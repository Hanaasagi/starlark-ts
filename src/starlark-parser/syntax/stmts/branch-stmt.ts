import { Stmt } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Token } from "../../tokenize";
import { Comments } from "../comments";
import { Node } from "../interface";

// A BranchStmt changes the flow of control: break, continue, pass.
export class BranchStmt implements Stmt {
  private commentsRef: CommentsRef;
  token: Token; // = BREAK | CONTINUE | PASS
  tokenPos: Position;

  constructor(token: Token, tokenPos: Position) {
    this.commentsRef = new CommentsRef();
    this.token = token;
    this.tokenPos = tokenPos;
  }

  public span(): [Position, Position] {
    return [this.tokenPos, this.tokenPos.add(this.token.toString())];
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isBranchStmt(n: Node): n is BranchStmt {
  return n instanceof BranchStmt;
}
