// import syntax = require("../syntax");
// BUG:
// import * as syntax from "../syntax/syntax";
import * as compile from '../starlark-compiler/compile';
import { Position } from '../starlark-parser';
import { Token } from '../starlark-parser';
import { signum } from './eval';
// ------------------------------------------------------
// ------------------------Library
// ------------------------------------------------------
import { Thread } from './eval';
import { Hashtable, hashString } from './hashtable';
// import { hashString } from "./hashtable";
// import { toString } from "./value";
import { AsInt32, Int, MakeInt } from './int';
import { mandatory } from './interpreter';

// Starlark values are represented by the Value interface.
// The following built-in Value types are known to the evaluator:
//
//      NoneType        -- NoneType
//      Bool            -- bool
//      Bytes           -- bytes
//      Int             -- int
//      Float           -- float
//      String          -- string
//      *List           -- list
//      Tuple           -- tuple
//      *Dict           -- dict
//      *Set            -- set
//      *Function       -- function (implemented in Starlark)
//      *Builtin        -- builtin_function_or_method (function or method implemented in Go)
//
// Client applications may define new data types that satisfy at least
// the Value interface.  Such types may provide additional operations by
// implementing any of these optional interfaces:
//
//      Callable        -- value is callable like a function
//      Comparable      -- value defines its own comparison operations
//      Iterable        -- value is iterable using 'for' loops
//      Sequence        -- value is iterable sequence of known length
//      Indexable       -- value is sequence with efficient random access
//      Mapping         -- value maps from keys to values, like a dictionary
//      HasBinary       -- value defines binary operations such as * and +
//      HasAttrs        -- value has readable fields or methods x.f
//      HasSetField     -- value has settable fields x.f
//      HasSetIndex     -- value supports element update using x[i]=y
//      HasSetKey       -- value supports map update using x[k]=v
//      HasUnary        -- value defines unary operations such as + and -
//
// Client applications may also define domain-specific functions in Go
// and make them available to Starlark programs.  Use NewBuiltin to
// construct a built-in value that wraps a Go function.  The
// implementation of the Go function may use UnpackArgs to make sense of
// the positional and keyword arguments provided by the caller.
//
// Starlark's None value is not equal to Go's nil. Go's nil is not a legal
// Starlark value, but the compiler will not stop you from converting nil
// to Value. Be careful to avoid allowing Go nil values to leak into
// Starlark data structures.
//
// The Compare operation requires two arguments of the same
// type, but this constraint cannot be expressed in Go's type system.
// (This is the classic "binary method problem".)
// So, each Value type's CompareSameType method is a partial function
// that compares a value only against others of the same type.
// Use the package's standalone Compare (or Equal) function to compare
// an arbitrary pair of values.
//
// To parse and evaluate a Starlark source file, use ExecFile.  The Eval
// function evaluates a single expression.  All evaluator functions
// require a Thread parameter which defines the "thread-local storage"
// of a Starlark thread and may be used to plumb application state
// through Starlark code and into callbacks.  When evaluation fails it
// returns an EvalError from which the application may obtain a
// backtrace of active Starlark calls.

// Value is a value in the Starlark interpreter.
export interface Value {
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
  Truth(): Bool;

  // Hash returns a function of x such that Equals(x, y) => Hash(x) == Hash(y).
  // Hash may fail if the value's type is not hashable, or if the value
  // contains a non-hashable value. The hash is used only by dictionaries and
  // is not exposed to the Starlark program.
  Hash(): [number, Error | null];
}

export function isValue(v: any): v is Value {
  let is = true;
  for (var n of ["String", "Type", "Freeze", "Truth", "Hash"]) {
    if (!(n in v)) {
      is = false;
      break;
    }

  }
  return is;

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
  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error];
}

// A Callable value f may be the operand of a function call, f(x).
//
// Clients should use the call() function, never the callInternal() method.
export interface Callable extends Value {
  name(): string;
  callInternal(
    thread: Thread,
    args: Tuple,
    kwargs: Tuple[]
  ): [Value, Error | null];
}

export interface callableWithPosition extends Callable {
  position(): Position;
}

// An Iterator provides a sequence of values to the caller.
//
// The caller must call Done when the iterator is no longer needed.
// Operations that modify a sequence will fail if it has active iterators.
//
// Example usage:
//
// 	iter := iterable.Iterator()
//	defer iter.Done()
//	var x Value
//	for iter.Next(&x) {
//		...
//	}
//
export interface Iterator {
  next(p: Value): boolean;
  done(): void;
}

// An Iterable abstracts a sequence of values.
// An iterable value may be iterated over by a 'for' loop or used where
// any other Starlark iterable is allowed.  Unlike a Sequence, the length
// of an Iterable is not necessarily known in advance of iteration.
export interface Iterable extends Value {
  iterate(): Iterator;
}

// A Sequence is a sequence of values of known length.
export interface Sequence extends Iterable {
  len(): number;
}

// An Indexable is a sequence of known length that supports efficient random access.
// It is not necessarily iterable.
export interface Indexable extends Value {
  index(i: number): Value;
  len(): number;
}

// A Sliceable is a sequence that can be cut into pieces with the slice operator (x[i:j:step]).
//
// All native indexable objects are sliceable.
// This is a separate interface for backwards-compatibility.
interface Sliceable extends Indexable {
  // For positive strides (step > 0), 0 <= start <= end <= n.
  // For negative strides (step < 0), -1 <= end <= start < n.
  // The caller must ensure that the start and end indices are valid
  // and that step is non-zero.
  slice(start: number, end: number, step: number): Value;
}

// A HasSetIndex is an Indexable value whose elements may be assigned (x[i] = y).
//
// The implementation should not add Len to a negative index as the
// evaluator does this before the call.
interface HasSetIndex extends Indexable {
  setIndex(index: number, v: Value): Error;
}

// A Mapping is a mapping from keys to values, such as a dictionary.
//
// If a type satisfies both Mapping and Iterable, the iterator yields
// the keys of the mapping.
export interface Mapping extends Value {
  // Get returns the value corresponding to the specified key,
  // or !found if the mapping does not contain the key.
  //
  // Get also defines the behavior of "v in mapping".
  // The 'in' operator reports the 'found' component, ignoring errors.
  // BUG:
  get(v: Value): [Value, boolean, Error];
}

export function isMapping(v: Value): v is Mapping {
  if ('get' in v && typeof v.get == 'function') {
    return true;
  }
  return false;
}

// An IterableMapping is a mapping that supports key enumeration.
export interface IterableMapping extends Mapping {
  iterate(): Iterator;
  items(): Tuple[];
}

// A HasSetKey supports map update using x[k]=v syntax, like a dictionary.
interface HasSetKey extends Mapping {
  setkey(k: Value, v: Value): Error;
}

type Side = boolean;
const Left: Side = false;
const Rigth: Side = true;
// A HasBinary value may be used as either operand of these binary operators:
//     +   -   *   /   //   %   in   not in   |   &   ^   <<   >>
//
// The Side argument indicates whether the receiver is the left or right operand.
//
// An implementation may decline to handle an operation by returning (nil, nil).
// For this reason, clients should always call the standalone Binary(op, x, y)
// function rather than calling the method directly.
interface hasBinary extends Value {
  binary(op: Token, y: Value, side: Side): [Value, Error | null];
}

// A HasUnary value may be used as the operand of these unary operators:
//     +   -   ~
//
// An implementation may decline to handle an operation by returning (nil, nil).
// For this reason, clients should always call the standalone Unary(op, x)
// function rather than calling the method directly.
interface HasUnary extends Value {
  unary(op: Token): [Value, Error | null];
}

// A HasAttrs value has fields or methods that may be read by a dot expression (y = x.f).
// Attribute names may be listed using the built-in 'dir' function.
//
// For implementation convenience, a result of (nil, nil) from Attr is
// interpreted as a "no such field or method" error. Implementations are
// free to return a more precise error.
interface HasAttrs extends Value {
  attr(name: string): [Value, Error | null];
  attrNames(): string[];
}

// A HasSetField value has fields that may be written by a dot expression (x.f = y).
//
// An implementation of SetField may return a NoSuchAttrError,
// in which case the runtime may augment the error message to
// warn of possible misspelling.
interface HasSetField extends HasAttrs {
  setField(name: string, val: Value): Error;
}

// TODO: NoSuchAttrError

// NoneType is the type of None.  Its only legal value is None.
// (We represent it as a number, not struct{}, so that None may be constant.)
export class NoneType implements Value {
  constructor() { }

  String(): string {
    return 'None';
  }
  Type(): string {
    return 'NoneType';
  }

  Freeze() { }
  Truth(): Bool {
    return False;
  }

  Hash(): [number, Error | null] {
    return [0, null];
  }
}
export const None = new NoneType();

// Bool is the type of a Starlark bool.
export class Bool implements Comparable {
  val: boolean;
  constructor(val: boolean) {
    this.val = val;
  }

  String(): string {
    if (this.val) {
      return 'True';
    }
    return 'False';
  }

  Type(): string {
    return 'bool';
  }

  Freeze() { }

  Truth(): Bool {
    return this;
  }

  Hash(): [number, Error | null] {
    // BUG:
    return [0, null];
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error] {
    // BUG:
    return [false, new Error()];
  }
}

export const False: Bool = new Bool(false);
export const True: Bool = new Bool(true);

export class Float implements Comparable {
  val: number;
  constructor(val: number) {
    this.val = val;
  }

  String(): string {
    return this.val.toString();
  }

  Type(): string {
    return 'float';
  }

  Freeze() { }

  Truth(): Bool {
    return new Bool(this.val !== 0.0);
  }

  Hash(): [number, Error | null] {
    // BUG:
    return [0, null];
  }

  // TODO: format

  floor(): Float {
    return new Float(Math.floor(this.val));
  }

  // isFinite reports whether f represents a finite rational value.
  // It is equivalent to !math.IsNan(f) && !math.IsInf(f, 0).
  isFinite(): boolean {
    return isFinite(this.val);
  }

  // TODO:
  // rational()

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error] {
    // BUG:
    return [false, new Error()];
  }
}

// BUG:
// floatCmp performs a three-valued comparison on floats,
// which are totally ordered with NaN > +Inf.
function floatCmp(x: Float, y: Float): number {
  if (x.val > y.val) {
    return 1;
  } else if (x.val < y.val) {
    return -1;
  } else {
    return 0;
  }

  // At least one operand is NaN.
  if (x.val == x.val) {
    return -1; // y is NaN
  } else if (y.val == y.val) {
    return +1; // x is NaN
  }
  return 0; // both NaN
}

// AsFloat returns the float64 value closest to x.
// The f result is undefined if x is not a float or Int.
// The result may be infinite if x is a very large Int.
function AsFloat(x: Value): [number, boolean] {
  if (x instanceof Float) {
    return [x.val, true];
  }
  if (x instanceof Int) {
    // BUG:
    return [0, true];
    // return [x.val, true];
  }

  return [0, false];
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
export class String implements Comparable, HasAttrs {
  val: string;

  constructor(val: string) {
    this.val = val;
  }

  String(): string {
    // BUG:
    // func (s String) String() string        { return syntax.Quote(string(s), false) }
    return this.val;
  }

  GoString(): string {
    return this.val;
  }

  Type(): string {
    return 'string';
  }

  Freeze() { }

  Truth(): Bool {
    return new Bool(this.val.length > 0);
  }

  Hash(): [number, Error | null] {
    // BUG:
    return [0, null];
  }

  Len(): number {
    return this.val.length;
  }

  Index(i: number): String {
    return new String(this.val[i]);
  }

  Slice(start: number, end: number, step: number): String {
    if (step == 1) {
      return new String(this.val.slice(start, end));
    }

    let sign = signum(step);

    let buf = new Array();

    for (let i = start; signum(end - i) == sign; i += step) {
      buf.push(this.val[i]);
    }

    return new String(buf.join(''));
  }

  attr(name: string): [Value, Error | null] {
    return builtinAttr(this, name, stringMethods);
  }

  attrNames(): string[] {
    return builtinAttrNames(stringMethods);
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error] {
    // BUG:
    return [false, new Error()];
  }
}

export function AsString(x: Value): [string, boolean] {
  if (x instanceof String) {
    return [x.val, true]
  }
  return [x.String(), true]
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
      return this.s + '.elem_ords()';
    } else {
      return this.s + '.elems()';
    }
  }

  Type(): string {
    return 'string.elems';
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
    // BUG:
    // if (this.ords) {
    //   return MakeInt(this.s.charCodeAt(i));
    // } else {
    //   return this.s[i];
    // }

    return new String(this.s[i]);
  }
}

class StringElemsIterator implements Iterator {
  si: StringElems;
  i: number;

  constructor(si: StringElems, i: number) {
    this.si = si;
    this.i = i;
  }

  next(p: Value): boolean {
    if (this.i == this.si.Len()) {
      return false;
    }
    // Bug
    p = this.si.Index(this.i);
    this.i++;
    return true;
  }

  done(): void { }
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
    return 'string.codepoints';
  }

  Freeze(): void { } // immutable

  Truth(): Bool {
    return True;
  }

  Hash(): [number, Error] {
    return [0, new Error(`unhashable: ${this.Type()}`)];
  }
}

// TODO: stringCodepointsIterator

class stringCodepointsIterator implements Iterator {
  si: stringCodepoints;
  i: number;

  constructor(si: stringCodepoints, i: number) {
    this.si = si;
    this.i = i;
  }

  next(p: Value): boolean {
    // BUG:
    return false;
    // let s = this.si.s.slice(this.i);
    // if (s === "") {
    //   return { done: true, value: undefined };
    // }
    // let [r, sz] = utf8DecodeRuneInString(s);
    // if (!this.si.ords) {
    //   if (r === utf8.RuneError) {
    //     p = new String(r);
    //   } else {
    //     p = new String(s.slice(0, sz));
    //   }
    // } else {
    //   p = new Int(r);
    // }
    // this.i += sz;
    // return { done: false, value: p };
  }

  done(): void { }
}

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

  // BUG:
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

  Truth(): Bool {
    return True;
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

// A Builtin is a function implemented in TypeScript.
export class Builtin implements Value {
  name: string;
  fn: (
    thread: Thread,
    fn: Builtin,
    args: Tuple,
    kwargs: Tuple[]
  ) => Value | Error;
  recv: Value | null;

  constructor(
    name: string,
    fn: (
      thread: Thread,
      fn: Builtin,
      args: Tuple,
      kwargs: Tuple[]
    ) => Value | Error,
    recv: Value | null = null
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

  Hash(): [number, Error | null] {
    let h = hashString(this.name);
    if (this.recv !== null) {
      h ^= 5521;
    }
    return [h, null];
  }

  Receiver(): Value | null {
    return this.recv;
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return 'builtin_function_or_method';
  }

  CallInternal(thread: Thread, args: Tuple, kwargs: Tuple[]): Value | Error {
    return this.fn(thread, this, args, kwargs);
  }

  Truth(): Bool {
    return True;
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
    return new Builtin(this.name, this.fn, this.recv);
  }
}

// A *Dict represents a Starlark dictionary.
// The zero value of Dict is a valid empty dictionary.
// If you know the exact final number of entries,
// it is more efficient to call NewDict.
export class Dict implements Value {
  ht: Hashtable;

  // NewDict returns a new empty dictionary.
  constructor(size?: number) {
    let ht = new Hashtable(size);
    this.ht = ht;
  }

  // clear removes all elements from the dictionary.
  public clear(): void {
    this.ht.clear();
  }

  // delete removes an element from the dictionary.
  public delete(k: Value): [Value | null, boolean, Error | null] {
    return this.ht.delete(k);
  }

  // get retrieves the value associated with a key.
  public get(k: Value): [Value | null, boolean, Error | null] {
    return this.ht.lookup(k);
  }

  // items returns a list of key-value pairs.
  public items(): Tuple[] {
    return this.ht.items();
  }

  // keys returns a list of all keys.
  public keys(): Value[] {
    return this.ht.keys();
  }

  // len returns the number of elements in the dictionary.
  public len(): number {
    return this.ht.len;
  }

  // set sets the value associated with a key.
  public setKey(k: Value, v: Value): Error | null {
    return this.ht.insert(k, v);
  }

  // String returns the string representation of the dictionary.
  public String(): string {
    return this.ht.toString();
  }

  // type returns the string "dict".
  public Type(): string {
    return 'dict';
  }

  // freeze makes the dictionary immutable.
  public Freeze(): void {
    this.ht.freeze();
  }

  // truth returns true if the dictionary is not empty.
  public Truth(): Bool {
    return new Bool(this.len() > 0);
  }

  // hash returns an error because dictionaries are not hashable.
  public Hash(): [number, Error | null] {
    return [0, new Error('unhashable type: dict')];
  }

  // union returns a new dictionary that is the union of two dictionaries.
  public union(other: Dict): Dict {
    const result = new Dict(this.len());
    result.ht.addAll(this.ht); // can't fail
    result.ht.addAll(other.ht); // can't fail
    return result;
  }

  Attr(name: string): [Value, Error | null] {
    return builtinAttr(this, name, dictMethods);
  }

  AttrNames(): string[] {
    return builtinAttrNames(dictMethods);
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error | null] {
    const yDict = y as Dict;
    switch (op) {
      case Token.EQL:
        const [ok, err] = dictsEqual(this, yDict, depth);
        return [ok, err];
      case Token.NEQ:
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
  if (x.len() != y.len()) {
    return [false, null];
  }

  let e = x.ht.head;
  while (e != null) {
    let key = e.key;
    let xval = e.value;

    let [yval, found, _] = y.get(key);
    if (!found) {
      return [false, null];
    }

    let [eq, err] = EqualDepth(xval, yval!, depth - 1);
    if (err != null) {
      return [false, err];
    }
    if (!eq) {
      return [false, null];
    }
    e = e.next;
  }
  return [true, null];
}

// A *List represents a Starlark list value.
export class List implements Value {
  elems: Value[];
  frozen: boolean;
  itercount: number; // number of active iterators (ignored if frozen)

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
  public checkMutable(verb: string): Error | null {
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
    return 'list';
  }
  public Hash(): [number, Error | null] {
    return [0, new Error('unhashable type: list')];
  }
  public Truth(): Bool {
    return new Bool(this.Len() > 0);
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
    let list = new Array();
    for (let i = start; signum(end - i) == sign; i += step) {
      list.push(this.elems[i]);
    }
    return new List(list);
  }

  Attr(name: string): [Value, Error | null] {
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
    op: Token,
    y_: Value,
    depth: number
  ): [boolean, Error | null] {
    const y = y_ as List;
    // It's tempting to check x == y as an optimization here,
    // but wrong because a list containing NaN is not equal to itself.
    return sliceCompare(op, this.elems, y.elems, depth);
  }

  public SetIndex(i: number, v: Value): Error | null {
    const err = this.checkMutable('assign to element of');
    if (err !== null) {
      return err;
    }
    this.elems[i] = v;
    return null;
  }

  public Append(v: Value): Error | null {
    const err = this.checkMutable('append to');
    if (err !== null) {
      return err;
    }
    this.elems.push(v);
    return null;
  }

  public Clear(): Error | null {
    const err = this.checkMutable('clear');
    if (err !== null) {
      return err;
    }
    for (let i = 0; i < this.elems.length; i++) {
      // FIXME:
      // this.elems[i] = null; // aid GC
    }
    this.elems = [];
    return null;
  }
}

function sliceCompare(
  op: Token,
  x: Value[],
  y: Value[],
  depth: number
): [boolean, Error | null] {
  // Fast path: check length.
  if (x.length !== y.length && (op === Token.EQL || op === Token.NEQ)) {
    return [op === Token.NEQ, null];
  }

  // Find first element that is not equal in both lists.
  for (let i = 0; i < x.length && i < y.length; i++) {
    let [eq, err] = EqualDepth(x[i], y[i], depth - 1);
    if (err != null) {
      return [false, err];
    }
    if (!eq) {
      switch (op) {
        case Token.EQL:
          return [false, null];
        case Token.NEQ:
          return [true, null];
        default:
          return CompareDepth(op, x[i], y[i], depth - 1);
      }
    }
  }

  return [threeway(op, x.length - y.length), null];
}

class ListIterator implements Iterator {
  private l: List;
  private i: number;

  constructor(l: List) {
    this.l = l;
    this.i = 0;
  }

  public next(p: Value): boolean {
    if (this.i < this.l.Len()) {
      p = this.l.elems[this.i];
      this.i++;
      return true;
    }
    return false;
  }

  public done() {
    if (!this.l.frozen) {
      this.l.itercount--;
    }
  }
}

// A Tuple represents a Starlark tuple value.
export class Tuple implements Value {
  elems: Value[];

  constructor(elems: Value[]) {
    this.elems = elems;
  }

  Len(): number {
    return this.elems.length;
  }

  index(i: number): Value {
    return this.elems[i];
  }

  slice(start: number, end: number, step: number = 1): Value {
    if (step === 1) {
      return new Tuple(this.elems.slice(start, end));
    }

    const sign = signum(step);
    let tuple: Value[] = new Array();
    for (let i = start; signum(end - i) === sign; i += step) {
      tuple.push(this.elems[i]);
    }
    return new Tuple(tuple);
  }

  Freeze() {
    for (var elem of this.elems) {
      elem.Freeze();
    }
  }

  Iterate(): Iterator {
    return new TupleIterator(this);
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return 'tuple';
  }

  Truth(): Bool {
    return new Bool(this.elems.length > 0);
  }

  compareSameType(op: Token, y: Tuple, depth: number): [boolean, Error | null] {
    return sliceCompare(op, this.elems, y.elems, depth);
  }

  Hash(): [number, Error | null] {
    let x: number = 0x345678;
    let mult: number = 1000003;
    for (const elem of this.elems) {
      let [y, _] = elem.Hash();
      x = x ^ (y * mult);
      mult += 82520 + this.elems.length + this.elems.length;
    }
    return [x, null];
  }
}

export class TupleIterator implements Iterator {
  private elems: Tuple;

  constructor(elems: Tuple) {
    this.elems = elems;
  }

  next(p: Value): boolean {
    if (this.elems.Len() > 0) {
      p = this.elems.index(0);
      // TODO: shitcode
      this.elems = new Tuple(this.elems.elems.slice(1));
      return true;
    }
    return false;
  }

  done(): void { }
}

// A Set represents a TypeScript set value.
// The zero value of Set is a valid empty set.
export class Set implements Value {
  ht: Hashtable; // values are all None

  // NewSet returns a dictionary with initial space for
  // at least size insertions before rehashing.
  constructor(size: number) {
    this.ht = new Hashtable(size);
  }

  delete(k: Value): [boolean, Error | null] {
    const [_, found, err] = this.ht.delete(k);
    return [found, err];
  }

  clear(): Error | null {
    return this.ht.clear();
  }

  has(k: Value): [boolean, Error | null] {
    const [_, found, err] = this.ht.lookup(k);
    return [found, err];
  }

  insert(k: Value): Error | null {
    return this.ht.insert(k, None);
  }

  Len(): number {
    return this.ht.len;
  }

  Iterate(): Iterator {
    return this.ht.iterate();
  }

  String(): string {
    return toString(this);
  }

  Type(): string {
    return 'set';
  }

  elems(): Value[] {
    return this.ht.keys();
  }

  Freeze(): void {
    this.ht.freeze();
  }

  Hash(): [number, Error | null] {
    return [0, new Error('unhashable type: set')];
  }

  Truth(): Bool {
    return new Bool(this.Len() > 0);
  }

  Attr(name: string): [Value, Error | null] {
    return builtinAttr(this, name, setMethods);
  }

  AttrNames(): string[] {
    return builtinAttrNames(setMethods);
  }

  compareSameType(op: Token, y: Set, depth: number): [boolean, Error | null] {
    switch (op) {
      case Token.EQL:
        let [ok, err] = setsEqual(this, y, depth);
        return [ok, err];
      case Token.NEQ:
        let [ok2, err2] = setsEqual(this, y, depth);
        return [!ok2, err2];
      default:
        return [
          false,
          new Error(`${this.Type()} ${op} ${y.Type()} not implemented`),
        ];
    }
  }

  union(iter: Iterator): Set {
    const set = new Set(8);
    // BUG:
    // for (const elem of this.elems()) {
    //   set.insert(elem);
    // }
    // let x: Value;
    // while (iter.next(x)) {
    //   if (set.insert(x) !== null) {
    //     return null;
    //   }
    // }
    return set;
  }
}

// BUG: change return type
function setsEqual(x: Set, y: Set, depth: number): [boolean, Error | null] {
  if (x.Len() !== y.Len()) {
    return [false, null];
  }
  for (const elem of x.elems()) {
    const [found, _] = y.has(elem);
    if (!found) {
      return [false, null];
    }
  }
  return [true, null];
}

// toString returns the string form of value v.
// It may be more efficient than v.toString() for larger values.
export function toString(v: Value): string {
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
  if (x instanceof NoneType) {
    out.push('None');
    return;
  }

  if (x instanceof Int) {
    out.push(x.toString());
    return;
  }
  if (x instanceof Bool) {
    if (x.val) {
      out.push('True');
    } else {
      out.push('False');
    }

    return;
  }

  if (x instanceof String) {
    // TODO quote
    out.push(x.String());
    return;
  }

  if (x instanceof List) {
    out.push('[');
    if (pathContains(path, x)) {
      out.push('...'); // list contains itself
    } else {
      for (let i = 0; i < x.elems.length; i++) {
        if (i > 0) {
          out.push(', ');
        }
        writeValue(out, x.elems[i], path.concat(x));
      }
    }
    out.push(']');
    return;
  }

  if (x instanceof Tuple) {
    out.push('(');
    for (let i = 0; i < x.Len(); i++) {
      if (i > 0) {
        out.push(', ');
      }
      writeValue(out, x.index(i), path);
    }
    if (x.Len() === 1) {
      out.push(',');
    }
    out.push(')');
    return;
  }

  if (x instanceof Function) {
    out.push(`< function ${x.Name()} > `);
  }

  if (x instanceof Builtin) {
    if (x.recv !== null) {
      out.push(`< built -in method ${x.Name()} of ${x.recv.Type()} value > `);
    } else {
      out.push(`< built -in function ${x.Name()} > `);
    }
    return;
  }

  if (x instanceof Dict) {
    out.push('{');
    if (pathContains(path, x)) {
      out.push('...'); // dict contains itself
    } else {
      let sep = '';
      for (let e = x.ht.head; e !== null; e = e.next) {
        let k = e.key;
        let v = e.value;
        out.push(sep);
        writeValue(out, k, path);
        out.push(': ');
        writeValue(out, v, path.concat(x)); // cycle check
        sep = ', ';
      }
    }
    out.push('}');
    return;
  }

  if (x instanceof Set) {
    out.push('set([');
    for (let i = 0; i < x.elems().length; i++) {
      if (i > 0) {
        out.push(', ');
      }
      writeValue(out, x.elems()[i], path);
    }
    out.push('])');
    return;
  }

  out.push(x.toString());
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
export function Equal(x: Value, y: Value): [boolean, Error | null] {
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
  return CompareDepth(Token.EQL, x, y, depth);
}

// Compare compares two Starlark values.
// The comparison operation must be one of EQL, NEQ, LT, LE, GT, or GE.
// Compare returns an error if an ordered comparison was
// requested for a type that does not support it.
//
// Recursive comparisons by implementations of Value.CompareSameType
// should use CompareDepth to prevent infinite recursion.
export function Compare(
  op: Token,
  x: Value,
  y: Value
): [boolean, Error | null] {
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
  op: Token,
  x: Value,
  y: Value,
  depth: number
): [boolean, Error | null] {
  if (depth < 1) {
    return [false, new Error('comparison exceeded maximum recursion depth')];
  }
  if (sameType(x, y)) {
    // TODO:?
    if ('CompareSameType' in x) {
      return (x as Comparable).CompareSameType(op, y, depth);
    }

    // use identity comparison
    switch (op) {
      case Token.EQL:
        return [x === y, null];
      case Token.NEQ:
        return [x !== y, null];
    }
    return [false, new Error(`${x.Type()} ${op} ${y.Type()} not implemented`)];
  }

  // int/float ordered comparisons
  if (x instanceof Int) {
    if (y instanceof Float) {
      let cmp: number;
      if (Number.isNaN(y)) {
        cmp = -1; // y is NaN
      } else if (isFinite(y.val)) {
        // BUG:
        cmp = 1;
        // cmp = x.rational().cmp(y.rational()); // y is finite
      } else if (y.val > 0) {
        cmp = -1; // y is +Inf
      } else {
        cmp = +1; // y is -Inf
      }
      return [threeway(op, cmp), null];
    }
  }
  if (x instanceof Float) {
    if (y instanceof Int) {
      let cmp: number;
      if (Number.isNaN(x)) {
        cmp = +1; // x is NaN
      } else if (isFinite(x.val)) {
        // BUG:
        cmp = 1;
        // cmp = x.rational().cmp(y.rational()); // x is finite
      } else if (x.val > 0) {
        cmp = +1; // x is +Inf
      } else {
        cmp = -1; // x is -Inf
      }
      return [threeway(op, cmp), null];
    }
  }

  // All other values of different types compare unequal.
  switch (op) {
    case Token.EQL:
      return [false, null];
    case Token.NEQ:
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
function threeway(op: Token, cmp: number): boolean {
  switch (op) {
    case Token.EQL:
      return cmp === 0;
    case Token.NEQ:
      return cmp !== 0;
    case Token.LE:
      return cmp <= 0;
    case Token.LT:
      return cmp < 0;
    case Token.GE:
      return cmp >= 0;
    case Token.GT:
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

export function Len(x: Value): number {
  if ('Len' in x) {
    // @ts-ignore
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
  if ('Iterate' in x) {
    //@ts-ignore
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
export class Bytes implements Value, Comparable, Sliceable, Indexable {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  String(): string {
    return this.value;
    // return syntax.Quote(this.value, true);
  }

  Type(): string {
    return 'bytes';
  }

  Freeze(): void { } // immutable

  Truth(): Bool {
    return new Bool(this.value.length > 0);
  }

  Hash(): [number, Error | null] {
    return [new String(this.value).Hash()[0], null];
  }

  len(): number {
    return this.value.length;
  }

  index(i: number): Value {
    return new Bytes(this.value[i]);
  }

  Attr(name: string): [Value, Error | null] {
    return builtinAttr(this, name, bytesMethods);
  }

  AttrNames(): string[] {
    return builtinAttrNames(bytesMethods);
  }

  slice(start: number, end: number, step: number): Value {
    if (step === 1) {
      return new Bytes(this.value.slice(start, end));
    }

    const sign = signum(step);
    let str = '';
    for (let i = start; signum(end - i) === sign; i += step) {
      str += this.value[i];
    }
    return new Bytes(str);
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error] {
    return [false, new Error()];
    // TODO:
    // const valueY = y as Bytes;
    // const result = threeway(op, stringCompare(this.value, valueY.value));
    // return [result, null];
  }
}

// import * as syntax from "../syntax/syntax";

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
  console.error('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
  console.error('<<<< print is not impl but i can give you', args);
  let sep = ' ';
  // const err = UnpackArgs("print", null, kwargs, "sep?", sep);
  // if (err) {
  //   return [null, err];
  // }
  // const buf = new Array();
  // for (let i = 0; i < args.Len(); i++) {
  //   const v = args.index(i);
  //   if (i > 0) {
  //     buf.push(sep);
  //   }
  //   const s = AsString(v);
  //   if (s !== undefined) {
  //     buf.push(s);
  //   } else if (v instanceof Bytes) {
  //     // buf.push(new String(v));
  //   } else {
  //     buf.push(v);
  //   }
  // }

  // console.log(buf.join(""));
  console.error('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
  return [None, null];

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
export class RangeValue implements Value {
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

  Freeze(): void { } // immutable

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
    return 'range';
  }

  Truth(): Bool {
    return new Bool(this.len > 0);
  }

  Hash(): [number, Error | null] {
    return [0, new Error('unhashable: range')];
  }

  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error | null] {
    switch (op) {
      case Token.EQL:
        return [rangeEqual(this, y as unknown as RangeValue), null];
      case Token.NEQ:
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
export function rangeLen(start: number, stop: number, step: number): number {
  if (step > 0) {
    if (stop > start) {
      return Math.floor((stop - 1 - start) / step) + 1;
    }
  } else if (step < 0) {
    if (start > stop) {
      return Math.floor((start - 1 - stop) / -step) + 1;
    }
  } else {
    throw new Error('rangeLen: zero step');
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

  done(): void { }
}

export class StringDict {
  val: Map<string, Value>;

  constructor(vals?: any) {
    if (vals) {
      this.val = new Map(vals);
    } else {
      this.val = new Map();
    }
  }

  set(k: string, v: Value) {
    this.val.set(k, v);
  }
  get(k: string): Value | undefined {
    return this.val.get(k);
  }

  keys(): string[] {
    return [...this.val.keys()];
  }

  toString(): string {
    // TODO:
    // const buf = new StringBuilder();
    // buf.writeChar('{');
    // let sep = '';
    // for (const name of this.keys()) {
    //   buf.writeString(sep);
    //   buf.writeString(name);
    //   buf.writeString(': ');
    //   writeValue(buf, this[name], null);
    //   sep = ', ';
    // }
    // buf.writeChar('}');
    // return buf.toString();
    return 'a string dict';
  }

  freeze(): void {
    for (const value of this.val.values()) {
      value.Freeze();
    }
  }

  has(key: string): boolean {
    return this.val.has(key);
  }
}

export { Universe } from './builtin';
// export var Universe = new StringDict([
//   ["print", new Builtin("print", print, null)],
// ]);
