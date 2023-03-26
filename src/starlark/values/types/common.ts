import { Token } from '../../../starlark-parser';
import { Int } from '../../../starlark/int';
import { Bool } from './bool';
import { Builtin } from './builtin';
import { Dict } from './dict';
import { Float } from './float';
import { Function } from './function';
import { Comparable, Value } from './interface';
import { List } from './list';
import { NoneType } from './none';
import { Set } from './set';
import { Tuple } from './tuple';

// toString returns the string form of value v.
// It may be more efficient than v.toString() for larger values.
export function toString(v: Value): string {
  const buf = new Array();
  writeValue(buf, v, []);
  return buf.toString();
}

// writeValue writes x to out.
//
// path is used to detect cycles.
// It contains the list of *List and *Dict values we're currently printing.
// (These are the only potentially cyclic structures.)
// Callers should generally pass nil for path.
// It is safe to re-use the same path slice for multiple calls.
function writeValue(out: string[], x: Value, path: Value[]): void {
  if (x instanceof NoneType) {
    out.push('None');
    return;
  }

  if (x instanceof Int) {
    out.push(x.toString());
    return;
  }
  if (x instanceof Bool) {
    if (x.val) {
      out.push('True');
    } else {
      out.push('False');
    }

    return;
  }

  if (x instanceof String) {
    // TODO quote
    out.push(x.String());
    return;
  }

  if (x instanceof List) {
    out.push('[');
    if (pathContains(path, x)) {
      out.push('...'); // list contains itself
    } else {
      for (let i = 0; i < x.elems.length; i++) {
        if (i > 0) {
          out.push(', ');
        }
        writeValue(out, x.elems[i], path.concat(x));
      }
    }
    out.push(']');
    return;
  }

  if (x instanceof Tuple) {
    out.push('(');
    for (let i = 0; i < x.Len(); i++) {
      if (i > 0) {
        out.push(', ');
      }
      writeValue(out, x.index(i), path);
    }
    if (x.Len() === 1) {
      out.push(',');
    }
    out.push(')');
    return;
  }

  if (x instanceof Function) {
    out.push(`< function ${x.Name()} > `);
  }

  if (x instanceof Builtin) {
    if (x.recv !== null) {
      out.push(`< built -in method ${x.Name()} of ${x.recv.Type()} value > `);
    } else {
      out.push(`< built -in function ${x.Name()} > `);
    }
    return;
  }

  if (x instanceof Dict) {
    out.push('{');
    if (pathContains(path, x)) {
      out.push('...'); // dict contains itself
    } else {
      let sep = '';
      for (let e = x.ht.head; e !== null; e = e.next) {
        let k = e.key;
        let v = e.value;
        out.push(sep);
        writeValue(out, k, path);
        out.push(': ');
        writeValue(out, v, path.concat(x)); // cycle check
        sep = ', ';
      }
    }
    out.push('}');
    return;
  }

  if (x instanceof Set) {
    out.push('set([');
    for (let i = 0; i < x.elems().length; i++) {
      if (i > 0) {
        out.push(', ');
      }
      writeValue(out, x.elems()[i], path);
    }
    out.push('])');
    return;
  }

  out.push(x.toString());
}

function pathContains(path: Value[], x: Value): boolean {
  for (const y of path) {
    if (x === y) {
      return true;
    }
  }
  return false;
}

// CompareLimit is the depth limit on recursive comparison operations such as == and <.
// Comparison of data structures deeper than this limit may fail.
var CompareLimit = 10;

// Equal reports whether two Starlark values are equal.
export function Equal(x: Value, y: Value): [boolean, Error | null] {
  // BUG: error type
  if (x instanceof String) {
    return [x == y, null]; // fast path for an important special case
  }
  return EqualDepth(x, y, CompareLimit);
}

// EqualDepth reports whether two Starlark values are equal.
//
// Recursive comparisons by implementations of Value.CompareSameType
// should use EqualDepth to prevent infinite recursion.
export function EqualDepth(
  x: Value,
  y: Value,
  depth: number
): [boolean, Error | null] {
  return CompareDepth(Token.EQL, x, y, depth);
}

// Compare compares two Starlark values.
// The comparison operation must be one of EQL, NEQ, LT, LE, GT, or GE.
// Compare returns an error if an ordered comparison was
// requested for a type that does not support it.
//
// Recursive comparisons by implementations of Value.CompareSameType
// should use CompareDepth to prevent infinite recursion.
export function Compare(
  op: Token,
  x: Value,
  y: Value
): [boolean, Error | null] {
  return CompareDepth(op, x, y, CompareLimit);
}

// CompareDepth compares two Starlark values.
// The comparison operation must be one of EQL, NEQ, LT, LE, GT, or GE.
// CompareDepth returns an error if an ordered comparison was
// requested for a pair of values that do not support it.
//
// The depth parameter limits the maximum depth of recursion
// in cyclic data structures.
export function CompareDepth(
  op: Token,
  x: Value,
  y: Value,
  depth: number
): [boolean, Error | null] {
  if (depth < 1) {
    return [false, new Error('comparison exceeded maximum recursion depth')];
  }
  if (sameType(x, y)) {
    // TODO:?
    if ('CompareSameType' in x) {
      return (x as Comparable).CompareSameType(op, y, depth);
    }

    // use identity comparison
    switch (op) {
      case Token.EQL:
        return [x === y, null];
      case Token.NEQ:
        return [x !== y, null];
    }
    return [false, new Error(`${x.Type()} ${op} ${y.Type()} not implemented`)];
  }

  // int/float ordered comparisons
  if (x instanceof Int) {
    if (y instanceof Float) {
      let cmp: number;
      if (Number.isNaN(y)) {
        cmp = -1; // y is NaN
      } else if (isFinite(y.val)) {
        // BUG:
        cmp = 1;
        // cmp = x.rational().cmp(y.rational()); // y is finite
      } else if (y.val > 0) {
        cmp = -1; // y is +Inf
      } else {
        cmp = +1; // y is -Inf
      }
      return [threeway(op, cmp), null];
    }
  }
  if (x instanceof Float) {
    if (y instanceof Int) {
      let cmp: number;
      if (Number.isNaN(x)) {
        cmp = +1; // x is NaN
      } else if (isFinite(x.val)) {
        // BUG:
        cmp = 1;
        // cmp = x.rational().cmp(y.rational()); // x is finite
      } else if (x.val > 0) {
        cmp = +1; // x is +Inf
      } else {
        cmp = -1; // x is -Inf
      }
      return [threeway(op, cmp), null];
    }
  }

  // All other values of different types compare unequal.
  switch (op) {
    case Token.EQL:
      return [false, null];
    case Token.NEQ:
      return [true, null];
  }
  return [false, new Error(`${x.Type()} ${op} ${y.Type()} not implemented`)];
}

export function sameType(x: Value, y: Value): boolean {
  // BUG:
  return x instanceof y.constructor || x.Type() === y.Type();
}

// threeway interprets a three-way comparison value cmp (-1, 0, +1)
// as a boolean comparison (e.g. x < y).
export function threeway(op: Token, cmp: number): boolean {
  switch (op) {
    case Token.EQL:
      return cmp === 0;
    case Token.NEQ:
      return cmp !== 0;
    case Token.LE:
      return cmp <= 0;
    case Token.LT:
      return cmp < 0;
    case Token.GE:
      return cmp >= 0;
    case Token.GT:
      return cmp > 0;
    default:
      throw new Error(op);
  }
}

export function builtinAttr(
  recv: Value,
  name: string,
  methods: Map<string, Builtin>
): [Value, Error | null] {
  const b = methods.get(name);
  if (!b) {
    //@ts-ignore
    return [b, null]; // no such method
  }
  return [b.BindReceiver(recv), null];
}

export function builtinAttrNames(methods: Map<string, Builtin>): string[] {
  const names: string[] = Object.keys(methods);
  names.sort();
  return names;
}
export function sliceCompare(
  op: Token,
  x: Value[],
  y: Value[],
  depth: number
): [boolean, Error | null] {
  // Fast path: check length.
  if (x.length !== y.length && (op === Token.EQL || op === Token.NEQ)) {
    return [op === Token.NEQ, null];
  }

  // Find first element that is not equal in both lists.
  for (let i = 0; i < x.length && i < y.length; i++) {
    let [eq, err] = EqualDepth(x[i], y[i], depth - 1);
    if (err != null) {
      return [false, err];
    }
    if (!eq) {
      switch (op) {
        case Token.EQL:
          return [false, null];
        case Token.NEQ:
          return [true, null];
        default:
          return CompareDepth(op, x[i], y[i], depth - 1);
      }
    }
  }

  return [threeway(op, x.length - y.length), null];
}

export class StringDict {
  val: Map<string, Value>;

  constructor(vals?: any) {
    if (vals) {
      this.val = new Map(vals);
    } else {
      this.val = new Map();
    }
  }

  set(k: string, v: Value) {
    this.val.set(k, v);
  }
  get(k: string): Value | undefined {
    return this.val.get(k);
  }

  keys(): string[] {
    return [...this.val.keys()];
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
    return 'a string dict';
  }

  freeze(): void {
    for (const value of this.val.values()) {
      value.Freeze();
    }
  }

  has(key: string): boolean {
    return this.val.has(key);
  }
}
