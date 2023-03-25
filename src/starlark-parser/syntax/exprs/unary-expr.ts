import { Position } from '../../tokenize';
import { Token } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// A UnaryExpr represents a unary expression: Op X.
//
// As a special case, UnaryOp{Op:Star} may also represent
// the star parameter in def f(...args: any[]) or def f(...: any[]).
export class UnaryExpr implements Expr {
  commentsRef: CommentsRef;
  OpPos: Position;
  Op: Token;
  X: Expr | null;

  constructor(OpPos: Position, Op: Token, X: Expr | null) {
    this.commentsRef = new CommentsRef();
    this.OpPos = OpPos;
    this.Op = Op;
    this.X = X;
  }

  span(): [start: Position, end: Position] {
    if (this.X !== null) {
      const [, end] = this.X.span();
      return [this.OpPos, end];
    } else {
      const end = this.OpPos.add('*');
      return [this.OpPos, end];
    }
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isUnaryExpr(n: Node): n is UnaryExpr {
  return n instanceof UnaryExpr;
}
