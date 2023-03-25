import { Position } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// A ListExpr represents a list literal: [ List ].
export class ListExpr implements Expr {
  private commentsRef: CommentsRef;
  private lbrack: Position | null;
  public list: Expr[];
  private rbrack: Position | null;

  constructor(lbrack: Position | null, list: Expr[], rbrack: Position | null) {
    this.lbrack = lbrack;
    this.list = list;
    this.rbrack = rbrack;
    this.commentsRef = new CommentsRef();
  }

  public span(): [Position, Position] {
    return [this.lbrack!, this.rbrack!.add(']')];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isListExpr(n: Node): n is ListExpr {
  return n instanceof ListExpr;
}
