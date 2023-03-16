import syntax = require("../syntax");

// Value is a value in the Starlark interpreter.
interface Value {
  // String returns the string representation of the value.
  // Starlark string values are quoted as if by Python's repr.
  String(): string;

  // Type returns a short string describing the value's type.
  Type(): string;

  // Freeze causes the value, and all values transitively
  // reachable from it through collections and closures, to be
  // marked as frozen. All subsequent mutations to the data
  // structure through this API will fail dynamically, making the
  // data structure immutable and safe for publishing to other
  // Starlark interpreters running concurrently.
  Freeze(): void;

  // Truth returns the truth value of an object.
  Truth(): boolean;

  // Hash returns a function of x such that Equals(x, y) => Hash(x) == Hash(y).
  // Hash may fail if the value's type is not hashable, or if the value
  // contains a non-hashable value. The hash is used only by dictionaries and
  // is not exposed to the Starlark program.
  Hash(): [number, Error];
}

// A Comparable is a value that defines its own equivalence relation and
// perhaps ordered comparisons.
interface Comparable extends Value {
  // CompareSameType compares one value to another of the same Type().
  // The comparison operation must be one of EQL, NEQ, LT, LE, GT, or GE.
  // CompareSameType returns an error if an ordered comparison was
  // requested for a type that does not support it.
  //
  // Implementations that recursively compare subcomponents of
  // the value should use the CompareDepth function, not Compare, to
  // avoid infinite recursion on cyclic structures.
  //
  // The depth parameter is used to bound comparisons of cyclic
  // data structures. Implementations should decrement depth
  // before calling CompareDepth and should return an error if depth
  // < 1.
  //
  // Client code should not call this method. Instead, use the
  // standalone Compare or Equals functions, which are defined for
  // all pairs of operands.
  CompareSameType(op: syntax.Token, y: Value, depth: number): [boolean, Error];
}

// A Callable value f may be the operand of a function call, f(x).
//
// Clients should use the call() function, never the callInternal() method.
interface Callable extends Value {
  name(): string;
  callInternal(
    thread: Thread,
    args: Tuple,
    kwargs: Tuple[]
  ): Value | Promise<Value>;
}

// Define a new interface callableWithPosition that extends the Callable interface with an additional method, Position(), which returns the syntax.Position of the callable value.
interface callableWithPosition extends Callable {
  Position(): syntax.Position;
}

// String is the type of a Starlark text string.
//
// A String encapsulates an an immutable sequence of bytes,
// but strings are not directly iterable. Instead, iterate
// over the result of calling one of these four methods:
// codepoints, codepoint_ords, elems, elem_ords.
//
// Strings typically contain text; use Bytes for binary strings.
// The Starlark spec defines text strings as sequences of UTF-k
// codes that encode Unicode code points. In this Go implementation,
// k=8, whereas in a Java implementation, k=16. For portability,
// operations on strings should aim to avoid assumptions about
// the value of k.
//
// Warning: the contract of the Value interface's String method is that
// it returns the value printed in Starlark notation,
// so s.String() or fmt.Sprintf("%s", s) returns a quoted string.
// Use string(s) or s.GoString() or fmt.Sprintf("%#v", s) to obtain the raw contents
// of a Starlark string as a Go string.
// TODO: string line: 522

function AsString(x: Value): [string, boolean] {
  if (typeof x === "string") {
    return [x, true];
  }
  return ["", false];
}

// A stringElems is an iterable whose iterator yields a sequence of
// elements (bytes), either numerically or as successive substrings.
// It is an indexable sequence.
class StringElems {
  s: string;
  ords: boolean;

  constructor(s: string, ords: boolean) {
    this.s = s;
    this.ords = ords;
  }

  toString(): string {
    if (this.ords) {
      return this.s + ".elem_ords()";
    } else {
      return this.s + ".elems()";
    }
  }

  Type(): string {
    return "string.elems";
  }

  Freeze(): void { } // immutable

  Truth(): Bool {
    return True;
  }

  Hash(): [number, Error] {
    return [0, new Error(`unhashable: ${this.Type()}`)];
  }

  Iterate(): Iterator {
    return new StringElemsIterator(this, 0);
  }

  Len(): number {
    return this.s.length;
  }

  Index(i: number): Value {
    if (this.ords) {
      return MakeInt(this.s.charCodeAt(i));
    } else {
      return this.s[i];
    }
  }
}

class StringElemsIterator implements Iterator {
  si: StringElems;
  i: number;

  constructor(si: StringElems, i: number) {
    this.si = si;
    this.i = i;
  }

  Next(p: Value): boolean {
    if (this.i == this.si.Len()) {
      return false;
    }
    // Bug
    p = this.si.Index(this.i);
    this.i++;
    return true;
  }

  Done(): void { }
}

// A stringCodepoints is an iterable whose iterator yields a sequence of
// Unicode code points, either numerically or as successive substrings.
// It is not indexable.
class stringCodepoints {
  s: String;
  ords: boolean;

  constructor(s: String, ords: boolean) {
    this.s = s;
    this.ords = ords;
  }

  // TODO:
  // Symbol.iterator: Iterator<Value> {
  //   return new stringCodepointsIterator(this, 0);
  // }

  toString(): string {
    if (this.ords) {
      return `${this.s.toString()}.codepoint_ords()`;
    } else {
      return `${this.s.toString()}.codepoints()`;
    }
  }

  Type(): string {
    return "string.codepoints";
  }

  Freeze(): void { } // immutable

  Truth(): Bool {
    return True;
  }

  Hash(): [number, Error] {
    return [0, new Error(unhashable: ${ this.Type() })];
  }
}

// TODO: stringCodepointsIterator

class stringCodepointsIterator implements Iterator<Value> {
  si: stringCodepoints;
  i: number;

  constructor(si: stringCodepoints, i: number) {
    this.si = si;
    this.i = i;
  }

  next(): IteratorResult<Value> {
    let s = this.si.s.slice(this.i);
    if (s === "") {
      return { done: true, value: undefined };
    }
    let [r, sz] = utf8DecodeRuneInString(s);
    let p: Value;
    if (!this.si.ords) {
      if (r === utf8.RuneError) {
        p = new String(r);
      } else {
        p = new String(s.slice(0, sz));
      }
    } else {
      p = new Int(r);
    }
    this.i += sz;
    return { done: false, value: p };
  }

  Done(): void { }
}

// A Function is a function defined by a Starlark def statement or lambda expression.
// The initialization behavior of a Starlark module is also represented by a Function.
class Function {
  funcode: Funcode;
  module: Module;
  defaults: Tuple;
  freevars: Tuple;

  constructor(
    funcode: compile.Funcode,
    module: module,
    defaults: Tuple,
    freevars: Tuple
  ) {
    this.funcode = funcode;
    this.module = module;
    this.defaults = defaults;
    this.freevars = freevars;
  }

  Name(): string {
    return this.funcode.Name;
  }

  Doc(): string {
    return this.funcode.Doc;
  }

  // BUG:
  Hash(): [number, undefined] {
    return [hashString(this.funcode.Name), undefined];
  }

  Freeze(): void {
    this.defaults.Freeze();
    this.freevars.Freeze();
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return "function";
  }

  Truth(): boolean {
    return true;
  }

  // Globals returns a new, unfrozen StringDict containing all global
  // variables so far defined in the function's module.
  Globals(): StringDict {
    return makeGlobalDict(this.module);
  }

  Position(): syntax.Position {
    return this.funcode.Pos;
  }

  NumParams(): number {
    return this.funcode.NumParams;
  }

  NumKwonlyParams(): number {
    return this.funcode.NumKwonlyParams;
  }

  // Param returns the name and position of the ith parameter,
  // where 0 <= i < NumParams().
  // The *args and **kwargs parameters are at the end
  // even if there were optional parameters after *args.
  public Param(i: number): [string, syntax.Position] {
    if (i >= this.NumParams()) {
      throw new Error(i.toString());
    }
    const id: LocalIdentifier = this.funcode.Locals[i];
    return [id.Name, id.Pos];
  }

  // ParamDefault returns the default value of the specified parameter
  // (0 <= i < NumParams()), or null if the parameter is not optional.
  public ParamDefault(i: number): Value {
    if (i < 0 || i >= this.NumParams()) {
      throw new Error(i.toString());
    }

    // this.defaults omits all required params up to the first optional param. It
    // also does not include *args or **kwargs at the end.
    let firstOptIdx: number = this.NumParams() - this.defaults.length;
    if (this.HasVarargs()) {
      firstOptIdx--;
    }
    if (this.HasKwargs()) {
      firstOptIdx--;
    }
    if (i < firstOptIdx || i >= firstOptIdx + this.defaults.length) {
      return null;
    }

    const dflt: Value = this.defaults[i - firstOptIdx];
    if (dflt instanceof mandatory) {
      return null;
    }
    return dflt;
  }

  public HasVarargs(): boolean {
    return this.funcode.HasVarargs;
  }

  public HasKwargs(): boolean {
    return this.funcode.HasKwargs;
  }
}

// A module is the dynamic counterpart to a Program.
// All functions in the same program share a module.
class Module {
  program: Program;
  predeclared: StringDict;
  globals: Value[];
  constants: Value[];

  // makeGlobalDict returns a new, unfrozen StringDict containing all global
  // variables so far defined in the module.
  makeGlobalDict(): StringDict {
    const r: StringDict = {};
    for (let i = 0; i < this.program.Globals.length; i++) {
      const id = this.program.Globals[i];
      if (this.globals[i] !== null && this.globals[i] !== undefined) {
        r[id.Name] = this.globals[i];
      }
    }
    return r;
  }
}

// A Builtin is a function implemented in TypeScript.
class Builtin implements Value {
  name: string;
  fn: (
    thread: Thread,
    fn: Builtin,
    args: Tuple,
    kwargs: Tuple[]
  ) => [Value, Error];
  recv: Value;

  constructor(
    name: string,
    fn: (
      thread: Thread,
      fn: Builtin,
      args: Tuple,
      kwargs: Tuple[]
    ) => [Value, Error],
    recv: Value
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

  Hash(): [number, Error] {
    let h = hashString(this.name);
    if (this.recv !== null) {
      h ^= 5521;
    }
    return [h, null];
  }

  Receiver(): Value {
    return this.recv;
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return "builtin_function_or_method";
  }

  CallInternal(thread: Thread, args: Tuple, kwargs: Tuple[]): [Value, Error] {
    return this.fn(thread, this, args, kwargs);
  }

  Truth(): Bool {
    return Bool.True;
  }
  // BindReceiver returns a new Builtin value representing a method
  // closure, that is, a built-in function bound to a receiver value.
  //
  // In the example below, the value of f is the string.index
  // built-in method bound to the receiver value "abc":
  //
  // f = "abc".index; f("a"); f("b")
  //
  // In the common case, the receiver is bound only during the call,
  // but this still results in the creation of a temporary method closure:
  //
  // "abc".index("a")
  //
  BindReceiver(recv: Value): Builtin {
    return { name: this.name, fn: this.fn, recv };
  }
}

// NewBuiltin returns a new 'builtin_function_or_method' value with the specified name
// and implementation. It compares unequal with all other values.
// TODO: duplicate
function NewBuiltin(
  name: string,
  fn: (
    thread: Thread,
    fn: Builtin,
    args: Tuple,
    kwargs: Tuple[]
  ) => [Value, Error]
): Builtin {
  return new Builtin(name, fn, null);
}

// A Dict represents a dictionary in TypeScript.
class Dict {
  private ht: HashTable = new HashTable();

  // NewDict returns a new empty dictionary.
  constructor() { }

  // clear removes all elements from the dictionary.
  public clear(): void {
    this.ht.clear();
  }

  // delete removes an element from the dictionary.
  public delete(k: Value): [Value, boolean] {
    return this.ht.delete(k);
  }

  // get retrieves the value associated with a key.
  public get(k: Value): [Value, boolean] {
    return this.ht.lookup(k);
  }

  // items returns a list of key-value pairs.
  public items(): Array<[Value, Value]> {
    return this.ht.items();
  }

  // keys returns a list of all keys.
  public keys(): Array<Value> {
    return this.ht.keys();
  }

  // len returns the number of elements in the dictionary.
  public len(): number {
    return this.ht.length();
  }

  // set sets the value associated with a key.
  public set(k: Value, v: Value): void {
    this.ht.insert(k, v);
  }

  // toString returns the string representation of the dictionary.
  public toString(): string {
    return this.ht.toString();
  }

  // type returns the string "dict".
  public type(): string {
    return "dict";
  }

  // freeze makes the dictionary immutable.
  public freeze(): void {
    this.ht.freeze();
  }

  // truth returns true if the dictionary is not empty.
  public truth(): boolean {
    return this.len() > 0;
  }

  // hash returns an error because dictionaries are not hashable.
  public hash(): [number, string] {
    return [0, "unhashable type: dict"];
  }

  // union returns a new dictionary that is the union of two dictionaries.
  public union(other: Dict): Dict {
    const result = new Dict();
    result.ht.init(this.len()); // a lower bound
    result.ht.addAll(this.ht); // can't fail
    result.ht.addAll(other.ht); // can't fail
    return result;
  }

  Attr(name: string): [Value, Error] {
    return builtinAttr(this, name, dictMethods);
  }

  AttrNames(): string[] {
    return builtinAttrNames(dictMethods);
  }

  CompareSameType(
    op: syntax.Token,
    y: Value,
    depth: number
  ): [boolean, Error | null] {
    const yDict = y as Dict;
    switch (op) {
      case syntax.EQL:
        const [ok, err] = dictsEqual(this, yDict, depth);
        return [ok, err];
      case syntax.NEQ:
        const [notEqual, error] = dictsEqual(this, yDict, depth);
        return [!notEqual, error];
      default:
        return [
          false,
          new Error(`${this.Type} ${op} ${y.Type} not implemented`),
        ];
    }
  }
}

// Given two dictionaries, return whether or not they are equal,
// up to a certain depth.
function dictsEqual(x: Dict, y: Dict, depth: number): [boolean, Error | null] {
  if (Object.keys(x).length !== Object.keys(y).length) {
    return [false, null];
  }
  for (const key in x) {
    if (!(key in y)) {
      return [false, null];
    }
    const xval = x[key];
    const yval = y[key];
    if (depth <= 0) {
      if (xval !== yval) {
        return [false, null];
      }
    } else {
      const [eq, err] = dictsEqual(xval, yval, depth - 1);
      if (err !== null) {
        return [false, err];
      } else if (!eq) {
        return [false, null];
      }
    }
  }
  return [true, null];
}

class List {
  private elems: Value[];
  private frozen: boolean;
  private itercount: number; // number of active iterators (ignored if frozen)

  constructor(elems: Value[]) {
    this.elems = elems;
    this.frozen = false;
    this.itercount = 0;
  }

  public Freeze(): void {
    if (!this.frozen) {
      this.frozen = true;
      for (const elem of this.elems) {
        elem.Freeze();
      }
    }
  }

  // checkMutable reports an error if the list should not be mutated.
  // verb+" list" should describe the operation.
  private checkMutable(verb: string): Error | null {
    if (this.frozen) {
      return new Error(`cannot ${verb} frozen list`);
    }
    if (this.itercount > 0) {
      return new Error(`cannot ${verb} list during iteration`);
    }
    return null;
  }

  public String(): string {
    return toString(this);
  }
  public Type(): string {
    return "list";
  }
  public Hash(): { hash: number; err: Error } {
    return { hash: 0, err: new Error("unhashable type: list") };
  }
  public Truth(): boolean {
    return this.Len() > 0;
  }
  public Len(): number {
    return this.elems.length;
  }
  public Index(i: number): Value {
    return this.elems[i];
  }

  Slice(start: number, end: number, step: number): Value {
    if (step == 1) {
      const elems = this.elems.slice(start, end);
      return new List(elems);
    }

    const sign = signum(step);
    const list = [];
    for (let i = start; signum(end - i) == sign; i += step) {
      list.push(this.elems[i]);
    }
    return new List(list);
  }

  Attr(name: string): [Value, Error] {
    return builtinAttr(this, name, listMethods);
  }

  AttrNames(): string[] {
    return builtinAttrNames(listMethods);
  }

  Iterate(): Iterator {
    if (!this.frozen) {
      this.itercount++;
    }
    return new ListIterator(this);
  }

  CompareSameType(
    op: syntax.Token,
    y_: Value,
    depth: number
  ): [boolean, Error] {
    const y = y_ as List;
    // It's tempting to check x == y as an optimization here,
    // but wrong because a list containing NaN is not equal to itself.
    return sliceCompare(op, this.elems, y.elems, depth);
  }
}

function sliceCompare(
  op: syntax.Token,
  x: Value[],
  y: Value[],
  depth: number
): [boolean, Error | null] {
  // Fast path: check length.
  if (x.length !== y.length && (op === syntax.EQL || op === syntax.NEQ)) {
    return [op === syntax.NEQ, null];
  }

  // Find first element that is not equal in both lists.
  for (let i = 0; i < x.length && i < y.length; i++) {
    const [eq, err] = EqualDepth(x[i], y[i], depth - 1);
    if (err) {
      return [false, err];
    } else if (!eq) {
      switch (op) {
        case syntax.EQL:
          return [false, null];
        case syntax.NEQ:
          return [true, null];
        default:
          return CompareDepth(op, x[i], y[i], depth - 1);
      }
    }
  }

  return [threeway(op, x.length - y.length), null];
}

class listIterator {
  private l: List;
  private i: number;

  constructor(l: List) {
    this.l = l;
    this.i = 0;
  }

  public Next(p: Value): boolean {
    if (this.i < this.l.Len()) {
      p = this.l.elems[this.i];
      this.i++;
      return true;
    }
    return false;
  }

  public Done() {
    if (!this.l.frozen) {
      this.l.itercount--;
    }
  }
}

// A Tuple represents a Starlark tuple value.
class Tuple implements Value {
  constructor(public elems: Value[]) { }

  get length(): number {
    return this.elems.length;
  }

  index(i: number): Value {
    return this.elems[i];
  }

  slice(start: number, end: number, step: number): Value {
    if (step === 1) {
      return new Tuple(this.elems.slice(start, end));
    }

    javascript;

    const sign = Math.sign(step);
    const tuple = [];
    for (let i = start; Math.sign(end - i) === sign; i += step) {
      tuple.push(this.elems[i]);
    }
    return new Tuple(tuple);
  }

  // FIXME:
  // Symbol.iterator: IterableIterator<Value> {
  //   return this.elems.values();
  // }

  toString(): string {
    return toString(this);
  }

  type(): string {
    return "tuple";
  }

  truth(): boolean {
    return this.elems.length > 0;
  }

  compareSameType(op: syntax.Token, y: Tuple, depth: number): boolean | Error {
    return sliceCompare(op, this, y, depth);
  }

  async hash(): Promise<number> {
    let x = 0x345678,
      mult = 1000003;
    for (const elem of this.elems) {
      const y = await elem.hash();
      x = x ^ (y * mult);
      mult += 82520 + this.elems.length + this.elems.length;
    }
    return x;
  }
}

class TupleIterator implements Iterator {
  private elems: Tuple;

  constructor(elems: Tuple) {
    this.elems = elems;
  }

  Next(p: Value): boolean {
    if (this.elems.length > 0) {
      p = this.elems[0];
      this.elems = this.elems.slice(1);
      return true;
    }
    return false;
  }

  Done(): void { }
}

// A Set represents a TypeScript set value.
// The zero value of Set is a valid empty set.
class Set {
  private ht: Hashtable; // values are all None

  // NewSet returns a dictionary with initial space for
  // at least size insertions before rehashing.
  constructor(size: number) {
    this.ht = new Hashtable(size);
  }

  delete(k: Value): [found: boolean, err?: Error] {
    const [_, found, err] = this.ht.delete(k);
    return [found, err];
  }

  clear(): Error | undefined {
    return this.ht.clear();
  }

  has(k: Value): [found: boolean, err?: Error] {
    const [_, found, err] = this.ht.lookup(k);
    return [found, err];
  }

  insert(k: Value): Error | undefined {
    return this.ht.insert(k, None);
  }

  get length(): number {
    return this.ht.len;
  }

  iterate(): Iterator {
    return this.ht.iterate();
  }

  toString(): string {
    return toString(this);
  }

  get type(): string {
    return "set";
  }

  elems(): Value[] {
    return this.ht.keys();
  }

  freeze(): void {
    this.ht.freeze();
  }

  hash(): [uint32: number, err?: Error] {
    return [0, new Error("unhashable type: set")];
  }

  truth(): Bool {
    return this.length > 0;
  }

  attr(name: string): [value: Value, err?: Error] {
    return builtinAttr(this, name, setMethods);
  }

  attrNames(): string[] {
    return builtinAttrNames(setMethods);
  }

  compareSameType(
    op: syntax.Token,
    y: Set,
    depth: number
  ): [result: boolean, err?: Error] {
    switch (op) {
      case syntax.EQL:
        const [ok, err] = [setsEqual(this, y, depth), undefined];
        return [ok, err];
      case syntax.NEQ:
        const [ok2, err2] = [setsEqual(this, y, depth), undefined];
        return [!ok2, err2];
      default:
        return [
          false,
          new Error(`${this.type} ${op} ${y.type} not implemented`),
        ];
    }
  }

  union(iter: Iterator): Set {
    const set = new Set();
    for (const elem of this.elems()) {
      set.insert(elem);
    }
    let x: Value;
    while (iter.next(x)) {
      if (set.insert(x) !== null) {
        return null;
      }
    }
    return set;
  }
}

// BUG: change return type
function setsEqual(x: Set, y: Set, depth: number): boolean {
  if (x.size !== y.size) {
    return false;
  }
  for (const elem of x.elems()) {
    const [found, _] = y.has(elem);
    if (!found) {
      return false;
    }
  }
  return true;
}

// toString returns the string form of value v.
// It may be more efficient than v.toString() for larger values.
function toString(v: Value): string {
  const buf = new Array();
  writeValue(buf, v, []);
  return buf.toString();
}

// writeValue writes x to out.
//
// path is used to detect cycles.
// It contains the list of *List and *Dict values we're currently printing.
// (These are the only potentially cyclic structures.)
// Callers should generally pass nil for path.
// It is safe to re-use the same path slice for multiple calls.
function writeValue(out: string[], x: Value, path: Value[]): void {
  switch (x.constructor) {
    case NoneType:
      out.push("None");
      break;

    case Int:
      out.push(x.toString());
      break;

    case Bool:
      if (x) {
        out.push("True");
      } else {
        out.push("False");
      }
      break;

    case String:
      out.push(syntax.Quote(String(x), false));
      break;

    case List:
      out.push("[");
      if (pathContains(path, x)) {
        out.push("..."); // list contains itself
      } else {
        for (let i = 0; i < x.elems.length; i++) {
          if (i > 0) {
            out.push(", ");
          }
          writeValue(out, x.elems[i], path.concat(x));
        }
      }
      out.push("]");
      break;

    case Tuple:
      out.push("(");
      for (let i = 0; i < x.length; i++) {
        if (i > 0) {
          out.push(", ");
        }
        writeValue(out, x[i], path);
      }
      if (x.length === 1) {
        out.push(",");
      }
      out.push(")");
      break;

    case Function:
      out.push(`<function ${x.Name()}>`);
      break;

    case Builtin:
      if (x.recv !== null) {
        out.push(`<built-in method ${x.Name()} of ${x.recv.Type()} value>`);
      } else {
        out.push(`<built-in function ${x.Name()}>`);
      }
      break;

    case Dict:
      out.push("{");
      if (pathContains(path, x)) {
        out.push("..."); // dict contains itself
      } else {
        let sep = "";
        for (let e = x.ht.head; e !== null; e = e.next) {
          let k = e.key;
          let v = e.value;
          out.push(sep);
          writeValue(out, k, path);
          out.push(": ");
          writeValue(out, v, path.concat(x)); // cycle check
          sep = ", ";
        }
      }
      out.push("}");
      break;

    case Set:
      out.push("set([");
      for (let i = 0; i < x.elems().length; i++) {
        if (i > 0) {
          out.push(", ");
        }
        writeValue(out, x.elems()[i], path);
      }
      out.push("])");
      break;

    default:
      out.push(x.toString());
  }
}

function pathContains(path: Value[], x: Value): boolean {
  for (const y of path) {
    if (x === y) {
      return true;
    }
  }
  return false;
}
// CompareLimit is the depth limit on recursive comparison operations such as == and <.
// Comparison of data structures deeper than this limit may fail.
var CompareLimit = 10;

// Equal reports whether two Starlark values are equal.
function Equal(x: Value, y: Value): [boolean, Error | null] {
  // BUG: error type
  if (x instanceof String) {
    return [x == y, null]; // fast path for an important special case
  }
  return EqualDepth(x, y, CompareLimit);
}

// EqualDepth reports whether two Starlark values are equal.
//
// Recursive comparisons by implementations of Value.CompareSameType
// should use EqualDepth to prevent infinite recursion.
function EqualDepth(
  x: Value,
  y: Value,
  depth: number
): [boolean, Error | null] {
  return CompareDepth(syntax.EQL, x, y, depth);
}

// Compare compares two Starlark values.
// The comparison operation must be one of EQL, NEQ, LT, LE, GT, or GE.
// Compare returns an error if an ordered comparison was
// requested for a type that does not support it.
//
// Recursive comparisons by implementations of Value.CompareSameType
// should use CompareDepth to prevent infinite recursion.
function Compare(op: syntax.Token, x: Value, y: Value): [boolean, Error] {
  return CompareDepth(op, x, y, CompareLimit);
}

// CompareDepth compares two Starlark values.
// The comparison operation must be one of EQL, NEQ, LT, LE, GT, or GE.
// CompareDepth returns an error if an ordered comparison was
// requested for a pair of values that do not support it.
//
// The depth parameter limits the maximum depth of recursion
// in cyclic data structures.
export function CompareDepth(
  op: syntax.Token,
  x: Value,
  y: Value,
  depth: number
): [boolean, Error] {
  if (depth < 1) {
    return [false, new Error("comparison exceeded maximum recursion depth")];
  }
  if (sameType(x, y)) {
    if (isComparable(x)) {
      return x.CompareSameType(op, y, depth);
    }

    // use identity comparison
    switch (op) {
      case syntax.EQL:
        return [x === y, null];
      case syntax.NEQ:
        return [x !== y, null];
    }
    return [false, new Error(`${x.Type()} ${op} ${y.Type()} not implemented`)];
  }

  // different types

  // int/float ordered comparisons
  switch (x.constructor) {
    case Int:
      if (y instanceof Float) {
        let cmp: number;
        if (Number.isNaN(y)) {
          cmp = -1; // y is NaN
        } else if (!math.isInf(y, 0)) {
          cmp = x.rational().cmp(y.rational()); // y is finite
        } else if (y > 0) {
          cmp = -1; // y is +Inf
        } else {
          cmp = +1; // y is -Inf
        }
        return [threeway(op, cmp), null];
      }
      break;
    case Float:
      if (y instanceof Int) {
        let cmp: number;
        if (Number.isNaN(x)) {
          cmp = +1; // x is NaN
        } else if (!math.isInf(x, 0)) {
          cmp = x.rational().cmp(y.rational()); // x is finite
        } else if (x > 0) {
          cmp = +1; // x is +Inf
        } else {
          cmp = -1; // x is -Inf
        }
        return [threeway(op, cmp), null];
      }
      break;
  }

  // All other values of different types compare unequal.
  switch (op) {
    case syntax.EQL:
      return [false, null];
    case syntax.NEQ:
      return [true, null];
  }
  return [false, new Error(`${x.Type()} ${op} ${y.Type()} not implemented`)];
}

function sameType(x: Value, y: Value): boolean {
  // BUG:
  return x instanceof y.constructor || x.Type() === y.Type();
}

// threeway interprets a three-way comparison value cmp (-1, 0, +1)
// as a boolean comparison (e.g. x < y).
function threeway(op: syntax.Token, cmp: number): boolean {
  switch (op) {
    case syntax.EQL:
      return cmp === 0;
    case syntax.NEQ:
      return cmp !== 0;
    case syntax.LE:
      return cmp <= 0;
    case syntax.LT:
      return cmp < 0;
    case syntax.GE:
      return cmp >= 0;
    case syntax.GT:
      return cmp > 0;
    default:
      throw new Error(op);
  }
}

function b2i(b: boolean): number {
  if (b) {
    return 1;
  } else {
    return 0;
  }
}

function Len(x: Value): number {
  if (typeof x === "string") {
    return x.length;
  } else if (x instanceof Indexable) {
    return x.Len();
  } else if (x instanceof Sequence) {
    return x.Len();
  }
  return -1;
}

// Iterate return a new iterator for the value if iterable, nil otherwise.
// If the result is non-nil, the caller must call Done when finished with it.
//
// Warning: Iterate(x) != nil does not imply Len(x) >= 0.
// Some iterables may have unknown length.
export function Iterate(x: Value): Iterator | null {
  if (x instanceof Iterable) {
    return x.Iterate();
  }
  return null;
}

// Bytes is the type of a Starlark binary string.
//
// A Bytes encapsulates an immutable sequence of bytes.
// It is comparable, indexable, and sliceable, but not directly iterable;
// use bytes.elems() for an iterable view.
// BUG: type bytes = string
class Bytes implements Value, Comparable, Sliceable, Indexable {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  public toString(): string {
    return syntax.Quote(this.value, true);
  }

  public type(): string {
    return "bytes";
  }

  public freeze(): void { } // immutable

  public truth(): boolean {
    return this.value.length > 0;
  }

  public hash(): number {
    return new String(this.value).hash();
  }

  public len(): number {
    return this.value.length;
  }

  public index(i: number): Value {
    return new Bytes(this.value[i]);
  }

  public attr(name: string): Value | None {
    return builtinAttr(this, name, bytesMethods);
  }

  public attrNames(): string[] {
    return builtinAttrNames(bytesMethods);
  }

  public slice(start: number, end: number, step: number): Value {
    if (step === 1) {
      return new Bytes(this.value.slice(start, end));
    }

    const sign = signum(step);
    let str = "";
    for (let i = start; signum(end - i) === sign; i += step) {
      str += this.value[i];
    }
    return new Bytes(str);
  }

  public compareSameType(
    op: syntax.Token,
    y: Value,
    depth: number
  ): [boolean, Error] {
    const valueY = y as Bytes;
    const result = threeway(op, stringCompare(this.value, valueY.value));
    return [result, null];
  }
}
