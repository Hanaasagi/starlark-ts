// import { ExecFile } from "./starlark/eval";
// import { Thread } from "./starlark/eval";
import { parse } from "./syntax/parse";
import { StringDict } from "./starlark/value";
import { ExecFile } from "./starlark/eval";
import { Thread } from "./starlark/eval";

// console.log(
//   parse("/home/kumiko/starlark-ts/tests/testcases/parse/action.star", null, 0)
// );
// console.log("parse finished");

const filename = "/home/kumiko/starlark-ts/demo.star";
let thread = new Thread();
thread.Name = "exec" + filename;
ExecFile(thread, filename, null, new StringDict());
