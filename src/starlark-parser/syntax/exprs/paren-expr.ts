import { Position } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// A ParenExpr represents a parenthesized expression: (X).
export class ParenExpr implements Expr {
  private commentsRef: CommentsRef;
  private lparen: Position;
  public x: Expr;
  private rparen: Position;

  constructor(lparen: Position, x: Expr, rparen: Position) {
    this.commentsRef = new CommentsRef();
    this.lparen = lparen;
    this.x = x;
    this.rparen = rparen;
  }

  public span(): [Position, Position] {
    return [this.lparen, this.rparen.add(')')];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isParenExpr(n: Node): n is ParenExpr {
  return n instanceof ParenExpr;
}
