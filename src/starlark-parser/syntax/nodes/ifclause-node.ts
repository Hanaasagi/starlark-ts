import { Position } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Node } from '../interface';
import { Expr } from '../interface';

// TypeScript equivalent of IfClause
export class IfClause implements Node {
  private commentsRef: any;
  public If: Position;
  public Cond: Expr;

  constructor(If: Position, Cond: Expr) {
    this.commentsRef = new CommentsRef();
    this.If = If;
    this.Cond = Cond;
  }

  span(): [Position, Position] {
    const [, end] = this.Cond.span();
    return [this.If, end];
  }
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isIfClause(n: Node): n is IfClause {
  return n instanceof IfClause;
}
