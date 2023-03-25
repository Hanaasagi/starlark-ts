import { Position } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// An IndexExpr represents an index expression: X[Y].
export class IndexExpr implements Expr {
  commentsRef: CommentsRef;
  X: Expr;
  Lbrack: Position;
  Y: Expr;
  Rbrack: Position;

  constructor(X: Expr, Lbrack: Position, Y: Expr, Rbrack: Position) {
    this.commentsRef = new CommentsRef();
    this.X = X;
    this.Lbrack = Lbrack;
    this.Y = Y;
    this.Rbrack = Rbrack;
  }

  span(): [start: Position, end: Position] {
    const [start, _] = this.X.span();
    return [start, this.Rbrack];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isIndexExpr(n: Node): n is IndexExpr {
  return n instanceof IndexExpr;
}
