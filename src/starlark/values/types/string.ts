import { Token } from '../../../starlark-parser';
import { signum } from '../../../utils';
import { builtinAttr } from './common';
import { builtinAttrNames } from './common';
import { Comparable } from './interface';
import { Value } from './interface';
import { HasAttrs } from './interface';
import { Iterator } from './interface';

// String is the type of a Starlark text string.
//
// A String encapsulates an an immutable sequence of bytes,
// but strings are not directly iterable. Instead, iterate
// over the result of calling one of these four methods:
// codepoints, codepoint_ords, elems, elem_ords.
//
// Strings typically contain text; use Bytes for binary strings.
// The Starlark spec defines text strings as sequences of UTF-k
// codes that encode Unicode code points. In this Go implementation,
// k=8, whereas in a Java implementation, k=16. For portability,
// operations on strings should aim to avoid assumptions about
// the value of k.
//
// Warning: the contract of the Value interface's String method is that
// it returns the value printed in Starlark notation,
// so s.String() or fmt.Sprintf("%s", s) returns a quoted string.
// Use string(s) or s.GoString() or fmt.Sprintf("%#v", s) to obtain the raw contents
// of a Starlark string as a Go string.
export class String implements Comparable, HasAttrs {
  val: string;

  constructor(val: string) {
    this.val = val;
  }

  String(): string {
    // BUG:
    // func (s String) String() string        { return syntax.Quote(string(s), false) }
    return this.val;
  }

  asJSValue(): string {
    return this.val;
  }

  Type(): string {
    return 'string';
  }

  Freeze() {}

  Truth(): boolean {
    return this.val.length > 0;
  }

  Hash(): [number, Error | null] {
    // BUG:
    return [0, null];
  }

  Len(): number {
    return this.val.length;
  }

  Index(i: number): String {
    return new String(this.val[i]);
  }

  Slice(start: number, end: number, step: number): String {
    if (step == 1) {
      return new String(this.val.slice(start, end));
    }

    let sign = signum(step);

    let buf = new Array();

    for (let i = start; signum(end - i) == sign; i += step) {
      buf.push(this.val[i]);
    }

    return new String(buf.join(''));
  }

  attr(name: string): [Value, Error | null] {
    var stdlib = require('../../stdlib');
    return builtinAttr(this, name, stdlib.stringMethods);
  }

  attrNames(): string[] {
    var stdlib = require('../../stdlib');
    return builtinAttrNames(stdlib.stringMethods);
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error] {
    // BUG:
    return [false, new Error()];
  }
}

export function AsString(x: Value): [string, boolean] {
  if (x instanceof String) {
    return [x.val, true];
  }
  return [x.String(), true];
}

// A stringElems is an iterable whose iterator yields a sequence of
// elements (bytes), either numerically or as successive substrings.
// It is an indexable sequence.
class StringElems {
  s: string;
  ords: boolean;

  constructor(s: string, ords: boolean) {
    this.s = s;
    this.ords = ords;
  }

  toString(): string {
    if (this.ords) {
      return this.s + '.elem_ords()';
    } else {
      return this.s + '.elems()';
    }
  }

  Type(): string {
    return 'string.elems';
  }

  Freeze(): void {} // immutable

  Truth(): boolean {
    return true;
  }

  Hash(): [number, Error] {
    return [0, new Error(`unhashable: ${this.Type()}`)];
  }

  Iterate(): Iterator {
    return new StringElemsIterator(this, 0);
  }

  Len(): number {
    return this.s.length;
  }

  Index(i: number): Value {
    // BUG:
    // if (this.ords) {
    //   return MakeInt(this.s.charCodeAt(i));
    // } else {
    //   return this.s[i];
    // }

    return new String(this.s[i]);
  }
}

class StringElemsIterator implements Iterator {
  si: StringElems;
  i: number;

  constructor(si: StringElems, i: number) {
    this.si = si;
    this.i = i;
  }

  next(p: Value): boolean {
    if (this.i == this.si.Len()) {
      return false;
    }
    // Bug
    p = this.si.Index(this.i);
    this.i++;
    return true;
  }

  done(): void {}
}

// A stringCodepoints is an iterable whose iterator yields a sequence of
// Unicode code points, either numerically or as successive substrings.
// It is not indexable.
class stringCodepoints {
  s: String;
  ords: boolean;

  constructor(s: String, ords: boolean) {
    this.s = s;
    this.ords = ords;
  }

  // TODO:
  // Symbol.iterator: Iterator<Value> {
  //   return new stringCodepointsIterator(this, 0);
  // }

  toString(): string {
    if (this.ords) {
      return `${this.s.toString()}.codepoint_ords()`;
    } else {
      return `${this.s.toString()}.codepoints()`;
    }
  }

  Type(): string {
    return 'string.codepoints';
  }

  Freeze(): void {} // immutable

  Truth(): boolean {
    return true;
  }

  Hash(): [number, Error] {
    return [0, new Error(`unhashable: ${this.Type()}`)];
  }
}

// TODO: stringCodepointsIterator

class stringCodepointsIterator implements Iterator {
  si: stringCodepoints;
  i: number;

  constructor(si: stringCodepoints, i: number) {
    this.si = si;
    this.i = i;
  }

  next(p: Value): boolean {
    // BUG:
    return false;
    // let s = this.si.s.slice(this.i);
    // if (s === "") {
    //   return { done: true, value: undefined };
    // }
    // let [r, sz] = utf8DecodeRuneInString(s);
    // if (!this.si.ords) {
    //   if (r === utf8.RuneError) {
    //     p = new String(r);
    //   } else {
    //     p = new String(s.slice(0, sz));
    //   }
    // } else {
    //   p = new Int(r);
    // }
    // this.i += sz;
    // return { done: false, value: p };
  }

  done(): void {}
}
