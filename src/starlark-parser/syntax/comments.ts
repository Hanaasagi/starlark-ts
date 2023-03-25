import { Comment } from '../tokenize';

// Comments collects the comments associated with an expression.
export class Comments {
  // Whole-line comments before this expression.
  before: Comment[];

  // End-of-line comments after this expression (up to 1).
  suffix: Comment[];

  // For top-level expressions only, whole-line comments
  // following the expression.
  after: Comment[];

  constructor(before?: Comment[], suffix?: Comment[], after?: Comment[]) {
    this.before = before || new Array();
    this.suffix = suffix || new Array();
    this.after = after || new Array();
  }
}

// A commentsRef is a possibly-nil reference to a set of comments.
// A commentsRef is embedded in each type of syntax node,
// and provides its Comments and AllocComments methods.
export class CommentsRef {
  ref: Comments | null;
  constructor() {
    this.ref = null;
  }

  comments(): Comments | null {
    return this.ref;
  }

  allocComments() {
    if (this.ref == null) {
      this.ref = new Comments();
    }
  }
}
