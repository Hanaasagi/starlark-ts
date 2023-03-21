import { Value } from "./value";
import { StringDict } from "./eval";
import { Thread } from "./eval";
import { Tuple } from "./value";
import { Bool } from "./value";
import { Builtin, Iterator } from "./value";
import { hashString } from "./hashtable";
import { toString } from "./value";
import { AsInt32, MakeInt, Int } from "./int";
import * as syntax from "../syntax/index";

export var Universe: StringDict;
// TODO: Universe and StringDict

export var bytesMethods: Map<string, Builtin> = new Map([
  // ["elems", new Builtin("elems", bytes_elems)]
]);

export var dictMethods: Map<string, Builtin> = new Map([
  // ["clear", new Builtin("clear", dict_clear)],
  // ["get", new Builtin("get", dict_get)],
  // ["items", new Builtin("items", dict_items)],
  // ["keys", new Builtin("keys", dict_keys)],
  // ["pop", new Builtin("pop", dict_pop)],
  // ["popitem", new Builtin("popitem", dict_popitem)],
  // ["setdefault", new Builtin("setdefault", dict_setdefault)],
  // ["update", new Builtin("update", dict_update)],
  // ["values", new Builtin("values", dict_values)],
]);

export var listMethods: Map<string, Builtin> = new Map([
  // ["append", new Builtin("append", list_append)],
  // ["clear", new Builtin("clear", list_clear)],
  // ["extend", new Builtin("extend", list_extend)],
  // ["index", new Builtin("index", list_index)],
  // ["insert", new Builtin("insert", list_insert)],
  // ["pop", new Builtin("pop", list_pop)],
  // ["remove", new Builtin("remove", list_remove)],
]);

export var stringMethods: Map<string, Builtin> = new Map([
  // ["capitalize", new Builtin("capitalize", string_capitalize)],
  // ["codepoint_ords", new Builtin("codepoint_ords", string_iterable)],
  // ["codepoints", new Builtin("codepoints", string_iterable)],
  // ["count", new Builtin("count", string_count)],
  // ["elem_ords", new Builtin("elem_ords", string_iterable)],
  // ["elems", new Builtin("elems", string_iterable)],
  // ["endswith", new Builtin("endswith", string_startswith)],
  // ["find", new Builtin("find", string_find)],
  // ["format", new Builtin("format", string_format)],
  // ["index", new Builtin("index", string_index)],
  // ["isalnum", new Builtin("isalnum", string_isalnum)],
  // ["isalpha", new Builtin("isalpha", string_isalpha)],
  // ["isdigit", new Builtin("isdigit", string_isdigit)],
  // ["islower", new Builtin("islower", string_islower)],
  // ["isspace", new Builtin("isspace", string_isspace)],
  // ["istitle", new Builtin("istitle", string_istitle)],
  // ["isupper", new Builtin("isupper", string_isupper)],
  // ["join", new Builtin("join", string_join)],
  // ["lower", new Builtin("lower", string_lower)],
  // ["lstrip", new Builtin("lstrip", string_strip)],
  // ["partition", new Builtin("partition", string_partition)],
  // ["removeprefix", new Builtin("removeprefix", string_removefix)],
  // ["removesuffix", new Builtin("removesuffix", string_removefix)],
  // ["replace", new Builtin("replace", string_replace)],
  // ["rfind", new Builtin("rfind", string_rfind)],
  // ["rindex", new Builtin("rindex", string_rindex)],
  // ["rpartition", new Builtin("rpartition", string_partition)],
  // ["rsplit", new Builtin("rsplit", string_split)],
  // ["rstrip", new Builtin("rstrip", string_strip)],
  // ["split", new Builtin("split", string_split)],
  // ["splitlines", new Builtin("splitlines", string_splitlines)],
  // ["startswith", new Builtin("startswith", string_startswith)],
  // ["strip", new Builtin("strip", string_strip)],
  // ["title", new Builtin("title", string_title)],
  // ["upper", new Builtin("upper", string_upper)],
]);

export var setMethods: Map<string, Builtin> = new Map([
  // ["union", new Builtin("union", set_union)]
]);

export function builtinAttr(
  recv: Value,
  name: string,
  methods: Map<string, Builtin>
): [Value, Error | null] {
  const b = methods.get(name);
  if (!b) {
    //@ts-ignore
    return [b, null]; // no such method
  }
  return [b.BindReceiver(recv), null];
}

export function builtinAttrNames(methods: Map<string, Builtin>): string[] {
  const names: string[] = Object.keys(methods);
  names.sort();
  return names;
}

// ---- built-in functions ----

// https://github.com/google/starlark-go/blob/master/doc/spec.md#print
function print(
  thread: Thread,
  b: Builtin,
  args: Tuple,
  kwargs: Tuple[]
): [Value, Error | null] {
  console.log("print is not impl");
  return [b, null];
  // let sep = " ";
  // const err = UnpackArgs("print", null, kwargs, "sep?", sep);
  // if (err) {
  //   return [null, err];
  // }
  // const buf = new StringBuilder();
  // for (let i = 0; i < args.length; i++) {
  //   const v = args[i];
  //   if (i > 0) {
  //     buf.WriteString(sep);
  //   }
  //   const s = AsString(v);
  //   if (s !== undefined) {
  //     buf.WriteString(s);
  //   } else if (v instanceof Bytes) {
  //     buf.WriteString(String(v));
  //   } else {
  //     writeValue(buf, v, null);
  //   }
  // }

  // const s = buf.String();
  // if (thread.Print !== null) {
  //   thread.Print(thread, s);
  // } else {
  //   console.log(s);
  // }
  // return [None, null];
}

// A rangeValue is a comparable, immutable, indexable sequence of integers
// defined by the three parameters to a range(...) call.
// Invariant: step != 0.
class RangeValue implements Value {
  public start: number;
  public stop: number;
  public step: number;
  public len: number;

  constructor(start: number, stop: number, step: number, len: number) {
    this.start = start;
    this.stop = stop;
    this.step = step;
    this.len = len;
  }

  Len(): number {
    return this.len;
  }

  Index(i: number): Value {
    return MakeInt(this.start + i * this.step);
  }

  Iterate(): Iterator {
    return new RangeIterator(this);
  }

  Slice(start: number, end: number, step: number): RangeValue {
    const newStart = this.start + this.step * start;
    const newStop = this.start + this.step * end;
    const newStep = this.step * step;
    return new RangeValue(
      newStart,
      newStop,
      newStep,
      rangeLen(newStart, newStop, newStep)
    );
  }

  Freeze(): void {} // immutable

  String(): string {
    if (this.step !== 1) {
      return `${this.start}, ${this.stop}, ${this.step}`;
    } else if (this.start !== 0) {
      return `${this.start}, ${this.stop}`;
    } else {
      return `${this.stop}`;
    }
  }

  Type(): string {
    return "range";
  }

  Truth(): Bool {
    return new Bool(this.len > 0);
  }

  Hash(): [number, Error | null] {
    return [0, new Error("unhashable: range")];
  }

  CompareSameType(
    op: syntax.Token,
    y: Value,
    depth: number
  ): [boolean, Error | null] {
    switch (op) {
      case syntax.Token.EQL:
        return [rangeEqual(this, y as unknown as RangeValue), null];
      case syntax.Token.NEQ:
        return [!rangeEqual(this, y as unknown as RangeValue), null];
      default:
        return [
          false,
          new Error(
            `${this.Type()} ${op} ${(y as RangeValue).Type()} not implemented)`
          ),
        ];
    }
  }

  public contains(x: Int): boolean {
    const x32 = AsInt32(x);
    if (x32 === undefined) {
      return false; // out of range
    }
    const delta = x32 - this.start;
    const [quo, rem] = [Math.floor(delta / this.step), delta % this.step];
    return rem === 0 && 0 <= quo && quo < this.len;
  }
}

function rangeEqual(x: RangeValue, y: RangeValue): boolean {
  // Two ranges compare equal if they denote the same sequence.
  if (x.len !== y.len) {
    return false; // sequences differ in length
  }
  if (x.len === 0) {
    return true; // both sequences are empty
  }
  if (x.start !== y.start) {
    return false; // first element differs
  }
  return x.len === 1 || x.step === y.step;
}

// rangeLen calculates the length of a range with the provided start, stop, and step.
// caller must ensure that step is non-zero.
function rangeLen(start: number, stop: number, step: number): number {
  if (step > 0) {
    if (stop > start) {
      return Math.floor((stop - 1 - start) / step) + 1;
    }
  } else if (step < 0) {
    if (start > stop) {
      return Math.floor((start - 1 - stop) / -step) + 1;
    }
  } else {
    throw new Error("rangeLen: zero step");
  }
  return 0;
}

class RangeIterator {
  r: RangeValue;
  i: number;

  constructor(r: RangeValue) {
    this.r = r;
    this.i = 0;
  }

  next(p: Value): boolean {
    if (this.i < this.r.len) {
      // BUG:
      // * p = this.r.index(this.i);
      this.i++;
      return true;
    }
    return false;
  }

  done(): void {}
}
