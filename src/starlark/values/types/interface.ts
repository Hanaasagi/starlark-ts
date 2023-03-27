import { Thread } from 'src/starlark/eval';

import { Token } from '../../../starlark-parser';
import { Position } from '../../../starlark-parser';
import { Tuple } from './tuple';

/*************************************************
 *                Interface
 *************************************************
 */

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
  Truth(): boolean;

  // Hash returns a function of x such that Equals(x, y) => Hash(x) == Hash(y).
  // Hash may fail if the value's type is not hashable, or if the value
  // contains a non-hashable value. The hash is used only by dictionaries and
  // is not exposed to the Starlark program.
  Hash(): [number, Error | null];
}

export function isValue(v: any): v is Value {
  let is = true;
  for (var n of ['String', 'Type', 'Freeze', 'Truth', 'Hash']) {
    if (!(n in v)) {
      is = false;
      break;
    }
  }
  return is;
}

// A Comparable is a value that defines its own equivalence relation and
// perhaps ordered comparisons.
export interface Comparable extends Value {
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
  CompareSameType(op: Token, y: Value, depth: number): [boolean, Error | null];
}

export function isComparable(v: Value): boolean {
  if ('CompareSameType' in v) {
    return true;
  }
  return false;
}

// A Callable value f may be the operand of a function call, f(x).
//
// Clients should use the call() function, never the callInternal() method.
export interface Callable extends Value {
  Name(): string;
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
export interface Sliceable extends Indexable {
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
export interface HasSetIndex extends Indexable {
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
export interface HasSetKey extends Mapping {
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
export interface hasBinary extends Value {
  binary(op: Token, y: Value, side: Side): [Value, Error | null];
}

// A HasUnary value may be used as the operand of these unary operators:
//     +   -   ~
//
// An implementation may decline to handle an operation by returning (nil, nil).
// For this reason, clients should always call the standalone Unary(op, x)
// function rather than calling the method directly.
export interface HasUnary extends Value {
  unary(op: Token): [Value, Error | null];
}

// A HasAttrs value has fields or methods that may be read by a dot expression (y = x.f).
// Attribute names may be listed using the built-in 'dir' function.
//
// For implementation convenience, a result of (nil, nil) from Attr is
// interpreted as a "no such field or method" error. Implementations are
// free to return a more precise error.
export interface HasAttrs extends Value {
  attr(name: string): [Value, Error | null];
  attrNames(): string[];
}

// A HasSetField value has fields that may be written by a dot expression (x.f = y).
//
// An implementation of SetField may return a NoSuchAttrError,
// in which case the runtime may augment the error message to
// warn of possible misspelling.
export interface HasSetField extends HasAttrs {
  setField(name: string, val: Value): Error;
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

export function Len(x: Value): number {
  if ('Len' in x) {
    // @ts-ignore
    return x.Len();
  }
  return -1;
}
