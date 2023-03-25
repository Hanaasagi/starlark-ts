import { Expr } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Comments } from "../comments";
import { Node } from "../interface";

// A SliceExpr represents a slice or substring expression: X[Lo:Hi:Step].
export class SliceExpr implements Expr {
  commentsRef: any;
  X: Expr;
  Lbrack: Position;
  Lo: Expr | null;
  Hi: Expr | null;
  Step: Expr | null;
  Rbrack: Position;

  constructor(
    X: Expr,
    Lbrack: Position,
    Lo: Expr | null,
    Hi: Expr | null,
    Step: Expr | null,
    Rbrack: Position
  ) {
    this.commentsRef = new CommentsRef();
    this.X = X;
    this.Lbrack = Lbrack;
    this.Lo = Lo;
    this.Hi = Hi;
    this.Step = Step;
    this.Rbrack = Rbrack;
  }

  span(): [start: Position, end: Position] {
    const [start, _] = this.X.span();
    return [start, this.Rbrack];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isSliceExpr(n: Node): n is SliceExpr {
  return n instanceof SliceExpr;
}
