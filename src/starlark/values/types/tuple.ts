import { Token } from '../../../starlark-parser';
import { signum } from '../../../utils';
import { toString } from './common';
import { sliceCompare } from './common';
import { Value } from './interface';
import { Iterator } from './interface';

// A Tuple represents a Starlark tuple value.
export class Tuple implements Value {
  elems: Value[];

  constructor(elems: Value[]) {
    this.elems = elems;
  }

  Len(): number {
    return this.elems.length;
  }

  index(i: number): Value {
    return this.elems[i];
  }

  slice(start: number, end: number, step: number = 1): Value {
    if (step === 1) {
      return new Tuple(this.elems.slice(start, end));
    }

    const sign = signum(step);
    let tuple: Value[] = new Array();
    for (let i = start; signum(end - i) === sign; i += step) {
      tuple.push(this.elems[i]);
    }
    return new Tuple(tuple);
  }

  Freeze() {
    for (var elem of this.elems) {
      elem.Freeze();
    }
  }

  Iterate(): Iterator {
    return new TupleIterator(this);
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return 'tuple';
  }

  Truth(): boolean {
    return this.elems.length > 0;
  }

  compareSameType(op: Token, y: Tuple, depth: number): [boolean, Error | null] {
    return sliceCompare(op, this.elems, y.elems, depth);
  }

  Hash(): [number, Error | null] {
    let x: number = 0x345678;
    let mult: number = 1000003;
    for (const elem of this.elems) {
      let [y, _] = elem.Hash();
      x = x ^ (y * mult);
      mult += 82520 + this.elems.length + this.elems.length;
    }
    return [x, null];
  }
}

export class TupleIterator implements Iterator {
  private elems: Tuple;

  constructor(elems: Tuple) {
    this.elems = elems;
  }

  next(): Value | null {
    if (this.elems.Len() > 0) {
      let p = this.elems.index(0);
      // TODO: shitcode
      this.elems = new Tuple(this.elems.elems.slice(1));
      return p;
    }
    return null;
  }

  done(): void { }
}
