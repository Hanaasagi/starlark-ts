import { Expr } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Comments } from "../comments";
import { Node } from "../interface";

// A LambdaExpr represents an inline function abstraction.
export class LambdaExpr implements Expr {
  private commentsRef: CommentsRef;
  public lambda: Position;
  public params: Expr[]; // param = ident | ident=expr | * | *ident | **ident
  public body: Expr;
  public _function: any; // a *resolve.Function, set by resolver

  constructor(lambda: Position, params: Expr[], body: Expr) {
    this.lambda = lambda;
    this.params = params;
    this.body = body;
    this.commentsRef = new CommentsRef();
  }

  public span(): [Position, Position] {
    const [, end] = this.body.span();
    return [this.lambda, end];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isLambdaExpr(n: Node): n is LambdaExpr {
  return n instanceof LambdaExpr;
}
