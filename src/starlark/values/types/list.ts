import { Token } from '../../../starlark-parser';
import { signum } from '../../../utils';
import { EqualDepth } from './common';
import { toString } from './common';
import { builtinAttr } from './common';
import { builtinAttrNames } from './common';
import { threeway } from './common';
import { CompareDepth } from './common';
import { sliceCompare } from './common';
import { Value } from './interface';
import { Iterator } from './interface';

// A *List represents a Starlark list value.
export class List implements Value {
  elems: Value[];
  frozen: boolean;
  itercount: number; // number of active iterators (ignored if frozen)

  constructor(elems: Value[]) {
    this.elems = elems;
    this.frozen = false;
    this.itercount = 0;
  }

  public Freeze(): void {
    if (!this.frozen) {
      this.frozen = true;
      for (const elem of this.elems) {
        elem.Freeze();
      }
    }
  }

  // checkMutable reports an error if the list should not be mutated.
  // verb+" list" should describe the operation.
  public checkMutable(verb: string): Error | null {
    if (this.frozen) {
      return new Error(`cannot ${verb} frozen list`);
    }
    if (this.itercount > 0) {
      return new Error(`cannot ${verb} list during iteration`);
    }
    return null;
  }

  public String(): string {
    return toString(this);
  }
  public Type(): string {
    return 'list';
  }
  public Hash(): [number, Error | null] {
    return [0, new Error('unhashable type: list')];
  }
  public Truth(): boolean {
    return this.Len() > 0;
  }
  public Len(): number {
    return this.elems.length;
  }
  public Index(i: number): Value {
    return this.elems[i];
  }

  Slice(start: number, end: number, step: number): Value {
    if (step == 1) {
      const elems = this.elems.slice(start, end);
      return new List(elems);
    }

    const sign = signum(step);
    let list = new Array();
    for (let i = start; signum(end - i) == sign; i += step) {
      list.push(this.elems[i]);
    }
    return new List(list);
  }

  Attr(name: string): [Value, Error | null] {
    var stdlib = require('../../stdlib');
    return builtinAttr(this, name, stdlib.listMethods);
  }

  AttrNames(): string[] {
    var stdlib = require('../../stdlib');
    return builtinAttrNames(stdlib.listMethods);
  }

  Iterate(): Iterator {
    if (!this.frozen) {
      this.itercount++;
    }
    return new ListIterator(this);
  }

  CompareSameType(
    op: Token,
    y_: Value,
    depth: number
  ): [boolean, Error | null] {
    const y = y_ as List;
    // It's tempting to check x == y as an optimization here,
    // but wrong because a list containing NaN is not equal to itself.
    return sliceCompare(op, this.elems, y.elems, depth);
  }

  public SetIndex(i: number, v: Value): Error | null {
    const err = this.checkMutable('assign to element of');
    if (err !== null) {
      return err;
    }
    this.elems[i] = v;
    return null;
  }

  public Append(v: Value): Error | null {
    const err = this.checkMutable('append to');
    if (err !== null) {
      return err;
    }
    this.elems.push(v);
    return null;
  }

  public Clear(): Error | null {
    const err = this.checkMutable('clear');
    if (err !== null) {
      return err;
    }
    for (let i = 0; i < this.elems.length; i++) {
      // FIXME:
      // this.elems[i] = null; // aid GC
    }
    this.elems = [];
    return null;
  }
}

class ListIterator implements Iterator {
  private l: List;
  private i: number;

  constructor(l: List) {
    this.l = l;
    this.i = 0;
  }

  public next(): Value | null {
    if (this.i < this.l.Len()) {
      let p = this.l.elems[this.i];
      this.i++;
      return p;
    }
    return null;
  }

  public done() {
    if (!this.l.frozen) {
      this.l.itercount--;
    }
  }
}
