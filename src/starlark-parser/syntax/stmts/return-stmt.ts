import { Position } from '../../tokenize';
import { Token } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Stmt } from '../interface';
import { Expr } from '../interface';
import { Node } from '../interface';

// A ReturnStmt returns from a function.
export class ReturnStmt implements Stmt {
  private commentsRef: CommentsRef;
  public readonly Return: Position | null;
  public readonly Result?: Expr;

  constructor(Return: Position | null, Result?: Expr) {
    this.commentsRef = new CommentsRef();
    this.Return = Return;
    this.Result = Result;
  }

  public span(): [start: Position, end: Position] {
    if (!this.Result) {
      return [this.Return!, this.Return!.add('return')];
    }
    const [, end] = this.Result!.span();
    return [this.Return!, end];
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isReturnStmt(n: Node): n is ReturnStmt {
  return n instanceof ReturnStmt;
}
