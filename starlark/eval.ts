import * as compile from "../internal/compile/compile"
import { Position } from "../syntax/scan"
import * as syntax from "../syntax/syntax"
import { MakePosition } from "../syntax/scan"
// import {*} from "./value"

// A Thread contains the state of a Starlark thread,
// such as its call stack and thread-local storage.
// The Thread is threaded throughout the evaluator.
class Thread {
  // Name is an optional name that describes the thread, for debugging.
  constructor(public Name?: string) { }

  // stack is the stack of (internal) call frames.
  public stack: Frame[] = [];

  // Print is the client-supplied implementation of the Starlark
  // 'print' function. If nil, console.log(msg) is
  // used instead.
  public Print?: (thread: Thread, msg: string) => void;

  // Load is the client-supplied implementation of module loading.
  // Repeated calls with the same module name must return the same
  // module environment or error.
  // The error message need not include the module name.
  //
  // See example_test.ts for some example implementations of Load.
  public Load?: (thread: Thread, module: string) => Promise<StringDict>;

  // OnMaxSteps is called when the thread reaches the limit set by SetMaxExecutionSteps.
  // The default behavior is to call thread.Cancel("too many steps").
  public OnMaxSteps?: (thread: Thread) => void;

  // Steps a count of abstract computation steps executed
  // by this thread. It is incremented by the interpreter. It may be used
  // as a measure of the approximate cost of Starlark execution, by
  // computing the difference in its value before and after a computation.
  //
  // The precise meaning of "step" is not specified and may change.
  public steps = 0;
  public maxSteps = 0;

  // cancelReason records the reason from the first call to Cancel.
  public cancelReason?: string;

  // locals holds arbitrary "thread-local" Go values belonging to the client.
  // They are accessible to the client but not to any Starlark program.
  public locals: { [key: string]: any } = {};

  // proftime holds the accumulated execution time since the last profile event.
  public proftime = new Date();

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
    atomic.StorePointer(<unsafe.Pointer><unknown>& this.cancelReason, null);
  }

  public Cancel(reason: string): void {
    // TODO
    // atomic.CompareAndSwapPointer(<unsafe.Pointer><unknown>& this.cancelReason, null, <unsafe.Pointer><unknown>& reason);
  }

  public setLocal(key: string, value: any): void {
    if (!this.locals) {
      this.locals = {};
    }
    this.locals[key] = value;
  }

  public local(key: string): any {
    return this.locals[key];
  }

  public CallFrame(depth: number): CallFrame {
    return this.frameAt(depth).asCallFrame();
  }

  private frameAt(depth: number): frame {
    return this.stack[this.stack.length - 1 - depth];
  }

  public CallStack(): CallFrame[] {
    const frames: CallFrame[] = [];
    for (let i = 0; i < this.stack.length; i++) {
      const fr = this.stack[i];
      frames.push(fr.asCallFrame());
    }
    return frames;
  }
  // CallStackDepth returns the number of frames in the current call stack.
  public callStackDepth(): number {
    return this.stack.length;
  }

}

class StringDict {
  [name: string]: Value;

  keys(): string[] {
    const names = Object.keys(this);
    names.sort();
    return names;
  }

  toString(): string {
    // TODO:
    // const buf = new StringBuilder();
    // buf.writeChar('{');
    // let sep = '';
    // for (const name of this.keys()) {
    //   buf.writeString(sep);
    //   buf.writeString(name);
    //   buf.writeString(': ');
    //   writeValue(buf, this[name], null);
    //   sep = ', ';
    // }
    // buf.writeChar('}');
    // return buf.toString();
  }

  freeze(): void {
    for (const value of Object.values(this)) {
      value.freeze();
    }
  }

  has(key: string): boolean {
    return key in this;
  }
}
const builtinFilename = "<builtin>"

// A frame records a call to a Starlark function (including module toplevel)
// or a built-in function or method.
class Frame {
  callable: Callable; // current function (or toplevel) or built-in
  pc: number; // program counter (Starlark frames only)
  locals: Value[]; // local variables (Starlark frames only)
  spanStart: number; // start time of current profiler span

  constructor(callable: Callable, pc: number, locals: Value[], spanStart: number) {
    this.callable = callable;
    this.pc = pc;
    this.locals = locals;
    this.spanStart = spanStart;
  }

  // Position returns the source position of the current point of execution in this frame.
  Position(): syntax.Position {
    switch (this.callable.constructor) {
      case Function:
        // Starlark function
        return this.callable.funcode.Position(this.pc);
      case CallableWithPosition:
        // If a built-in Callable defines
        // a Position method, use it.
        return this.callable.Position();
    }
    return syntax.MakePosition(new Syntax.Literal('builtinFilename'), 0, 0);
  }

  // Function returns the frame's function or built-in.
  Callable(): Callable {
    return this.callable;
  }

  asCallFrame(): CallFrame {
    return new CallFrame(
      this.Callable().Name(),
      this.Position(),
    )
  }
}

// A CallStack is a stack of call frames, outermost first.
class CallStack {
  frames: CallFrame[];

  kotlin

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
    const out = new StringBuilder();
    if (this.frames.length > 0) {
      out.append("Traceback (most recent call last):\n");
    }
    for (const fr of this.frames) {
      out.append(`  ${fr.Pos}: in ${fr.Name}\n`);
    }
    return out.toString();
  }

}

// An EvalError is a Starlark evaluation error and
// a copy of the thread's stack at the moment of the error.
class EvalError {
  public Msg: string;
  public CallStack: CallStack;
  private cause: Error;

  constructor(msg: string, callStack: CallStack, cause?: Error) {
    this.Msg = msg;
    this.CallStack = callStack;
    this.cause = cause;
  }
}

// A CallFrame represents the function name and current
// position of execution of an enclosing call frame.
class CallFrame {
  public name: string;
  public pos: syntax.Position;

  constructor(name: string, pos: syntax.Position) {
    this.name = name;
    this.pos = pos;
  }
}

// TODO:
// func (thread *Thread) evalError(err error) *EvalError {
// 	return &EvalError{
// 		Msg:       err.Error(),
// 		CallStack: thread.CallStack(),
// 		cause:     err,
// 	}
// }

// func (e *EvalError) Error() string { return e.Msg }

// // Backtrace returns a user-friendly error message describing the stack
// // of calls that led to this error.
// func (e *EvalError) Backtrace() string {
// 	// If the topmost stack frame is a built-in function,
// 	// remove it from the stack and add print "Error in fn:".
// 	stack := e.CallStack
// 	suffix := ""
// 	if last := len(stack) - 1; last >= 0 && stack[last].Pos.Filename() == builtinFilename {
// 		suffix = " in " + stack[last].Name
// 		stack = stack[:last]
// 	}
// 	return fmt.Sprintf("%sError%s: %s", stack, suffix, e.Msg)
// }

// func (e *EvalError) Unwrap() error { return e.cause }

// CompilerVersion is the version number of the protocol for compiled
// files. Applications must not run programs compiled by one version
// with an interpreter at another version, and should thus incorporate
// the compiler version into the cache key when reusing compiled code.
const CompilerVersion = compile.Version

export class Program {
  public compiled: compile.Program;

  constructor(compiled: compile.Program) {
    this.compiled = compiled;
  }

  public Filename(): string {
    return this.compiled.toplevel.pos.filename();
  }

  public String(): string {
    return this.Filename();
  }

  public NumLoads(): number {
    return this.compiled.loads.length;
  }

  public Load(i: number): [string, Position] {
    const id = this.compiled.loads[i];
    return [id.name, id.pos];
  }

  public init(thread: Thread, predeclared: StringDict): [StringDict, Error] {
    const toplevel = makeToplevelFunction(this.compiled, predeclared)

    const [_, err] = Call(thread, toplevel, null, null)

    return [toplevel.globals(), err]

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
): [StringDict, EvalError] {
  // Parse, resolve, and compile a Starlark source file.
  const [, mod, err] = SourceProgram(filename, src, predeclared.hasOwnProperty);
  if (err !== null) {
    return [null, err];
  }

  const g = mod.Init(thread, predeclared);
  g.Freeze();
  return [g, null];
}

// SourceProgram produces a new program by parsing, resolving,
// and compiling a Starlark source file.
// On success, it returns the parsed file and the compiled program.
// The filename and src parameters are as for syntax.Parse.
// The isPredeclared predicate reports whether a name is
// a pre-declared identifier of the current module.
// Its typical value is predeclared.Has,
// where predeclared is a StringDict of pre-declared values.
function SourceProgram(filename: string, src: any, isPredeclared: (name: string) => boolean): [syntax.File, Program, error] {
  const [f, err] = syntax.Parse(filename, src, 0)
  if (err !== null) {
    return [null, null, err]
  }
  const prog = FileProgram(f, isPredeclared)
  return [f, prog, err]
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
function FileProgram(f: syntax.File, isPredeclared: (name: string) => boolean): Program {
  resolve.File(f, isPredeclared, Universe.Has);

  let pos: Position;
  if (f.Stmts.length > 0) {
    pos = f.Stmts[0].span()[0];
  } else {
    pos = syntax.MakePosition(f.Path, 1, 1);
  }

  const module = f.Module as resolve.Module;
  const compiled = compile.File(f.Stmts, pos, "<toplevel>", module.Locals, module.Globals);

  return new Program(compiled);

}

// TypeScript implementation of ExecREPLChunk
// Note: This implementation assumes that the required libraries and types are already imported/defined

function ExecREPLChunk(f: syntax.File, thread: Thread, globals: StringDict): Error {
  let predeclared: StringDict = {};

  // -- variant of FileProgram --

  const has = (x: string): boolean => globals.hasOwnProperty(x);
  const universeHas = (x: string): boolean => true; // The Universe object is not defined in TypeScript, but we can assume everything is part of the universe
  const replChunkErr = resolve.REPLChunk(f, has, predeclared.has, universeHas);

  if (replChunkErr !== null) {
    return replChunkErr;
  }

  let pos: Position;
  if (f.Stmts.length > 0) {
    pos = syntax.Start(f.Stmts[0]);
  } else {
    pos = syntax.MakePosition(new syntax.Position().Path, 1, 1);
  }

  const module = f.Module as resolve.Module;
  const compiled = compile.File(f.Stmts, pos, "<toplevel>", module.Locals, module.Globals);
  const prog = new Program(compiled);

  // -- variant of Program.Init --

  const toplevel = makeToplevelFunction(prog.compiled, predeclared);

  // Initialize module globals from parameter.
  for (let i = 0; i < prog.compiled.globals.length; i++) {
    const id = prog.compiled.globals[i];
    if (globals[id.name] !== null) {
      toplevel.module.globals[i] = globals[id.name];
    }
  }

  const [, err] = Call(thread, toplevel, null, null);

  // Reflect changes to globals back to parameter, even after an error.
  for (let i = 0; i < prog.compiled.globals.length; i++) {
    const id = prog.compiled.globals[i];
    if (toplevel.module.globals[i] !== null) {
      globals[id.name] = toplevel.module.globals[i];
    }
  }

  return err;
}

function makeToplevelFunction(prog: compile.Program, predeclared: StringDict): Function {
  // Create the Starlark value denoted by each program constant c.
  const constants: Value[] = [];
  for (let i = 0; i < prog.constants.length; i++) {
    const c = prog.constants[i];
    let v: Value;
    if (typeof c === "number") {
      v = MakeInt64(c);
    } else if (c instanceof BigInt) {
      v = MakeBigInt(c);
    } else if (typeof c === "string") {
      v = String(c);
    } else if (c instanceof compile.Bytes) {
      v = Bytes(c);
    } else if (typeof c === "number") {
      v = Float(c);
    } else {
      throw new Error(`unexpected constant ${c.constructor.name}: ${c}`);
    }
    constants[i] = v;
  }

  return new Function({
    funcode: prog.toplevel,
    module: {
      program: prog,
      predeclared: predeclared,
      globals: new Array(prog.globals.length),
      constants: constants,
    },
  });
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
function eval(thread: Thread, filename: string, src: string, env: StringDict): [Value, Error] {
  const expr = syntax.parseExpr(filename, src, 0);
  if (expr instanceof EvalError) {
    return [null, expr];
  }
  const f = makeExprFunc(expr, env);
  const [res, err] = call(thread, f, null, null);
  if (err !== null) {
    return [null, new EvalError(err.message, err.backtrace())];
  }
  return [res, null];
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
function EvalExpr(thread: Thread, expr: syntax.Expr, env: StringDict): [Value, error] {
  const [fn, err] = makeExprFunc(expr, env);
  if (err != null) {
    return [null, err];
  }
  return Call(thread, fn, null, null);
}

// ExprFunc returns a no-argument function
// that evaluates the expression whose source is src.
function ExprFunc(filename: string, src: any, env: StringDict): [Function, Error] {
  const expr = syntax.parseExpr(filename, src, 0);
  if (expr instanceof Error) {
    return [null, expr];
  }
  return makeExprFunc(expr, env);
}

// makeExprFunc returns a no-argument function whose body is expr.
function makeExprFunc(expr: syntax.Expr, env: StringDict): [Function, Error] {
  const [locals, err] = resolve.expr(expr, env.Has, Universe.Has);
  if (err instanceof Error) {
    return [null, err];
  }
  const compiled = compile.expr(expr, "<expr>", locals);
  return [makeToplevelFunction(compiled, env), null];
}

// The following functions are primitive operations of the byte code interpreter.

// list += iterable
function listExtend(x: List, y: Iterable): void {
  if (y instanceof List) {
    // fast path: list += list
    x.elems.push(...y.elems);
  } else {
    let iter = y.Iterate();
    try {
      let z: Value;
      while (iter.Next(z)) {
        x.elems.push(z);
      }
    } finally {
      iter.Done();
    }
  }
}

// getAttr implements x.dot.
function getAttr(x: Value, name: string): [Value, Error] {
  let hasAttr = x as HasAttrs;
  if (!hasAttr) {
    return [null, new Error(${ x.Type() } has no.${ name } field or method)];
  }

  let errmsg: string;
  let v: Value;
  try {
    v = hasAttr.Attr(name);
  } catch (err) {
    if (err instanceof NoSuchAttrError) {
      errmsg = err.toString();
    } else {
      return [null, err];
    }
  }

  if (v !== null) {
    return [v, null];
  }

  // (null, null) => generic error
  errmsg = `${x.Type()} has no.${name} field or method`;

  // add spelling hint
  let n = spell.Nearest(name, hasAttr.AttrNames());
  if (n) {
    errmsg = `${errmsg} (did you mean.${n}?)`;
  }

  return [null, new Error(errmsg)];
}

// setField implements x.name = y.
function setField(x: Value, name: string, y: Value): Error | undefined {
  if (isHasSetField(x)) {
    const err = x.setField(name, y);
    if (isNoSuchAttrError(err)) {
      // No such field: check spelling.
      const n = spell.Nearest(name, x.attrNames());
      if (n !== "") {
        return new Error(`${err}(did you mean.${n} ?)`);
      }
    }
    return err;
  }

  return new Error(`can't assign to .${name} field of ${x.type()}`);
}

// getIndex implements x[y].
function getIndex(x: Value, y: Value): [Value, Error] {
  switch (x.type) {
    case "Mapping": // dict
      const [z, found, err] = x.get(y);
      if (err) {
        return [null, err];
      }
      if (!found) {
        return [null, Error(`key ${y} not in ${x.type}`)];
      }
      return [z, null];

    case "Indexable": // string, list, tuple
      let n = x.len();
      let [i, err2] = AsInt32(y);
      if (err2) {
        return [null, Error(`${x.type} index: ${err2}`)];
      }
      let origI = i;
      if (i < 0) {
        i += n;
      }
      if (i < 0 || i >= n) {
        return [null, outOfRange(origI, n, x)];
      }
      return [x.index(i), null];

  }
  return [null, Error(`unhandled index operation ${x.type}[${y.type}]`)];
}

function outOfRange(i: number, n: number, x: Value): Error {
  if (n === 0) {
    return new Error(`index ${i} out of range: empty ${x.Type()}`);
  } else {
    return new Error(`${x.Type()} index ${i} out of range[${- n}:${n - 1}]`);
  }
}

// setIndex implements x[y] = z.
function setIndex(x: Value, y: Value, z: Value): Error | null {
  switch (x.type) {
    case "Mapping":
      // dict
      if (typeof y !== "string") {
        return new Error(`invalid key type: ${y.type}(must be string)`);
      }
      x.set(y, z);
      return null;

    case "Indexable":
      // string, list, tuple
      const n = x.len();
      let i = AsInt32(y);
      if (i === null) {
        return new Error(`${x.type} index: ${i}`);
      }
      const origI = i;
      if (i < 0) {
        i += n;
      }
      if (i < 0 || i >= n) {
        return outOfRange(origI, n, x);
      }
      x.set(i, z);
      return null;

    default:
      return new Error(`${x.type} value does not support item assignment`);

  }
}

function Unary(op: syntax.Token, x: Value): [Value, Error] {
  if (op === syntax.NOT) {
    return [!x.Truth(), null];
  }

  if (x instanceof HasUnary) {
    const [y, err] = x.Unary(op);
    if (y !== null || err !== null) {
      return [y, err];
    }
  }

  return [null, new Error(`unknown unary op: ${op} ${x.Type()}`)];
}

// TODO: Binary is missing

// It's always possible to overeat in small bites but we'll
// try to stop someone swallowing the world in one gulp.
const maxAlloc: number = 1 << 30

function tupleRepeat(elems: Tuple, n: Value): [Tuple, Error] {
  if (elems.length === 0) {
    return [null, null];
  }
  const i = AsInt32(n)[0];
  if (i < 1) {
    return [null, null];
  }
  // Inv: i > 0, len > 0
  const sz = elems.length * i;
  if (sz < 0 || sz >= maxAlloc) {
    // Don't print sz.
    return [null, new Error(`excessive repeat (${elems.length} * ${i} elements)`)];
  }
  const res: Value[] = new Array(sz);
  // copy elems into res, doubling each time
  let x = elems.copyWithin(res, 0);
  while (x < res.length) {
    res.copyWithin(x, 0, x);
    x *= 2;
  }
  return [res, null];
}

function bytesRepeat(b: Uint8Array, n: number): [Uint8Array, Error | null] {
  const [res, err] = stringRepeat(new TextDecoder().decode(b), BigInt(n));
  return [new TextEncoder().encode(res), err];
}

function stringRepeat(s: string, n: bigint): [string, Error | null] {
  if (s === "") {
    return ["", null];
  }
  const i = Number(n);
  if (i < 1) {
    return ["", null];
  }
  // Inv: i > 0, len > 0
  const sz = s.length * i;
  if (sz < 0 || sz >= Number.MAX_SAFE_INTEGER) {
    // Don't print sz.
    return ["", new Error(`excessive repeat(${s.length} * ${i} elements)`)];
  }
  return [s.repeat(i), null];
}

// Call calls the function fn with the specified positional and keyword arguments.
function Call(thread: Thread, fn: Value, args: Tuple, kwargs: Tuple[]): [Value, Error] {
  let c = fn as Callable;
  if (!c) {
    return [null, new Error(`invalid call of non - function(${fn.Type()})`)];
  }

  // Allocate and push a new frame.
  let fr: Frame | undefined;
  // Optimization: use slack portion of thread.stack
  // slice as a freelist of empty frames.
  if (thread.stack.length < thread.stack.capacity) {
    fr = thread.stack[thread.stack.length];
    thread.stack.length += 1;
  }
  if (!fr) {
    fr = new Frame();
  }

  if (thread.stack.length === 0) {
    // one-time initialization of thread
    if (thread.maxSteps === 0n) {
      thread.maxSteps = -1n;
    }
  }

  thread.stack.push(fr); // push

  fr.callable = c;

  thread.beginProfSpan();

  // Use try-finally to ensure that panics from built-ins
  // pass through the interpreter without leaving
  // it in a bad state.
  try {
    let [result, err] = c.CallInternal(thread, args, kwargs);

    // Sanity check: null is not a valid Starlark value.
    if (result == null && err == null) {
      err = new Error(`internal error: null (not None) returned from ${fn}`);
    }

    // Always return an EvalError with an accurate frame.
    if (err) {
      if (!(err instanceof EvalError)) {
        err = thread.evalError(err);
      }
    }

    return [result, err];

  } finally {
    thread.endProfSpan();

    // clear out any references
    // TODO: opt: zero fr.locals and
    // reuse it if it is large enough.
    fr.locals = Object.create(null);

    thread.stack.pop(); // pop

  }
}

import { Sliceable } from './sliceable'; // import the corresponding TypeScript library for Sliceable

function slice(x: Value, lo: Value, hi: Value, step_: Value): [Value, Error] {
  const sliceable = x as Sliceable; // cast x to Sliceable
  if (!sliceable) {
    return [null, new Error(`invalid slice operand ${x.type}`)];
  }

  const n = sliceable.len(); // call the len() method from Sliceable

  let step = 1;
  if (step_ !== None) {
    const [val, err] = AsInt32(step_); // call AsInt32() function
    if (err) {
      return [null, new Error(`invalid slice step: ${err}`)];
    }
    step = val;
    if (step === 0) {
      return [null, new Error(`zero is not a valid slice step`)];
    }
  }

  let start = 0, end = 0;
  if (step > 0) {
    // positive stride
    // default indices are [0:n].
    const [startVal, endVal, err] = indices(lo, hi, n); // call indices() function
    if (err) {
      return [null, err];
    }
    start = startVal;
    end = endVal;

    if (end < start) {
      end = start;
    }
  } else {
    // negative stride
    // default indices are effectively [n-1:-1], though to
    // get this effect using explicit indices requires
    // [n-1:-1-n:-1] because of the treatment of -ve values.
    start = n - 1;
    let err = asIndex(lo, n, start); // call asIndex() function
    if (err) {
      return [null, new Error(`invalid start index: ${err}`)];
    }
    if (start >= n) {
      start = n - 1;
    }

    end = -1;
    err = asIndex(hi, n, end); // call asIndex() function
    if (err) {
      return [null, new Error(`invalid end index: ${err}`)];
    }
    if (end < -1) {
      end = -1;
    }

    if (start < end) {
      start = end;
    }
  }

  return [sliceable.slice(start, end, step), null]; // call the slice() method from Sliceable
}

// From Hacker's Delight, section 2.8.
function signum64(x: number): number {
  return Number(BigInt.asUintN(64, BigInt(x >> 63)) | BigInt(-x) >> 63n);
}

function signum(x: number): number {
  return signum64(BigInt(x));
}

// TypeScript equivalent of the Golang function indices
// start_ and end_ are converted to indices in the range [0:len]
// The start index defaults to 0 and the end index defaults to len
// An index -len < i < 0 is treated like i+len
// All other indices outside the range are clamped to the nearest value in the range
// Beware: start may be greater than end.
// This function is suitable only for slices with positive strides.
function indices(start_: Value, end_: Value, len: number): [number, number, Error] {
  let start = 0;
  let end = len;

  if (asIndex(start_, len, (value: any) => start = value)) {
    return [0, 0, new Error(`invalid start index: ${asIndex(start_, len, (value: any) => value)}`)];
  }
  // Clamp to [0:len].
  if (start < 0) {
    start = 0;
  } else if (start > len) {
    start = len;
  }

  // BUG: argument is a pointer!
  if (asIndex(end_, len, (value: any) => end = value)) {
    return [0, 0, new Error(`invalid end index: ${asIndex(end_, len, (value: any) => value)}`)];
  }
  // Clamp to [0:len].
  if (end < 0) {
    end = 0;
  } else if (end > len) {
    end = len;
  }

  return [start, end, null];
}

// asIndex sets *result to the integer value of v, adding len to it
// if it is negative. If v is undefined, null, or NaN, *result is unchanged.
function asIndex(v: Value, len: number, result: number[]): Error | null {
  if (v !== undefined && v !== null && !isNaN(v)) {
    const value = Math.floor(v);
    if (isNaN(value)) {
      return new Error(`Cannot convert ${v} to an integer`);
    }
    result[0] = value < 0 ? value + len : value;
  }
  return null;
}

function setArgs(locals: Value[], fn: Function, args: Tuple, kwargs: Tuple[]): Error {
  if (fn.NumParams() == 0) {
    const nactual = args.length + Object.keys(kwargs).length;
    if (nactual > 0) {
      return new Error(`function ${fn.Name()} accepts no arguments (${nactual} given)`);
    }
    return null;
  }

  const cond = (x: boolean, y: any, z: any) => x ? y : z;

  const nparams = fn.NumParams();
  let kwdict: { [key: string]: any } | undefined;
  if (fn.HasKwargs()) {
    nparams--;
    kwdict = {};
    locals[nparams] = kwdict;
  }
  if (fn.HasVarargs()) {
    nparams--;
  }

  // Define the number of non-kwonly parameters
  const nonkwonly: number = nparams - fn.NumKwonlyParams();

  // Check for too many positional arguments
  const argsLen: number = args.length;
  if (argsLen > nonkwonly) {
    if (!fn.HasVarargs()) {
      throw new Error(`function ${fn.Name()} accepts ${fn.defaults.length > fn.NumKwonlyParams() ? 'at most ' : ''}${nonkwonly} positional argument${nonkwonly === 1 ? '' : 's'} (${argsLen} given)`);
    }
  }

  // Bind positional arguments to non-kwonly parameters
  for (let i = 0; i < argsLen && i < nonkwonly; i++) {
    locals[i] = args[i];
  }

  // Bind surplus positional arguments to *args parameter
  if (fn.HasVarargs()) {
    const tuple: Array<any> = [];
    for (let i = nonkwonly; i < argsLen; i++) {
      tuple.push(args[i]);
    }
    locals[nparams] = tuple;
  }

  // Bind keyword arguments to parameters.
  const paramIdents = fn.funcode.Locals.slice(0, nparams);
  for (const pair of kwargs) {
    const k = pair[0] as string, v = pair[1];
    const i = findParam(paramIdents, k);
    if (i >= 0) {
      if (locals[i] != null) {
        return new Error(`function ${fn.Name()} got multiple values for parameter ${k}`);
      }
      locals[i] = v;
      continue;
    }
    if (kwdict == null) {
      return new Error(`function ${fn.Name()} got an unexpected keyword argument ${k}`);
    }
    const oldlen = kwdict.Len();
    kwdict.SetKey(k, v);
    if (kwdict.Len() === oldlen) {
      return new Error(`function ${fn.Name()} got multiple values for parameter ${k}`);
    }
  }

  // Are defaults required?
  if (n < nparams || fn.NumKwonlyParams() > 0) {
    const m = nparams - fn.defaults.length; // first default

    // Report errors for missing required arguments.
    const missing = [];
    let i;
    for (i = n; i < m; i++) {
      if (locals[i] == null) {
        missing.push(paramIdents[i].Name);
      }
    }

    // Bind default values to parameters.
    for (; i < nparams; i++) {
      if (locals[i] == null) {
        const dflt = fn.defaults[i - m];
        if (dflt instanceof mandatory) {
          missing.push(paramIdents[i].Name);
          continue;
        }
        locals[i] = dflt;
      }
    }

    if (missing.length !== 0) {
      return new Error(`function ${fn.Name()} missing ${missing.length} argument${missing.length > 1 ? 's' : ''}(${missing.join(', ')})`);
    }
  }
  return null;

}

function findParam(params: Binding[], name: string): number {
  for (let i = 0; i < params.length; i++) {
    if (params[i].Name === name) {
      return i;
    }
  }
  return -1;
}

// https://github.com/google/starlark-go/blob/master/doc/spec.md#string-interpolation
function interpolate(format: string, x: Value): [Value, Error] {
  //TODO:
}
