import { Token } from '../../../starlark-parser';
import { AsInt32, Int, MakeInt } from './int';
import { Value } from './interface';
import { Iterator } from './interface';

// A rangeValue is a comparable, immutable, indexable sequence of integers
// defined by the three parameters to a range(...) call.
// Invariant: step != 0.
export class RangeValue implements Value {
  public start: number;
  public stop: number;
  public step: number;
  public len: number;

  constructor(start: number, stop: number, step: number, len: number) {
    this.start = start;
    this.stop = stop;
    this.step = step;
    this.len = len;
  }

  Len(): number {
    return this.len;
  }

  Index(i: number): Value {
    return MakeInt(this.start + i * this.step);
  }

  Iterate(): Iterator {
    return new RangeIterator(this);
  }

  Slice(start: number, end: number, step: number): RangeValue {
    const newStart = this.start + this.step * start;
    const newStop = this.start + this.step * end;
    const newStep = this.step * step;
    return new RangeValue(
      newStart,
      newStop,
      newStep,
      rangeLen(newStart, newStop, newStep)
    );
  }

  Freeze(): void { } // immutable

  String(): string {
    if (this.step !== 1) {
      return `${this.start}, ${this.stop}, ${this.step}`;
    } else if (this.start !== 0) {
      return `${this.start}, ${this.stop}`;
    } else {
      return `${this.stop}`;
    }
  }

  Type(): string {
    return 'range';
  }

  Truth(): boolean {
    return this.len > 0;
  }

  Hash(): [number, Error | null] {
    return [0, new Error('unhashable: range')];
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error | null] {
    switch (op) {
      case Token.EQL:
        return [rangeEqual(this, y as unknown as RangeValue), null];
      case Token.NEQ:
        return [!rangeEqual(this, y as unknown as RangeValue), null];
      default:
        return [
          false,
          new Error(
            `${this.Type()} ${op} ${(y as RangeValue).Type()} not implemented)`
          ),
        ];
    }
  }

  public contains(x: Int): boolean {
    const x32 = AsInt32(x);
    if (x32 === undefined) {
      return false; // out of range
    }
    const delta = x32 - this.start;
    const [quo, rem] = [Math.floor(delta / this.step), delta % this.step];
    return rem === 0 && 0 <= quo && quo < this.len;
  }
}

function rangeEqual(x: RangeValue, y: RangeValue): boolean {
  // Two ranges compare equal if they denote the same sequence.
  if (x.len !== y.len) {
    return false; // sequences differ in length
  }
  if (x.len === 0) {
    return true; // both sequences are empty
  }
  if (x.start !== y.start) {
    return false; // first element differs
  }
  return x.len === 1 || x.step === y.step;
}

// rangeLen calculates the length of a range with the provided start, stop, and step.
// caller must ensure that step is non-zero.
export function rangeLen(start: number, stop: number, step: number): number {
  if (step > 0) {
    if (stop > start) {
      return Math.floor((stop - 1 - start) / step) + 1;
    }
  } else if (step < 0) {
    if (start > stop) {
      return Math.floor((start - 1 - stop) / -step) + 1;
    }
  } else {
    throw new Error('rangeLen: zero step');
  }
  return 0;
}

class RangeIterator {
  r: RangeValue;
  i: number;

  constructor(r: RangeValue) {
    this.r = r;
    this.i = 0;
  }

  next(p: Value): boolean {
    if (this.i < this.r.len) {
      // BUG:
      // * p = this.r.index(this.i);
      this.i++;
      return true;
    }
    return false;
  }

  done(): void { }
}
