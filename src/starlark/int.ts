import { Token } from '../starlark-parser';
import { Value } from './value';
import { Bool } from './value';

class IntImpl {
  // We use only the signed 32-bit range of small to ensure
  // that small+small and small*small do not overflow.
  private small_: BigInt; // minint32 <= small <= maxint32
  private big_: BigInt | null; // big != null <=> value is not representable as int32

  constructor(small_: BigInt, big_: BigInt | null) {
    this.small_ = small_;
    this.big_ = big_;
  }

  // --- low-level accessors ---

  // get returns the small and big components of the Int.
  // small is defined only if big is null.
  // small is sign-extended to 64 bits for ease of subsequent arithmetic.
  public get(): [BigInt, BigInt | null] {
    return [this.small_, this.big_];
  }
}

// Precondition: math.MinInt32 <= x && x <= math.MaxInt32
function makeSmallInt(x: BigInt): Int {
  return new Int(new IntImpl(x, null));
}

// Precondition: x cannot be represented as int32.
function makeBigInt(x: BigInt): Int {
  return new Int(new IntImpl(BigInt(0), x));
}

const MinInt32 = -2147483648;
const MaxInt32 = 2147483647;
const minint64 = BigInt('-9223372036854775808');
const maxint64 = BigInt('9223372036854775807');

// Int is the type of a Starlark int.
// The zero value is not a legal value; use MakeInt(0).
export class Int implements Value {
  impl: IntImpl;

  constructor(impl: IntImpl) {
    this.impl = impl;
  }

  public get(): [BigInt, BigInt | null] {
    return this.impl.get();
  }

  Int64(): [BigInt, boolean] {
    let [iSmall, iBig] = this.get();
    if (iBig != null) {
      let [x, acc] = this.BigIntToInt64(iBig);
      if (acc != 0) {
        return [BigInt(0), false]; // inexact
      }
      return [x, true];
    }
    return [iSmall, true];
  }

  // BigInt returns a new big.Int with the same value as the Int.
  BigInt(): BigInt {
    let [iSmall, iBig] = this.get();
    if (iBig != null) {
      return iBig;
    }
    return iSmall;
  }

  // BigInt returns the value as a big.Int.
  // It differs from BigInt in that this method returns the actual
  // reference and any modification will change the state of i.
  bigInt(i: Int): BigInt {
    let [iSmall, iBig] = i.get();
    if (iBig != null) {
      return iBig;
    }
    return iSmall;
  }

  // Uint64 returns the value as a uint64.
  // If it is not exactly representable the result is undefined and ok is false.
  Uint64(i: Int): [BigInt, boolean] {
    let [iSmall, iBig] = i.get();
    if (iBig != null) {
      let [x, acc] = this.BigIntToUint64(iBig);
      if (acc != 0) {
        return [BigInt(0), false]; // inexact
      }
      return [x, true];
    }
    if (iSmall < BigInt(0)) {
      return [BigInt(0), false]; // inexact
    }
    return [iSmall, true];
  }

  // The math/big API should provide this function.
  BigIntToInt64(i: BigInt): [BigInt, number] {
    throw Error('no');
    return [BigInt(0), 0];
    // let sign = i.Sign();
    // if (sign > 0) {
    //   if (i.Cmp(maxint64) > 0) {
    //     return [Math.maxSafeInteger, big.Below];
    //   }
    // } else if (sign < 0) {
    //   if (i.Cmp(minint64) < 0) {
    //     return [Math.minSafeInteger, big.Above];
    //   }
    // }
    // return [i.Int64(), big.Exact];
  }

  BigIntToUint64(i: BigInt): [BigInt, number] {
    throw Error('no');
    // const sign = i.sign();
    // if (sign > 0) {
    //   if (i.bitLength() > 64) {
    //     return [Number.MAX_SAFE_INTEGER, big.Below];
    //   }
    // } else if (sign < 0) {
    //   return [0, big.Above];
    // }
    // return [i.toNumber(), big.Exact];
  }

  // TODO:
  public Format(s: any, ch: string): void {
    // const [small, big] = this.get();
    // if (big !== undefined) {
    //   big.toString().Format(s, ch);
    //   return;
    // }
    // s.Write(BigInt(small ?? 0).toString());
  }

  public String(): string {
    const [small, big] = this.get();
    if (big !== null) {
      return big.toString();
    }
    return small.toString();
  }

  public Type(): string {
    return 'int';
  }

  public Freeze(): void {
    // Immutable.
  }

  public Truth(): Bool {
    return new Bool(this.Sign() !== 0);
  }

  public Hash(): [number, Error | null] {
    // const [iSmall, iBig] = this.get();
    // let lo: BigInt.BigInteger | number;
    // if (iBig !== null) {
    //   lo = iBig.value[0];
    // } else {
    //   lo = iSmall;
    // }
    // return [12582917 * (lo + 3) as number, null];
    return [0, null];
  }
  public CompareSameType(
    op: string,
    v: Int,
    depth: number
  ): [boolean, Error | null] {
    return [true, null];
    // const y = v;
    // const [xSmall, xBig] = this.get();
    // const [ySmall, yBig] = y.get();
    // if (xBig !== null || yBig !== null) {
    //   return [threeway(op, this.BigInt().compare(y.bigInt())), null];
    // } else {
    //   return [threeway(op, signum64(xSmall - ySmall)), null];
    // }
  }

  public Float(): number {
    return 0;
    // const [iSmall, iBig] = this.get();
    // if (iBig !== null) {
    //   if (iBig.isInt() && iBig.greater(-Number.MAX_SAFE_INTEGER) && iBig.lesser(Number.MAX_SAFE_INTEGER)) {
    //     return new Float(iBig.toJSNumber());
    //   }
    //   const f = new BigInt(iBig).toJSNumber();
    //   return new Float(f);
    // } else {
    //   return new Float(iSmall);
    // }
  }
  // finiteFloat returns the finite float value nearest i,
  // or an error if the magnitude is too large.
  public finiteFloat(): [number, Error | null] {
    return [0, null];
    // const f = i.Float()
    // if (Number.isFinite(f)) {
    //   return [f, null]
    // } else {
    //   return [null, new Error("int too large to convert to float")]
    // }
  }
  public Sign(): number {
    const [small, big] = this.get();
    if (big !== null) {
      return big == BigInt(0) ? 0 : big > BigInt(0) ? 1 : -1;
    }
    return small === BigInt(0) ? 0 : small > BigInt(0) ? 1 : -1;
  }

  public Add(other: Int): Int {
    return one;
    // return new Int(this.BigInt().add(other.bigInt()));
  }

  public Sub(other: Int): Int {
    return one;
    // return new Int(this.BigInt().subtract(other.bigInt()));
  }

  public Mul(other: Int): Int {
    return one;
    // return new Int(this.BigInt().multiply(other.bigInt()));
  }

  public Or(other: Int): Int {
    return one;
    // return new Int(this.BigInt().divide(other.bigInt()));
  }

  public And(other: Int): Int {
    return one;
    // return new Int(this.BigInt().and(other.bigInt()));
  }

  public Xor(other: Int): Int {
    return one;
    // return new Int(this.BigInt().xor(other.bigInt()));
  }

  public Not(): Int {
    return one;
    // return new Int(this.BigInt().not());
  }

  public Lsh(n: Int): Int {
    return one;
    // return new Int(this.BigInt().shiftLeft(n));
  }

  public Rsh(n: Int): Int {
    return one;
    // return new Int(this.BigInt().shiftRight(n));
  }

  public Div(n: Int): Int {
    return one;
    // return new Int(this.BigInt().shiftRight(n));
  }

  public Mod(n: Int): Int {
    return one;
    // return new Int(this.BigInt().shiftRight(n));
  }

  public Cmp(other: Int): number {
    return 1;
    // const [xSmall, xBig] = this.get();
    // const [ySmall, yBig] = other.get();
    // if (xBig !== null || yBig !== null) {
    //   return this.BigInt().cmp(other.bigInt());
    // }
    // return Math.sign((xSmall ?? 0) - (ySmall ?? 0));
  }
}

// --- high-level accessors ---

// MakeInt returns a Starlark int for the specified signed integer.
export function MakeInt(x: number): Int {
  return MakeInt64(BigInt(x));
}

// MakeInt64 returns a Starlark int for the specified int64.
export function MakeInt64(x: BigInt): Int {
  if (x >= BigInt(MinInt32) && x <= BigInt(MaxInt32)) {
    return makeSmallInt(x);
  }
  return makeBigInt(x);
}

// MakeUint returns a Starlark int for the specified unsigned integer.
function MakeUint(x: number): Int {
  return MakeUint64(BigInt(x));
}

// MakeUint64 returns a Starlark int for the specified uint64.
function MakeUint64(x: BigInt): Int {
  if (x <= BigInt(MaxInt32)) {
    return makeSmallInt(x);
  }
  return makeBigInt(x);
}

export function MakeBigInt(x: BigInt): Int {
  if (isSmall(x)) {
    return makeSmallInt(x);
  }
  // BUG:
  return makeBigInt(x);
}

function isSmall(x: BigInt): boolean {
  // BUG:
  const n = x.toString(2).length;
  return n < 32 || (n === 32 && x === BigInt(Math.pow(2, 31) * -1));
}

export const zero = makeSmallInt(BigInt(0));
export const one = makeSmallInt(BigInt(1));
export const oneBig = BigInt(1);

// Unary implements the operations +int, -int, and ~int.
function Unary(i: Int, op: Token): [Value | null, Error | null] {
  switch (op) {
    case Token.MINUS:
      return [zero.Sub(i), null];
    case Token.PLUS:
      return [i, null];
    case Token.TILDE:
      return [i.Not(), null];
  }
  return [null, null];
}

export function AsInt32(n: Value): number {
  return 0;
}

//   private BigInt(): bigInt.BigInteger {
//   if (this.big === undefined) {
//     return BigInt(this.small ?? 0);
//   }
//   return this.big;
// }

//   public signum64(x: number): number {
//   if (x > 0) {
//     return 1
//   } else if (x < 0) {
//     return -1
//   } else {
//     return 0
//   }
// }

//   public addInt64(x: number, y: number): [number, Error] {
//   const result = x + y
//   if (Number.isSafeInteger(result)) {
//     return [result, null]
//   } else {
//     return [null, new Error("integer overflow")]
//   }
// }

//   public subInt64(x: number, y: number): [number, Error] {
//   const result = x - y
//   if (Number.isSafeInteger(result)) {
//     return [result, null]
//   } else {
//     return [null, new Error("integer overflow")]
//   }
// }

//   public mulInt64(x: number, y: number): [number, Error] {
//   const result = x * y
//   if (Number.isSafeInteger(result)) {
//     return [result, null]
//   } else {
//     return [null, new Error("integer overflow")]
//   }
// }

//   public orInt64(x: number, y: number): number {
//   return x | y
// }

//   public andInt64(x: number, y: number): number {
//   return x & y
// }

//   public xorInt64(x: number, y: number): number {
//   return x ^ y
// }

//   public notInt64(x: number): number {
//   return ~x
// }

//   public lshInt64(x: number, y: number): number {
//   return x << y
// }

//   public rshInt64(x: number, y: number): number {
//   return x >> y
// }

//   // Precondition: y is nonzero.
//   public divInt64(x: number, y: number): [number, Error] {
//   const quotient = Math.floor(x / y)
//   const remainder = x % y
//   if ((x < 0) != (y < 0) && remainder !== 0) {
//     return [quotient - 1, null]
//   } else {
//     return [quotient, null]
//   }
// }

//   // Precondition: y is nonzero.
//   public modInt64(x: number, y: number): number {
//   const remainder = x % y
//   if ((x < 0) != (y < 0) && remainder !== 0) {
//     return remainder + y
//   } else {
//     return remainder
//   }
// }

// // }

// function threeway(op: string, cmp: number): boolean {
//   switch (op) {
//     case '==': return cmp === 0;
//     case '<': return cmp < 0;
//     case '<=': return cmp <= 0;
//     case '>': return cmp > 0;
//     case '>=': return cmp >= 0;
//     case '!=': return cmp !== 0;
//     default: throw new Error(invalid operator: ${ op });
//   }
// }

// function signum64(x: number): number {
//   if (x === 0) {
//     return 0;
//   } else if (x > 0) {
//     return 1;
//   } else {
//     return -1;
//   }
// }

// const zero = Int.makeSmallInt(0);
// const one = Int.makeSmallInt(1);
// const oneBig = BigInt(1);

// interface HasUnary {
//   HasUnary(): void;
// }
// class Int implements HasUnary {
//   HasUnary(): void { }
// }

// Int64 returns the value as an int64.
// If it is not exactly representable the result is undefined and ok is false.
