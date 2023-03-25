import { argv0 } from 'process';

import { Thread } from '../eval';
import { Int } from '../int';
import { AsInt32 } from '../int';
import { MakeInt } from '../int';
import { zero } from '../int';
import { UnpackPositionalArgs } from '../unpack';
import { Builtin, StringDict } from '../value';
import { Tuple } from '../value';
import { Value } from '../value';
import { Bool } from '../value';
import { String as String_ } from '../value';
import { Len } from '../value';
import { Dict } from '../value';
import { None } from '../value';
import { True } from '../value';
import { False } from '../value';
import { Float } from '../value';
import { RangeValue } from '../value';
import { rangeLen } from '../value';

export var Universe = new StringDict([
  ['None', None],
  ['True', True],
  ['False', False],
  ['abs', new Builtin('abs', abs)],
  ['any', new Builtin('any', any)],
  ['all', new Builtin('all', all)],
  ['bool', new Builtin('bool', bool_)],
  ['bytes', new Builtin('bytes', bytes_)],
  ['chr', new Builtin('chr', chr)],
  ['dict', new Builtin('dict', dict)],
  ['dir', new Builtin('dir', dir)],
  ['enumerate', new Builtin('enumerate', enumerate)],
  ['fail', new Builtin('fail', fail)],
  ['float', new Builtin('float', float)],
  ['getattr', new Builtin('getattr', getattr)],
  ['hasattr', new Builtin('hasattr', hasattr)],
  ['hash', new Builtin('hash', hash)],
  ['int', new Builtin('int', int_)],
  ['len', new Builtin('len', len_)],
  ['list', new Builtin('list', list)],
  ['max', new Builtin('max', minmax)],
  ['min', new Builtin('min', minmax)],
  ['ord', new Builtin('ord', ord)],
  ['print', new Builtin('print', print)],
  ['range', new Builtin('range', range_)],
  // ["repr", new Builtin("repr", repr)],
  // ["reversed", new Builtin("reversed", reversed)],
  // ["set", new Builtin("set", set)], // requires resolve.AllowSet
  // ["sorted", new Builtin("sorted", sorted)],
  // ["str", new Builtin("str", str)],
  // ["tuple", new Builtin("tuple", tuple)],
  // ["type", new Builtin("type", type_)],
  // ["zip", new Builtin("zip", zip)],
]);

// https://github.com/google/starlark-go/blob/master/doc/spec.md#abs
function abs(
  thread: Thread,
  _: Builtin | undefined,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  let res = new Array(1);
  const unpackError = UnpackPositionalArgs('abs', args, kwargs, 1, res);
  let x = res[0];

  if (unpackError) {
    return unpackError;
  }
  if (x instanceof Float) {
    return new Float(Math.abs(x.val));
  }
  if (x instanceof Int) {
    if (x.Sign() >= 0) {
      return x;
    }
    return zero.Sub(x);
  }
  return new Error(`got ${x.type}, want int or float`);
}

function all(
  thread: Thread,
  b: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  // TODO:
  // let res = new Array()
  // unpackPositionalArgs("all", args, kwargs, 1, (x) => (iterable = x as Iterable));
  // const iter = iterable.iterate();
  // try {
  //   let x: Value;
  //   while (iter.next(x)) {
  //     if (!x.truth()) {
  //       return Promise.resolve(False);
  //     }
  //   }
  //   return Promise.resolve(True);
  // } finally {
  //   iter.done();
  // }
  return new Error('TODO: builtin all');
}

function any(
  thread: Thread,
  b: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin any');
}

// https://github.com/google/starlark-go/blob/master/doc/spec.md#bool
function bool_(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  let x: Value = False;
  let res = new Array(1);
  const unpackError = UnpackPositionalArgs('bool', args, kwargs, 0, res);
  if (unpackError) {
    return unpackError;
  }
  x = res[0];
  return x.Truth();
}

function bytes_(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin bytes');
}

// https://github.com/google/starlark-go/blob/master/doc/spec.md#chr
function chr(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  if (kwargs.length > 0) {
    return new Error('chr does not accept keyword arguments');
  }
  if (args.Len() !== 1) {
    return new Error(`chr: got ${args.Len()} arguments, want 1`);
  }
  // FIXME:?
  const i: number = AsInt32(args.index(0) as Int);

  if (i < 0) {
    return new Error(`chr: Unicode code point ${i} out of range(<0)`);
  }
  if (i > 0x10ffff) {
    return new Error(
      `chr: Unicode code point U + ${i.toString(16)} out of range(> 0x10FFFF)`
    );
  }
  return new String_(String.fromCharCode(i));
}

// https://github.com/google/starlark-go/blob/master/doc/spec.md#dict
function dict(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin dict');
  // if (args.Len() > 1) {
  //   return new Error(`dict: got ${args.Len()} arguments, want at most 1`);
  // }

  // let dict = new Dict();
  // const err = updateDict(dict, args, kwargs);
  // if (err) {
  //   return new Error(`dict: ${err}`);
  // }
  // return dict;
}

function dir(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin dir');
}

function enumerate(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin enumerate');
}

// https://github.com/google/starlark-go/blob/master/doc/spec.md#fail
function fail(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin fail');
}

// https://github.com/google/starlark-go/blob/master/doc/spec.md#float
function float(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin fail');
}

function getattr(
  thread: Thread,
  b: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  let res = new Array(3);

  const err = UnpackPositionalArgs('getattr', args, kwargs, 2, res);
  if (err) {
    return err;
  }

  let [obj, name, dflt] = res;
  if ('Attr' in obj && 'AttrNames' in obj) {
    let [v, err] = obj.Attr(name);
    if (err) {
      if (dflt) {
        return dflt;
      } else {
        return new Error(`${b.Name()}: ${err}`);
      }
    }
    if (v) {
      return v;
    }
  }
  if (dflt) {
    return dflt;
  }

  return new Error(`getattr: ${obj.Type()} has no.${name} field or method`);
}

function hasattr(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  let res = new Array(2);
  const err = UnpackPositionalArgs('hasattr', args, kwargs, 2, res);
  if (err) {
    return err;
  }
  let obj = res[0];
  let name = res[1];
  if ('Attr' in obj && 'AttrNames' in obj) {
    let [v, err] = obj.Attr(name);
    if (!err) {
      return new Bool(v != null);
    }

    // An error does not conclusively indicate presence or
    // absence of a field: it could occur while computing
    // the value of a present attribute, or it could be a
    // "no such attribute" error with details.
    for (var x of obj.AttrNames()) {
      if (x == name) {
        return True;
      }
    }
  }

  return False;
}

function hash(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin hash');
}

function int_(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin int');
}

function len_(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  let res = new Array(1);
  const err = UnpackPositionalArgs('len', args, kwargs, 1, res);
  if (err) {
    return err;
  }
  let x = res[0];
  let len = Len(x);

  if (len < 0) {
    return new Error('len: value of type ${x.Type()} has no len');
  }
  return MakeInt(len);
}

function list(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin list');
}

function minmax(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin minmax');
}

function ord(
  thread: Thread,
  _: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  return new Error('TODO: builtin ord');
}

// https://github.com/google/starlark-go/blob/master/doc/spec.md#print
function print(
  thread: Thread,
  b: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  //@ts-ignore
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };

  console.error('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
  console.error(
    '<<<< print is not impl but i can give you',
    JSON.stringify(args)
  );
  let sep = ' ';
  // const err = UnpackArgs("print", null, kwargs, "sep?", sep);
  // if (err) {
  //   return [null, err];
  // }
  // const buf = new Array();
  // for (let i = 0; i < args.Len(); i++) {
  //   const v = args.index(i);
  //   if (i > 0) {
  //     buf.push(sep);
  //   }
  //   const s = AsString(v);
  //   if (s !== undefined) {
  //     buf.push(s);
  //   } else if (v instanceof Bytes) {
  //     // buf.push(new String(v));
  //   } else {
  //     buf.push(v);
  //   }
  // }

  // console.log(buf.join(""));
  console.error('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
  // @ts-ignore
  return null;

  // const s = buf.String();
  // if (thread.Print !== null) {
  //   thread.Print(thread, s);
  // } else {
  //   console.log(s);
  // }
  // return [None, null];
}

function range_(
  thread: Thread,
  b: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): Value | Error {
  let res = new Array(3);
  const err = UnpackPositionalArgs('range', args, kwargs, 1, res);
  if (err) {
    return err;
  }
  console.log(res);

  let start = res[0];
  let stop = res[1];
  let step = res[2] || 1;

  if (args.Len() == 1) {
    start = 0;
    stop = start;
  }

  if (step == 0) {
    return new Error(`${b.Name()}: step argument must not be zero`);
  }

  return new RangeValue(start, stop, step, rangeLen(start, stop, step));
}
