import { Opcode } from "../internal/compile/compile";
import { Thread } from "./eval";
import * as compile from "../internal/compile/compile";
import { Position } from "../syntax/scan";
import * as syntax from "../syntax/index";
import { parse, ParseExpr } from "../syntax/parse";
import { Callable, Function, Tuple, Module } from "./value";
import { List, Iterable } from "./value";
import { Value, Compare } from "./value";
import { Universe } from "./library";
import { Iterator } from "./value";
import { Bool, True, False } from "./value";
import * as resolve from "./resolve";
import { setArgs } from "./eval";
import { Binary, Unary } from "./eval";

// This file defines the bytecode interpreter.

const vmdebug = false; // TODO(adonovan): use a bitfield of specific kinds of error.

// TODO(adonovan):
// - optimize position table.
// - opt: record MaxIterStack during compilation and preallocate the stack.
function CallInternal(
  fn: Function,
  thread: Thread,
  args: Tuple,
  kwargs: Tuple[]
): [Value | null, Error | null] {
  // function body

  // Postcondition: args is not mutated. This is stricter than required by Callable,
  // but allows CALL to avoid a copy.

  if (!resolve.AllowRecursion) {
    // detect recursion
    for (let fr of thread.stack.slice(0, thread.stack.length - 1)) {
      // We look for the same function code,
      // not function value, otherwise the user could
      // defeat the check by writing the Y combinator.
      let call = fr.Callable();
      if (call instanceof Function) {
        let frfn = call as unknown as Function;

        if (frfn.funcode === fn.funcode) {
          return [null, new Error(`function ${fn.Name()} called recursively`)];
        }
      }
    }
  }

  let f = fn.funcode;
  let fr = thread.frameAt(0);

  // Allocate space for stack and locals.
  // Logically these do not escape from this frame
  // (See https://github.com/golang/go/issues/20533.)
  //
  // This heap allocation looks expensive, but I was unable to get
  // more than 1% real time improvement in a large alloc-heavy
  // benchmark (in which this alloc was 8% of alloc-bytes)
  // by allocating space for 8 Values in each frame, or
  // by allocating stack by slicing an array held by the Thread
  // that is expanded in chunks of min(k, nspace), for k=256 or 1024.

  const nlocals: number = f.locals.length;
  const nspace: number = nlocals + f.maxStack;
  const space: Value[] = new Array(nspace);
  const locals: Value[] = space.slice(0, nlocals); // local variables, starting with parameters
  const stack: Value[] = space.slice(nlocals); // operand stack

  // Digest arguments and set parameters.
  let err: Error | null = setArgs(locals, fn, args, kwargs);
  if (err !== null) {
    return [null, thread.evalError(err)];
  }

  if (vmdebug) {
    console.log(`Entering ${f.name} @${f.position(0)}`);
    console.log(`${stack.length} stack, ${locals.length} locals`);
    const leaveMsg = `Leaving ${f.name}`;
    // setTimeout(() => console.log(leaveMsg), 0);
  }

  fr.locals = locals;

  // Spill indicated locals to cells.
  // Each cell is a separate alloc to avoid spurious liveness.
  for (const index of f.cells) {
    locals[index] = new cell(locals[index]);
  }

  // TODO(adonovan): add static check that beneath this point
  // - there is exactly one return statement
  // - there is no redefinition of 'err'.

  var iterstack: Iterator[]; // stack of active iterators
  // TODO: defer

  let sp = 0;
  var pc: number = 0;
  var result: Value;
  let code = f.code;

  loop: while (true) {
    thread.steps++;
    if (thread.steps >= thread.maxSteps) {
      if (thread.OnMaxSteps != null) {
        thread.OnMaxSteps(thread);
      } else {
        thread.Cancel("too many steps");
      }
    }
    // BUG: atomic
    const reason = thread.cancelReason;
    if (reason !== null) {
      const err = `Starlark computation cancelled: ${reason}`;
      break loop;
    }

    fr.pc = pc;

    // FIXME: ?
    let op: compile.Opcode = Object.values(compile.Opcode)[
      Object.keys(compile.Opcode).indexOf(compile.Opcode[code[pc]])
    ] as compile.Opcode;
    pc++;

    let arg = 0;

    if (op >= compile.OpcodeArgMin) {
      let s = 0;
      for (; ;) {
        const b = code[pc];
        pc++;
        arg |= (b & 0x7f) << s;
        s += 7;
        if (b < 0x80) {
          break;
        }
      }
    }
    if (vmdebug) {
      console.log(stack.slice(0, sp)); // very verbose!
      compile.PrintOp(f, fr.pc, op, arg);
    }
    switch (op) {
      case Opcode.NOP:
        // nop
        break;

      case Opcode.DUP:
        stack[sp] = stack[sp - 1];
        sp++;
        break;

      case Opcode.DUP2:
        stack[sp] = stack[sp - 2];
        stack[sp + 1] = stack[sp - 1];
        sp += 2;
        break;

      case Opcode.POP:
        sp--;
        break;

      case Opcode.EXCH:
        [stack[sp - 2], stack[sp - 1]] = [stack[sp - 1], stack[sp - 2]];
        break;

      case Opcode.EQL:
      case Opcode.NEQ:
      case Opcode.GT:
      case Opcode.LT:
      case Opcode.LE:
      case Opcode.GE:
        let opToken = Object.values(syntax.Token)[
          op -
          Opcode.EQL +
          Object.values(syntax.Token).indexOf(syntax.Token.EQL)
        ];
        const yy = stack[sp - 1];
        const xx = stack[sp - 2];
        sp -= 2;
        const [ok, err3] = Compare(opToken, xx, yy);
        if (err3 != null) {
          err = err3;
          break loop;
        }
        stack[sp] = new Bool(ok);
        sp++;
        break;

      case Opcode.PLUS:
      case Opcode.MINUS:
      case Opcode.STAR:
      case Opcode.SLASH:
      case Opcode.SLASHSLASH:
      case Opcode.PERCENT:
      case Opcode.AMP:
      case Opcode.PIPE:
      case Opcode.CIRCUMFLEX:
      case Opcode.LTLT:
      case Opcode.GTGT:
      case Opcode.IN:
        let binop = Object.values(syntax.Token)[
          op -
          Opcode.PLUS +
          Object.values(syntax.Token).indexOf(syntax.Token.PLUS)
        ];

        if (op == Opcode.IN) {
          binop = syntax.Token.IN;
        }
        let y = stack[sp - 1];
        let x = stack[sp - 2];
        sp -= 2;
        let [z, err2] = Binary(binop, x, y);
        if (err2 != null) {
          err = err2;
          break loop;
        }
        stack[sp] = z;
        sp++;
      case Opcode.UPLUS:
      case Opcode.UMINUS:
      case Opcode.TILDE: {
        let unop: syntax.Token;
        if (op === Opcode.TILDE) {
          unop = syntax.Token.TILDE;
        } else {
          unop = Object.values(syntax.Token)[
            op -
            Opcode.UPLUS +
            Object.values(syntax.Token).indexOf(syntax.Token.PLUS)
          ];
        }
        const x = stack[sp - 1];
        const [y, err2] = Unary(unop, x);
        if (err2 !== null) {
          err = err2;
          break loop;
        }
        stack[sp - 1] = y;
      }

      case Opcode.INPLACE_ADD: {
        let y = stack[sp - 1];
        let x = stack[sp - 2];
        sp -= 2;

        // TODO:

        // let z: Value;
        // if (x instanceof List && isIterable(y)) {
        //   if (x.checkMutable("apply += to")) {
        //     break loop;
        //   }
        //   listExtend(x, y);
        //   z = x;
        // }
        // if (!z) {
        //   [z, err] = Binary(syntax.PLUS, x, y);
        //   if (err) {
        //     break loop;
        //   }
        // }

        // stack[sp++] = z;
      }

      // TODO:
      // case compile.INPLACE_PIPE:
      default:
        err = new Error(`unimplemented: ${op}`);
        break loop;
    }
  }
  // @ts-ignore
  return result, err;
}

class wrappedError {
  constructor(public msg: string, public cause: Error) { }

  csharp;

  public get name(): string {
    return "wrappedError";
  }

  public get message(): string {
    return this.msg;
  }

  public toString(): string {
    return `${this.name}: ${this.message}`;
  }

  public get stack(): string | undefined {
    if (this.cause && this.cause.stack) {
      return this.cause.stack;
    }
    return undefined;
  }

  public unwrap(): Error {
    return this.cause;
  }
}

// mandatory is a sentinel value used in a function's defaults tuple
// to indicate that a (keyword-only) parameter is mandatory.
class mandatory implements Value {
  public String(): string {
    return "mandatory";
  }
  public Type(): string {
    return "mandatory";
  }
  public Freeze(): void { } // immutable
  public Truth(): Bool {
    return False;
  }
  public Hash(): [number, Error | null] {
    return [0, null];
  }
}

// A cell is a box containing a Value.
// Local variables marked as cells hold their value indirectly
// so that they may be shared by outer and inner nested functions.
// Cells are always accessed using indirect {FREE,LOCAL,SETLOCAL}CELL instructions.
// The FreeVars tuple contains only cells.
// The FREE instruction always yields a cell.
class cell {
  public v: Value;
  constructor(v: Value) {
    this.v = v;
  }
  public String(): string {
    return "cell";
  }
  public Type(): string {
    return "cell";
  }
  public Freeze(): void {
    if (this.v != null) {
      this.v.Freeze();
    }
  }
  public Truth(): Bool {
    throw new Error("unreachable");
  }
  public Hash(): [number, Error | null] {
    throw new Error("unreachable");
  }
}
