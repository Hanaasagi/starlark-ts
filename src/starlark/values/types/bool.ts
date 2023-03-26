import { Token } from '../../../starlark-parser';
import { b2i } from '../../../utils';
import { Value } from './interface';
import { Comparable } from './interface';

// Bool is the type of a Starlark bool.
export class Bool implements Comparable {
  val: boolean;

  constructor(val: boolean) {
    this.val = val;
  }

  String(): string {
    if (this.val) {
      return 'True';
    }
    return 'False';
  }

  Type(): string {
    return 'bool';
  }

  Freeze() { }

  Truth(): boolean {
    return this.val;
  }

  Hash(): [number, Error | null] {
    let hsh = b2i(this.val);
    return [hsh, null];
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error] {
    // BUG:
    return [false, new Error()];
  }

  asJSValue(): boolean {
    return this.val;
  }
}

export const False: Bool = new Bool(false);
export const True: Bool = new Bool(true);
