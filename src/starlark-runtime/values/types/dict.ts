import { Token } from '../../../starlark-parser';
import { Hashtable } from '../hashtable';
import { builtinAttrNames } from './common';
import { builtinAttr } from './common';
import { EqualDepth } from './common';
import { Value } from './interface';
import { Tuple } from './tuple';

// A *Dict represents a Starlark dictionary.
// The zero value of Dict is a valid empty dictionary.
// If you know the exact final number of entries,
// it is more efficient to call NewDict.
export class Dict implements Value {
  ht: Hashtable;

  // NewDict returns a new empty dictionary.
  constructor(size?: number) {
    let ht = new Hashtable(size);
    this.ht = ht;
  }

  // clear removes all elements from the dictionary.
  public clear(): void {
    this.ht.clear();
  }

  // delete removes an element from the dictionary.
  public delete(k: Value): [Value | null, boolean, Error | null] {
    return this.ht.delete(k);
  }

  // get retrieves the value associated with a key.
  public get(k: Value): [Value | null, boolean, Error | null] {
    return this.ht.lookup(k);
  }

  // items returns a list of key-value pairs.
  public items(): Tuple[] {
    return this.ht.items();
  }

  // keys returns a list of all keys.
  public keys(): Value[] {
    return this.ht.keys();
  }

  // len returns the number of elements in the dictionary.
  public len(): number {
    return this.ht.len;
  }

  // set sets the value associated with a key.
  public setKey(k: Value, v: Value): Error | null {
    return this.ht.insert(k, v);
  }

  // String returns the string representation of the dictionary.
  public String(): string {
    return this.ht.toString();
  }

  // type returns the string "dict".
  public Type(): string {
    return 'dict';
  }

  // freeze makes the dictionary immutable.
  public Freeze(): void {
    this.ht.freeze();
  }

  // truth returns true if the dictionary is not empty.
  public Truth(): boolean {
    return this.len() > 0;
  }

  // hash returns an error because dictionaries are not hashable.
  public Hash(): [number, Error | null] {
    return [0, new Error('unhashable type: dict')];
  }

  // union returns a new dictionary that is the union of two dictionaries.
  public union(other: Dict): Dict {
    const result = new Dict(this.len());
    result.ht.addAll(this.ht); // can't fail
    result.ht.addAll(other.ht); // can't fail
    return result;
  }

  Attr(name: string): [Value, Error | null] {
    var stdlib = require('../../stdlib');
    return builtinAttr(this, name, stdlib.dictMethods);
  }

  AttrNames(): string[] {
    var stdlib = require('../../stdlib');
    return builtinAttrNames(stdlib.dictMethods);
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error | null] {
    const yDict = y as Dict;
    switch (op) {
      case Token.EQL:
        const [ok, err] = dictsEqual(this, yDict, depth);
        return [ok, err];
      case Token.NEQ:
        const [notEqual, error] = dictsEqual(this, yDict, depth);
        return [!notEqual, error];
      default:
        return [
          false,
          new Error(`${this.Type} ${op} ${y.Type} not implemented`),
        ];
    }
  }
}

// Given two dictionaries, return whether or not they are equal,
// up to a certain depth.
function dictsEqual(x: Dict, y: Dict, depth: number): [boolean, Error | null] {
  if (x.len() != y.len()) {
    return [false, null];
  }

  let e = x.ht.head;
  while (e != null) {
    let key = e.key;
    let xval = e.value;

    let [yval, found, _] = y.get(key);
    if (!found) {
      return [false, null];
    }

    let [eq, err] = EqualDepth(xval, yval!, depth - 1);
    if (err != null) {
      return [false, err];
    }
    if (!eq) {
      return [false, null];
    }
    e = e.next;
  }
  return [true, null];
}
