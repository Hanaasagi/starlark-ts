import { Err, Ok, Result } from 'ts-results';

import * as spell from '../utils/spell';
import { Value, isValue } from './values';
import { Bool } from './values';
import { Tuple } from './values';
import { AsString, String } from './values';
import { NoneType } from './values';

// import { AsInt } from './value';

var debug = require('debug')('unpack');

interface Unpacker {
  unpack(v: Value): Result<Value, Error>;
}

function isUnpacker(v: any): v is Unpacker {
  if ('unpack' in v) {
    return true;
  }
  return false;
}

class intset {
  private small: bigint = 0n;
  private large: Map<number, boolean> | null = null;
  constructor(small?: bigint, large?: Map<number, boolean>) {
    this.small = small || 0n;
    this.large = large || null;
  }

  public init(n: number): void {
    if (n >= 64) {
      this.large = new Map();
    }
  }

  public set(i: number): boolean {
    let prev: boolean;
    if (this.large === null) {
      prev = (this.small & (1n << BigInt(i))) !== 0n;
      this.small |= 1n << BigInt(i);
    } else {
      prev = this.large.get(i) ?? false;
      this.large.set(i, true);
    }
    return prev;
  }

  public get(i: number): boolean {
    if (this.large === null) {
      return (this.small & (1n << BigInt(i))) !== 0n;
    }
    return this.large.get(i) ?? false;
  }

  public len(): number {
    if (this.large === null) {
      // Suboptimal, but used only for error reporting.
      let len = 0;
      for (let i = 0; i < 64; i++) {
        if ((this.small & (1n << BigInt(i))) !== 0n) {
          len++;
        }
      }
      return len;
    }
    return this.large.size;
  }
}

// UnpackArgs unpacks the positional and keyword arguments into the
// supplied parameter variables.  pairs is an alternating list of names
// and pointers to variables.
//
// If the variable is a bool, integer, string, *List, *Dict, Callable,
// Iterable, or user-defined implementation of Value,
// UnpackArgs performs the appropriate type check.
// Predeclared Go integer types uses the AsInt check.
//
// If the parameter name ends with "?", it is optional.
//
// If the parameter name ends with "??", it is optional and treats the None value
// as if the argument was absent.
//
// If a parameter is marked optional, then all following parameters are
// implicitly optional where or not they are marked.
//
// If the variable implements Unpacker, its Unpack argument
// is called with the argument value, allowing an application
// to define its own argument validation and conversion.
//
// If the variable implements Value, UnpackArgs may call
// its Type() method while constructing the error message.
//
// Examples:
//
//      var (
//          a Value
//          b = MakeInt(42)
//          c Value = starlark.None
//      )
//
//      // 1. mixed parameters, like def f(a, b=42, c=None).
//      err := UnpackArgs("f", args, kwargs, "a", &a, "b?", &b, "c?", &c)
//
//      // 2. keyword parameters only, like def f(*, a, b, c=None).
//      if len(args) > 0 {
//              return fmt.Errorf("f: unexpected positional arguments")
//      }
//      err := UnpackArgs("f", args, kwargs, "a", &a, "b?", &b, "c?", &c)
//
//      // 3. positional parameters only, like def f(a, b=42, c=None, /) in Python 3.8.
//      err := UnpackPositionalArgs("f", args, kwargs, 1, &a, &b, &c)
//
// More complex forms such as def f(a, b=42, *args, c, d=123, **kwargs)
// require additional logic, but their need in built-ins is exceedingly rare.
//
// In the examples above, the declaration of b with type Int causes UnpackArgs
// to require that b's argument value, if provided, is also an int.
// To allow arguments of any type, while retaining the default value of 42,
// declare b as a Value:
//
//	var b Value = MakeInt(42)
//
// The zero value of a variable of type Value, such as 'a' in the
// examples above, is not a valid Starlark value, so if the parameter is
// optional, the caller must explicitly handle the default case by
// interpreting nil as None or some computed default. The same is true
// for the zero values of variables of type *List, *Dict, Callable, or
// Iterable. For example:
//
//      // def myfunc(d=None, e=[], f={})
//      var (
//          d Value
//          e *List
//          f *Dict
//      )
//      err := UnpackArgs("myfunc", args, kwargs, "d?", &d, "e?", &e, "f?", &f)
//      if d == nil { d = None; }
//      if e == nil { e = new(List); }
//      if f == nil { f = new(Dict); }
//
export function UnpackArgs(
  fnname: string,
  args: Tuple,
  kwargs: Tuple[],
  pairs: Array<Value>
): Result<void, Error> {
  let nparams = Math.floor(pairs.length / 2);
  let defined = new intset();
  defined.init(nparams);

  let paramName = (x: any): [string, boolean] => {
    let skipNone = false;
    let name = x as string;

    if (name.startsWith('??')) {
      name = name.slice(2, name.length);
      skipNone = true;
    } else if (name[name.length - 1] == '?') {
      name = name.slice(0, name.length - 1);
    }

    return [name, skipNone];
  };

  if (args.Len() > nparams) {
    return Err(
      new Error(
        `${fnname}: got ${args.Len()} arguments, want at most ${nparams}`
      )
    );
  }

  for (let i = 0; i < args.Len(); i++) {
    let arg = args.index(i);
    defined.set(i);
    const [name, skipNone] = paramName(pairs[2 * i]);
    if (skipNone) {
      if (arg instanceof NoneType) {
        continue;
      }

      let res = unpackOneArg(arg, pairs[2 * i + 1]);
      if (res.err) {
        return Err(new Error(`${fnname}: for parameter ${name}: ${res.val}`));
      }
      pairs[2 * i + 1] = res.unwrap();
    }
  }

  // keyword arguments
  kwloop: for (let i = 0; i < kwargs.length; i++) {
    let item = kwargs[i];
    let name = item.index(0) as String;
    let arg = item.index(1);
    for (let i = 0; i < nparams; i++) {
      const [pName, skipNone] = paramName(pairs[2 * i]);
      if (pName === name.val) {
        // found it
        if (defined.set(i)) {
          return Err(
            new Error(
              `${fnname}: got multiple values for keyword argument ${name}`
            )
          );
        }

        if (skipNone) {
          if (arg instanceof NoneType) {
            continue kwloop;
          }
        }

        const ptr = pairs[2 * i + 1];
        let res = unpackOneArg(arg, ptr);
        if (res.err) {
          return Err(new Error(`${fnname}: for parameter ${name}: ${res.val}`));
        }
        pairs[2 * i + 1] = res.unwrap();
        continue kwloop;
      }
    }
    const err = new Error(`${fnname}: unexpected keyword argument ${name}`);
    const names: string[] = [];
    for (let i = 0; i < nparams; i += 2) {
      const param = paramName(pairs[i])[0];
      names.push(param);
    }
    const n = spell.nearest(name.val, names);
    if (n !== '') {
      err.message = `${err.message} (did you mean ${n}?)`;
    }
    return Err(err);
  }

  // Check that all non-optional parameters are defined.
  // (We needn't check the first len(args).)
  for (let i = args.Len(); i < nparams; i++) {
    let name = (pairs[2 * i] as String).val;
    if (name.startsWith('?')) {
      break;
    }
    if (!defined.get(i)) {
      return Err(new Error('${fname}: missing argument for ${name}'));
    }
  }

  return Ok.EMPTY;
}

// UnpackPositionalArgs unpacks the positional arguments into
// corresponding variables.  Each element of vars is a pointer; see
// UnpackArgs for allowed types and conversions.
//
// UnpackPositionalArgs reports an error if the number of arguments is
// less than min or greater than len(vars), if kwargs is nonempty, or if
// any conversion fails.
//
// See UnpackArgs for general comments.
export function UnpackPositionalArgs(
  fnname: string,
  args: Tuple,
  kwargs: Tuple[],
  min: number,
  vars: Array<Value>
): Error | null {
  if (kwargs.length > 0) {
    return new Error(`${fnname}: unexpected keyword arguments`);
  }
  const max = vars.length;
  if (args.Len() < min) {
    const atleast = min < max ? 'at least ' : '';
    return new Error(
      `${fnname}: got ${args.Len()} arguments, want ${atleast}${min}`
    );
  }
  if (args.Len() > max) {
    const atmost = max > min ? 'at most ' : '';
    return new Error(
      `${fnname}: got ${args.Len()} arguments, want ${atmost}${max}`
    );
  }

  for (let i = 0; i < args.Len(); i++) {
    const arg = args.index(i);
    // const variable = vars[i];
    const res = unpackOneArg(arg, vars[i]);
    if (res.err) {
      return new Error(`${fnname}: for parameter ${i + 1}: ${res.val}`);
    }
    vars[i] = res.unwrap();
  }
  return null;
}

// TODO:
function unpackOneArg<T>(v: Value, dst: T): Result<T, Error> {
  // BUG:
  if (!dst) {
    return Ok(dst);
  }
  debug('UNPACK');
  debug(v, dst);
  // TODO:?
  if (isUnpacker(dst)) {
    // TODO:
    // @ts-ignore
    return dst.unpack(v);
  }
  if (isValue(dst)) {
    return Ok(v as T);
  }

  if (typeof dst == 'string') {
    const [s, err] = AsString(v);
    if (err) {
      return Err(new Error(`got ${v.Type()}, want string`));
    }
    return Ok(s as T);
  }

  if (typeof dst == 'boolean') {
    if (v instanceof Bool) {
      return Ok(v.val as T);
    } else {
      return Err(new Error(`get ${v.Type()}, want bool`));
    }
  }

  throw new Error('unpackOneArg is not implemented');
}
