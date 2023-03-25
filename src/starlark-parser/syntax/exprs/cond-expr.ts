import { Expr } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Comments } from "../comments";
import { Node } from "../interface";

// CondExpr represents the conditional: X if COND else ELSE.
export class CondExpr implements Expr {
  private commentsRef: CommentsRef;
  private If: Position;
  public Cond: Expr;
  public True: Expr;
  private ElsePos: any;
  public False: Expr;

  constructor(If: any, Cond: Expr, True: Expr, ElsePos: any, False: Expr) {
    this.commentsRef = new CommentsRef();
    this.If = If;
    this.Cond = Cond;
    this.True = True;
    this.ElsePos = ElsePos;
    this.False = False;
  }

  public span(): [start: Position, end: Position] {
    const [startTrue, endTrue] = this.True.span();
    const [startFalse, endFalse] = this.False.span();
    return [startTrue, endFalse];
  }
  expr() { }
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isCondExpr(n: Node): n is CondExpr {
  return n instanceof CondExpr;
}
