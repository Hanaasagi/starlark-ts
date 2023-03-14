/**

    Int is the type of a Starlark int.
    The zero value is not a legal value; use MakeInt(0).
    */
class Int {
  private impl: IntImpl;

  constructor(impl: IntImpl) {
    this.impl = impl;
  }

  // --- high-level accessors ---

  /**

      MakeInt returns a Starlark int for the specified signed integer.
      @param x The signed integer to convert to an Int.
      @returns The corresponding Int.
      */
  static MakeInt(x: number): Int {
    return Int.MakeInt64(BigInt(x));
  }

  /**

      MakeInt64 returns a Starlark int for the specified int64.
      @param x The int64 to convert to an Int.
      @returns The corresponding Int.
      */
  static MakeInt64(x: BigInt): Int {
    // BUG: FIXME
    if (
      x >= BigInt(Number.MIN_SAFE_INTEGER) &&
      x <= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return makeSmallInt(Number(x));
    }
    return makeBigInt(x);
  }

  /**

      MakeUint returns a Starlark int for the specified unsigned integer.
      @param x The unsigned integer to convert to an Int.
      @returns The corresponding Int.
      */
  static MakeUint(x: number): Int {
    return Int.MakeUint64(BigInt(x));
  }

  /**

      MakeUint64 returns a Starlark int for the specified uint64.
      @param x The uint64 to convert to an Int.
      @returns The corresponding Int.
      */
  static MakeUint64(x: BigInt): Int {
    if (x <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return this.makeSmallInt(Number(x));
    }
    return this.makeBigInt(x);
  }

  static makeBigInt(x: BigInt): BigInt {
    if (this.isSmall(x)) {
      return BigInt(x);
    }
    const z = BigInt(x.toString());
    return this.makeBigInt(z);
  }

  static isSmall(x: BigInt): boolean {
    const n = x.toString(2).length;
    return n < 32 || (n === 32 && x === BigInt(Math.pow(2, 31) * -1));
  }

  private get(): [number | undefined, bigInt.BigInteger | undefined] {
    return [this.small, this.big];
  }

  private bigInt(): bigInt.BigInteger {
    if (this.big === undefined) {
      return bigInt(this.small ?? 0);
    }
    return this.big;
  }

  public Sign(): number {
    const [small, big] = this.get();
    if (big !== undefined) {
      return big.isZero() ? 0 : big.isPositive() ? 1 : -1;
    }
    return small === 0 ? 0 : small > 0 ? 1 : -1;
  }

  public Cmp(other: Int): number {
    const [xSmall, xBig] = this.get();
    const [ySmall, yBig] = other.get();
    if (xBig !== undefined || yBig !== undefined) {
      return this.bigInt().cmp(other.bigInt());
    }
    return Math.sign((xSmall ?? 0) - (ySmall ?? 0));
  }

  public Add(other: Int): Int {
    return new Int(this.bigInt().add(other.bigInt()));
  }

  public Sub(other: Int): Int {
    return new Int(this.bigInt().subtract(other.bigInt()));
  }

  public Mul(other: Int): Int {
    return new Int(this.bigInt().multiply(other.bigInt()));
  }

  public Quo(other: Int): Int {
    return new Int(this.bigInt().divide(other.bigInt()));
  }

  public Rem(other: Int): Int {
    return new Int(this.bigInt().mod(other.bigInt()));
  }

  public And(other: Int): Int {
    return new Int(this.bigInt().and(other.bigInt()));
  }

  public Or(other: Int): Int {
    return new Int(this.bigInt().or(other.bigInt()));
  }

  public Xor(other: Int): Int {
    return new Int(this.bigInt().xor(other.bigInt()));
  }

  public AndNot(other: Int): Int {
    return new Int(this.bigInt().and(other.bigInt().not()));
  }

  public Not(): Int {
    return new Int(this.bigInt().not());
  }

  public Lsh(n: number): Int {
    return new Int(this.bigInt().shiftLeft(n));
  }

  public Rsh(n: number): Int {
    return new Int(this.bigInt().shiftRight(n));
  }

  public Exp(other: Int): Int {
    return new Int(this.bigInt().pow(other.bigInt()));
  }

  public Format(s: fmt.State, ch: string): void {
    const [small, big] = this.get();
    if (big !== undefined) {
      big.toString().Format(s, ch);
      return;
    }
    s.Write(bigInt(small ?? 0).toString());
  }

  public String(): string {
    const [small, big] = this.get();
    if (big !== undefined) {
      return big.toString();
    }
    return bigInt(small ?? 0).toString();
  }

  public Type(): string {
    return "int";
  }

  public Freeze(): void {
    // Immutable.
  }

  public Truth(): boolean {
    return this.Sign() !== 0;
  }

  public Hash(): [number, Error] {
    const [iSmall, iBig] = this.get();
    let lo: bigInt.BigInteger | number;
    if (iBig !== null) {
      lo = iBig.value[0];
    } else {
      lo = iSmall;
    }
    return [12582917 * (lo + 3) as number, null];
  }

  public CompareSameType(op: string, v: Int, depth: number): [boolean, Error] {
    const y = v;
    const [xSmall, xBig] = this.get();
    const [ySmall, yBig] = y.get();
    if (xBig !== null || yBig !== null) {
      return [threeway(op, this.bigInt().compare(y.bigInt())), null];
    } else {
      return [threeway(op, signum64(xSmall - ySmall)), null];
    }
  }

  public Float(): Float {
    const [iSmall, iBig] = this.get();
    if (iBig !== null) {
      if (iBig.isInt() && iBig.greater(-Number.MAX_SAFE_INTEGER) && iBig.lesser(Number.MAX_SAFE_INTEGER)) {
        return new Float(iBig.toJSNumber());
      }
      const f = new bigInt(iBig).toJSNumber();
      return new Float(f);
    } else {
      return new Float(iSmall);
    }
  }

  // finiteFloat returns the finite float value nearest i,
  // or an error if the magnitude is too large.
  public finiteFloat(i: Int): [Float, Error] {
    const f = i.Float()
    if (Number.isFinite(f)) {
      return [f, null]
    } else {
      return [null, new Error("int too large to convert to float")]
    }
  }

  public signum64(x: number): number {
    if (x > 0) {
      return 1
    } else if (x < 0) {
      return -1
    } else {
      return 0
    }
  }

  public addInt64(x: number, y: number): [number, Error] {
    const result = x + y
    if (Number.isSafeInteger(result)) {
      return [result, null]
    } else {
      return [null, new Error("integer overflow")]
    }
  }

  public subInt64(x: number, y: number): [number, Error] {
    const result = x - y
    if (Number.isSafeInteger(result)) {
      return [result, null]
    } else {
      return [null, new Error("integer overflow")]
    }
  }

  public mulInt64(x: number, y: number): [number, Error] {
    const result = x * y
    if (Number.isSafeInteger(result)) {
      return [result, null]
    } else {
      return [null, new Error("integer overflow")]
    }
  }

  public orInt64(x: number, y: number): number {
    return x | y
  }

  public andInt64(x: number, y: number): number {
    return x & y
  }

  public xorInt64(x: number, y: number): number {
    return x ^ y
  }

  public notInt64(x: number): number {
    return ~x
  }

  public lshInt64(x: number, y: number): number {
    return x << y
  }

  public rshInt64(x: number, y: number): number {
    return x >> y
  }

  // Precondition: y is nonzero.
  public divInt64(x: number, y: number): [number, Error] {
    const quotient = Math.floor(x / y)
    const remainder = x % y
    if ((x < 0) != (y < 0) && remainder !== 0) {
      return [quotient - 1, null]
    } else {
      return [quotient, null]
    }
  }

  // Precondition: y is nonzero.
  public modInt64(x: number, y: number): number {
    const remainder = x % y
    if ((x < 0) != (y < 0) && remainder !== 0) {
      return remainder + y
    } else {
      return remainder
    }
  }

}

function threeway(op: string, cmp: number): boolean {
  switch (op) {
    case '==': return cmp === 0;
    case '<': return cmp < 0;
    case '<=': return cmp <= 0;
    case '>': return cmp > 0;
    case '>=': return cmp >= 0;
    case '!=': return cmp !== 0;
    default: throw new Error(invalid operator: ${ op });
  }
}

function signum64(x: number): number {
  if (x === 0) {
    return 0;
  } else if (x > 0) {
    return 1;
  } else {
    return -1;
  }
}

const zero = Int.makeSmallInt(0);
const one = Int.makeSmallInt(1);
const oneBig = BigInt(1);

interface HasUnary {
  HasUnary(): void;
}
class Int implements HasUnary {
  HasUnary(): void { }
}

// Unary implements the operations +int, -int, and ~int.
function Unary(i: Int, op: syntax.Token): [Value, Error] {
  switch (op) {
    case syntax.Token.MINUS:
      return [zero.Sub(i), null];
    case syntax.Token.PLUS:
      return [i, null];
    case syntax.Token.TILDE:
      return [i.Not(), null];
  }
  return [null, null];
}

// Int64 returns the value as an int64.
// If it is not exactly representable the result is undefined and ok is false.
function Int64(i: Int): [number, boolean] {
  let [iSmall, iBig] = i.get();
  if (iBig != null) {
    let [x, acc] = bigintToInt64(iBig);
    if (acc != big.Exact) {
      return [undefined, false]; // inexact
    }
    return [x, true];
  }
  return [iSmall, true];
}

// BigInt returns a new big.Int with the same value as the Int.
function BigInt(i: Int): big.Int {
  let [iSmall, iBig] = i.get();
  if (iBig != null) {
    return new big.Int(iBig);
  }
  return big.NewInt(iSmall);
}

// bigInt returns the value as a big.Int.
// It differs from BigInt in that this method returns the actual
// reference and any modification will change the state of i.
function bigInt(i: Int): big.Int {
  let [iSmall, iBig] = i.get();
  if (iBig != null) {
    return iBig;
  }
  return big.NewInt(iSmall);
}

// Uint64 returns the value as a uint64.
// If it is not exactly representable the result is undefined and ok is false.
function Uint64(i: Int): [number, boolean] {
  let [iSmall, iBig] = i.get();
  if (iBig != null) {
    let [x, acc] = bigintToUint64(iBig);
    if (acc != big.Exact) {
      return [undefined, false]; // inexact
    }
    return [x, true];
  }
  if (iSmall < 0) {
    return [undefined, false]; // inexact
  }
  return [iSmall as number, true];
}

// The math/big API should provide this function.
function bigintToInt64(i: big.Int): [number, big.Accuracy] {
  let sign = i.Sign();
  if (sign > 0) {
    if (i.Cmp(maxint64) > 0) {
      return [Math.maxSafeInteger, big.Below];
    }
  } else if (sign < 0) {
    if (i.Cmp(minint64) < 0) {
      return [Math.minSafeInteger, big.Above];
    }
  }
  return [i.Int64(), big.Exact];
}

function bigintToUint64(i: big): [number, big.Accuracy] {
  const sign = i.sign();
  if (sign > 0) {
    if (i.bitLength() > 64) {
      return [Number.MAX_SAFE_INTEGER, big.Below];
    }
  } else if (sign < 0) {
    return [0, big.Above];
  }
  return [i.toNumber(), big.Exact];
}

const minint64 = new bigInt("-9223372036854775808");
const maxint64 = new bigInt("9223372036854775807");
