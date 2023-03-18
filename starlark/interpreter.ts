import { Opcode } from "../internal/compile/compile"

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
): [Value, Error] {
  // function body

  // Postcondition: args is not mutated. This is stricter than required by Callable,
  // but allows CALL to avoid a copy.

  if (!resolve.AllowRecursion) {
    // detect recursion
    for (let fr of thread.stack.slice(0, -1)) {
      // We look for the same function code,
      // not function value, otherwise the user could
      // defeat the check by writing the Y combinator.
      if (frfn instanceof Function && frfn.funcode === fn.funcode) {
        return [null, new Error(`function ${fn.Name()} called recursively`)];
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

  const nlocals: number = f.Locals.length;
  const nspace: number = nlocals + f.MaxStack;
  const space: Value[] = new Array(nspace);
  const locals: Value[] = space.slice(0, nlocals); // local variables, starting with parameters
  const stack: Value[] = space.slice(nlocals); // operand stack

  // Digest arguments and set parameters.
  const err: Error | null = setArgs(locals, fn, args, kwargs);
  if (err !== null) {
    return [null, thread.evalError(err)];
  }

  fr.locals = locals;

  if (vmdebug) {
    console.log(Entering ${ f.Name } @${ f.Position(0) });
    console.log(${ stack.length } stack, ${ locals.length } locals);
    const leaveMsg = Leaving ${ f.Name };
    setTimeout(() => console.log(leaveMsg), 0);
  }

  // Spill indicated locals to cells.
  // Each cell is a separate alloc to avoid spurious liveness.
  for (const index of f.Cells) {
    locals[index] = new cell(locals[index]);
  }

  // TODO(adonovan): add static check that beneath this point
  // - there is exactly one return statement
  // - there is no redefinition of 'err'.

  var iterstack: Iterator[] // stack of active iterators
  // TODO: defer

  let sp = 0
  var pc: number
  var result: Value
  let code = f.Code

  loop: while (true) {

    thread.Steps++;
    if (thread.Steps >= thread.maxSteps) {
      if (thread.OnMaxSteps !== undefined) {
        thread.OnMaxSteps(thread);
      } else {
        thread.Cancel("too many steps");
      }
    }
    // bug atomic
    const reason = thread.cancelReason;
    if (reason !== null) {
      const err = `Starlark computation cancelled: ${reason}`;
      break loop;
    }
    fr.pc = pc;

    const op = code[pc];
    pc++;
    let arg = 0;

    if (op >= OpcodeArgMin) {
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
      PrintOp(f, fr.pc, op, arg);
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
        const op = op - Opcode.EQL + Token.EQL;
        const y = stack[sp - 1];
        const x = stack[sp - 2];
        sp -= 2;
        const [ok, err2] = Compare(op, x, y);
        if (err2 != null) {
          err = err2;
          break loop;
        }
        stack[sp] = Bool(ok);
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
        let binop = syntax.PLUS + (op - compile.PLUS);
        if (op == compile.IN) {
          binop = syntax.IN;
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
    }
  }
}
