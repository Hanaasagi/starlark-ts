import syntax = require("../../syntax");

// Disassemble causes the assembly code for each function
// to be printed to stderr as it is generated.
var Disassemble = false;

const debug = false; // make code generation verbose, for debugging the compiler

// Increment this to force recompilation of saved bytecode files.
export const Version = 13;
const variableStackEffect = 0x7f;

export enum Opcode {
  NOP,
  DUP,
  DUP2,
  POP,
  EXCH,
  LT,
  GT,
  GE,
  LE,
  EQL,
  NEQ,
  PLUS,
  MINUS,
  STAR,
  SLASH,
  SLASHSLASH,
  PERCENT,
  AMP,
  PIPE,
  CIRCUMFLEX,
  LTLT,
  GTGT,
  IN,
  UPLUS,
  UMINUS,
  TILDE,
  NONE,
  TRUE,
  FALSE,
  MANDATORY,
  ITERPUSH,
  ITERPOP,
  NOT,
  RETURN,
  SETINDEX,
  INDEX,
  SETDICT,
  SETDICTUNIQ,
  APPEND,
  SLICE,
  INPLACE_ADD,
  INPLACE_PIPE,
  MAKEDICT,
  JMP,
  CJMP,
  ITERJMP,
  CONSTANT,
  MAKETUPLE,
  MAKELIST,
  MAKEFUNC,
  LOAD,
  SETLOCAL,
  SETGLOBAL,
  LOCAL,
  FREE,
  FREECELL,
  LOCALCELL,
  SETLOCALCELL,
  GLOBAL,
  PREDECLARED,
  UNIVERSAL,
  ATTR,
  SETFIELD,
  UNPACK,
  CALL,
  CALL_VAR,
  CALL_KW,
  CALL_VAR_KW,

  // TODO
  //  	OpcodeArgMin = JMP
  // OpcodeMax    = CALL_VAR_KW
}

// stackEffect records the effect on the size of the operand stack of
// each kind of instruction. For some instructions this requires computation.
const stackEffect: { [key: string]: number } = {
  AMP: -1,
  APPEND: -2,
  ATTR: 0,
  CALL: variableStackEffect,
  CALL_KW: variableStackEffect,
  CALL_VAR: variableStackEffect,
  CALL_VAR_KW: variableStackEffect,
  CIRCUMFLEX: -1,
  CJMP: -1,
  CONSTANT: +1,
  DUP2: +2,
  DUP: +1,
  EQL: -1,
  FALSE: +1,
  FREE: +1,
  FREECELL: +1,
  GE: -1,
  GLOBAL: +1,
  GT: -1,
  GTGT: -1,
  IN: -1,
  INDEX: -1,
  INPLACE_ADD: -1,
  INPLACE_PIPE: -1,
  ITERJMP: variableStackEffect,
  ITERPOP: 0,
  ITEMPUSH: -1,
  JMP: 0,
  LE: -1,
  LOAD: -1,
  LOCAL: +1,
  LOCALCELL: +1,
  LT: -1,
  LTLT: -1,
  MAKEDICT: +1,
  MAKEFUNC: 0,
  MAKELIST: variableStackEffect,
  MAKETUPLE: variableStackEffect,
  MANDATORY: +1,
  MINUS: -1,
  NEQ: -1,
  NONE: +1,
  NOP: 0,
  NOT: 0,
  PERCENT: -1,
  PIPE: -1,
  PLUS: -1,
  POP: -1,
  PREDECLARED: +1,
  RETURN: -1,
  SETLOCALCELL: -1,
  SETDICT: -3,
  SETDICTUNIQ: -3,
  SETFIELD: -2,
  SETGLOBAL: -1,
  SETINDEX: -3,
  SETLOCAL: -1,
  SLASH: -1,
  SLASHSLASH: -1,
  SLICE: -3,
  STAR: -1,
  TRUE: +1,
  UMINUS: 0,
  UNIVERSAL: +1,
  UNPACK: variableStackEffect,
  UPLUS: 0,
};

// The type of a bytes literal value, to distinguish from text string.
type Bytes = string;

// A Binding is the name and position of a binding identifier.
class Binding {
  name: string;
  pos: syntax.Position;

  constructor(name: string, pos: syntax.Position) {
    this.name = name;
    this.pos = pos;
  }
}

class Pclinecol {
  pc: number;
  line: number;
  col: number;
}

// A Funcode is the code of a compiled Starlark function.
//
// Funcodes are serialized by the encoder.function method,
// which must be updated whenever this declaration is changed.
export class Funcode {
  prog: Program;
  pos: syntax.Position;
  name: string;
  doc: string;
  // TODO: type bytes u8
  code: number[];
  pclinetab: number[];
  locals: Binding[];
  cells: number[];
  freevars: Binding[];
  maxStack: number;
  numParams: number;
  numKwonlyParams: number;
  hasVarargs: boolean;
  hasKwargs: boolean;

  // -- transient state --
  // BUG:
  // lntOnce: SyncOnce;
  lnt: Pclinecol[]; // TODO: define pclinecol type

  // Position returns the source position for program counter pc.
  position(pc: number): syntax.Position {
    // BUG:
    this.decodeLNT();

    let n = this.lnt.length;
    let i = 0;
    let j = n;

    while (i < j) {
      let h = Math.floor((i + j) / 2);
      if (!(h >= n - 1 || this.lnt[h + 1].pc > pc)) {
        i = h + 1;
      } else {
        j = h;
      }
    }

    let line: number = 0;
    let col: number = 0;
    if (i < n) {
      line = this.lnt[i].line;
      col = this.lnt[i].col;
    }

    let pos = this.pos;
    pos.col = col;
    pos.line = line;
    return pos;
  }

  // decodeLNT decodes the line number table and populates fn.lnt.
  // It is called at most once.
  decodeLNT(fn: Funcode): void {
    // Conceptually the table contains rows of the form
    // (pc uint32, line int32, col int32), sorted by pc.
    // We use a delta encoding, since the differences
    // between successive pc, line, and column values
    // are typically small and positive (though line and
    // especially column differences may be negative).
    // The delta encoding starts from
    // {pc: 0, line: fn.Pos.Line, col: fn.Pos.Col}.
    //
    // Each entry is packed into one or more 16-bit values:
    // Δpc uint4
    // Δline int5
    // Δcol int6
    // incomplete uint1
    // The top 4 bits are the unsigned delta pc.
    // The next 5 bits are the signed line number delta.
    // The next 6 bits are the signed column number delta.
    // The bottom bit indicates that more rows follow because
    // one of the deltas was maxed out.
    // These field widths were chosen from a sample of real programs,
    // and allow >97% of rows to be encoded in a single uint16.

    fn.lnt = new Array<Pclinecol>(); // a minor overapproximation
    let entry: Pclinecol = {
      pc: 0,
      line: fn.pos.line,
      col: fn.pos.col,
    };
    for (const x of fn.pclinetab) {
      entry.pc += x >>> 12;
      entry.line += (x << 4) >> (16 - 5); // sign extend Δline
      entry.col += (x << 9) >> (16 - 6); // sign extend Δcol
      if ((x & 1) === 0) {
        fn.lnt.push(entry);
      }
    }
  }
}

// Programs are serialized by the Program.Encode method,
// which must be updated whenever this declaration is changed.
export class Program {
  loads: Binding[];
  names: string[];
  constants: any;
  functions: Funcode[];
  globals: Binding[];
  toplevel: Funcode | null;
}

// A pcomp holds the compiler state for a Program.
class Pcomp {
  prog: Program;
  names: Map<string, number>;
  constants: Map<any, number>;
  functions: Map<Funcode, number>;

  function(name: string, pos: syntax.Position, stmts: syntax.Stmt[], locals: resolve.Binding[], freevars: resolve.Binding[]): Funcode {
    const fcomp = new fcomp(
      this,
      pos,
      new Funcode(
        Prog: pcomp.prog,
        Pos: pos,
        Name: name,
        Doc: docStringFromBody(stmts),
        Locals: bindings(locals),
        Freevars: bindings(freevars),
        Cells: []number[]
      )
    );

    // Record indices of locals that require cells.
    for (let i = 0; i < locals.length; i++) {
      const local = locals[i];
      if (local.Scope === resolve.Cell) {
        fcomp.fn.Cells.push(i);
      }
    }

    if (debug) {
      console.log(`start function(${name} @ ${pos})`);
    }

    // Convert AST to a CFG of instructions.
    const entry: Block = fcomp.newBlock();
    fcomp.block = entry;
    fcomp.stmts(stmts);
    if (fcomp.block !== null) {
      fcomp.emit(Opcode.NONE);
      fcomp.emit(Opcode.RETURN);
    }

    let oops = false; // something bad happened

    const setinitialstack = (b: block, depth: number): void => {
      if (b.initialstack === -1) {
        b.initialstack = depth;
      } else if (b.initialstack !== depth) {
        console.log(`${b.index}: setinitialstack: depth mismatch: ${b.initialstack} vs ${depth}`);
        oops = true;
      }
    };

    // Linearize the CFG:
    // compute order, address, and initial
    // stack depth of each reachable block.
    let pc: number = 0;
    const blocks: block[] = [];
    let maxstack: number = 0;

    let visit = (b: block) => {
      if (b.index >= 0) {
        return; // already visited
      }
      b.index = blocks.length;
      b.addr = pc;
      blocks.push(b);

      let stack = b.initialstack;
      if (debug) {
        console.log(`${name} block ${b.index}: (stack = ${stack})`);
      }
      let cjmpAddr: number | null = null;
      let isiterjmp = 0;
      for (let i = 0; i < b.insns.length; i++) {
        pc++;

        // Compute size of argument.
        let insn = b.insns[i];
        if (insn.op >= OpcodeArgMin) {
          switch (insn.op) {
            case Opcode.ITERJMP:
              isiterjmp = 1;
            case Opcode.CJMP:
              cjmpAddr = b.insns[i].arg;
              pc += 4;
              break;
            default:
              pc += argLen(insn.arg);
              break;
          }
        }

        // Compute effect on stack.
        let se = insn.stackeffect();
        if (debug) {
          console.log(`\t${insn.op} ${stack} ${stack + se}`);
        }
        stack += se;
        if (stack < 0) {
          console.log(`After pc=${pc}: stack underflow`);
          oops = true;
        }
        if (stack + isiterjmp > maxstack) {
          maxstack = stack + isiterjmp;
        }
      }

      if (debug) {
        console.log(`successors of block ${b.addr} (start=${b.index}):`);
        if (b.jmp !== null) {
          console.log(`jmp to ${b.jmp.index}`);
        }
        if (b.cjmp !== null) {
          console.log(`cjmp to ${b.cjmp.index}`);
        }
      }

      // Place the jmp block next.
      if (b.jmp !== null) {
        // jump threading (empty cycles are impossible)
        while (b.jmp.insns === null) {
          b.jmp = b.jmp.jmp;
        }

        setinitialstack(b.jmp, stack + isiterjmp);
        if (b.jmp.index < 0) {
          // Successor is not yet visited:
          // place it next and fall through.
          visit(b.jmp);
        } else {
          // Successor already visited;
          // explicit backward jump required.
          pc += 5;
        }
      }

      // Then the cjmp block.
      if (b.cjmp !== null) {
        // jump threading (empty cycles are impossible)
        while (b.cjmp.insns === null) {
          b.cjmp = b.cjmp.jmp;
        }

        setinitialstack(b.cjmp, stack);
        visit(b.cjmp);

        // Patch the CJMP/ITERJMP, if present.
        if (cjmpAddr !== null) {
          b.insns[cjmpAddr].arg = b.cjmp.addr;
        }
      }
    }
    setinitialstack(entry, 0)
    visit(entry)

    const fn = fcomp.fn;
    fn.MaxStack = maxstack;

    // Emit bytecode (and position table).
    if (Disassemble) {
      console.log(`Function ${name}: (${blocks.length} blocks, ${pc} bytes)`);
    }
    fcomp.generate(blocks, pc);

    if (debug) {
      console.log(`code = ${fn.Code} maxstack = ${fn.MaxStack}`);
    }

    // Don't panic until we've completed printing of the function.
    if (oops) {
      throw new Error("internal error");
    }

    if (debug) {
      console.log(`end function(${name} @${pos})`);
    }

    return fn;
  }
  // nameIndex returns the index of the specified name
  // within the name pool, adding it if necessary.
  nameIndex(name: string): number {
    let index = this.names[name];
    if (index === undefined) {
      index = this.prog.Names.length;
      this.names[name] = index;
      this.prog.Names.push(name);
    }
    return index;
  }

  // constantIndex returns the index of the specified constant
  // within the constant pool, adding it if necessary.
  constantIndex(v: any): number {
    let index = this.constants[v];
    if (index === undefined) {
      index = this.prog.Constants.length;
      this.constants[v] = index;
      this.prog.Constants.push(v);
    }
    return index;
  }

  // functionIndex returns the index of the specified function
  // AST the nestedfun pool, adding it if necessary.
  functionIndex(fn: Funcode): number {
    let index = this.functions[fn];
    if (index === undefined) {
      index = this.prog.Functions.length;
      this.functions[fn] = index;
      this.prog.Functions.push(fn);
    }
    return index;
  }

}

class fcomp {
  public pcomp: Pcomp;
  public pos: syntax.Position;
  public fn: Funcode;
  public loops: loop[];
  public block: block;

  constructor(
    pcomp: Pcomp,
    pos: syntax.Position,
    fn: Funcode,
    loops: loop[],
    block: block,

  ) {
    this.pcomp = pcomp
    this.pos = pos
    this.fn = fn
    this.loops = loops
    this.block = block

  }

  generate(blocks: block[], codelen: number): void {
    const code: number[] = [];
    let pclinetab: number[] = [];
    let prev: pclinecol = {
      pc: 0,
      line: fn.Pos.Line,
      col: fn.Pos.Col,
    };

    for (const b of blocks) {
      if (Disassemble) {
        console.error(${ b.index }: );
      }
      let pc: number = b.addr;
      for (const insn of b.insns) {
        if (insn.line !== 0) {
          // Instruction has a source position. Delta-encode it.
          // See Funcode.Position for the encoding.
          while (true) {
            let incomplete: number = 0;
            // Δpc, uint4
            const deltapc: number = pc - prev.pc;
            if (deltapc > 0x0f) {
              incomplete = 1;
            }
            prev.pc += deltapc;

            // Δline, int5
            const deltaline: number = clip(insn.line - prev.line, -0x10, 0x0f)[0];
            if (!clip(insn.line - prev.line, -0x10, 0x0f)[1]) {
              incomplete = 1;
            }
            prev.line += deltaline;

            // Δcol, int6
            const deltacol: number = clip(insn.col - prev.col, -0x20, 0x1f)[0];
            if (!clip(insn.col - prev.col, -0x20, 0x1f)[1]) {
              incomplete = 1;
            }
            prev.col += deltacol;

            const entry: number =
              ((deltapc << 12) & 0xf000) |
              ((deltaline << 7) & 0x3f80) |
              ((deltacol << 1) & 0x7e) |
              incomplete;
            pclinetab.push(entry);

            if (incomplete === 0) {
              break;
            }
          }

          if (Disassemble) {
            console.error(
              `\t\t\t\t\t; ${path.basename(fn.Pos.Filename())}:${insn.line}:${insn.col}`
            );
          }
        }

        if (Disassemble) {
          PrintOp(fn, pc, insn.op, insn.arg);
        }

        code.push(insn.op);
        pc++;

        if (insn.op >= OpcodeArgMin) {
          if (insn.op === CJMP || insn.op === ITERJMP) {
            code = addUint32(code, insn.arg, 4); // pad arg to 4 bytes
          } else {
            code = addUint32(code, insn.arg, 0);
          }
          pc = code.length;
        }
      }

      if (b.jmp !== null && b.jmp.index !== b.index + 1) {
        const addr: number = b.jmp.addr;
        if (Disassemble) {
          console.error(`\t${pc}\tjmp\t\t${addr}\t; block ${b.jmp.index}`);
        }

        code.push(Opcode.JMP);
        code = addUint32(code, addr, 4);
      }

    }

    if (code.length !== codelen) {
      throw new Error("internal error: wrong code length");
    }

    this.fn.pclinetab = pclinetab
    this.fn.code = code
  }

  newBlock(): Block {
    return new Block();
  }

  emit(op: Opcode): void {
    if (op >= OpcodeArgMin) {
      throw new Error("missing arg: " + op.toString());
    }

    let insn: insn = { op: op, line: this.pos.Line, col: this.pos.Col };
    this.block.insns.push(insn);
    this.pos.Line = 0;
    this.pos.Col = 0;
  }

  emit1(op: Opcode, arg: number): void {
    if (op < OpcodeArgMin) {
      throw new Error("unwanted arg: " + op.toString());
    }
    const insn: insn = {
      op: op,
      arg: arg,
      line: this.pos.Line,
      col: this.pos.Col
    };
    this.block.insns.push(insn);
    this.pos.Line = 0;
    this.pos.Col = 0;
  }

  // jump emits a jump to the specified block.
  // On return, the current block is unset.
  jump(b: block) {
    if (b === this.block) {
      throw new Error("self-jump"); // unreachable: Starlark has no arbitrary looping constructs
    }
    this.block.jmp = b;
    this.block = null;
  }

  // condjump emits a conditional jump (CJMP or ITERJMP)
  // to the specified true/false blocks.
  // (For ITERJMP, the cases are jmp/f/ok and cjmp/t/exhausted.)
  // On return, the current block is unset.
  condjump(op: Opcode, t: block, f: block) {
    if (!(op === Opcode.CJMP || op === Opcode.ITERJMP)) {
      throw new Error("not a conditional jump: " + op.toString());
    }
    this.emit1(op, 0); // fill in address later
    this.block.cjmp = t;
    this.jump(f);
  }

  // string emits code to push the specified string.
  string(s: string): void {
    this.emit1(Opcode.CONSTANT, this.pcomp.constantIndex(s));
  }

  // setPos sets the current source position.
  // It should be called prior to any operation that can fail dynamically.
  // All positions are assumed to belong to the same file.
  setPos(pos: syntax.Position): void {
    this.pos = pos;
  }

  // set emits code to store the top-of-stack value
  // to the specified local, cell, or global variable.
  set(id: syntax.Ident): void {
    const bind: resolve.Binding = id.Binding;
    switch (bind.scope) {
      case resolve.Scope.Local:
        this.emit1(Opcode.SETLOCAL, bind.index);
        break;
      case resolve.Scope.Cell:
        this.emit1(Opcode.SETLOCALCELL, bind.index);
        break;
      case resolve.Scope.Global:
        this.emit1(Opcode.SETGLOBAL, bind.index);
        break;
      default:
        log.Panicf(`${id.NamePos}: set(${id.Name}): not global/local/cell (${bind.scope})`);
        break;
    }
  }

  // lookup emits code to push the value of the specified variable.
  lookup(id: syntax.Ident): void {
    const bind = id.Binding as resolve.Binding;
    if (bind.Scope !== resolve.Universal) { // (universal lookup can't fail)
      this.setPos(id.NamePos);
    }
    switch (bind.Scope) {
      case resolve.Local:
        this.emit1(Opcode.LOCAL, bind.Index);
        break;
      case resolve.Free:
        this.emit1(Opcode.FREECELL, bind.Index);
        break;
      case resolve.Cell:
        this.emit1(Opcode.LOCALCELL, bind.Index);
        break;
      case resolve.Global:
        this.emit1(Opcode.GLOBAL, bind.Index);
        break;
      case resolve.Predeclared:
        this.emit1(Opcode.PREDECLARED, this.pcomp.nameIndex(id.Name));
        break;
      case resolve.Universal:
        this.emit1(Opcode.UNIVERSAL, this.pcomp.nameIndex(id.Name));
        break;
      default:
        throw new Error(`${id.NamePos}: compiler.lookup(${id.Name}): scope = ${bind.Scope}`);
    }
  }

  stmts(stmts: syntax.Stmt[]) {
    for (const stmt of stmts) {
      this.stmt(stmt);
    }
  }

  stmt(stmt: syntax.Stmt) {
    switch (stmt.type) {
      case "ExprStmt":
        if (stmt.X.type === "Literal") {
          // Opt: don't compile doc comments only to pop them.
          return;
        }
        this.expr(stmt.X);
        this.emit(POP);
        break;

      case "BranchStmt":
        // Resolver invariant: break/continue appear only within loops.
        switch (stmt.Token) {
          case "PASS":
            // no-op
            break;
          case "BREAK":
            const b = this.loops[this.loops.length - 1].break_;
            this.jump(b);
            this.block = this.newBlock(); // dead code
            break;
          case "CONTINUE":
            const c = this.loops[this.loops.length - 1].continue_;
            this.jump(c);
            this.block = this.newBlock(); // dead code
            break;
        }
        break;

      case "IfStmt":
        // Keep consistent with CondExpr.
        const t = this.newBlock();
        const f = this.newBlock();
        const done = this.newBlock();

        this.ifelse(stmt.Cond, t, f);

        this.block = t;
        this.stmts(stmt.True);
        this.jump(done);

        this.block = f;
        this.stmts(stmt.False);
        this.jump(done);

        this.block = done;
        break;

      case "AssignStmt":
        switch (stmt.Op) {
          case syntax.EQ:
            // simple assignment: x = y
            this.expr(stmt.RHS);
            this.assign(stmt.OpPos, stmt.LHS);
            break;

          case syntax.PLUS_EQ,
            syntax.MINUS_EQ,
            syntax.STAR_EQ,
            syntax.SLASH_EQ,
            syntax.SLASHSLASH_EQ,
            syntax.PERCENT_EQ,
            syntax.AMP_EQ,
            syntax.PIPE_EQ,
            syntax.CIRCUMFLEX_EQ,
            syntax.LTLT_EQ,
            syntax.GTGT_EQ:
            // augmented assignment: x += y

            let set: () => void;

            // Evaluate "address" of x exactly once to avoid duplicate side-effects.
            const lhs = unparen(stmt.LHS);
            if (lhs.type === "Ident") {
              // x = ...
              this.lookup(lhs);
              set = () => {
                this.set(lhs);
              };
            } else if (lhs.type === "IndexExpr") {
              // x[y] = ...
              this.expr(lhs.X);
              this.expr(lhs.Y);
              this.emit(Opcode.DUP2);
              this.setPos(lhs.Lbrack);
              this.emit(Opcode.INDEX);
              set = () => {
                this.setPos(lhs.Lbrack);
                this.emit(Opcode.SETINDEX);
              };
            } else if (lhs.type === "DotExpr") {
              // x.f = ...
              this.expr(lhs.X);
              this.emit(Opcode.DUP);
              const name = this.pcomp.nameIndex(lhs.Name.Name);
              this.setPos(lhs.Dot);
              this.emit1(Opcode.ATTR, name);
              set = () => {
                this.setPos(lhs.Dot);
                this.emit1(Opcode.SETFIELD, name);
              };
            } else {
              throw new Error(`Unexpected LHS type ${lhs.type}`);
            }

            this.expr(stmt.RHS);

            switch (stmt.Op) {
              case syntax.PLUS_EQ:
                this.setPos(stmt.OpPos);
                this.emit(INPLACE_ADD);
                set();
                break;

              case syntax.PIPE_EQ:
                this.setPos(stmt.OpPos);
                this.emit(INPLACE_OR);
                set();
                break;

              default:
                this.binop(stmt.OpPos, stmt.Op - syntax.PLUS_EQ + syntax.PLUS);
                set();
                break;
            }
        }
      case "DefStmt":
        this.function(stmt.Function);
        this.set(stmt.Name);
        break;

      case "ForStmt":
        // Keep consistent with ForClause.
        const head = this.newBlock();
        const body = this.newBlock();
        const tail = this.newBlock();

        this.expr(stmt.X);
        this.setPos(stmt.For);
        this.emit(ITERPUSH);
        this.jump(head);

        this.block = head;
        this.condjump(ITERJMP, tail, body);

        this.block = body;
        this.assign(stmt.For, stmt.Vars);
        this.loops.push({ break: tail, continue: head });
        this.stmts(stmt.Body);
        this.loops.pop();
        this.jump(head);

        this.block = tail;
        this.emit(ITERPOP);
        break;

      case "WhileStmt":
        const head = this.newBlock();
        const body = this.newBlock();
        const done = this.newBlock();

        this.jump(head);
        this.block = head;
        this.ifelse(stmt.Cond, body, done);

        this.block = body;
        this.loops.push({ break: done, continue: head });
        this.stmts(stmt.Body);
        this.loops.pop();
        this.jump(head);

        this.block = done;
        break;

      case "ReturnStmt":
        if (stmt.result !== null) {
          this.expr(stmt.result);
        } else {
          this.emit(Opcode.NONE);
        }
        this.emit(Opcode.RETURN);
        this.block = this.newBlock(); // dead code
        break;

      case "LoadStmt":
        for (const name of stmt.from) {
          this.string(name.name);
        }
        const module = stmt.module.value as string;
        this.pcomp.prog.Loads.push({
          Name: module,
          Pos: stmt.module.tokenPos,
        });
        this.string(module);
        this.setPos(stmt.load);
        this.emit1(Opcode.LOAD, stmt.from.length);
        for (const name of stmt.to.reverse()) {
          this.set(name);
        }
        break;

      default:
        const [start, _] = stmt.span();
        console.log(`${start}: exec: unexpected statement ${stmt.type}`);
        break;

    }

  }

  assign(pos: syntax.Position, lhs: syntax.Expr): void {
    switch (lhs.type) {
      case "ParenExpr":
        // (lhs) = rhs
        assign(this, pos, lhs.X)
        break

        typescript

      case "Ident":
        // x = rhs
        this.set(lhs)
        break

      case "TupleExpr":
        // x, y = rhs
        assignSequence(this, pos, lhs.List)
        break

      case "ListExpr":
        // [x, y] = rhs
        assignSequence(this, pos, lhs.List)
        break

      case "IndexExpr":
        // x[y] = rhs
        this.expr(lhs.X)
        this.emit(EXCH)
        this.expr(lhs.Y)
        this.emit(EXCH)
        this.setPos(lhs.Lbrack)
        this.emit(SETINDEX)
        break

      case "DotExpr":
        // x.f = rhs
        this.expr(lhs.X)
        this.emit(EXCH)
        this.setPos(lhs.Dot)
        this.emit1(SETFIELD, this.pcomp.nameIndex(lhs.Name.Name))
        break

      default:
        throw new Error(`Unexpected expression type: ${lhs.type}`)

    }
  }

  assignSequence(pos: syntax.Position, lhs: syntax.Expr[]): void {
    this.setPos(pos);
    this.emit1(Opcode.UNPACK, lhs.length);
    for (let i = 0; i < lhs.length; i++) {
      this.assign(pos, lhs[i]);
    }
  }

  expr(e: syntax.Expr) {

    switch (e) {
      case syntax.ParenExpr:
        this.expr(e.X);

      case syntax.Ident:
        this.lookup(e);

      case syntax.Literal:
        // e.Value is int64, float64, *bigInt, string
        let v = e.Value;
        if (e.Token === syntax.BYTES) {
          v = Bytes(v as string);
        }
        this.emit1(Opcode.CONSTANT, this.pcomp.constantIndex(v));

      case syntax.ListExpr:
        for (let x of e.List) {
          this.expr(x);
        }
        this.emit1(Opcode.MAKELIST, e.List.length);

      case syntax.CondExpr:
        // Keep consistent with IfStmt.
        const t = this.newBlock();
        const f = this.newBlock();
        const done = this.newBlock();

        this.ifelse(e.Cond, t, f);

        this.block = t;
        this.expr(e.True);
        this.jump(done);

        this.block = f;
        this.expr(e.False);
        this.jump(done);

        this.block = done;

      case syntax.IndexExpr:
        this.expr(e.X);
        this.expr(e.Y);
        this.setPos(e.Lbrack);
        this.emit(Opcode.INDEX);
        break;

      case syntax.SliceExpr:
        this.setPos(e.Lbrack);
        this.expr(e.X);
        if (e.Lo != null) {
          this.expr(e.Lo);
        } else {
          this.emit(Opcode.NONE);
        }
        if (e.Hi != null) {
          this.expr(e.Hi);
        } else {
          this.emit(Opcode.NONE);
        }
        if (e.Step != null) {
          this.expr(e.Step);
        } else {
          this.emit(Opcode.NONE);
        }
        this.emit(Opcode.SLICE);
        break;

      case syntax.Comprehension:
        if (e.Curly) {
          this.emit(Opcode.MAKEDICT);
        } else {
          this.emit1(Opcode.MAKELIST, 0);
        }
        this.comprehension(e, 0);
        break;

      case syntax.TupleExpr:
        this.tuple(e.List);
        break;
      case syntax.Kind.DictExpr:
        this.emit(Opcode.MAKEDICT);
        for (const entry of e.List) {
          const dictEntry = entry as syntax.DictEntry;
          this.emit(Opcode.DUP);
          this.expr(dictEntry.Key);
          this.expr(dictEntry.Value);
          this.setPos(dictEntry.Colon);
          this.emit(Opcode.SETDICTUNIQ);
        }
        break;

      case syntax.Kind.UnaryExpr:
        this.expr(e.X);
        this.setPos(e.OpPos);
        switch (e.Op) {
          case syntax.MINUS:
            this.emit(Opcode.UMINUS);
            break;
          case syntax.PLUS:
            this.emit(Opcode.UPLUS);
            break;
          case syntax.NOT:
            this.emit(Opcode.NOT);
            break;
          case syntax.TILDE:
            this.emit(Opcode.TILDE);
            break;
          default:
            throw new Error(`${e.OpPos}: unexpected unary op: ${e.Op}`);
        }
        break;

      case syntax.BinaryExpr:
        switch (e.Op) {
          case syntax.OR:
            // x or y  =>  if x then x else y
            const done = this.newBlock();
            const y = this.newBlock();

            this.expr(e.X);
            this.emit(Opcode.DUP);
            this.condjump(Opcode.CJMP, done, y);

            this.block = y;
            this.emit(Opcode.POP); // discard X
            this.expr(e.Y);
            this.jump(done);

            this.block = done;
            break;

          case syntax.AND:
            // x and y  =>  if x then y else x
            const done1 = this.newBlock();
            const y1 = this.newBlock();

            this.expr(e.X);
            this.emit(Opcode.DUP);
            this.condjump(Opcode.CJMP, y1, done1);

            this.block = y1;
            this.emit(Opcode.POP); // discard X
            this.expr(e.Y);
            this.jump(done1);

            this.block = done1;
            break;

          case syntax.PLUS:
            this.plus(e);
            break;

          default:
            // all other strict binary operator (includes comparisons)
            this.expr(e.X);
            this.expr(e.Y);
            this.binop(e.OpPos, e.Op);
            break;
        }

      case syntax.DotExpr:
        this.expr(e.X)
        this.setPos(e.Dot)
        this.emit1(Opcode.ATTR, this.pcomp.nameIndex(e.Name.Name))
        break;

      case syntax.CallExpr:
        this.call(e);
        break;

      case syntax.LambdaExpr:
        this.function(e.Function);
        break;

      default:
        const start = e.Span()[0];
        console.log(`${start}: unexpected expr ${e.constructor.name}`);
        break;

    }
  }

  plus(e: syntax.BinaryExpr): void {
    // Gather all the right operands of the left tree of plusses.
    // A tree (((a+b)+c)+d) becomes args=[a +b +c +d].
    const args: Summand[] = [];
    for (let plus = e; ;) {
      args.push({ x: this.unparen(plus.Y), plusPos: plus.OpPos });
      const left = this.unparen(plus.X) as syntax.Expr;
      if (!(left instanceof syntax.BinaryExpr) || left.Op !== syntax.PLUS) {
        args.push({ x: left });
        break;
      }
      plus = left;
    }
    // Reverse args to syntactic order.
    args.reverse();

    // Fold sums of adjacent literals of the same type: ""+"", []+[], ()+().
    const out: Summand[] = []; // compact in situ
    for (let i = 0; i < args.length;) {
      let j = i + 1;
      const code = this.addable(args[i].x);
      if (code !== 0) {
        while (j < args.length && this.addable(args[j].x) === code) {
          j++;
        }
        if (j > i + 1) {
          args[i].x = this.add(code, args.slice(i, j));
        }
      }
      out.push(args[i]);
      i = j;
    }
    const compactArgs = out;

    // Emit code for an n-ary sum (n > 0).
    this.expr(compactArgs[0].x);
    for (let i = 1; i < compactArgs.length; i++) {
      const summand = compactArgs[i];
      this.expr(summand.x);
      this.setPos(summand.plusPos);
      this.emit(Opcode.PLUS);
    }
  }

  binop(pos: syntax.Position, op: syntax.Token): void {
    // TODO(adonovan): simplify by assuming syntax and compiler constants align.
    this.setPos(pos);
    switch (op) {
      // arithmetic
      case syntax.PLUS:
        this.emit(Opcode.PLUS);
        break;
      case syntax.MINUS:
        this.emit(Opcode.MINUS);
        break;
      case syntax.STAR:
        this.emit(Opcode.STAR);
        break;
      case syntax.SLASH:
        this.emit(Opcode.SLASH);
        break;
      case syntax.SLASHSLASH:
        this.emit(Opcode.SLASHSLASH);
        break;
      case syntax.PERCENT:
        this.emit(Opcode.PERCENT);
        break;
      case syntax.AMP:
        this.emit(Opcode.AMP);
        break;
      case syntax.PIPE:
        this.emit(Opcode.PIPE);
        break;
      case syntax.CIRCUMFLEX:
        this.emit(Opcode.CIRCUMFLEX);
        break;
      case syntax.LTLT:
        this.emit(Opcode.LTLT);
        break;
      case syntax.GTGT:
        this.emit(Opcode.GTGT);
        break;
      case syntax.IN:
        this.emit(Opcode.IN);
        break;
      case syntax.NOT_IN:
        this.emit(Opcode.IN);
        this.emit(Opcode.NOT);
        break;

      // comparisons
      case syntax.EQL:
      case syntax.NEQ:
      case syntax.GT:
      case syntax.LT:
      case syntax.LE:
      case syntax.GE:
        this.emit(op - syntax.EQL + Opcode.EQL);
        break;
      default:
        console.log(`${pos}: unexpected binary op: ${op}`);
        throw new Error("Unexpected binary op");
    }
  }

  call(call: syntax.CallExpr): void {
    // usual case
    this.expr(call.Fn);
    const [op, arg] = this.args(call);
    this.setPos(call.Lparen);
    this.emit1(op, arg);
  }

  // args emits code to push a tuple of positional arguments
  // and a tuple of named arguments containing alternating keys and values.
  // Either or both tuples may be empty.
  args(call: syntax.CallExpr): [Opcode, number] {
    let callmode = 0;
    // Compute the number of each kind of parameter.
    let p = 0; // number of positional arguments
    let n = 0; // number of named arguments
    let varargs: syntax.Expr | undefined;
    let kwargs: syntax.Expr | undefined;
    for (const arg of call.Args) {
      if (arg instanceof syntax.BinaryExpr && arg.Op === syntax.EQ) {
        // named argument (name, value)
        // BUG: here
        // this.string(arg.X.(* syntax.Ident).Name);
        this.expr(arg.Y);
        n++;
        continue;
      }
      if (arg instanceof syntax.UnaryExpr) {
        if (arg.Op === syntax.STAR) {
          callmode |= 1;
          varargs = arg.X;
          continue;
        } else if (arg.Op === syntax.STARSTAR) {
          callmode |= 2;
          kwargs = arg.X;
          continue;
        }
      }
      // positional argument
      this.expr(arg);
      p++;
    }

    // *args
    if (varargs !== undefined) {
      this.expr(varargs);
    }

    // **kwargs
    if (kwargs !== undefined) {
      this.expr(kwargs);
    }

    // TODO: avoid this with a more flexible encoding.
    if (p >= 256 || n >= 256) {
      // resolve already checked this; should be unreachable
      throw new Error("too many arguments in call");
    }

    return [Opcode.CALL + callmode, p << 8 | n];
  }

  tuple(elems: syntax.Expr[]): void {
    elems.forEach((elem) => this.expr(elem));
    this.emit1(Opcode.MAKETUPLE, elems.length);
  }

  // emit a comprehension with the given syntax comprehension and clause index
  comprehension(comp: syntax.Comprehension, clauseIndex: number): void {
    if (clauseIndex == comp.clauses.length) {
      this.dup();
      if (comp.curly) {
        // dict: {k:v for ...}
        // Parser ensures that body is of form k:v.
        // Python-style set comprehensions {body for vars in x}
        // are not supported.
        const entry = comp.body as syntax.DictEntry;
        this.expr(entry.key);
        this.expr(entry.value);
        this.setDict(entry.colon);
      } else {
        // list: [body for vars in x]
        this.expr(comp.body);
        this.append();
      }
      return;
    }

    const clause = comp.clauses[clauseIndex];
    switch (clause.constructor) {
      case syntax.IfClause:
        const t = this.newBlock();
        const done = this.newBlock();
        this.ifelse((clause as syntax.IfClause).cond, t, done);

        this.block = t;
        this.comprehension(comp, clauseIndex + 1);
        this.jump(done);

        this.block = done;
        return;

      case syntax.ForClause:
        // Keep consistent with ForStmt.
        const head = this.newBlock();
        const body = this.newBlock();
        const tail = this.newBlock();

        this.expr(clause.X)
        this.setPos(clause.For)
        this.emit(Opcode.ITERPUSH)

        this.jump(head);

        this.block = head;
        this.condjump(Opcode.ITERJMP, tail, body);

        this.block = body;
        this.assign((clause as syntax.ForClause).vars, [null]); // TODO: Implement variable assignment
        this.comprehension(comp, clauseIndex + 1);
        this.jump(head);

        this.block = tail;
        this.emit(Opcode.ITERPOP);
        return
    }

    let start, _ = clause.Span();
    throw new Error(`${start}: unexpected comprehension clause ${clause}`)
  }

  // TypeScript equivalent of the given Golang code
  function(f: resolve.Function): void {
    // Evaluation of the defaults may fail, so record the position.
    this.setPos(f.Pos);

    // To reduce allocation, we emit a combined tuple
    // for the defaults and the freevars.
    // The function knows where to split it at run time.

    // Generate tuple of parameter defaults. For:
    // def f(p1, p2=dp2, p3=dp3, *, k1, k2=dk2, k3, **kwargs)
    // the tuple is:
    // (dp2, dp3, MANDATORY, dk2, MANDATORY).
    let ndefaults = 0;
    let seenStar = false;
    for (const param of f.Params) {
      switch (param.type) {
        case "BinaryExpr":
          this.expr(param.Y);
          ndefaults++;
          break;
        case "UnaryExpr":
          seenStar = true; // * or *args (also **kwargs)
          break;
        case "Ident":
          if (seenStar) {
            this.emit(Opcode.MANDATORY);
            ndefaults++;
          }
          break;
      }
    }

    // Capture the cells of the function's
    // free variables from the lexical environment.
    for (const freevar of f.FreeVars) {
      // Don't call fcomp.lookup because we want
      // the cell itself, not its content.
      switch (freevar.Scope) {
        case resolve.Free:
          this.emit1(Opcode.FREE, freevar.Index);
          break;
        case resolve.Cell:
          this.emit1(Opcode.LOCAL, freevar.Index);
          break;
      }
    }

    this.emit1(Opcode.MAKETUPLE, ndefaults + f.FreeVars.length);

    const funcode = this.pcomp.function(
      f.Name,
      f.Pos,
      f.Body,
      f.Locals,
      f.FreeVars
    );

    if (debug) {
      // TODO(adonovan): do compilations sequentially not as a tree,
      // to make the log easier to read.
      // Simplify by identifying Toplevel and functionIndex 0.
      // FIXME: missing debug
      // console.log(`resuming ${this.fn.Name} @${this.pos} `);
    }

    // def f(a, *, b=1) has only 2 parameters.
    let numParams = f.Params.length;
    if (f.NumKwonlyParams > 0 && !f.HasVarargs) {
      numParams--;
    }

    funcode.numParams = numParams;
    funcode.numKwonlyParams = f.NumKwonlyParams;
    funcode.hasVarargs = f.HasVarargs;
    funcode.hasKwargs = f.HasKwargs;
    this.emit1(Opcode.MAKEFUNC, this.pcomp.functionIndex(funcode));
  }

  // ifelse emits a Boolean control flow decision.
  // On return, the current block is unset.
  ifelse(cond: syntax.Expr, t: block, f: block) {
    let y;
    switch (cond.type) {
      case "UnaryExpr":
        if (cond.Op === "!" || cond.Op === "not") {
          // if not x then goto t else goto f
          // =>
          // if x then goto f else goto t
          this.ifelse(cond.X, f, t);
          return;
        }
        break;
      case "BinaryExpr":
        switch (cond.Op) {
          case "&&":
          case "and":
            // if x and y then goto t else goto f
            // =>
            // if x then ifelse(y, t, f) else goto f
            this.expr(cond.X);
            y = this.newBlock();
            this.condjump(Opcode.CJMP, y, f);

            this.block = y;
            this.ifelse(cond.Y, t, f);
            return;
          case "||":
          case "or":
            // if x or y then goto t else goto f
            //    =>
            // if x then goto t else ifelse(y, t, f)
            this.expr(cond.X);
            y = this.newBlock();
            this.condjump(Opcode.CJMP, t, y);

            this.block = y;
            this.ifelse(cond.Y, t, f);
            return;
          case "not in":
            // if x not in y then goto t else goto f
            //    =>
            // if x in y then goto f else goto t
            const copy = { ...cond };
            // BUG:
            copy.Op = syntax.IN;
            this.expr(copy);
            this.condjump(Opcode.CJMP, f, t);
            return;
        }
        break;

    }

    // general case
    this.expr(cond);
    this.condjump(Opcode.CJMP, t, f);
  }
}

class loop {
  public break_: block;
  public continue_: block;
}

class block {
  public insns: insn[];
  public jmp?: block;
  public cjmp?: block;
  public initialstack: number;
  public index: number; // -1 => not encoded yet
  public addr: number;
}

class insn {
  op: Opcode;
  arg: number;
  line: number;
  col: number;

  stackeffect(): number {
    let se: number = stackEffect[this.op];
    if (se === variableStackEffect) {
      const arg: number = Number(this.arg);
      switch (this.op) {
        case Opcode.CALL:
        case Opcode.CALL_KW:
        case Opcode.CALL_VAR:
        case Opcode.CALL_VAR_KW:
          se = -2 * (this.arg & 0xff) + (this.arg >> 8);
          if (this.op !== Opcode.CALL) {
            se--;
          }
          if (this.op === Opcode.CALL_VAR_KW) {
            se--;
          }
          break;
        case Opcode.ITERJMP:
          se = 0;
          // Stack effect differs by successor:
          // +1 for jmp/false/ok
          //  0 for cjmp/true/exhausted
          // Handled specially in caller.
          break;
        case Opcode.MAKELIST:
        case Opcode.MAKETUPLE:
          se = 1 - arg;
          break;
        case Opcode.UNPACK:
          se = arg - 1;
          break;
        default:
          throw new Error(this.op.toString());
      }
    }
    return se;
  }

}

function bindings(bindings: resolve.Binging[]): Binding[] {
  let res = new Array();
  for (var b of bindings) {
    res.push(new Binding(b.First.Name, b.First.NamePos));
  }
  return res;
}

// Expr compiles an expression to a program whose toplevel function evaluates it.
function Expr(
  expr: syntax.Expr,
  name: string,
  locals: resolve.Binding[]
): Program {
  const pos = syntax.Start(expr);
  const stmts: syntax.Stmt[] = [new ReturnStmt(expr)];
  return File(stmts, pos, name, locals, null);
}

// File compiles the statements of a file into a program.
function File(
  stmts: syntax.Stmt[],
  pos: syntax.Position,
  name: string,
  locals: resolve.Binding[],
  globals: resolve.Binding[]
): Program {
  const pcomp: Pcomp = {
    prog: {
      Globals: bindings(globals),
    } as Program,
    names: new Map(),
    constants: new Map(),
    functions: new Map(),
  };
  pcomp.prog.Toplevel = pcomp.function(name, pos, stmts, locals, null);

  return pcomp.prog;
}

function docStringFromBody(body: syntax.Stmt[]): string {
  if (body.length === 0) {
    return '';
  }
  const expr = body[0] as syntax.ExprStmt;
  if (!expr) {
    return '';
  }
  const lit = expr.X as syntax.Literal;
  if (!lit || lit.Token !== syntax.STRING) {
    return '';
  }
  return lit.Value as string;
}

function clip(x: number, min: number, max: number): [number, boolean] {
  if (x > max) {
    return [max, false];
  } else if (x < min) {
    return [min, false];
  } else {
    return [x, true];
  }
}

function addUint32(code: number[], x: number, min: number): number[] {
  let end: number = code.length + min;
  while (x >= 0x80) {
    code.push(x | 0x80);
    x >>= 7;
  }
  code.push(x);
  // Pad the operand with NOPs to exactly min bytes.
  while (code.length < end) {
    code.push(Opcode.NOP);
  }
  return code;
}

function argLen(x: number): number {
  let n = 0;
  while (x >= 0x80) {
    n++;
    x >>= 7;
  }
  return n + 1;
}

// PrintOp prints an instruction.
// It is provided for debugging.
function PrintOp(fn: Funcode, pc: number, op: Opcode, arg: number): void {
  if (op < OpcodeArgMin) {
    console.log(`\t${pc} \t${op} `);
    return;
  }

  let comment = "";
  switch (op) {
    case Opcode.CONSTANT:
      const constant = fn.Prog.Constants[arg];
      if (typeof constant === "string") {
        comment = JSON.stringify(constant);
      } else if (constant instanceof Bytes) {
        comment = `b${JSON.stringify(constant.toString())} `;
      } else {
        comment = String(constant);
      }
      break;
    case Opcode.MAKEFUNC:
      comment = fn.Prog.Functions[arg].Name;
      break;
    case Opcode.SETLOCAL:
    case Opcode.LOCAL:
      comment = fn.Locals[arg].Name;
      break;
    case Opcode.SETGLOBAL:
    case Opcode.GLOBAL:
      comment = fn.Prog.Globals[arg].Name;
      break;
    case Opcode.ATTR:
    case Opcode.SETFIELD:
    case Opcode.PREDECLARED:
    case Opcode.UNIVERSAL:
      comment = fn.Prog.Names[arg];
      break;
    case Opcode.FREE:
      comment = fn.Freevars[arg].Name;
      break;
    case Opcode.CALL:
    case Opcode.CALL_VAR:
    case Opcode.CALL_KW:
    case Opcode.CALL_VAR_KW:
      comment = `${(arg >> 8)} pos, ${(arg & 0xff)} named`;
      break;
    default:
      // JMP, CJMP, ITERJMP, MAKETUPLE, MAKELIST, LOAD, UNPACK:
      // arg is just a number
      break;
  }
  const buf = new Array<string>();
  buf.push(`\t${pc} \t${op} \t${arg} `);
  if (comment !== "") {
    buf.push(`\t; ${comment} `);
  }
  console.log(buf.join(""));
}

class Summand {
  x: syntax.Expr
  plusPos: syntax.Position
}

// addable reports whether e is a statically addable
// expression: a [s]tring, [b]ytes, [a]rray, or [t]uple.
function addable(e: syntax.Expr): string | null {
  switch (e.type) {
    case "Literal": {
      const { value, kind } = e;
      if (kind === "STRING") {
        return "s";
      } else if (kind === "BYTES") {
        return "b";
      }
      break;
    }
    case "ArrayExpr":
      return "a";
    case "TupleExpr":
      return "t";
  }
  return null;
}

// add returns an expression denoting the sum of args,
// which are all addable values of the type indicated by code.
// The resulting syntax is degenerate, lacking position, etc.
function add(code: string, args: Summand[]): syntax.Expr {
  switch (code) {
    case 's':
    case 'b': {
      let buf = ''
      for (const arg of args) {
        buf += arg.x instanceof syntax.Literal ? arg.x.Value : ''
      }
      const tok = code === 'b' ? syntax.BYTES : syntax.STRING
      return { Token: tok, Value: buf } as syntax.Literal
    }
    case 'l': {
      let elems: syntax.Expr[] = []
      for (const arg of args) {
        elems = elems.concat(arg.x instanceof syntax.ListExpr ? arg.x.List : [])
      }
      return { List: elems } as syntax.ListExpr
    }
    case 't': {
      let elems: syntax.Expr[] = []
      for (const arg of args) {
        elems = elems.concat(arg.x instanceof syntax.TupleExpr ? arg.x.List : [])
      }
      return { List: elems } as syntax.TupleExpr
    }
  }
  throw new Error('Unsupported code: ' + code)
}

function unparen(e: syntax.Expr): syntax.Expr {
  if (e instanceof syntax.ParenExpr) {
    return unparen(e.X);
  }
  return e;
}
