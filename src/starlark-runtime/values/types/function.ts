import * as compile from '../../../starlark-compiler/compile';
import { Position } from '../../../starlark-parser';
import { mandatory } from '../../interpreter';
import { hashString } from '../hashtable';
import { StringDict } from './common';
import { toString } from './common';
import { Value } from './interface';
import { Module } from './module';
import { Tuple } from './tuple';

// A Function is a function defined by a Starlark def statement or lambda expression.
// The initialization behavior of a Starlark module is also represented by a Function.
export class Function implements Value {
  funcode: compile.Funcode;
  module: Module;
  defaults: Tuple;
  freevars: Tuple;

  constructor(
    funcode: compile.Funcode,
    module: Module,
    defaults: Tuple,
    freevars: Tuple
  ) {
    this.funcode = funcode;
    this.module = module;
    this.defaults = defaults;
    this.freevars = freevars;
  }

  Name(): string {
    return this.funcode.name;
  }

  Doc(): string {
    return this.funcode.doc;
  }

  Hash(): [number, Error | null] {
    return [hashString(this.funcode.name), null];
  }

  Freeze(): void {
    this.defaults.Freeze();
    this.freevars.Freeze();
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return 'function';
  }

  Truth(): boolean {
    return true;
  }

  // Globals returns a new, unfrozen StringDict containing all global
  // variables so far defined in the function's module.
  Globals(): StringDict {
    return this.module.makeGlobalDict();
  }

  Position(): Position {
    return this.funcode.pos;
  }

  NumParams(): number {
    return this.funcode.numParams;
  }

  NumKwonlyParams(): number {
    return this.funcode.numKwonlyParams;
  }

  // Param returns the name and position of the ith parameter,
  // where 0 <= i < NumParams().
  // The *args and **kwargs parameters are at the end
  // even if there were optional parameters after *args.
  Param(i: number): [string, Position] {
    if (i >= this.NumParams()) {
      throw new Error(i.toString());
    }
    const id = this.funcode.locals[i];
    return [id.name, id.pos];
  }

  // ParamDefault returns the default value of the specified parameter
  // (0 <= i < NumParams()), or null if the parameter is not optional.
  ParamDefault(i: number): Value | null {
    if (i < 0 || i >= this.NumParams()) {
      throw new Error(i.toString());
    }

    // this.defaults omits all required params up to the first optional param. It
    // also does not include *args or **kwargs at the end.
    let firstOptIdx: number = this.NumParams() - this.defaults.Len();
    if (this.HasVarargs()) {
      firstOptIdx--;
    }
    if (this.HasKwargs()) {
      firstOptIdx--;
    }
    if (i < firstOptIdx || i >= firstOptIdx + this.defaults.Len()) {
      return null;
    }

    const dflt: Value = this.defaults.index(i - firstOptIdx);
    if (dflt instanceof mandatory) {
      return null;
    }
    return dflt;
  }

  HasVarargs(): boolean {
    return this.funcode.hasVarargs;
  }

  HasKwargs(): boolean {
    return this.funcode.hasKwargs;
  }
}
