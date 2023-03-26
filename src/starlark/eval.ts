import { Err, Ok, Result } from 'ts-results';

import * as binding from '../resolve/binding';
import * as resolve from '../resolve/resolve';
import * as compile from '../starlark-compiler/compile';
import { Position, Token } from '../starlark-parser';
import { ParseExpr, parse } from '../starlark-parser';
import * as syntax from '../starlark-parser/syntax';
import { AsInt32, MakeBigInt, MakeInt64 } from './int';
import { Int } from './int';
import { CallInternal } from './interpreter';
import { mandatory } from './interpreter';
import { Universe } from './stdlib';
import { Callable, Equal, Function, Module, String, Tuple } from './values';
import { Bytes } from './values';
import { Iterable, List } from './values';
import { Value } from './values';
import { Builtin, StringDict } from './values';
import { Bool } from './values';
import { Dict } from './values';
import { Float } from './values';
import { Mapping, isMapping } from './values';
import { Set } from './values';
import { False, True } from './values';
import { RangeValue } from './values';

// import {*} from "./value"

var debug = require('debug')('eval');

// A Thread contains the state of a Starlark thread,
// such as its call stack and thread-local storage.
// The Thread is threaded throughout the evaluator.
export class Thread {
  // Name is an optional name that describes the thread, for debugging.
  public Name: string;

  // stack is the stack of (internal) call frames.
  public stack: Frame[] = [];

  // Print is the client-supplied implementation of the Starlark
  // 'print' function. If nil, console.log(msg) is
  // used instead.
  public Print: (thread: Thread, msg: string) => void;

  // Load is the client-supplied implementation of module loading.
  // Repeated calls with the same module name must return the same
  // module environment or error.
  // The error message need not include the module name.
  //
  // See example_test.ts for some example implementations of Load.
  public Load: (thread: Thread, module: string) => [StringDict, Error];

  // OnMaxSteps is called when the thread reaches the limit set by SetMaxExecutionSteps.
  // The default behavior is to call thread.Cancel("too many steps").
  public OnMaxSteps: (thread: Thread) => void;

  // Steps a count of abstract computation steps executed
  // by this thread. It is incremented by the interpreter. It may be used
  // as a measure of the approximate cost of Starlark execution, by
  // computing the difference in its value before and after a computation.
  //
  // The precise meaning of "step" is not specified and may change.
  public steps = 0;
  public maxSteps = 0;

  // cancelReason records the reason from the first call to Cancel.
  public cancelReason: string;

  // locals holds arbitrary "thread-local" Go values belonging to the client.
  // They are accessible to the client but not to any Starlark program.
  public locals: Map<string, any>;

  // proftime holds the accumulated execution time since the last profile event.
  // public proftime = new Date();

  public ExecutionSteps(): number {
    return this.steps;
  }

  // Sets a limit on the number of Starlark computation steps that may be executed by this thread.
  // If the thread's step counter exceeds this limit, the interpreter calls the optional OnMaxSteps
  // function or the default behavior of calling thread.Cancel("too many steps").
  public SetMaxExecutionSteps(max: number): void {
    this.maxSteps = max;
  }

  public Uncancel(): void {
    // TODO:
    // atomic.StorePointer(<unsafe.Pointer><unknown>& this.cancelReason, null);
  }

  public Cancel(reason: string): void {
    // TODO
    // atomic.CompareAndSwapPointer(<unsafe.Pointer><unknown>& this.cancelReason, null, <unsafe.Pointer><unknown>& reason);
  }

  public setLocal(key: string, value: any): void {
    // if (!this.locals) {
    //   this.locals = {};
    // }
    this.locals.set(key, value);
  }

  public local(key: string): any {
    return this.locals.get(key);
  }

  public CallFrame(depth: number): CallFrame {
    return this.frameAt(depth).asCallFrame();
  }

  public frameAt(depth: number): Frame {
    return this.stack[this.stack.length - 1 - depth];
  }

  // BUG: type
  public CallStack(): CallStack {
    const frames: CallFrame[] = [];
    for (let i = 0; i < this.stack.length; i++) {
      const fr = this.stack[i];
      frames.push(fr.asCallFrame());
    }
    return new CallStack(frames);
  }
  // CallStackDepth returns the number of frames in the current call stack.
  public callStackDepth(): number {
    return this.stack.length;
  }

  evalError(err: Error): EvalError {
    return new EvalError(err.toString(), this.CallStack(), err);
  }
}

const builtinFilename = '<builtin>';

// A frame records a call to a Starlark function (including module toplevel)
// or a built-in function or method.
class Frame {
  callable: Callable; // current function (or toplevel) or built-in
  pc: number; // program counter (Starlark frames only)
  locals: Value[]; // local variables (Starlark frames only)
  spanStart: number; // start time of current profiler span

  constructor(
    callable: Callable,
    pc: number,
    locals: Value[],
    spanStart: number
  ) {
    this.callable = callable;
    this.pc = pc;
    this.locals = locals;
    this.spanStart = spanStart;
  }

  // Position returns the source position of the current point of execution in this frame.
  Position(): Position {
    if (this.callable instanceof Function) {
      let v = this.callable as Function;
      return v.funcode.position(this.pc);
    }
    if ('position' in this.callable) {
      // If a built-in Callable defines
      // a Position method, use it.
      //@ts-ignore
      return this.callable.position();
    }
    return new Position(builtinFilename, 0, 0);
  }

  // Function returns the frame's function or built-in.
  Callable(): Callable {
    return this.callable;
  }

  asCallFrame(): CallFrame {
    return new CallFrame(this.Callable().Name(), this.Position());
  }
}

// A CallStack is a stack of call frames, outermost first.
class CallStack {
  frames: CallFrame[];

  constructor(frames: CallFrame[]) {
    this.frames = frames;
  }

  // At returns a copy of the frame at depth i.
  // At(0) returns the topmost frame.
  At(i: number): CallFrame {
    return this.frames[this.frames.length - 1 - i];
  }

  // Pop removes and returns the topmost frame.
  Pop(): CallFrame {
    const last = this.frames.length - 1;
    const top = this.frames[last];
    this.frames = this.frames.slice(0, last);
    return top;
  }

  // String returns a user-friendly description of the stack.
  toString(): string {
    const out = new Array();
    if (this.frames.length > 0) {
      out.push('Traceback (most recent call last):\n');
    }
    for (const fr of this.frames) {
      out.push(`  ${fr.pos}: in ${fr.name}\n`);
    }
    return out.join('');
  }
}

// An EvalError is a Starlark evaluation error and
// a copy of the thread's stack at the moment of the error.
class EvalError extends Error {
  public Msg: string;
  public CallStack: CallStack;
  public cause: Error;

  constructor(msg: string, callStack: CallStack, cause: Error) {
    super(msg);
    this.Msg = msg;
    this.CallStack = callStack;
    this.cause = cause;
  }

  Error(): string {
    return this.Msg;
  }

  Backtrace(): string {
    // TODO:
    return 'backtrace';
  }

  Unwrap(): Error {
    return this.cause;
  }
}

// A CallFrame represents the function name and current
// position of execution of an enclosing call frame.
class CallFrame {
  public name: string;
  public pos: Position;

  constructor(name: string, pos: Position) {
    this.name = name;
    this.pos = pos;
  }
}

// CompilerVersion is the version number of the protocol for compiled
// files. Applications must not run programs compiled by one version
// with an interpreter at another version, and should thus incorporate
// the compiler version into the cache key when reusing compiled code.
const CompilerVersion = compile.Version;

export class Program {
  public compiled: compile.Program;

  constructor(compiled: compile.Program) {
    this.compiled = compiled;
  }

  // Filename returns the name of the file from which this program was loaded.
  public Filename(): string {
    return this.compiled.toplevel?.pos.filename() || '';
  }

  public String(): string {
    return this.Filename();
  }

  // NumLoads returns the number of load statements in the compiled program.
  public NumLoads(): number {
    return this.compiled.loads.length;
  }

  // Load(i) returns the name and position of the i'th module directly
  // loaded by this one, where 0 <= i < NumLoads().
  // The name is unresolved---exactly as it appears in the source.
  public Load(i: number): [string, Position] {
    const id = this.compiled.loads[i];
    return [id.name, id.pos];
  }

  public init(
    thread: Thread,
    predeclared: StringDict
  ): [StringDict, Error | null] {
    const toplevel = makeToplevelFunction(this.compiled, predeclared);

    const [_, err] = Call(
      thread,
      toplevel,
      new Tuple(new Array()),
      new Array()
    );

    return [toplevel.Globals(), err];
  }
}

// ExecFile parses, resolves, and executes a Starlark file in the specified global environment,
// which may be modified during execution.
// Thread is the state associated with the Starlark thread.
// The filename and src parameters are as for syntax.Parse:
// filename is the name of the file to execute,
// and the name that appears in error messages;
// src is an optional source of bytes to use instead of filename.
// predeclared defines the predeclared names specific to this module.
// Execution does not modify this dictionary, though it may mutate its values.
// If ExecFile fails during evaluation, it returns an EvalError containing a backtrace.
export function ExecFile(
  thread: Thread,
  filename: string,
  src: any,
  predeclared: StringDict
): Result<StringDict | null, Error> {
  const f = (s: string): boolean => {
    return predeclared.has(s);
  };

  // Parse, resolve, and compile a Starlark source file.
  const res = sourceProgram(filename, src, f);

  return res.map((val) => {
    const [, mod] = val;
    let [g] = mod.init(thread, predeclared);
    g.freeze();
    return g;
  });
}

// SourceProgram produces a new program by parsing, resolving,
// and compiling a Starlark source file.
// On success, it returns the parsed file and the compiled program.
// The filename and src parameters are as for syntax.Parse.
// The isPredeclared predicate reports whether a name is
// a pre-declared identifier of the current module.
// Its typical value is predeclared.Has,
// where predeclared is a StringDict of pre-declared values.
function sourceProgram(
  filename: string,
  src: any,
  isPredeclared: (name: string) => boolean
): Result<[syntax.File, Program], Error> {
  const [f, err] = parse(filename, src, 0);
  if (err !== null) {
    return Err(err);
  }
  const prog = FileProgram(f!, isPredeclared);
  return Ok([f!, prog]);
}

// FileProgram produces a new program by resolving,
// and compiling the Starlark source file syntax tree.
// On success, it returns the compiled program.
//
// Resolving a syntax tree mutates it.
// Do not call FileProgram more than once on the same file.
//
// The isPredeclared predicate reports whether a name is
// a pre-declared identifier of the current module.
// Its typical value is predeclared.Has,
// where predeclared is a StringDict of pre-declared values.
function FileProgram(
  f: syntax.File,
  isPredeclared: (name: string) => boolean
): Program {
  const fn = (s: string): boolean => {
    return Universe.has(s);
  };
  resolve.File(f, isPredeclared, fn);

  let pos: Position;
  if (f.Stmts.length > 0) {
    pos = f.Stmts[0].span()[0];
  } else {
    pos = new Position(f.Path, 1, 1);
  }

  const module = f.Module as binding.Module;
  const compiled = compile.File(
    f.Stmts,
    pos,
    '<toplevel>',
    module.locals,
    module.globals
  );

  return new Program(compiled);
}

// TypeScript implementation of ExecREPLChunk
// Note: This implementation assumes that the required libraries and types are already imported/defined

function ExecREPLChunk(
  f: syntax.File,
  thread: Thread,
  globals: StringDict
): Error | null {
  let predeclared: StringDict = new StringDict();

  // -- variant of FileProgram --

  const has = (x: string): boolean => globals.hasOwnProperty(x);
  const universeHas = (x: string): boolean => true; // The Universe object is not defined in TypeScript, but we can assume everything is part of the universe
  const replChunkErr = resolve.REPLChunk(f, has, predeclared.has, universeHas);

  if (replChunkErr !== null) {
    //@ts-ignore
    return replChunkErr;
  }

  let pos: Position;
  if (f.Stmts.length > 0) {
    pos = f.Stmts[0].span()[0];
  } else {
    pos = new Position(f.Path, 1, 1);
  }

  const module = f.Module as binding.Module;
  const compiled = compile.File(
    f.Stmts,
    pos,
    '<toplevel>',
    module.locals,
    module.globals
  );
  const prog = new Program(compiled);

  // -- variant of Program.Init --

  const toplevel = makeToplevelFunction(prog.compiled, predeclared);

  // Initialize module globals from parameter.
  for (let i = 0; i < prog.compiled.globals.length; i++) {
    const id = prog.compiled.globals[i];
    if (globals.has(id.name)) {
      toplevel.module.globals[i] = globals.get(id.name)!;
    }
  }

  const [, err] = Call(thread, toplevel, new Tuple(new Array()), new Array());

  // Reflect changes to globals back to parameter, even after an error.
  for (let i = 0; i < prog.compiled.globals.length; i++) {
    const id = prog.compiled.globals[i];
    if (toplevel.module.globals[i] !== null) {
      globals.set(id.name, toplevel.module.globals[i]);
    }
  }

  return err;
}

function makeToplevelFunction(
  prog: compile.Program,
  predeclared: StringDict
): Function {
  const constants: Value[] = new Array(prog.constants.length);

  for (let i = 0; i < prog.constants.length; i++) {
    const c = prog.constants[i];
    let v: Value;

    if (typeof c === 'number') {
      v = MakeInt64(BigInt(c));
    } else if (typeof c == 'bigint') {
      v = MakeBigInt(c);
    } else if (typeof c === 'string') {
      v = new String(c);
      // TODO:
      // } else if (c instanceof compile.Bytes) {
      //   v = Bytes(c);
      // } else if (typeof c === "number") {
      //   v = Float(c);
    } else {
      throw new Error(`unexpected constant ${c.constructor.name}: ${c}`);
    }
    constants[i] = v;
  }

  return new Function(
    prog.toplevel!,
    new Module(prog, predeclared, new Array(prog.globals.length), constants),
    new Tuple(new Array()),
    new Tuple(new Array())
  );
}

// Eval parses, resolves, and evaluates an expression within the
// specified (predeclared) environment.
//
// Evaluation cannot mutate the environment dictionary itself,
// though it may modify variables reachable from the dictionary.
//
// The filename and src parameters are as for syntax.Parse.
//
// If Eval fails during evaluation, it returns an EvalError
// containing a backtrace.
function Eval(
  thread: Thread,
  filename: string,
  src: any,
  env: StringDict
): [Value | null, Error | null] {
  let [expr, err] = ParseExpr(filename, src, 0);
  if (err != null) {
    return [null, err];
  }
  let [f, err2] = makeExprFunc(expr!, env);
  if (err2 !== null) {
    return [null, err2];
  }
  return Call(thread, f, new Tuple(new Array()), new Array());
}

// EvalExpr resolves and evaluates an expression within the
// specified (predeclared) environment.
// Evaluating a comma-separated list of expressions yields a tuple value.
//
// Resolving an expression mutates it.
// Do not call EvalExpr more than once for the same expression.
//
// Evaluation cannot mutate the environment dictionary itself,
// though it may modify variables reachable from the dictionary.
//
// If Eval fails during evaluation, it returns an EvalError
// containing a backtrace.
function EvalExpr(
  thread: Thread,
  expr: syntax.Expr,
  env: StringDict
): [Value, Error | null] {
  const [fn, err] = makeExprFunc(expr, env);
  if (err != null) {
    return [fn, err];
  }
  return Call(thread, fn, new Tuple(new Array()), new Array());
}

// ExprFunc returns a no-argument function
// that evaluates the expression whose source is src.
function ExprFunc(
  filename: string,
  src: any,
  env: StringDict
): [Function | null, Error | null] {
  const [expr, err] = ParseExpr(filename, src, 0);
  if (err != null) {
    return [null, err];
  }
  return makeExprFunc(expr!, env);
}

// makeExprFunc returns a no-argument function whose body is expr.
function makeExprFunc(
  expr: syntax.Expr,
  env: StringDict
): [Function, Error | null] {
  const [locals, err] = resolve.Expr(expr, env.has, Universe.has);
  if (err instanceof Error) {
    //@ts-ignore
    return [locals, err];
  }
  const compiled = compile.Expr(expr, '<expr>', locals);
  return [makeToplevelFunction(compiled, env), null];
}

// The following functions are primitive operations of the byte code interpreter.

// list += iterable
export function listExtend(x: List, y: Iterable): void {
  if (y instanceof List) {
    // fast path: list += list
    x.elems.push(...(y as List).elems);
  } else {
    let iter = y.iterate();
    // TODO:
    // try {
    //   let z: Value;
    //   while (iter.next(z)) {
    //     x.elems.push(z);
    //   }
    // } finally {
    //   iter.done();
    // }
  }
}

// getAttr implements x.dot.
export function getAttr(x: Value, name: string): [Value | null, Error | null] {
  let hasAttr = 'Attr' in x && 'AttrNames' in x;
  if (!hasAttr) {
    return [null, new Error(`${x.Type()} has no.${name} field or method`)];
  }

  let errmsg: string;
  let v: Value;

  try {
    //@ts-ignore
    v = x.Attr(name);
    if (v !== null) {
      return [v, null];
    }
  } catch (err) {
    // if (err instanceof NoSuchAttrError) {
    //   errmsg = err.toString();
    // } else {
    return [null, err as Error];
    // }
  }

  // (null, null) => generic error
  errmsg = `${x.Type()} has no.${name} field or method`;

  // add spelling hint
  // let n = spell.Nearest(name, x.AttrNames());
  // if (n) {
  //   errmsg = `${errmsg} (did you mean.${n}?)`;
  // }

  return [null, new Error(errmsg)];
}

// setField implements x.name = y.
export function setField(x: Value, name: string, y: Value): Error | null {
  // if (isHasSetField(x)) {
  //   const err = x.setField(name, y);
  //   if (isNoSuchAttrError(err)) {
  //     // No such field: check spelling.
  //     const n = spell.Nearest(name, x.attrNames());
  //     if (n !== "") {
  //       return new Error(`${err}(did you mean.${n} ?)`);
  //     }
  //   }
  //   return err;
  // }

  return new Error(`can't assign to .${name} field of ${x.Type()}`);
}

// getIndex implements x[y].
export function getIndex(x: Value, y: Value): [Value, Error] {
  // switch (x.type) {
  //   case "Mapping": // dict
  //     const [z, found, err] = x.get(y);
  //     if (err) {
  //       return [null, err];
  //     }
  //     if (!found) {
  //       return [null, Error(`key ${y} not in ${x.type}`)];
  //     }
  //     return [z, null];

  //   case "Indexable": // string, list, tuple
  //     let n = x.len();
  //     let [i, err2] = AsInt32(y);
  //     if (err2) {
  //       return [null, Error(`${x.type} index: ${err2}`)];
  //     }
  //     let origI = i;
  //     if (i < 0) {
  //       i += n;
  //     }
  //     if (i < 0 || i >= n) {
  //       return [null, outOfRange(origI, n, x)];
  //     }
  //     return [x.index(i), null];
  // }
  return [y, Error(`unhandled index operation ${x.Type()}[${y.Type()}]`)];
}

function outOfRange(i: number, n: number, x: Value): Error {
  if (n === 0) {
    return new Error(`index ${i} out of range: empty ${x.Type()}`);
  } else {
    return new Error(`${x.Type()} index ${i} out of range[${-n}:${n - 1}]`);
  }
}

// setIndex implements x[y] = z.
export function setIndex(x: Value, y: Value, z: Value): Error | null {
  // switch (x.type) {
  //   case "Mapping":
  //     // dict
  //     if (typeof y !== "string") {
  //       return new Error(`invalid key type: ${y.type}(must be string)`);
  //     }
  //     x.set(y, z);
  //     return null;

  //   case "Indexable":
  //     // string, list, tuple
  //     const n = x.len();
  //     let i = AsInt32(y);
  //     if (i === null) {
  //       return new Error(`${x.type} index: ${i}`);
  //     }
  //     const origI = i;
  //     if (i < 0) {
  //       i += n;
  //     }
  //     if (i < 0 || i >= n) {
  //       return outOfRange(origI, n, x);
  //     }
  //     x.set(i, z);
  //     return null;

  //   default:
  //     return new Error(`${x.type} value does not support item assignment`);
  // }
  return new Error(`${x.Type()} value does not support item assignment`);
}

export function Unary(op: Token, x: Value): [Value, Error] {
  // if (op === syntax.NOT) {
  //   return [!x.Truth(), null];
  // }

  // if (x instanceof HasUnary) {
  //   const [y, err] = x.Unary(op);
  //   if (y !== null || err !== null) {
  //     return [y, err];
  //   }
  // }

  // return [null, new Error(`unknown unary op: ${op} ${x.Type()}`)];
  return [x, new Error(`unknown unary op: ${op} ${x.Type()}`)];
}

// TODO: Binary is missing
export function Binary(op: Token, x: Value, y: Value): Value | Error {
  let unknown = false;
  switch (op) {
    case Token.PLUS: {
      if (x instanceof String) {
        if (y instanceof String) {
          return new String(x.val + y.val);
        }
      }

      if (x instanceof Int) {
        if (y instanceof Int) {
          return x.Add(y);
        }

        if (y instanceof Float) {
          const [xf, err] = x.finiteFloat();
          if (err) {
            return err;
          }

          return new Float(xf + y.val);
        }
      }

      if (x instanceof Float) {
        if (y instanceof Float) {
          return new Float(x.val + y.val);
        }

        if (y instanceof Int) {
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }

          return new Float(x.val + yf);
        }
      }

      if (x instanceof List) {
        if (y instanceof List) {
          let inner = [...x.elems, ...y.elems];
          return new List(inner);
        }
      }

      if (x instanceof Tuple) {
        if (y instanceof Tuple) {
          let inner = [...x.elems, ...y.elems];
          return new Tuple(inner);
        }
      }
      break;
    }

    case Token.MINUS: {
      if (x instanceof Int) {
        if (y instanceof Int) {
          return x.Sub(y);
        }
        if (y instanceof Float) {
          const [xf, err] = x.finiteFloat();
          if (err) {
            return err;
          }
          return new Float(xf - y.val);
        }
      }
      if (x instanceof Float) {
        if (y instanceof Float) {
          return new Float(x.val - y.val);
        }
        if (y instanceof Int) {
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }
          return new Float(x.val - yf);
        }
      }
      break;
    }

    case Token.STAR: {
      if (x instanceof Int) {
        if (y instanceof Int) {
          return x.Mul(y);
        }
        if (y instanceof Float) {
          const [xf, err] = x.finiteFloat();
          if (err) {
            return err;
          }
          return new Float(xf * y.val);
        }

        if (y instanceof String) {
          return new String(stringRepeat(y.val, x.BigInt())[0]);
        }

        if (y instanceof Bytes) {
          // TODO:
          console.log('TODO: eval.ts binary bytes');
          // return bytesRepeat(y, x);
        }

        if (y instanceof List) {
          const [elems, err] = tupleRepeat(new Tuple(y.elems), x);
          if (err) {
            return err;
          }

          return new List(elems.elems);
        }

        if (y instanceof Tuple) {
          return tupleRepeat(y, x)[0];
        }
      }
      if (x instanceof Float) {
        if (y instanceof Float) {
          return new Float(x.val * y.val);
        }
        if (y instanceof Int) {
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }

          return new Float(x.val * yf);
        }
      }

      if (x instanceof String) {
        if (y instanceof Int) {
          return new String(stringRepeat(x.val, y.BigInt())[0]);
        }
      }

      if (x instanceof Bytes) {
        console.log('TODO: eval.ts binary x bytes');
      }

      if (x instanceof List) {
        if (y instanceof Int) {
          const [elems, err] = tupleRepeat(new Tuple(x.elems), y);
          if (err) {
            return err;
          }

          return new List(elems.elems);
        }
      }

      if (x instanceof Tuple) {
        if (y instanceof Int) {
          return tupleRepeat(x, y)[0];
        }
      }
      break;
    }

    case Token.SLASH: {
      if (x instanceof Int) {
        const [xf, err] = x.finiteFloat();
        if (err) {
          return err;
        }

        if (y instanceof Int) {
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }

          if (yf == 0) {
            return new Error('floating-point division by zero');
          }

          return new Float(xf / yf);
        }

        if (y instanceof Float) {
          if (y.val == 0) {
            return new Error('floating-point division by zero');
          }
          return new Float(xf / y.val);
        }
      }

      if (x instanceof Float) {
        if (y instanceof Float) {
          if (y.val == 0) {
            return new Error('floating-point division by zero');
          }

          return new Float(x.val / y.val);
        }
        if (y instanceof Int) {
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }

          if (yf == 0.0) {
            return new Error('floating-point division by zero');
          }

          return new Float(x.val / yf);
        }
      }
      break;
    }

    case Token.SLASH: {
      if (x instanceof Int) {
        const [xf, err] = x.finiteFloat();
        if (err) {
          return err;
        }

        if (y instanceof Int) {
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }
          if (yf == 0) {
            return new Error('floating-point division by zero');
          }

          return new Float(xf / yf);
        }

        if (y instanceof Float) {
          if (y.val == 0) {
            return new Error('floating-point division by zero');
          }
          return new Float(xf / y.val);
        }
      }

      if (x instanceof Float) {
        if (y instanceof Float) {
          if (y.val == 0) {
            return new Error('floating-point division by zero');
          }

          return new Float(x.val / y.val);
        }

        if (y instanceof Int) {
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }
          if (yf == 0) {
            return new Error('floating-point division by zero');
          }

          return new Float(x.val / yf);
        }
      }
      break;
    }
    case Token.SLASHSLASH: {
      if (x instanceof Int) {
        if (y instanceof Int) {
          if (y.Sign() == 0) {
            return new Error('floored division by zero');
          }
          return x.Div(y);
        }

        if (y instanceof Float) {
          const [xf, err] = x.finiteFloat();
          if (err) {
            return err;
          }

          if (y.val == 0) {
            return new Error('floored division by zero');
          }

          return new Float(Math.floor(xf / y.val));
        }
      }

      if (x instanceof Float) {
        if (y instanceof Float) {
          if (y.val == 0) {
            return new Error('floored division by zero');
          }
          return new Float(Math.floor(x.val / y.val));
        }

        if (y instanceof Int) {
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }
          if (yf == 0) {
            return new Error('floored division by zero');
          }

          return new Float(Math.floor(x.val / yf));
        }
      }
      break;
    }
    case Token.PERCENT: {
      if (x instanceof Int) {
        if (y instanceof Int) {
          if (y.Sign() == 0) {
            return new Error('integer modulo by zero');
          }
          return x.Mod(y);
        }

        if (y instanceof Float) {
          const [xf, err] = x.finiteFloat();
          if (err) {
            return err;
          }

          if (y.val == 0) {
            return new Error('floating-point modulo by zero');
          }
          return new Float(xf % y.val);
        }
      }
      if (x instanceof Float) {
        if (y instanceof Float) {
          if (y.val == 0) {
            return new Error('floating-point modulo by zero');
          }
          return new Float(x.val % y.val);
        }

        if (y instanceof Int) {
          if (y.Sign() == 0) {
            return new Error('Floating-point modulo by zero');
          }
          const [yf, err] = y.finiteFloat();
          if (err) {
            return err;
          }
          return new Float(x.val % yf);
        }
      }
      if (x instanceof String) {
        // TODO: bug
        return interpolate(x.val, y)[0];
      }

      break;
    }

    case Token.NOT_IN: {
      const z = Binary(Token.IN, x, y);
      if (z instanceof Error) {
        return z;
      }
      return new Bool(!z.Truth());
    }

    case Token.IN: {
      if (y instanceof List) {
        for (var elem of y.elems) {
          const [eq, err] = Equal(elem, x);
          if (err) {
            return err;
          }

          if (eq) {
            return True;
          }
        }
      }

      if (y instanceof Tuple) {
        for (var elem of y.elems) {
          const [eq, err] = Equal(elem, x);
          if (err) {
            return err;
          }

          if (eq) {
            return True;
          }
        }
      }
      if (isMapping(y)) {
        const [_, found, __] = y.get(x);
        return new Bool(found);
      }

      if (y instanceof Set) {
        const [ok, err] = y.has(x);
        if (err) {
          return err;
        }
        return new Bool(ok);
      }

      if (y instanceof String) {
        if (!(x instanceof String)) {
          return new Error(
            "'in <string>' requires string as left operand, not ${x.Type()}"
          );
        }
        return new Bool(y.val.indexOf(x.val) != -1);
      }
      if (y instanceof Bytes) {
        // TODO:
      }
      if (y instanceof RangeValue) {
        // TODO:
      }

      break;
    }

    case Token.PIPE: {
      if (x instanceof Int) {
        if (y instanceof Int) {
          return x.Or(y);
        }
      }

      if (x instanceof Dict) {
        if (y instanceof Dict) {
          return x.union(y);
        }
      }

      if (x instanceof Set) {
        if (y instanceof Set) {
          // TODO:
        }
      }
      break;
    }

    case Token.AMP: {
      if (x instanceof Int) {
        if (y instanceof Int) {
          return x.And(y);
        }
      }
      if (x instanceof Set) {
        if (y instanceof Set) {
          let newSet = new Set(x.Len() + y.Len());
          if (x.Len() > y.Len()) {
            [x, y] = [y, x];
          }

          // @ts-ignore
          for (var xelem of x.elems()) {
            // @ts-ignore
            if (y.Has(xelem)) {
              newSet.insert(xelem);
            }
          }
          return newSet;
        }
      }
      break;
    }

    case Token.CIRCUMFLEX: {
      if (x instanceof Int) {
        if (y instanceof Int) {
          return x.Xor(y);
        }
      }

      if (x instanceof Set) {
        if (y instanceof Set) {
          let newSet = new Set(x.Len() + y.Len());
          for (var xelem of x.elems()) {
            if (!y.has(xelem)[0]) {
              newSet.insert(xelem);
            }
          }

          for (var yelem of y.elems()) {
            if (!x.has(yelem)[0]) {
              newSet.insert(yelem);
            }
          }

          return newSet;
        }
      }
      break;
    }

    case Token.LTLT:
    case Token.GTGT: {
      if (x instanceof Int) {
        const z = AsInt32(y);

        if (z < 0) {
          return new Error('negative shift count: ${y}');
        }

        if (op == Token.LTLT) {
          if (z >= 512) {
            return new Error('shift count too large ${v}');
          }

          // BUG: uint
          // return x.Lsh(new Int(z));
        } else {
          // BUG:
        }
      }
      break;
    }
    default:
      unknown = true;
  }

  // TODO: user-defined types

  return new Error('');
}

// It's always possible to overeat in small bites but we'll
// try to stop someone swallowing the world in one gulp.
const maxAlloc: number = 1 << 30;

function tupleRepeat(elems: Tuple, n: Value): [Tuple, Error | null] {
  return [elems, null];
  // if (elems.length === 0) {
  //   return [null, null];
  // }
  // const i = AsInt32(n)[0];
  // if (i < 1) {
  //   return [null, null];
  // }
  // // Inv: i > 0, len > 0
  // const sz = elems.length * i;
  // if (sz < 0 || sz >= maxAlloc) {
  //   // Don't print sz.
  //   return [
  //     null,
  //     new Error(`excessive repeat (${elems.length} * ${i} elements)`),
  //   ];
  // }
  // const res: Value[] = new Array(sz);
  // // copy elems into res, doubling each time
  // let x = elems.copyWithin(res, 0);
  // while (x < res.length) {
  //   res.copyWithin(x, 0, x);
  //   x *= 2;
  // }
  // return [res, null];
}

function bytesRepeat(b: Uint8Array, n: number): [Uint8Array, Error | null] {
  const [res, err] = stringRepeat(new TextDecoder().decode(b), BigInt(n));
  return [new TextEncoder().encode(res), err];
}

function stringRepeat(s: string, n: BigInt): [string, Error | null] {
  if (s === '') {
    return ['', null];
  }
  const i = Number(n);
  if (i < 1) {
    return ['', null];
  }
  // Inv: i > 0, len > 0
  const sz = s.length * i;
  if (sz < 0 || sz >= Number.MAX_SAFE_INTEGER) {
    // Don't print sz.
    return ['', new Error(`excessive repeat(${s.length} * ${i} elements)`)];
  }
  return [s.repeat(i), null];
}

// Call calls the function fn with the specified positional and keyword arguments.
export function Call(
  thread: Thread,
  fn: Value,
  args: Tuple,
  kwargs: Tuple[]
): [Value, Error | null] {
  let c = fn as Callable;
  if (!c) {
    return [fn, new Error(`invalid call of non - function(${fn.Type()})`)];
  }

  // Allocate and push a new frame.
  let fr: Frame | null = null;
  // Optimization: use slack portion of thread.stack
  // slice as a freelist of empty frames.
  // if (thread.stack.length < thread.stack.capacity) {
  //   fr = thread.stack[thread.stack.length];
  //   thread.stack.length += 1;
  // }
  if (thread.stack.length > 0) {
    fr = thread.stack.at(-1) as Frame;
  }

  if (!fr) {
    fr = new Frame(c, 0, new Array(), 0);
  }

  if (thread.stack.length === 0) {
    // one-time initialization of thread
    if (thread.maxSteps === 0) {
      thread.maxSteps--;
    }
  }

  thread.stack.push(fr!); // push

  // Use try-finally to ensure that panics from built-ins
  // pass through the interpreter without leaving
  // it in a bad state.
  try {
    // console.log(c, c.callInternal);
    // let [result, err] = c.callInternal(thread, args, kwargs);
    // TODO:
    let result;
    let err;
    if (fn instanceof Builtin) {
      // TODO:
      result = fn.CallInternal(thread, args, kwargs);
    } else {
      [result, err] = CallInternal(fn as Function, thread, args, kwargs);
    }
    console.log('result ' + (fn instanceof Builtin) + '>>>>>>>>>>> ');
    console.log(result);

    // TODO: IMPORANT uncommented this, current is type reason
    // Sanity check: null is not a valid Starlark value.
    // if ((result == null || result == undefined) && err == null) {
    //   err = new Error(`internal error: null (not None) returned from ${fn}`);
    // }

    // Always return an EvalError with an accurate frame.
    if (err) {
      if (!(err instanceof EvalError)) {
        // @ts-ignore
        err = thread.evalError(err);
      }
    }

    //@ts-ignore
    return [result, err];
  } finally {
    // clear out any references
    // TODO: opt: zero fr.locals and
    // reuse it if it is large enough.
    fr.locals = Object.create(null);

    thread.stack.pop(); // pop
  }
}

export function slice(
  x: Value,
  lo: Value,
  hi: Value,
  step_: Value
): [Value, Error | null] {
  return [x, null];
  // const sliceable = x as Sliceable; // cast x to Sliceable
  // if (!sliceable) {
  //   return [null, new Error(`invalid slice operand ${x.type}`)];
  // }

  // const n = sliceable.len(); // call the len() method from Sliceable

  // let step = 1;
  // if (step_ !== None) {
  //   const [val, err] = AsInt32(step_); // call AsInt32() function
  //   if (err) {
  //     return [null, new Error(`invalid slice step: ${err}`)];
  //   }
  //   step = val;
  //   if (step === 0) {
  //     return [null, new Error(`zero is not a valid slice step`)];
  //   }
  // }

  // let start = 0,
  //   end = 0;
  // if (step > 0) {
  //   // positive stride
  //   // default indices are [0:n].
  //   const [startVal, endVal, err] = indices(lo, hi, n); // call indices() function
  //   if (err) {
  //     return [null, err];
  //   }
  //   start = startVal;
  //   end = endVal;

  //   if (end < start) {
  //     end = start;
  //   }
  // } else {
  //   // negative stride
  //   // default indices are effectively [n-1:-1], though to
  //   // get this effect using explicit indices requires
  //   // [n-1:-1-n:-1] because of the treatment of -ve values.
  //   start = n - 1;
  //   let err = asIndex(lo, n, start); // call asIndex() function
  //   if (err) {
  //     return [null, new Error(`invalid start index: ${err}`)];
  //   }
  //   if (start >= n) {
  //     start = n - 1;
  //   }

  //   end = -1;
  //   err = asIndex(hi, n, end); // call asIndex() function
  //   if (err) {
  //     return [null, new Error(`invalid end index: ${err}`)];
  //   }
  //   if (end < -1) {
  //     end = -1;
  //   }

  //   if (start < end) {
  //     start = end;
  //   }
  // }

  // return [sliceable.slice(start, end, step), null]; // call the slice() method from Sliceable
}

// From Hacker's Delight, section 2.8.
export function signum64(x: BigInt): number {
  return 0;
  // return Number(BigInt.asUintN(64, BigInt(x >> 63)) | (BigInt(-x) >> 63n));
}

export function signum(x: number): number {
  return signum64(BigInt(x));
}

// TypeScript equivalent of the Golang function indices
// start_ and end_ are converted to indices in the range [0:len]
// The start index defaults to 0 and the end index defaults to len
// An index -len < i < 0 is treated like i+len
// All other indices outside the range are clamped to the nearest value in the range
// Beware: start may be greater than end.
// This function is suitable only for slices with positive strides.
function indices(
  start_: Value,
  end_: Value,
  len: number
): [number, number, Error | null] {
  return [len, len, null];
  // let start = 0;
  // let end = len;

  // if (asIndex(start_, len, (value: any) => (start = value))) {
  //   return [
  //     0,
  //     0,
  //     new Error(
  //       `invalid start index: ${asIndex(start_, len, (value: any) => value)}`
  //     ),
  //   ];
  // }
  // // Clamp to [0:len].
  // if (start < 0) {
  //   start = 0;
  // } else if (start > len) {
  //   start = len;
  // }

  // // BUG: argument is a pointer!
  // if (asIndex(end_, len, (value: any) => (end = value))) {
  //   return [
  //     0,
  //     0,
  //     new Error(
  //       `invalid end index: ${asIndex(end_, len, (value: any) => value)}`
  //     ),
  //   ];
  // }
  // // Clamp to [0:len].
  // if (end < 0) {
  //   end = 0;
  // } else if (end > len) {
  //   end = len;
  // }

  // return [start, end, null];
}

// asIndex sets *result to the integer value of v, adding len to it
// if it is negative. If v is undefined, null, or NaN, *result is unchanged.
function asIndex(v: Value, len: number, result: number[]): Error | null {
  // if (v !== undefined && v !== null && !isNaN(v)) {
  //   const value = Math.floor(v);
  //   if (isNaN(value)) {
  //     return new Error(`Cannot convert ${v} to an integer`);
  //   }
  //   result[0] = value < 0 ? value + len : value;
  // }
  return null;
}

export function setArgs(
  locals: Value[],
  fn: Function,
  args: Tuple,
  kwargs: Tuple[]
): Error | null {
  if (fn.NumParams() == 0) {
    const nactual = args.Len() + kwargs.length;
    if (nactual > 0) {
      return new Error(
        `function ${fn.Name()} accepts no arguments (${nactual} given)`
      );
    }
    return null;
  }

  const cond = <T>(x: Bool, y: T, z: T): T => (x.val ? y : z);

  let nparams = fn.NumParams();
  let kwdict: Dict | null = null;

  if (fn.HasKwargs()) {
    nparams--;
    kwdict = new Dict();
    locals[nparams] = kwdict;
  }
  if (fn.HasVarargs()) {
    nparams--;
  }

  // Define the number of non-kwonly parameters
  const nonkwonly: number = nparams - fn.NumKwonlyParams();
  console.log(
    'SETARGS nparams=',
    nparams,
    'args.len()=',
    args.Len(),
    'fn.NumKwonlyParams=',
    fn.NumKwonlyParams(),
    'nonkwonly=',
    nonkwonly,
    'fn.HasVarargs()',
    fn.HasVarargs()
  );

  // Check for too many positional arguments
  let n: number = args.Len();
  if (args.Len() > nonkwonly) {
    if (!fn.HasVarargs()) {
      throw new Error(
        `function ${fn.Name()} accepts ${
          fn.defaults.Len() > fn.NumKwonlyParams() ? 'at most ' : ''
        }${nonkwonly} positional argument${
          nonkwonly === 1 ? '' : 's'
        } (${args.Len()} given)`
      );
    }
    n = nonkwonly;
  }

  // Bind positional arguments to non-kwonly parameters
  for (let i = 0; i < n; i++) {
    locals[i] = args.index(i);
  }

  // Bind surplus positional arguments to *args parameter
  if (fn.HasVarargs()) {
    const tuple = new Tuple(new Array(args.Len() - n));
    for (let i = n; i < args.Len(); i++) {
      tuple.elems[i - n] = args.index(i);
    }
    locals[nparams] = tuple;
  }

  // Bind keyword arguments to parameters.
  let paramIdents = fn.funcode.locals.slice(0, nparams);

  for (const pair of kwargs) {
    const k = pair.index(0) as String;
    const v = pair.index(1);
    const i = findParam(paramIdents, k.val);

    if (i >= 0) {
      if (locals[i] != null) {
        return new Error(
          `function ${fn.Name()} got multiple values for parameter ${k}`
        );
      }
      locals[i] = v;
      continue;
    }
    if (kwdict == null) {
      return new Error(
        `function ${fn.Name()} got an unexpected keyword argument ${k}`
      );
    }
    const oldlen = kwdict.len();
    kwdict.setKey(k, v);
    if (kwdict.len() === oldlen) {
      return new Error(
        `function ${fn.Name()} got multiple values for parameter ${k}`
      );
    }
  }

  // Are defaults required?
  if (n < nparams || fn.NumKwonlyParams() > 0) {
    const m = nparams - fn.defaults.Len(); // first default

    // Report errors for missing required arguments.
    const missing = [];
    let i;
    for (i = n; i < m; i++) {
      if (locals[i] == null) {
        missing.push(paramIdents[i].name);
      }
    }

    // Bind default values to parameters.
    for (; i < nparams; i++) {
      if (locals[i] == null) {
        const dflt = fn.defaults.index(i - m);
        if (dflt instanceof mandatory) {
          missing.push(paramIdents[i].name);
          continue;
        }
        locals[i] = dflt;
      }
    }

    if (missing.length !== 0) {
      return new Error(
        `function ${fn.Name()} missing ${missing.length} argument${
          missing.length > 1 ? 's' : ''
        }(${missing.join(', ')})`
      );
    }
  }
  return null;
}

function findParam(params: compile.Binding[], name: string): number {
  for (let i = 0; i < params.length; i++) {
    if (params[i].name === name) {
      return i;
    }
  }
  return -1;
}

// https://github.com/google/starlark-go/blob/master/doc/spec.md#string-interpolation
function interpolate(format: string, x: Value): [Value, Error | null] {
  //TODO:
  return [x, null];
}
