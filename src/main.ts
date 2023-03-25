// import { ExecFile } from "./starlark/eval";
// import { Thread } from "./starlark/eval";
import { parse } from './starlark-parser';
import { ExecFile } from './starlark/eval';
import { Thread } from './starlark/eval';
import { StringDict } from './starlark/value';

// console.log(
//   parse("/home/kumiko/starlark-ts/tests/testcases/parse/action.star", null, 0)
// );
// console.log("parse finished");

const filename = '/home/kumiko/starlark-ts/demo.star';
let thread = new Thread();
thread.Name = 'exec' + filename;
ExecFile(thread, filename, null, new StringDict());
