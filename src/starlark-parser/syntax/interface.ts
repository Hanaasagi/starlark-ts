import { Position } from '../tokenize';
import { Comments } from './comments';

// A Node is a node in a Starlark syntax tree.
export interface Node {
  // Span returns the start and end position of the expression.
  span(): [Position, Position];

  // Comments returns the comments associated with this node.
  // It returns nil if RetainComments was not specified during parsing,
  // or if AllocComments was not called.
  comments(): Comments | null;

  // AllocComments allocates a new Comments node if there was none.
  // This makes possible to add new comments using Comments() method.
  allocComments(): void;

  // start(): Position {
  // let start, _ = this.span();
  // return start;
  // }
}

export interface Stmt extends Node {
  // TODO: stmt()?
  stmt(): void;
}

export interface Expr extends Node {
  expr(): void;
}
