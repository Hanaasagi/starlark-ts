import { Stmt } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "src/syntax/tokenize";
import { Expr } from "../interface";
import { Node } from "../interface";
import { Comments } from "../comments";

// An IfStmt is a conditional: If Cond: True; else: False.
// 'elseif' is desugared into a chain of IfStmts.
export class IfStmt implements Stmt {
  private commentsRef: CommentsRef;
  public ifPos: Position; // IF or ELIF
  public cond: Expr;
  public trueBody: Stmt[];
  public elsePos: Position | null; // ELSE or ELIF
  public falseBody: Stmt[]; // optional

  constructor(
    ifPos: Position,
    cond: Expr,
    trueBody: Stmt[],
    elsePos: Position | null,
    falseBody: Stmt[]
  ) {
    this.commentsRef = new CommentsRef();
    this.ifPos = ifPos;
    this.cond = cond;
    this.trueBody = trueBody;
    this.elsePos = elsePos;
    this.falseBody = falseBody;
  }

  span(): [start: Position, end: Position] {
    let body = this.falseBody;
    if (body == null || body.length == 0) {
      body = this.trueBody;
    }
    const [_, end] = body[body.length - 1].span();
    return [this.ifPos, end];
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isIfStmt(n: Node): n is IfStmt {
  return n instanceof IfStmt;
}
