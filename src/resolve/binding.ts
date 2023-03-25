import * as syntax from '../starlark-parser';
import { Position } from '../starlark-parser';

// The Scope of Binding indicates what kind of scope it has.
export enum Scope {
  Undefined,
  Local,
  Cell,
  Free,
  Global,
  Predeclared,
  Universal,
}

export const scopeNames = [
  'undefined',
  'local',
  'cell',
  'free',
  'global',
  'predeclared',
  'universal',
];

export namespace Scope {
  export function toString(val: Scope): string {
    return scopeNames[val];
  }
}

// This file defines resolver data types saved in the syntax tree.
// We cannot guarantee API stability for these types
// as they are closely tied to the implementation.

// A Binding contains resolver information about an identifer.
// The resolver populates the Binding field of each syntax.Identifier.
// The Binding ties together all identifiers that denote the same variable.
export class Binding {
  scope: Scope;
  // Index records the index into the enclosing
  // - {DefStmt,File}.Locals, if Scope==Local
  // - DefStmt.FreeVars,      if Scope==Free
  // - File.Globals,          if Scope==Global.
  // It is zero if Scope is Predeclared, Universal, or Undefined.

  index: number;
  first: syntax.Ident | null;
  constructor(scope: Scope, index: number, first: syntax.Ident | null) {
    this.scope = scope;
    this.index = index;
    this.first = first;
  }
}

// A Module contains resolver information about a file.
// The resolver populates the Module field of each syntax.File.
export class Module {
  locals: Binding[];
  globals: Binding[];
  constructor(locals: Binding[], globals: Binding[]) {
    this.locals = locals;
    this.globals = globals;
  }
}

// A Function contains resolver information about a named or anonymous function.
// The resolver populates the Function field of each syntax.DefStmt and syntax.LambdaExpr.
export class Function {
  pos: Position;
  name: string;
  params: syntax.Expr[];
  body: syntax.Stmt[];
  hasVarargs: boolean;
  hasKwargs: boolean;
  numKwonlyParams: number;
  locals: Binding[];
  freeVars: Binding[];
  constructor(
    pos: Position,
    name: string,
    params: syntax.Expr[],
    body: syntax.Stmt[],
    hasVarargs: boolean,
    hasKwargs: boolean,
    numKwonlyParams: number,
    locals: Binding[],
    freeVars: Binding[]
  ) {
    this.pos = pos;
    this.name = name;
    this.params = params;
    this.body = body;
    this.hasVarargs = hasVarargs;
    this.hasKwargs = hasKwargs;
    this.numKwonlyParams = numKwonlyParams;
    this.locals = locals;
    this.freeVars = freeVars;
  }
}
