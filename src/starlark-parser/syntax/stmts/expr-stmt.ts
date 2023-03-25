import { Stmt } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "src/syntax/tokenize";
import { Token } from "src/syntax/tokenize";
import { Expr } from "../interface";
import { Comments } from "../comments";
import { Node } from "../interface";

export class ExprStmt implements Stmt {
  private commentsRef: CommentsRef;
  public X: Expr;

  constructor(X: Expr) {
    this.commentsRef = new CommentsRef();
    this.X = X;
  }

  public span(): [Position, Position] {
    return this.X.span();
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isExprStmt(n: Node): n is ExprStmt {
  return n instanceof ExprStmt;
}
