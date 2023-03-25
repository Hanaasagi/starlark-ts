import * as resolve from '../resolve/resolve';
import { Opcode } from '../starlark-compiler/compile';
import * as compile from '../starlark-compiler/compile';
import { Position } from '../starlark-parser';
import { Token } from '../starlark-parser';
import { ParseExpr, parse } from '../starlark-parser';
import { Call, Thread } from './eval';
import { getAttr, getIndex, setArgs, setField, setIndex, slice } from './eval';
import { Binary, Unary } from './eval';
import { listExtend } from './eval';
import { Callable, Function, Module, Tuple } from './value';
import { Iterable, List } from './value';
import { Compare, Value } from './value';
import { Universe } from './value';
import { Dict, Iterator, String } from './value';
import { Bool, False, Iterate, None, True } from './value';
import { IterableMapping } from './value';

// This file defines the bytecode interpreter.

const vmdebug = true; // TODO(adonovan): use a bitfield of specific kinds of error.

// TODO(adonovan):
// - optimize position table.
// - opt: record MaxIterStack during compilation and preallocate the stack.
export function CallInternal(
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
  console.log('CallInternal funcode is', f);
  let fr = thread.frameAt(0);
  console.log('CallInternal fr is', fr);

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
  const space: Value[] = new Array(nspace).fill(null);
  const locals: Value[] = space.slice(0, nlocals); // local variables, starting with parameters
  const stack: Value[] = space.slice(nlocals); // operand stack

  // Digest arguments and set parameters.
  let err: Error | null = setArgs(locals, fn, args, kwargs);
  if (err !== null) {
    return [null, thread.evalError(err)];
  }

  fr.locals = locals;

  if (vmdebug) {
    console.log(`Entering ${f.name} @${f.position(0)}`);
    console.log(`${stack.length} stack, ${locals.length} locals`);
    // const leaveMsg = `Leaving ${f.name}`;
    // setTimeout(() => console.log(leaveMsg), 0);
  }

  // Spill indicated locals to cells.
  // Each cell is a separate alloc to avoid spurious liveness.
  for (const index of f.cells) {
    locals[index] = new cell(locals[index]);
  }

  // TODO(adonovan): add static check that beneath this point
  // - there is exactly one return statement
  // - there is no redefinition of 'err'.

  var iterstack: Iterator[] = new Array(); // stack of active iterators
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
        thread.Cancel('too many steps');
      }
    }
    // BUG: atomic
    const reason = thread.cancelReason;
    if (reason) {
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
      for (;;) {
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

    console.log('CallInternal op code is', Opcode.String(op));
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
        let opToken =
          Object.values(Token)[
            op - Opcode.EQL + Object.values(Token).indexOf(Token.EQL)
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
        let binop =
          Object.values(Token)[
            op - Opcode.PLUS + Object.values(Token).indexOf(Token.PLUS)
          ];

        if (op == Opcode.IN) {
          binop = Token.IN;
        }
        let y = stack[sp - 1];
        let x = stack[sp - 2];
        sp -= 2;
        let z = Binary(binop, x, y);
        if (z instanceof Error) {
          err = z;
          break loop;
        }
        stack[sp] = z;
        sp++;
        break;
      case Opcode.UPLUS:
      case Opcode.UMINUS:
      case Opcode.TILDE: {
        let unop: Token;
        if (op === Opcode.TILDE) {
          unop = Token.TILDE;
        } else {
          unop =
            Object.values(Token)[
              op - Opcode.UPLUS + Object.values(Token).indexOf(Token.PLUS)
            ];
        }
        const x = stack[sp - 1];
        const [y, err2] = Unary(unop, x);
        if (err2 !== null) {
          err = err2;
          break loop;
        }
        stack[sp - 1] = y;
        break;
      }

      case Opcode.INPLACE_ADD: {
        let y = stack[sp - 1];
        let x = stack[sp - 2];
        sp -= 2;

        // It's possible that y is not Iterable but
        // nonetheless defines x+y, in which case we
        // should fall back to the general case.
        let z: Value | null = null;
        if (x instanceof List && 'iterate' in y) {
          if (x.checkMutable('apply += to')) {
            break loop;
          }
          listExtend(x, y as Iterable);
          z = x;
        }
        if (!z) {
          //@ts-ignore
          z = Binary(Token.PLUS, x, y);
          if (z instanceof Error) {
            err = z;
            break loop;
          }
        }

        stack[sp++] = z!;
        break;
      }
      case Opcode.INPLACE_ADD: {
        const y = stack[sp - 1];
        const x = stack[sp - 2];
        sp -= 2;

        let z: Value | null = null;
        if (x instanceof Dict) {
          if (y instanceof Dict) {
            const err = x.ht.checkMutable('apply |= to');
            if (err !== null) {
              break loop;
            }
            x.ht.addAll(y.ht); // can't fail
            z = x;
          }
        }
        if (z === null) {
          //@ts-ignore
          z = Binary(Token.PIPE, x, y);
          if (z instanceof Error) {
            err = z;
            break loop;
          }
        }

        stack[sp] = z!;
        sp++;
        break;
      }

      case Opcode.NONE:
        stack[sp] = None;
        sp++;
        break;

      case Opcode.TRUE:
        stack[sp] = True;
        sp++;
        break;

      case Opcode.FALSE:
        stack[sp] = False;
        sp++;
        break;

      case Opcode.MANDATORY:
        stack[sp] = new mandatory();
        sp++;
        break;

      case Opcode.JMP:
        pc = arg;
        break;

      case Opcode.CALL:
      case Opcode.CALL_VAR:
      case Opcode.CALL_KW:
      case Opcode.CALL_VAR_KW: {
        let kwargs: Value | null = null;
        if (op === Opcode.CALL_KW || op === Opcode.CALL_VAR_KW) {
          kwargs = stack[sp - 1];
          sp--;
        }

        let args: Value | null = null;
        if (op === Opcode.CALL_VAR || op === Opcode.CALL_VAR_KW) {
          args = stack[sp - 1];
          sp--;
        }

        // named args (pairs)
        let kvpairs: Tuple[] = [];
        const nkvpairs: number = arg & 0xff;
        if (nkvpairs > 0) {
          kvpairs = new Array<Tuple>(nkvpairs);
          let kvpairsAlloc = new Tuple(new Array(2 * nkvpairs)); // allocate a single backing array
          sp -= 2 * nkvpairs;

          for (let i = 0; i < nkvpairs; i++) {
            // BUG:
            let pair: Tuple = kvpairsAlloc.slice(0, 2, 1) as Tuple;
            pair.elems[0] = stack[sp + 2 * i]; // name
            pair.elems[1] = stack[sp + 2 * i + 1]; // value
            kvpairs.push(pair);
          }
        }
        if (kwargs != null) {
          // Add key/value items from **kwargs dictionary.
          const dict: IterableMapping = kwargs as IterableMapping;
          if (!dict.Type()) {
            err = new Error(
              `argument after ** must be a mapping, not ${dict.Type()}`
            );
            break loop;
          }
          const items: Tuple[] = dict.items();
          for (let i = 0; i < items.length; i++) {
            if (!items[i].index(0).Type()) {
              err = new Error(
                `keywords must be strings, not ${items[i].index(0).Type()}`
              );
              break loop;
            }
          }
          if (kvpairs.length === 0) {
            kvpairs = items;
          } else {
            kvpairs.push(...items);
          }
        }

        // positional args
        let positional: Tuple | null = null;
        const npos: number = arg >> 8;
        if (npos > 0) {
          positional = new Tuple(stack.slice(sp - npos, sp));
          console.log('----->', positional);
          sp -= npos;

          // Copy positional arguments into a new array,
          // unless the callee is another Starlark function,
          // in which case it can be trusted not to mutate them.
          if (!(stack[sp - 1] instanceof Function) || args != null) {
            positional = new Tuple([...positional.elems]);
            // positional.elems.push(...tmp.elems);
          }
        }
        if (args !== null) {
          // TODO:
          // // Add elements from *args sequence.
          // const iter: Iterable<Value> | null = Iterate(args);
          // if (iter === null) {
          //   err = new Error(
          //     `argument after * must be iterable, not ${args.Type()}`
          //   );
          //   break loop;
          // }
          // for (let elem of iter) {
          //   positional?.elems.push(elem);
          // }
        }

        const func: Value = stack[sp - 1];

        if (vmdebug) {
          console.log(
            `VM call ${func.String()} args = ${positional} kwargs = ${kvpairs} @${f.position(
              fr.pc
            )}`
          );
        }

        // thread.endProfSpan()
        const result = Call(thread, func, positional!, kvpairs);
        console.log('VM call return', result);
        // thread.beginProfSpan()

        if (result[1]) {
          break loop;
        }
        if (vmdebug) {
          console.log(`Resuming ${f.name} @${f.position(0)}`);
        }
        stack[sp - 1] = result[0];

        console.log('After Resuming', stack, result[0], sp);
        break;
      }

      case Opcode.ITERPUSH: {
        let x = stack[sp - 1];
        sp--;
        let iter = Iterate(x);
        if (!iter) {
          err = new Error(`${x.Type()} value is not iterable`);
          break loop;
        }
        iterstack.push(iter);
        break;
      }
      case Opcode.ITERJMP: {
        let iter = iterstack[iterstack.length - 1];
        if (iter.next(stack[sp])) {
          sp++;
        } else {
          pc = arg;
        }
        break;
      }

      case Opcode.ITERPOP: {
        let n = iterstack.length - 1;
        iterstack[n].done();
        iterstack = iterstack.slice(0, n);
        break;
      }
      case Opcode.NOT:
        stack[sp - 1] = stack[sp - 1].Truth().val == true ? True : None;
        break;

      case Opcode.SETINDEX: {
        let z = stack[sp - 1];
        let y = stack[sp - 2];
        let x = stack[sp - 3];
        sp -= 3;
        err = setIndex(x, y, z);
        if (err) {
          break loop;
        }
        break;
      }

      case Opcode.INDEX: {
        let y = stack[sp - 1];
        let x = stack[sp - 2];
        sp -= 2;
        let [z, err3] = getIndex(x, y);
        if (err3) {
          err = err3;
          break loop;
        }
        stack[sp] = z;
        sp++;
        break;
      }

      case Opcode.ATTR: {
        let x = stack[sp - 1];
        let name = f.prog.names[arg];
        let [y, err2] = getAttr(x, name);
        if (err2) {
          err = err2;
          break loop;
        }
        stack[sp - 1] = y!;
        break;
      }

      case Opcode.SETFIELD: {
        let y = stack[sp - 1];
        let x = stack[sp - 2];
        sp -= 2;
        let name = f.prog.names[arg];
        let err2 = setField(x, name, y);
        if (err2) {
          err = err2;
          break loop;
        }
        break;
      }

      case Opcode.MAKEDICT: {
        stack[sp] = new Dict();
        sp++;
        break;
      }

      case Opcode.SETFIELD:
      case Opcode.SETDICTUNIQ: {
        let dict = stack[sp - 3] as Dict;
        let k = stack[sp - 2];
        let v = stack[sp - 1];
        sp -= 3;
        let oldlen = dict.len();
        let err2 = dict.setKey(k, v);
        if (err2) {
          err = err2;
          break loop;
        }
        if (op == Opcode.SETDICTUNIQ && dict.len() == oldlen) {
          err = new Error('duplicate key: ${k}');
          break loop;
        }

        break;
      }

      case Opcode.APPEND: {
        let elem = stack[sp - 1];
        let list = stack[sp - 2] as List;
        sp -= 2;
        list.elems.push(elem);
        break;
      }

      case Opcode.SLICE: {
        let x = stack[sp - 4];
        let lo = stack[sp - 3];
        let hi = stack[sp - 2];
        let step = stack[sp - 1];
        sp -= 4;
        let [res, err2] = slice(x, lo, hi, step);
        if (err2) {
          err = err2;
          break loop;
        }
        stack[sp] = res;
        sp++;
        break;
      }

      case Opcode.UNPACK: {
        let n = Number(arg);
        let iterable = stack[sp - 1];
        sp--;
        let iter = Iterate(iterable);
        if (!iter) {
          err = new Error('got ${iterable.Type()} in sequence assignment');
          break loop;
        }
        let i = 0;
        sp += n;

        while (i < n && iter.next(stack[sp - 1 - i])) {
          i++;
        }
        // BUG:
        var dummy: Value | null = null;
        if (iter.next(dummy!)) {
          // NB: Len may return -1 here in obscure cases.
          err = new Error(
            'too many values to unpack (got ${iterable.length}, want ${n})'
          );
          break loop;
        }
        iter.done();
        if (i < n) {
          err = new Error('too few values to unpack (got ${i}, want ${n})');
          break loop;
        }

        break;
      }

      case Opcode.CJMP:
        if (stack[sp - 1].Truth().val) {
          pc = arg;
        }
        sp--;
        break;

      case Opcode.CONSTANT: {
        stack[sp] = fn.module.constants[arg];
        sp++;
        break;
      }
      case Opcode.MAKETUPLE: {
        let n = Number(arg);
        let tuple = new Tuple(new Array(n));
        sp -= n;
        for (let i = 0; i < tuple.Len(); i++) {
          if (sp + i >= stack.length) {
            break;
          }
          tuple.elems[i] = stack[sp + i];
        }
        // tuple.elems = stack.slice(sp, stack.length);
        stack[sp] = tuple;
        sp++;
        break;
      }

      case Opcode.MAKELIST: {
        let n = Number(arg);
        let elems: Value[] = new Array(n);
        sp -= n;

        for (let i = 0; i < elems.length; i++) {
          if (sp + i >= stack.length) {
            break;
          }
          elems[i] = stack[sp + i];
        }
        stack[sp] = new List(elems);
        sp++;
        break;
      }

      case Opcode.MAKEFUNC: {
        let funcode = f.prog.functions[arg];
        let tuple = stack[sp - 1] as Tuple;
        let n = tuple.Len() - funcode.freevars.length;
        let defaults = tuple.slice(0, n, 1) as Tuple;
        let freevars = tuple.slice(n, tuple.Len(), 1) as Tuple;
        stack[sp - 1] = new Function(funcode, fn.module, defaults, freevars);
        break;
      }

      case Opcode.LOAD: {
        let n = arg as number;
        let m = stack[sp - 1] as String;
        sp--;

        if (!thread.Load) {
          err = new Error('load not implemented by this application');
          break loop;
        }

        let [dict, err2] = thread.Load(thread, m.val);

        if (err2 !== null) {
          err = new Error(`cannot load ${m}: ${err2}`);
          break loop;
        }

        for (let i = 0; i < n; i++) {
          const from = stack[sp - 1 - i] as String;
          const v = dict.get(from.val);

          if (!v) {
            // TODO:
            // err = new Error(`load: name ${from} not found in module ${module}`);
            // const nearest = spell.Nearest(from, Object.keys(dict));
            const nearest = '';
            if (nearest) {
              err = new Error(`${err} (did you mean ${nearest}?)`);
            }
            break loop;
          }

          stack[sp - 1 - i] = v;
        }
        break;
      }

      case Opcode.SETLOCAL:
        locals[arg] = stack[sp - 1];
        sp--;
        break;

      case Opcode.SETLOCALCELL:
        (locals[arg] as cell).v = stack[sp - 1];
        sp--;
        break;

      case Opcode.SETGLOBAL:
        fn.module.globals[arg] = stack[sp - 1];
        sp--;
        break;

      case Opcode.LOCAL: {
        let x = locals[arg];
        if (!x) {
          err = new Error(
            `local variable ${f.locals[arg].name} referenced before assignment`
          );
          break loop;
        }
        stack[sp] = x;
        sp++;
        break;
      }
      case Opcode.FREE: {
        stack[sp] = fn.freevars.index(arg);
        sp++;
        break;
      }

      case Opcode.LOCALCELL: {
        let v = (locals[arg] as cell).v;
        if (!v) {
          err = new Error(
            `local variable ${f.locals[arg].name} referenced before assignment`
          );
          break loop;
        }
        stack[sp] = v;
        sp++;
        break;
      }
      case Opcode.FREECELL: {
        let v = (fn.freevars.index(arg) as cell).v;
        if (!v) {
          err = new Error(
            `local variable ${f.freevars[arg].name} referenced before assignment`
          );
          break loop;
        }
        stack[sp] = v;
        sp++;
        break;
      }
      case Opcode.GLOBAL: {
        let x = fn.module.globals[arg];
        if (!x) {
          err = new Error(
            `global variable ${f.prog.globals[arg].name} referenced before assignment`
          );
          break loop;
        }
        stack[sp] = x;
        sp++;
        break;
      }

      case Opcode.UNIVERSAL:
        stack[sp] = Universe.get(f.prog.names[arg])!;
        sp++;
        break;

      case Opcode.RETURN:
        result = stack[sp - 1];
        break loop;

      // TODO:
      // case compile.INPLACE_PIPE:
      default:
        err = new Error(`unimplemented: ${op}`);
        break loop;
    }
  }
  // @ts-ignore
  return [result, err];
}

class wrappedError {
  constructor(public msg: string, public cause: Error) {}

  public get name(): string {
    return 'wrappedError';
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
export class mandatory implements Value {
  constructor() {}
  public String(): string {
    return 'mandatory';
  }
  public Type(): string {
    return 'mandatory';
  }
  public Freeze(): void {} // immutable
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
    return 'cell';
  }
  public Type(): string {
    return 'cell';
  }
  public Freeze(): void {
    if (this.v != null) {
      this.v.Freeze();
    }
  }
  public Truth(): Bool {
    throw new Error('unreachable');
  }
  public Hash(): [number, Error | null] {
    throw new Error('unreachable');
  }
}
