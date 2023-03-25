import { Position } from '../../tokenize';
import { Token } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// A BinaryExpr represents a binary expression: X Op Y.
//
// As a special case, BinaryExpr{Op:EQ} may also
// represent a named argument in a call f(k=v)
// or a named parameter in a function declaration
// def f(param=default).
export class BinaryExpr implements Expr {
  private commentsRef: CommentsRef;
  public X: Expr;
  public OpPos: Position;
  public Op: Token;
  public Y: Expr;

  constructor(X: Expr, OpPos: Position, Op: Token, Y: Expr) {
    this.commentsRef = new CommentsRef();
    this.X = X;
    this.OpPos = OpPos;
    this.Op = Op;
    this.Y = Y;
  }

  public span(): [start: Position, end: Position] {
    const [start] = this.X.span();
    const [, end] = this.Y.span();
    return [start, end];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isBinaryExpr(n: Node): n is BinaryExpr {
  return n instanceof BinaryExpr;
}
