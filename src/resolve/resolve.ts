import { symlinkSync } from 'fs';

import * as syntax from '../starlark-parser';
import { Token } from '../starlark-parser';
import { Position } from '../starlark-parser';
import { Binding, Module } from './binding';
import { Scope } from './binding';
import { Function } from './binding';

const debug = false;
const doesnt = 'this Starlark dialect does not ';

// global options
// These features are either not standard Starlark (yet), or deprecated
// features of the BUILD language, so we put them behind flags.
export var AllowSet = false; // allow the 'set' built-in
export var AllowGlobalReassign = false; // allow reassignment to top-level names; also, allow if/for/while at top-level
export var AllowRecursion = false; // allow while statements and recursive functions
export var LoadBindsGlobally = false; // load creates global not file-local bindings (deprecated)

// obsolete flags for features that are now standard. No effect.
export var AllowNestedDef = true;
export var AllowLambda = true;
export var AllowFloat = true;
export var AllowBitwise = true;

// File resolves the specified file and records information about the
// module in file.Module.
//
// The isPredeclared and isUniversal predicates report whether a name is
// a pre-declared identifier (visible in the current module) or a
// universal identifier (visible in every module).
// Clients should typically pass predeclared.Has for the first and
// starlark.Universe.Has for the second, where predeclared is the
// module's StringDict of predeclared names and starlark.Universe is the
// standard set of built-ins.
// The isUniverse predicate is supplied a parameter to avoid a cyclic
// dependency upon starlark.Universe, not because users should ever need
// to redefine it.
export function File(
  file: syntax.File,
  isPredeclared: (name: string) => boolean,
  isUniversal: (name: string) => boolean
): Error | null {
  return REPLChunk(file, null, isPredeclared, isUniversal);
}

export function REPLChunk(
  file: syntax.File,
  isGlobal: ((name: string) => boolean) | null,
  isPredeclared: (name: string) => boolean,
  isUniversal: (name: string) => boolean
): Error | null {
  const r = new Resolver(isGlobal, isPredeclared, isUniversal);
  r.stmts(file.Stmts);

  r.env.resolveLocalUses();

  r.resolveNonLocalUses(r.env);

  file.Module = new Module(r.moduleLocals, r.moduleGlobals);

  if (r.errors.errors.length > 0) {
    return r.errors.errors[0];
  }

  return null;
}

export function Expr(
  expr: syntax.Expr,
  isPredeclared: (name: string) => boolean,
  isUniversal: (name: string) => boolean
): [Binding[], Error | null] {
  const r = new Resolver(null, isPredeclared, isUniversal);
  r.expr(expr);
  r.env.resolveLocalUses();
  r.resolveNonLocalUses(r.env);
  if (r.errors.errors.length > 0) {
    return [[], r.errors.errors[0]];
  }
  return [r.moduleLocals, null];
}

// An ErrorList is a non-empty list of resolver error messages.
class ErrorList {
  errors: Error[];
  constructor(errors: Error[]) {
    this.errors = errors;
  }

  // Return the first error message in the list
  public Error() {
    return this.errors[0].Error();
  }
}

// An Error describes the nature and position of a resolver error.
class Error {
  Pos: Position;
  Msg: string;
  constructor(pos: Position, msg: string) {
    this.Pos = pos;
    this.Msg = msg;
  }

  // Return a string representation of the error
  public Error() {
    return `${this.Pos.toString()} : ${this.Msg} `;
  }
}

// A use records an identifier and the environment in which it appears.
class Use {
  id: syntax.Ident;
  env: Block;

  constructor(id: syntax.Ident, env: Block) {
    this.id = id;
    this.env = env;
  }
}

class Block {
  parent: Block | null; // null for file block
  func: Function | null = null; // only for function blocks
  comp: syntax.Comprehension | null = null; // only for comprehension blocks

  // bindings maps a name to its binding.
  // A local binding has an index into its innermost enclosing container's locals array.
  // A free binding has an index into its innermost enclosing function's freevars array.
  bindings: Map<string, Binding>;

  // children records the child blocks of the current one.
  children: Block[] = [];

  // uses records all identifiers seen in this container (function or file),
  // and a reference to the environment in which they appear.
  // As we leave each container block, we resolve them,
  // so that only free and global ones remain.
  // At the end of each top-level function we compute closures.
  uses: Use[] = [];

  constructor(parent: Block | null = null) {
    this.parent = parent;
    this.bindings = new Map();
    this.children = new Array();
    this.uses = new Array();
  }

  bind(name: string, bind: Binding): void {
    this.bindings.set(name, bind);
  }

  toString(): string {
    if (this.func !== null) {
      return `function block at ${this.func.pos}`;
    }
    if (this.comp !== null) {
      return `comprehension block at ${this.comp.span()}`;
    }
    return 'file block';
  }

  resolveLocalUses() {
    const unresolved: Use[] = this.uses.slice(0);
    for (const use of this.uses) {
      const bind = lookupLocal(use);
      if (
        bind != null &&
        (bind.scope === Scope.Local || bind.scope === Scope.Cell)
      ) {
        use.id.Binding = bind;
      } else {
        unresolved.push(use);
      }
    }
    this.uses = unresolved;
  }
}

class Resolver {
  env: Block;
  file: Block;
  moduleLocals: Binding[];
  moduleGlobals: Binding[];
  globals: Map<string, Binding>;
  predeclared: Map<string, Binding>;
  isGlobal: ((name: string) => boolean) | null;
  isPredeclared: ((name: string) => boolean) | null;
  isUniversal: ((name: string) => boolean) | null;
  loops: number;
  ifstmts: number;
  errors: ErrorList;

  constructor(
    isGlobal: ((name: string) => boolean) | null,
    isPredeclared: ((name: string) => boolean) | null,
    isUniversal: ((name: string) => boolean) | null
  ) {
    const file = new Block();
    this.env = file;
    this.file = file;
    this.moduleLocals = new Array();
    this.moduleGlobals = new Array();
    this.globals = new Map();
    this.predeclared = new Map();
    this.isGlobal = isGlobal;
    this.isPredeclared = isPredeclared;
    this.isUniversal = isUniversal;
    this.loops = 0;
    this.ifstmts = 0;
    this.errors = new ErrorList([]);
  }

  container(): Block {
    for (let b = this.env; ; b = b.parent!) {
      if (b.func !== null || b === this.file) {
        return b;
      }
    }
  }

  push(b: Block): void {
    this.env.children.push(b);
    b.parent = this.env;
    this.env = b;
  }

  pop(): void {
    this.env = this.env.parent!;
  }

  errorf(pos: Position, message: string) {
    this.errors.errors.push(new Error(pos, message));
  }

  // Bind creates a binding for id: a global (not file-local)
  // binding at top-level, a local binding otherwise.
  // At top-level, it reports an error if a global or file-local
  // binding already exists, unless AllowGlobalReassign.
  // It sets id.Binding to the binding (whether old or new),
  // and returns whether a binding already existed.
  bind(id: syntax.Ident): boolean {
    // Binding outside any local (comprehension/function) block?
    if (this.env === this.file) {
      // BUG:?
      let ok = true;

      let bind = this.file.bindings.get(id.Name);
      if (bind == undefined) {
        ok = false;
        bind = this.globals.get(id.Name);
        if (bind == undefined) {
          // first global binding of this name
          bind = new Binding(Scope.Global, this.moduleGlobals.length, id);
          this.globals.set(id.Name, bind);
          this.moduleGlobals.push(bind);
        } else {
          ok = true;
        }
      } else if (AllowGlobalReassign) {
        this.errorf(
          id.NamePos,
          `cannot reassign ${bind.scope} ${id.Name} declared at ${bind.first?.NamePos}`
        );
      }

      id.Binding = bind;
      return ok;
    }

    return this.bindLocal(id);
  }

  bindLocal(id: syntax.Ident): boolean {
    // Mark this name as local to current block.
    // Assign it a new local (positive) index in the current container.
    // if (id.Name in this.env.binding)
    let ok = this.env.bindings.has(id.Name);
    if (!ok) {
      let locals: Binding[];
      const fn = this.container().func;
      if (fn != null) {
        locals = fn.locals;
      } else {
        locals = this.moduleLocals;
      }
      const bind = new Binding(Scope.Local, locals.flat().length, id);
      this.env.bind(id.Name, bind);
      locals.push(bind);
    }
    this.use(id);
    return ok;
  }

  use(id: syntax.Ident) {
    let use = new Use(id, this.env);

    if (AllowGlobalReassign && this.env == this.file) {
      this.useToplevel(use);
      return;
    }

    let b = this.container();
    b.uses.push(use);
  }

  // useToplevel resolves use.id as a reference to a name visible at top-level.
  // The use.env field captures the original environment for error reporting.
  useToplevel(use: Use): Binding | null {
    const id = use.id;
    let bind: Binding;

    console.log(
      'this.file.bindings.has',
      this.file.bindings.has(id.Name),
      id.Name
    );
    console.log('globals.has', this.globals.has(id.Name), id.Name);
    console.log(this.isUniversal, this.isUniversal!(id.Name), id.Name);

    if (this.file.bindings.has(id.Name)) {
      // use of load-defined name in file block
      bind = this.file.bindings.get(id.Name)!;
    } else if (this.globals.has(id.Name)) {
      // use of global declared by module
      bind = this.globals.get(id.Name)!;
    } else if (this.isGlobal !== null && this.isGlobal(id.Name)) {
      // use of global defined in a previous REPL chunk
      bind = new Binding(
        Scope.Global,
        this.moduleGlobals.length,
        id // wrong: this is not even a binding use
      );
      this.globals.set(id.Name, bind);
      this.moduleGlobals.push(bind);
    } else if (this.predeclared.has(id.Name)) {
      // repeated use of predeclared or universal
      bind = this.predeclared.get(id.Name)!;
    } else if (this.isPredeclared && this.isPredeclared!(id.Name)) {
      // use of pre-declared name
      bind = new Binding(Scope.Predeclared, 0, null);
      this.predeclared.set(id.Name, bind); // save it
    } else if (this.isUniversal && this.isUniversal!(id.Name)) {
      // use of universal name
      if (!AllowSet && id.Name.toUpperCase() === 'SET') {
        this.errorf(id.NamePos, doesnt + 'support sets');
      }
      bind = new Binding(Scope.Universal, 0, null);
      this.predeclared.set(id.Name, bind); // save it
    } else {
      bind = new Binding(Scope.Undefined, 0, null);
      // TODO:
      this.errorf(id.NamePos, `undefined: ${id.Name} fuck`);
    }
    id.Binding = bind;

    return bind;
  }
  // TODO: SPELLCHECK

  stmts(stmts: syntax.Stmt[]) {
    for (const stmt of stmts) {
      this.stmt(stmt);
    }
  }

  stmt(stmt: syntax.Stmt) {
    if (stmt instanceof syntax.ExprStmt) {
      this.expr(stmt.X);
      return;
    }

    if (stmt instanceof syntax.BranchStmt) {
      if (
        this.loops === 0 &&
        (stmt.token === Token.BREAK || stmt.token === Token.CONTINUE)
      ) {
        this.errorf(stmt.tokenPos, `${stmt.token} not in a loop`);
      }
      return;
    }

    if (stmt instanceof syntax.IfStmt) {
      if (!AllowGlobalReassign && this.container().func == null) {
        this.errorf(stmt.ifPos, 'if statement not within a function');
      }
      this.expr(stmt.cond);
      this.ifstmts++;
      this.stmts(stmt.trueBody);
      this.stmts(stmt.falseBody);
      this.ifstmts--;
      return;
    }

    if (stmt instanceof syntax.AssignStmt) {
      this.expr(stmt.RHS);
      const isAugmented = stmt.Op !== '=';
      this.assign(stmt.LHS, isAugmented);
      return;
    }

    if (stmt instanceof syntax.DefStmt) {
      this.bind(stmt.Name);
      const fn: Function = new Function(
        stmt.Def,
        stmt.Name.Name,
        stmt.Params,
        stmt.Body,
        false,
        false,
        0,
        new Array(),
        new Array()
      );
      stmt.Function = fn;
      this.func(fn, stmt.Def);
      return;
    }

    if (stmt instanceof syntax.ForStmt) {
      if (!AllowGlobalReassign && this.container().func == null) {
        this.errorf(stmt.For, 'for loop not within a function');
      }
      this.expr(stmt.X);
      const isAugmented = false;
      this.assign(stmt.Vars, isAugmented);
      this.loops++;
      this.stmts(stmt.Body);
      this.loops--;

      return;
    }

    if (stmt instanceof syntax.WhileStmt) {
      if (!AllowRecursion) {
        this.errorf(stmt.While, doesnt + 'support while loops');
      }
      if (!AllowGlobalReassign && this.container().func == null) {
        this.errorf(stmt.While, 'while loop not within a function');
      }
      this.expr(stmt.Cond);
      this.loops++;
      this.stmts(stmt.Body);
      this.loops--;

      return;
    }

    if (stmt instanceof syntax.ReturnStmt) {
      if (this.container().func == null) {
        this.errorf(stmt.Return!, 'return statement not within a function');
      }
      if (stmt.Result != null) {
        this.expr(stmt.Result);
      }

      return;
    }

    if (stmt instanceof syntax.LoadStmt) {
      // A load statement may not be nested in any other statement.
      if (this.container().func !== null) {
        this.errorf(stmt.Load, 'load statement within a function');
      } else if (this.loops > 0) {
        this.errorf(stmt.Load, 'load statement within a loop');
      } else if (this.ifstmts > 0) {
        this.errorf(stmt.Load, 'load statement within a conditional');
      }

      for (let i = 0; i < stmt.From.length; i++) {
        const from = stmt.From[i];
        if (from.Name === '') {
          this.errorf(from.NamePos, 'load: empty identifier');
          continue;
        }
        if (from.Name[0] === '_') {
          this.errorf(
            from.NamePos,
            'load: names with leading underscores are not exported:${from.Name}'
          );
        }

        const id = stmt.To[i];
        if (LoadBindsGlobally) {
          this.bind(id);
        } else if (this.bindLocal(id) && !AllowGlobalReassign) {
          // "Global" in AllowGlobalReassign is a misnomer for "toplevel".
          // Sadly we can't report the previous declaration
          // as id.Binding may not be set yet.
          this.errorf(id.NamePos, 'cannot reassign top-level ${id.Name}');
        }
      }

      return;
    }

    console.log('unreachable!!!');
  }

  assign(lhs: syntax.Expr, isAugmented: boolean): void {
    if (lhs instanceof syntax.Ident) {
      // x = ...
      this.bind(lhs);
      return;
    }

    if (lhs instanceof syntax.IndexExpr) {
      // x[i] = ...
      this.expr((lhs as syntax.IndexExpr).X);
      this.expr((lhs as syntax.IndexExpr).Y);
      return;
    }

    if (lhs instanceof syntax.DotExpr) {
      // x.f = ...
      this.expr((lhs as syntax.DotExpr).X);
      return;
    }

    if (lhs instanceof syntax.TupleExpr) {
      // (x, y) = ...
      if (isAugmented) {
        this.errorf(
          lhs.span()[0],
          "can't use tuple expression in augmented assignment"
        );
      }
      for (const elem of (lhs as syntax.TupleExpr).List) {
        this.assign(elem, isAugmented);
      }
      return;
    }

    if (lhs instanceof syntax.ListExpr) {
      // [x, y, z] = ...
      if (isAugmented) {
        this.errorf(
          lhs.span()[0],
          "can't use list expression in augmented assignment"
        );
      }
      for (const elem of (lhs as syntax.ListExpr).list) {
        this.assign(elem, isAugmented);
      }
      return;
    }

    if (lhs instanceof syntax.ParenExpr) {
      this.assign((lhs as syntax.ParenExpr).x, isAugmented);
      return;
    }

    // const name = (lhs.constructor as Function).name.replace(/^syntax\./, '').toLowerCase();
    // this.errorf(syntax.Start(lhs), `can't assign to ${name}`);
  }

  public expr(e: syntax.Expr): void {
    if (e instanceof syntax.Ident) {
      this.use(e);
      return;
    }

    if (e instanceof syntax.Literal) {
      return;
    }

    if (e instanceof syntax.ListExpr) {
      for (var x of e.list) {
        this.expr(x);
      }
      return;
    }

    if (e instanceof syntax.CondExpr) {
      this.expr(e.Cond);
      this.expr(e.True);
      this.expr(e.False);
      return;
    }

    if (e instanceof syntax.IndexExpr) {
      this.expr(e.X);
      this.expr(e.Y);
      return;
    }

    if (e instanceof syntax.DictEntry) {
      this.expr(e.Key);
      this.expr(e.Value);
      return;
    }

    if (e instanceof syntax.SliceExpr) {
      this.expr(e.X);
      if (e.Lo != null) {
        this.expr(e.Lo);
      }
      if (e.Hi != null) {
        this.expr(e.Hi);
      }
      if (e.Step != null) {
        this.expr(e.Step);
      }
      return;
    }

    if (e instanceof syntax.Comprehension) {
      // The 'in' operand of the first clause (always a ForClause)
      // is resolved in the outer block; consider: [x for x in x].
      const clause = e.Clauses[0] as syntax.ForClause;
      this.expr(clause.x);

      // A list/dict comprehension defines a new lexical block.
      // Locals defined within the block will be allotted
      // distinct slots in the locals array of the innermost
      // enclosing container (function/module) block.
      let block = new Block();
      block.comp = e;
      this.push(block);

      const isAugmented = false;
      this.assign(clause.vars, isAugmented);

      for (const clause of e.Clauses.slice(1)) {
        if (clause instanceof syntax.IfClause) {
          this.expr(clause.Cond);
        }
        if (clause instanceof syntax.ForClause) {
          this.assign(clause.vars, isAugmented);
          this.expr(clause.x);
        }
      }
      this.expr(e.Body); // body may be *DictEntry
      this.pop();
      return;
    }

    if (e instanceof syntax.TupleExpr) {
      for (const x of e.List) {
        this.expr(x);
      }
      return;
    }

    if (e instanceof syntax.DictExpr) {
      for (const entry of e.List) {
        const entry_ = entry as syntax.DictEntry;
        this.expr(entry_.Key);
        this.expr(entry_.Value);
      }
      return;
    }

    if (e instanceof syntax.UnaryExpr) {
      this.expr(e.X!);
      return;
    }

    if (e instanceof syntax.BinaryExpr) {
      this.expr(e.X);
      this.expr(e.Y);
      return;
    }

    if (e instanceof syntax.DotExpr) {
      this.expr(e.X);
      return;
    }

    if (e instanceof syntax.CallExpr) {
      this.expr(e.Fn);
      let seenVarargs = false;
      let seenKwargs = false;
      let seenName = new Map<string, boolean>();
      let n = 0;
      let p = 0;

      for (const arg of e.Args) {
        const [pos, _] = arg.span();
        if (arg instanceof syntax.UnaryExpr && arg.Op == Token.STARSTAR) {
          // **kwargs
          if (seenKwargs) {
            this.errorf(pos, 'multiple **kwargs not allowed');
          }
          seenKwargs = true;
          this.expr(arg);
        } else if (arg instanceof syntax.UnaryExpr && arg.Op == Token.STAR) {
          // *args
          if (seenKwargs) {
            this.errorf(pos, '*args may not follow **kwargs');
          } else if (seenVarargs) {
            this.errorf(pos, 'multiple *args not allowed');
          }
          seenVarargs = true;
          this.expr(arg);
        } else if (arg instanceof syntax.BinaryExpr && arg.Op == Token.EQ) {
          // k=v
          n++;
          if (seenKwargs) {
            this.errorf(pos, 'keyword argument may not follow **kwargs');
          } else if (seenVarargs) {
            this.errorf(pos, 'keyword argument may not follow *args');
          }
          const x = arg.X as syntax.Ident;
          if (seenName.has(x.Name)) {
            this.errorf(x.NamePos, `keyword argument ${x.Name} repeated`);
          } else {
            seenName.set(x.Name, true);
          }
          this.expr(arg.Y);
        } else {
          // positional argument
          p++;
          if (seenVarargs) {
            this.errorf(pos, 'positional argument may not follow *args');
          } else if (seenKwargs) {
            this.errorf(pos, 'positional argument may not follow **kwargs');
          } else if (seenName.size > 0) {
            this.errorf(pos, 'positional argument may not follow named');
          }
          this.expr(arg);
        }
      }

      // Fail gracefully if compiler-imposed limit is exceeded.
      if (p >= 256) {
        const [pos, _] = e.span();
        this.errorf(pos, `${p} positional arguments in call, limit is 255`);
      }
      if (n >= 256) {
        const [pos, _] = e.span();
        this.errorf(pos, `${n} keyword arguments in call, limit is 255`);
      }
      return;
    }

    if (e instanceof syntax.LambdaExpr) {
      let fn = new Function(
        e.lambda,
        'lambda',
        e.params,
        [new syntax.ReturnStmt(e.span()[0], e.body)],
        false,
        false,
        0,
        new Array(),
        new Array()
      );
      e._function = fn;
      this.func(fn, e.lambda);
      return;
    }

    if (e instanceof syntax.ParenExpr) {
      this.expr(e.x);
      return;
    }

    console.log('unreachable');
  }

  func(func: Function, pos: Position) {
    // Resolve defaults in enclosing environment.
    for (const param of func.params) {
      if (param instanceof syntax.BinaryExpr) {
        this.expr(param.Y);
      }
    }

    // Enter function block.
    const b = new Block();
    b.func = func;
    this.push(b);

    let seenOptional = false;
    let star: syntax.UnaryExpr | null = null; // * or *args param
    let starStar: syntax.Ident | null = null; // **kwargs ident
    let numKwonlyParams = 0;

    for (const param of func.params) {
      if (param instanceof syntax.Ident) {
        // e.g. x
        if (starStar != null) {
          this.errorf(
            param.NamePos,
            //@ts-ignore
            `required parameter may not follow **${starStar.Name}`
          );
        } else if (star != null) {
          numKwonlyParams++;
        } else if (seenOptional) {
          this.errorf(
            param.NamePos,
            'required parameter may not follow optional'
          );
        }
        if (this.bind(param)) {
          this.errorf(param.NamePos, `duplicate parameter: ${param.Name}`);
        }
        break;
      }

      if (param instanceof syntax.BinaryExpr) {
        if (starStar != null) {
          this.errorf(
            param.OpPos,
            //@ts-ignore
            `optional parameter may not follow **${starStar.Name}`
          );
        } else if (star != null) {
          numKwonlyParams++;
        }
        if (param.X instanceof syntax.Ident && this.bind(param.X)) {
          this.errorf(
            param.OpPos,
            `duplicate parameter: ${(param.X as syntax.Ident).Name}`
          );
        }
        seenOptional = true;
        break;
      }

      if (param instanceof syntax.UnaryExpr) {
        // * or *args or **kwargs
        if (param.Op === Token.STAR) {
          if (starStar != null) {
            this.errorf(
              param.OpPos,
              //@ts-ignore
              `* parameter may not follow **${starStar.Name}`
            );
          } else if (star != null) {
            this.errorf(param.OpPos, 'multiple * parameters not allowed');
          } else {
            star = param;
          }
        } else {
          if (starStar != null) {
            this.errorf(param.OpPos, 'multiple ** parameters not allowed');
          }
          starStar = param.X instanceof syntax.Ident ? param.X : null;
        }
        break;
      }
    }

    // Bind the *args and **kwargs parameters at the end,
    // so that regular parameters a/b/c are contiguous and
    // there is no hole for the "*":
    //   def f(a, b, *args, c=0, **kwargs)
    //   def f(a, b, *,     c=0, **kwargs)
    if (star != null) {
      if (star.X instanceof syntax.Ident) {
        // *args
        if (this.bind(star.X)) {
          this.errorf(
            star.X.NamePos,
            `duplicate parameter: ${(star.X as syntax.Ident).Name}`
          );
        }
        func.hasVarargs = true;
      } else if (numKwonlyParams === 0) {
        this.errorf(
          star.OpPos,
          'bare * must be followed by keyword-only parameters'
        );
      }
    }
    if (starStar != null) {
      if (this.bind(starStar)) {
        this.errorf(starStar.NamePos, `duplicate parameter: ${starStar.Name}`);
      }
      func.hasKwargs = true;
    }

    func.numKwonlyParams = numKwonlyParams;
    this.stmts(func.body);
    b.resolveLocalUses();
    this.pop();
  }

  public resolveNonLocalUses(b: Block): void {
    // First resolve inner blocks.
    for (const child of b.children) {
      this.resolveNonLocalUses(child);
    }

    for (const use of b.uses) {
      use.id.Binding = this.lookupLexical(use, use.env);
    }
  }

  // Lookup an identifier use.id within its lexically enclosing environment.
  // The use.env field captures the original environment for error reporting.
  public lookupLexical(use: Use, env: Block): Binding {
    if (debug) {
      console.log(`lookupLexical ${use.id.Name} in ${env} = ...`);
    }

    // Is this the file block?
    if (env == this.file) {
      let a = this.useToplevel(use)!; // file-local, global, predeclared, or not found
      console.log('~~~~~~~~~~~~~', use.id);
      return a;
    }

    // Defined in this block?
    let bind = env.bindings.get(use.id.Name);
    if (!bind) {
      // Defined in parent block?
      bind = this.lookupLexical(use, env.parent!);
      if (
        env.func &&
        (bind.scope == Scope.Local ||
          bind.scope == Scope.Free ||
          bind.scope == Scope.Cell)
      ) {
        // Found in parent block, which belongs to enclosing function.
        // Add the parent's binding to the function's freevars,
        // and add a new 'free' binding to the inner function's block,
        // and turn the parent's local into cell.
        if (bind.scope == Scope.Local) {
          bind.scope = Scope.Cell;
        }
        const index: number = env.func.freeVars.length;
        env.func.freeVars.push(bind);
        bind = new Binding(Scope.Free, index, bind.first);
        if (debug) {
          console.log(
            `creating freevar ${env.func.freeVars.length} in function at ${env.func.pos}: ${use.id.Name}`
          );
        }
      }

      // Memoize, to avoid duplicate free vars
      // and redundant global (failing) lookups.
      env.bind(use.id.Name, bind);
    }
    if (debug) {
      console.log(`= ${bind}`);
    }
    return bind;
  }
}

// lookupLocal looks up an identifier within its immediately enclosing function.
function lookupLocal(use: Use): Binding | null {
  for (let env: Block | null = use.env; env !== null; env = env.parent) {
    const bind = env.bindings.get(use.id.Name);
    if (bind !== undefined) {
      if (bind.scope === Scope.Free) {
        // shouldn't exist till later
        throw new Error(
          use.id.NamePos,
          `internal error: ${use.id.Name}, ${bind}`
        );
      }
      return bind; // found
    }
    if (env.func !== null) {
      break;
    }
  }
  return null; // not found in this function
}
