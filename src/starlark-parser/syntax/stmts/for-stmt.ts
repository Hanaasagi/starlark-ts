import { Stmt } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Expr } from "../interface";
import { Comments } from "../comments";
import { Node } from "../interface";

// A ForStmt represents a loop: for Vars in X: Body.
export class ForStmt implements Stmt {
  private commentsRef: CommentsRef;
  public For: Position;
  public Vars: Expr; // name, or tuple of names
  public X: Expr;
  public Body: Stmt[];

  constructor(For: Position, Vars: Expr, X: Expr, Body: Stmt[]) {
    this.commentsRef = new CommentsRef();
    this.For = For;
    this.Vars = Vars;
    this.X = X;
    this.Body = Body;
  }

  public span(): [Position, Position] {
    const [, end] = this.Body[this.Body.length - 1].span();
    return [this.For, end];
  }

  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isForStmt(n: Node): n is ForStmt {
  return n instanceof ForStmt;
}
