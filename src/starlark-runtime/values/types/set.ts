import { Token } from '../../../starlark-parser';
import { Hashtable } from '../hashtable';
import { toString } from './common';
import { builtinAttrNames } from './common';
import { builtinAttr } from './common';
import { Iterator } from './interface';
import { Value } from './interface';
import { None } from './none';

// A Set represents a TypeScript set value.
// The zero value of Set is a valid empty set.
export class Set implements Value {
  ht: Hashtable; // values are all None

  // NewSet returns a dictionary with initial space for
  // at least size insertions before rehashing.
  constructor(size: number) {
    this.ht = new Hashtable(size);
  }

  delete(k: Value): [boolean, Error | null] {
    const [_, found, err] = this.ht.delete(k);
    return [found, err];
  }

  clear(): Error | null {
    return this.ht.clear();
  }

  has(k: Value): [boolean, Error | null] {
    const [_, found, err] = this.ht.lookup(k);
    return [found, err];
  }

  insert(k: Value): Error | null {
    return this.ht.insert(k, None);
  }

  Len(): number {
    return this.ht.len;
  }

  Iterate(): Iterator {
    return this.ht.iterate();
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return 'set';
  }

  elems(): Value[] {
    return this.ht.keys();
  }

  Freeze(): void {
    this.ht.freeze();
  }

  Hash(): [number, Error | null] {
    return [0, new Error('unhashable type: set')];
  }

  Truth(): boolean {
    return this.Len() > 0;
  }

  Attr(name: string): [Value, Error | null] {
    var stdlib = require('../../stdlib');
    return builtinAttr(this, name, stdlib.setMethods);
  }

  AttrNames(): string[] {
    var stdlib = require('../../stdlib');
    return builtinAttrNames(stdlib.setMethods);
  }

  compareSameType(op: Token, y: Set, depth: number): [boolean, Error | null] {
    switch (op) {
      case Token.EQL:
        let [ok, err] = setsEqual(this, y, depth);
        return [ok, err];
      case Token.NEQ:
        let [ok2, err2] = setsEqual(this, y, depth);
        return [!ok2, err2];
      default:
        return [
          false,
          new Error(`${this.Type()} ${op} ${y.Type()} not implemented`),
        ];
    }
  }

  union(iter: Iterator): Set {
    const set = new Set(8);
    // BUG:
    // for (const elem of this.elems()) {
    //   set.insert(elem);
    // }
    // let x: Value;
    // while (iter.next(x)) {
    //   if (set.insert(x) !== null) {
    //     return null;
    //   }
    // }
    return set;
  }
}

// BUG: change return type
function setsEqual(x: Set, y: Set, depth: number): [boolean, Error | null] {
  if (x.Len() !== y.Len()) {
    return [false, null];
  }
  for (const elem of x.elems()) {
    const [found, _] = y.has(elem);
    if (!found) {
      return [false, null];
    }
  }
  return [true, null];
}
