import * as compile from '../../../starlark-compiler/compile';
import { StringDict } from './common';
import { Value } from './interface';

// A module is the dynamic counterpart to a Program.
// All functions in the same program share a module.
export class Module {
  program: compile.Program;
  predeclared: StringDict;
  globals: Value[];
  constants: Value[];

  constructor(
    program: compile.Program,
    predeclared: StringDict,
    globals: Value[],
    constants: Value[]
  ) {
    this.program = program;
    this.predeclared = predeclared;
    this.globals = globals;
    this.constants = constants;
  }

  // makeGlobalDict returns a new, unfrozen StringDict containing all global
  // variables so far defined in the module.
  makeGlobalDict(): StringDict {
    const r: StringDict = new StringDict();
    for (let i = 0; i < this.program.globals.length; i++) {
      const id = this.program.globals[i];
      if (this.globals[i] !== null && this.globals[i] !== undefined) {
        // BUG:
        r.set(id.name, this.globals[i]);
      }
    }
    return r;
  }
}
