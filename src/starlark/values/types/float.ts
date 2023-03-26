import { Token } from '../../../starlark-parser';
import { Int } from '../../int';
import { Comparable } from './interface';
import { Value } from './interface';

export class Float implements Comparable {
  val: number;
  constructor(val: number) {
    this.val = val;
  }

  String(): string {
    return this.val.toString();
  }

  Type(): string {
    return 'float';
  }

  Freeze() {}

  Truth(): boolean {
    return this.val == 0;
  }

  Hash(): [number, Error | null] {
    // BUG:
    return [0, null];
  }

  // TODO: format

  floor(): Float {
    return new Float(Math.floor(this.val));
  }

  // isFinite reports whether f represents a finite rational value.
  // It is equivalent to !math.IsNan(f) && !math.IsInf(f, 0).
  isFinite(): boolean {
    return isFinite(this.val);
  }

  // TODO:
  // rational()

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error] {
    // BUG:
    return [false, new Error()];
  }

  asJSValue(): number {
    return this.val;
  }
}

// BUG:
// floatCmp performs a three-valued comparison on floats,
// which are totally ordered with NaN > +Inf.
function floatCmp(x: Float, y: Float): number {
  if (x.val > y.val) {
    return 1;
  } else if (x.val < y.val) {
    return -1;
  } else {
    return 0;
  }

  // At least one operand is NaN.
  if (x.val == x.val) {
    return -1; // y is NaN
  } else if (y.val == y.val) {
    return +1; // x is NaN
  }
  return 0; // both NaN
}

// AsFloat returns the float64 value closest to x.
// The f result is undefined if x is not a float or Int.
// The result may be infinite if x is a very large Int.
export function AsFloat(x: Value): [number, boolean] {
  if (x instanceof Float) {
    return [x.val, true];
  }
  if (x instanceof Int) {
    // BUG:
    return [0, true];
    // return [x.val, true];
  }

  return [0, false];
}
