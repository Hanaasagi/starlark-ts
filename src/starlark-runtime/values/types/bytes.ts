import { Token } from '../../../starlark-parser';
import { signum } from '../../../utils';
import { builtinAttr } from './common';
import { builtinAttrNames } from './common';
import { threeway } from './common';
import { Comparable, Indexable, Sliceable, Value } from './interface';
import { String } from './string';

// Bytes is the type of a Starlark binary string.
//
// A Bytes encapsulates an immutable sequence of bytes.
// It is comparable, indexable, and sliceable, but not directly iterable;
// use bytes.elems() for an iterable view.
export class Bytes implements Value, Comparable, Sliceable, Indexable {
  // BUG: ???
  private readonly val: string;

  constructor(value: string) {
    this.val = value;
  }

  String(): string {
    return this.val;
    // return syntax.Quote(this.value, true);
  }

  Type(): string {
    return 'bytes';
  }

  Freeze(): void {} // immutable

  Truth(): boolean {
    return this.val.length > 0;
  }

  Hash(): [number, Error | null] {
    return [new String(this.val).Hash()[0], null];
  }

  len(): number {
    return this.val.length;
  }

  index(i: number): Value {
    return new Bytes(this.val[i]);
  }

  Attr(name: string): [Value, Error | null] {
    var stdlib = require('../../stdlib');
    return builtinAttr(this, name, stdlib.bytesMethods);
  }

  AttrNames(): string[] {
    var stdlib = require('../../stdlib');
    return builtinAttrNames(stdlib.bytesMethods);
  }

  slice(start: number, end: number, step: number): Value {
    if (step === 1) {
      return new Bytes(this.val.slice(start, end));
    }

    const sign = signum(step);
    let str = '';
    for (let i = start; signum(end - i) === sign; i += step) {
      str += this.val[i];
    }
    return new Bytes(str);
  }

  asJSValue(): string {
    return this.val;
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error | null] {
    let y_ = y as Bytes;
    return [threeway(op, this.val > y_.val ? 1 : 0), null];
  }
}
