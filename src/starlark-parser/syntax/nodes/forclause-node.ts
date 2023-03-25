import { Node } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Expr } from "../interface";
import { Comments } from "../comments";

// A ForClause represents a for clause in a list comprehension: for Vars in X.
export class ForClause implements Node {
  private commentsRef: CommentsRef;
  public forPos: Position;
  public vars: Expr;
  public inPos: Position;
  public x: Expr;

  constructor(forPos: Position, vars: Expr, inPos: Position, x: Expr) {
    this.commentsRef = new CommentsRef();
    this.forPos = forPos;
    this.vars = vars;
    this.inPos = inPos;
    this.x = x;
  }

  public span(): [Position, Position] {
    let [_, end] = this.x.span();
    return [this.forPos, end];
  }

  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isForClause(n: Node): n is ForClause {
  return n instanceof ForClause;
}
