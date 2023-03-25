import { Expr } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Comments } from "../comments";
import { Node } from "../interface";

// A CallExpr represents a function call expression: Fn(Args).
export class CallExpr implements Expr {
  private commentsRef: CommentsRef;
  public Fn: Expr;
  public Lparen: Position;
  public Args: Expr[]; // arg = expr | ident=expr | *expr | **expr
  public Rparen: Position;

  constructor(Fn: Expr, Lparen: Position, Args: Expr[], Rparen: Position) {
    this.commentsRef = new CommentsRef();
    this.Fn = Fn;
    this.Lparen = Lparen;
    this.Args = Args;
    this.Rparen = Rparen;
  }

  public span(): [Position, Position] {
    const [start, _] = this.Fn.span();
    return [start, this.Rparen.add(")")] as [Position, Position];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isCallExpr(n: Node): n is CallExpr {
  return n instanceof CallExpr;
}
