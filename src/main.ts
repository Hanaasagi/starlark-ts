// import { ExecFile } from "./starlark/eval";
// import { Thread } from "./starlark/eval";
import { parse } from "./syntax/parse.js";

console.log(parse("/home/kumiko/starlark-ts/demo.star", null, 0));
console.log("parse finished");
