export function b2i(b: boolean): number {
  return b ? 1 : 0;
}

export function signum64(x: bigint): number {
  return Number(BigInt(x >> 63n) | (BigInt(-x) >> 63n));
}

export function signum(x: number): number {
  return signum64(BigInt(x));
}
