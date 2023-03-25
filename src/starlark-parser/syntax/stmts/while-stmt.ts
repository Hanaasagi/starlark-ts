import { Stmt } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "src/syntax/tokenize";
import { Expr } from "../interface";
import { Comments } from "../comments";
import { Node } from "../interface";

// A WhileStmt represents a while loop: while X: Body.
export class WhileStmt implements Stmt {
  private commentsRef: CommentsRef;
  public While: Position;
  public Cond: Expr;
  public Body: Stmt[];

  constructor(While: Position, Cond: Expr, Body: Stmt[]) {
    this.commentsRef = new CommentsRef();
    this.While = While;
    this.Cond = Cond;
    this.Body = Body;
  }

  public span(): [start: Position, end: Position] {
    const [, end] = this.Body[this.Body.length - 1].span();
    return [this.While, end];
  }
  stmt() { }
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isWhileStmt(n: Node): n is WhileStmt {
  return n instanceof WhileStmt;
}
