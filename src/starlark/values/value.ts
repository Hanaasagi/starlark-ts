// // import syntax = require("../syntax");
// // BUG:
// // import * as syntax from "../syntax/syntax";
// import * as compile from '../starlark-compiler/compile';
// import { Position } from '../starlark-parser';
// import { Token } from '../starlark-parser';
// import { signum } from './eval';
// // ------------------------------------------------------
// // ------------------------Library
// // ------------------------------------------------------
// import { Thread } from './eval';
// import { Hashtable, hashString } from './hashtable';
// // import { hashString } from "./hashtable";
// // import { toString } from "./value";
// import { AsInt32, Int, MakeInt } from './int';
// import { mandatory } from './interpreter';

// // TODO: NoSuchAttrError

// // import * as syntax from "../syntax/syntax";

// export function builtinAttr(
//   recv: Value,
//   name: string,
//   methods: Map<string, Builtin>
// ): [Value, Error | null] {
//   const b = methods.get(name);
//   if (!b) {
//     //@ts-ignore
//     return [b, null]; // no such method
//   }
//   return [b.BindReceiver(recv), null];
// }

// export function builtinAttrNames(methods: Map<string, Builtin>): string[] {
//   const names: string[] = Object.keys(methods);
//   names.sort();
//   return names;
// }

// export class StringDict {
//   val: Map<string, Value>;

//   constructor(vals?: any) {
//     if (vals) {
//       this.val = new Map(vals);
//     } else {
//       this.val = new Map();
//     }
//   }

//   set(k: string, v: Value) {
//     this.val.set(k, v);
//   }
//   get(k: string): Value | undefined {
//     return this.val.get(k);
//   }

//   keys(): string[] {
//     return [...this.val.keys()];
//   }

//   toString(): string {
//     // TODO:
//     // const buf = new StringBuilder();
//     // buf.writeChar('{');
//     // let sep = '';
//     // for (const name of this.keys()) {
//     //   buf.writeString(sep);
//     //   buf.writeString(name);
//     //   buf.writeString(': ');
//     //   writeValue(buf, this[name], null);
//     //   sep = ', ';
//     // }
//     // buf.writeChar('}');
//     // return buf.toString();
//     return 'a string dict';
//   }

//   freeze(): void {
//     for (const value of this.val.values()) {
//       value.Freeze();
//     }
//   }

//   has(key: string): boolean {
//     return this.val.has(key);
//   }
// }

// export { Universe } from './stdlib';
// // export var Universe = new StringDict([
// //   ["print", new Builtin("print", print, null)],
// // ]);
