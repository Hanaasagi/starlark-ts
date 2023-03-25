import { Stmt } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Token } from "../../tokenize";
import { Expr } from "../interface";
import { Comments } from "../comments";
import { Node } from "../interface";

// An AssignStmt represents an assignment:
//	x = 0
//	x, y = y, x
// 	x += 1
export class AssignStmt implements Stmt {
  // BUG:
  private commentsRef: CommentsRef;
  public OpPos: Position;
  public Op: Token; // = EQ | {PLUS,MINUS,STAR,PERCENT}_EQ
  public LHS: Expr;
  public RHS: Expr;

  constructor(opPos: Position, op: Token, lhs: Expr, rhs: Expr) {
    this.commentsRef = new CommentsRef();
    this.OpPos = opPos;
    this.Op = op;
    this.LHS = lhs;
    this.RHS = rhs;
  }

  public span(): [Position, Position] {
    const start = this.LHS.span()[0];
    const end = this.RHS.span()[1];
    return [start, end];
  }

  stmt() { }
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isAssignStmt(n: Node): n is AssignStmt {
  return n instanceof AssignStmt;
}
