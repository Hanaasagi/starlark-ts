import { Position } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Ident } from '../exprs';
import { Stmt } from '../interface';
import { Expr } from '../interface';
import { Node } from '../interface';

// A DefStmt represents a function definition.
export class DefStmt implements Stmt {
  commentsRef: any;
  Def: Position;
  Name: Ident;
  Params: Expr[];
  Body: Stmt[];
  Function: any; // a *resolve.Function, set by resolver

  constructor(Def: Position, Name: Ident, Params: Expr[], Body: Stmt[]) {
    this.commentsRef = new CommentsRef();
    this.Def = Def;
    this.Name = Name;
    this.Params = Params;
    this.Body = Body;
  }
  span(): [start: Position, end: Position] {
    const [_, end] = this.Body[this.Body.length - 1].span();
    return [this.Def, end];
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isDefStmt(n: Node): n is DefStmt {
  return n instanceof DefStmt;
}
