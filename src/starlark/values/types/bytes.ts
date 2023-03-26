import { Token } from '../../../starlark-parser';
import { signum } from '../../../utils';
import { builtinAttr } from './common';
import { builtinAttrNames } from './common';
import { Comparable, Indexable, Sliceable, Value } from './interface';
import { String } from './string';

// Bytes is the type of a Starlark binary string.
//
// A Bytes encapsulates an immutable sequence of bytes.
// It is comparable, indexable, and sliceable, but not directly iterable;
// use bytes.elems() for an iterable view.
// BUG: type bytes = string
export class Bytes implements Value, Comparable, Sliceable, Indexable {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  String(): string {
    return this.value;
    // return syntax.Quote(this.value, true);
  }

  Type(): string {
    return 'bytes';
  }

  Freeze(): void {} // immutable

  Truth(): boolean {
    return this.value.length > 0;
  }

  Hash(): [number, Error | null] {
    return [new String(this.value).Hash()[0], null];
  }

  len(): number {
    return this.value.length;
  }

  index(i: number): Value {
    return new Bytes(this.value[i]);
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
      return new Bytes(this.value.slice(start, end));
    }

    const sign = signum(step);
    let str = '';
    for (let i = start; signum(end - i) === sign; i += step) {
      str += this.value[i];
    }
    return new Bytes(str);
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error] {
    return [false, new Error()];
    // TODO:
    // const valueY = y as Bytes;
    // const result = threeway(op, stringCompare(this.value, valueY.value));
    // return [result, null];
  }
}
