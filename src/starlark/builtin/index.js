'use strict';
exports.__esModule = true;
exports.Universe = void 0;
var value_1 = require('../value');
var value_2 = require('../value');
var value_3 = require('../value');
var value_4 = require('../value');
var value_5 = require('../value');
var value_6 = require('../value');
var value_7 = require('../value');
var value_8 = require('../value');
var value_9 = require('../value');
var value_10 = require('../value');
var int_1 = require('../int');
var int_2 = require('../int');
var int_3 = require('../int');
var int_4 = require('../int');
var unpack_1 = require('../unpack');
exports.Universe = new value_1.StringDict([
  ['None', value_5.None],
  ['True', value_6.True],
  ['False', value_7.False],
  ['abs', new value_1.Builtin('abs', abs)],
  ['any', new value_1.Builtin('any', any)],
  ['all', new value_1.Builtin('all', all)],
  ['bool', new value_1.Builtin('bool', bool_)],
  ['bytes', new value_1.Builtin('bytes', bytes_)],
  ['chr', new value_1.Builtin('chr', chr)],
  ['dict', new value_1.Builtin('dict', dict)],
  ['dir', new value_1.Builtin('dir', dir)],
  ['enumerate', new value_1.Builtin('enumerate', enumerate)],
  ['fail', new value_1.Builtin('fail', fail)],
  ['float', new value_1.Builtin('float', float)],
  ['getattr', new value_1.Builtin('getattr', getattr)],
  ['hasattr', new value_1.Builtin('hasattr', hasattr)],
  ['hash', new value_1.Builtin('hash', hash)],
  ['int', new value_1.Builtin('int', int_)],
  ['len', new value_1.Builtin('len', len_)],
  ['list', new value_1.Builtin('list', list)],
  ['max', new value_1.Builtin('max', minmax)],
  ['min', new value_1.Builtin('min', minmax)],
  ['ord', new value_1.Builtin('ord', ord)],
  ['print', new value_1.Builtin('print', print)],
  ['range', new value_1.Builtin('range', range_)],
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
function abs(thread, _, args, kwargs) {
  var res = new Array(1);
  var unpackError = (0, unpack_1.UnpackPositionalArgs)(
    'abs',
    args,
    kwargs,
    1,
    res
  );
  var x = res[0];
  if (unpackError) {
    return unpackError;
  }
  if (x instanceof value_8.Float) {
    return new value_8.Float(Math.abs(x.val));
  }
  if (x instanceof int_1.Int) {
    if (x.Sign() >= 0) {
      return x;
    }
    return int_4.zero.Sub(x);
  }
  return new Error('got '.concat(x.type, ', want int or float'));
}
function all(thread, b, args, kwargs) {
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
function any(thread, b, args, kwargs) {
  return new Error('TODO: builtin any');
}
// https://github.com/google/starlark-go/blob/master/doc/spec.md#bool
function bool_(thread, _, args, kwargs) {
  var x = value_7.False;
  var res = new Array(1);
  var unpackError = (0, unpack_1.UnpackPositionalArgs)(
    'bool',
    args,
    kwargs,
    0,
    res
  );
  if (unpackError) {
    return unpackError;
  }
  x = res[0];
  return x.Truth();
}
function bytes_(thread, _, args, kwargs) {
  return new Error('TODO: builtin bytes');
}
// https://github.com/google/starlark-go/blob/master/doc/spec.md#chr
function chr(thread, _, args, kwargs) {
  if (kwargs.length > 0) {
    return new Error('chr does not accept keyword arguments');
  }
  if (args.Len() !== 1) {
    return new Error('chr: got '.concat(args.Len(), ' arguments, want 1'));
  }
  // FIXME:?
  var i = (0, int_2.AsInt32)(args.index(0));
  if (i < 0) {
    return new Error('chr: Unicode code point '.concat(i, ' out of range(<0)'));
  }
  if (i > 0x10ffff) {
    return new Error(
      'chr: Unicode code point U + '.concat(
        i.toString(16),
        ' out of range(> 0x10FFFF)'
      )
    );
  }
  return new value_3.String(String.fromCharCode(i));
}
// https://github.com/google/starlark-go/blob/master/doc/spec.md#dict
function dict(thread, _, args, kwargs) {
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
function dir(thread, _, args, kwargs) {
  return new Error('TODO: builtin dir');
}
function enumerate(thread, _, args, kwargs) {
  return new Error('TODO: builtin enumerate');
}
// https://github.com/google/starlark-go/blob/master/doc/spec.md#fail
function fail(thread, _, args, kwargs) {
  return new Error('TODO: builtin fail');
}
// https://github.com/google/starlark-go/blob/master/doc/spec.md#float
function float(thread, _, args, kwargs) {
  return new Error('TODO: builtin fail');
}
function getattr(thread, b, args, kwargs) {
  var res = new Array(3);
  var err = (0, unpack_1.UnpackPositionalArgs)('getattr', args, kwargs, 2, res);
  if (err) {
    return err;
  }
  var obj = res[0],
    name = res[1],
    dflt = res[2];
  if ('Attr' in obj && 'AttrNames' in obj) {
    var _a = obj.Attr(name),
      v = _a[0],
      err_1 = _a[1];
    if (err_1) {
      if (dflt) {
        return dflt;
      } else {
        return new Error(''.concat(b.Name(), ': ').concat(err_1));
      }
    }
    if (v) {
      return v;
    }
  }
  if (dflt) {
    return dflt;
  }
  return new Error(
    'getattr: '.concat(obj.Type(), ' has no.').concat(name, ' field or method')
  );
}
function hasattr(thread, _, args, kwargs) {
  var res = new Array(2);
  var err = (0, unpack_1.UnpackPositionalArgs)('hasattr', args, kwargs, 2, res);
  if (err) {
    return err;
  }
  var obj = res[0];
  var name = res[1];
  if ('Attr' in obj && 'AttrNames' in obj) {
    var _a = obj.Attr(name),
      v = _a[0],
      err_2 = _a[1];
    if (!err_2) {
      return new value_2.Bool(v != null);
    }
    // An error does not conclusively indicate presence or
    // absence of a field: it could occur while computing
    // the value of a present attribute, or it could be a
    // "no such attribute" error with details.
    for (var _i = 0, _b = obj.AttrNames(); _i < _b.length; _i++) {
      var x = _b[_i];
      if (x == name) {
        return value_6.True;
      }
    }
  }
  return value_7.False;
}
function hash(thread, _, args, kwargs) {
  return new Error('TODO: builtin hash');
}
function int_(thread, _, args, kwargs) {
  return new Error('TODO: builtin int');
}
function len_(thread, _, args, kwargs) {
  var res = new Array(1);
  var err = (0, unpack_1.UnpackPositionalArgs)('len', args, kwargs, 1, res);
  if (err) {
    return err;
  }
  var x = res[0];
  var len = (0, value_4.Len)(x);
  if (len < 0) {
    return new Error('len: value of type ${x.Type()} has no len');
  }
  return (0, int_3.MakeInt)(len);
}
function list(thread, _, args, kwargs) {
  return new Error('TODO: builtin list');
}
function minmax(thread, _, args, kwargs) {
  return new Error('TODO: builtin minmax');
}
function ord(thread, _, args, kwargs) {
  return new Error('TODO: builtin ord');
}
// https://github.com/google/starlark-go/blob/master/doc/spec.md#print
function print(thread, b, args, kwargs) {
  //@ts-ignore
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
  console.error('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
  console.error(
    '<<<< print is not impl but i can give you',
    JSON.stringify(args)
  );
  var sep = ' ';
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
function range_(thread, b, args, kwargs) {
  var res = new Array(3);
  var err = (0, unpack_1.UnpackPositionalArgs)('range', args, kwargs, 1, res);
  if (err) {
    return err;
  }
  console.log(res);
  var start = res[0];
  var stop = res[1];
  var step = res[2] || 1;
  if (args.Len() == 1) {
    start = 0;
    stop = start;
  }
  if (step == 0) {
    return new Error(''.concat(b.Name(), ': step argument must not be zero'));
  }
  return new value_9.RangeValue(
    start,
    stop,
    step,
    (0, value_10.rangeLen)(start, stop, step)
  );
}
