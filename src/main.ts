// import { ExecFile } from "./starlark/eval";
// import { Thread } from "./starlark/eval";
import { Command } from 'commander';

import { REPL } from './repl';
// import { parse } from './starlark-parser';
import { ExecFile } from './starlark-runtime/eval';
import { Thread } from './starlark-runtime/eval';
import { StringDict } from './starlark-runtime/values';

const version = '0.1.0';

function main(): void {
  // console.log(
  //   parse("/home/kumiko/starlark-ts/tests/testcases/parse/action.star", null, 0)
  // );
  // console.log("parse finished");
  const program = new Command();

  program
    .name('starlark')
    .description('An implementation of the Starlark language in TypeScript.')
    .version(version);

  program.arguments('[filename]').description('program read from script file');
  program.parse();
  const filename = program.args[0];

  let thread = new Thread();
  let globals = new StringDict();
  if (filename) {
    thread.Name = 'exec' + filename;
    ExecFile(thread, filename, null, globals);
  } else {
    thread.Name = 'REPL';
    console.log(`Welcome to Starlark v${version}.`);
    console.log('Press CTRL-C to exit.');
    REPL(thread, globals);
  }
}

main();
