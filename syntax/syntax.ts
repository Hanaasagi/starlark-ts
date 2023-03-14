import { Position } from "./scan";

// A Node is a node in a Starlark syntax tree.
export interface Node {
  span(): [Position, Position];
  comments(): Comments | null;
  allocComments(): void;

  start(): Position {
  let start, _ = this.span();
  return start;
}
}

// A Comment represents a single # comment.
class Comment {
  start: Position;
  text: string; // without trailing newline
  constructor(start: Position, text: string) {
    this.start = start;
    this.text = text;
  }
}

// Comments collects the comments associated with an expression.
class Comments {
  // Whole-line comments before this expression.
  before: Comment[];

  // End-of-line comments after this expression (up to 1).
  suffix: Comment[];

  // For top-level expressions only, whole-line comments
  // following the expression.
  after: Comment[];
}

// TODO: commentsRef
