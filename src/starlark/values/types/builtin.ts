import { Thread } from '../../eval';
import { hashString } from '../../hashtable';
import { toString } from './common';
import { Value } from './interface';
import { Tuple } from './tuple';

// A Builtin is a function implemented in TypeScript.
export class Builtin implements Value {
  name: string;
  fn: (
    thread: Thread,
    fn: Builtin,
    args: Tuple,
    kwargs: Tuple[]
  ) => Value | Error;
  recv: Value | null;

  constructor(
    name: string,
    fn: (
      thread: Thread,
      fn: Builtin,
      args: Tuple,
      kwargs: Tuple[]
    ) => Value | Error,
    recv: Value | null = null
  ) {
    this.name = name;
    this.fn = fn;
    this.recv = recv;
  }

  Name(): string {
    return this.name;
  }

  Freeze(): void {
    if (this.recv !== null) {
      this.recv.Freeze();
    }
  }

  Hash(): [number, Error | null] {
    let h = hashString(this.name);
    if (this.recv !== null) {
      h ^= 5521;
    }
    return [h, null];
  }

  Receiver(): Value | null {
    return this.recv;
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return 'builtin_function_or_method';
  }

  CallInternal(thread: Thread, args: Tuple, kwargs: Tuple[]): Value | Error {
    return this.fn(thread, this, args, kwargs);
  }

  Truth(): boolean {
    return true;
  }
  // BindReceiver returns a new Builtin value representing a method
  // closure, that is, a built-in function bound to a receiver value.
  //
  // In the example below, the value of f is the string.index
  // built-in method bound to the receiver value "abc":
  //
  // f = "abc".index; f("a"); f("b")
  //
  // In the interface case, the receiver is bound only during the call,
  // but this still results in the creation of a temporary method closure:
  //
  // "abc".index("a")
  //
  BindReceiver(recv: Value): Builtin {
    return new Builtin(this.name, this.fn, this.recv);
  }
}
