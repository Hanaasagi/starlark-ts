import { Value } from './interface';

// NoneType is the type of None.  Its only legal value is None.
// (We represent it as a number, not struct{}, so that None may be constant.)
export class NoneType implements Value {
  constructor() { }

  String(): string {
    return 'None';
  }
  Type(): string {
    return 'NoneType';
  }

  Freeze() { }

  Truth(): boolean {
    return false;
  }

  Hash(): [number, Error | null] {
    return [0, null];
  }
}

export const None = new NoneType();
