import { Expr } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Comments } from "../comments";
import { Ident } from "./ident-expr";
import { Node } from "../interface";

// A DotExpr represents a field or method selector: X.Name.
export class DotExpr implements Expr {
  private commentsRef: CommentsRef;
  public X: Expr;
  public Dot: Position;
  public NamePos: Position | null;
  public Name: Ident;

  constructor(X: Expr, Dot: Position, NamePos: Position | null, Name: Ident) {
    this.commentsRef = new CommentsRef();
    this.X = X;
    this.Dot = Dot;
    this.NamePos = NamePos;
    this.Name = Name;
  }

  public span(): [Position, Position] {
    let start: Position, end: Position;
    [start] = this.X.span();
    [, end] = this.Name.span();
    return [start, end];
  }
  expr() { }
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isDotExpr(n: Node): n is DotExpr {
  return n instanceof DotExpr;
}
