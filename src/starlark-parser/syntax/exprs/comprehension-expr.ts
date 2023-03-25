import { Position } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// A Comprehension represents a list or dict comprehension:
// [Body for ... if ...] or {Body for ... if ...}
export class Comprehension implements Expr {
  private commentsRef: CommentsRef;
  public Curly: boolean; // {x:y for ...} or {x for ...}, not [x for ...]
  public Lbrack: Position;
  public Body: Expr;
  public Clauses: Node[]; // = *ForClause | *IfClause
  public Rbrack: Position;

  constructor(
    Curly: boolean,
    Lbrack: Position,
    Body: Expr,
    Clauses: Node[],
    Rbrack: Position
  ) {
    this.commentsRef = new CommentsRef();
    this.Curly = Curly;
    this.Lbrack = Lbrack;
    this.Body = Body;
    this.Clauses = Clauses;
    this.Rbrack = Rbrack;
  }

  public span(): [Position, Position] {
    return [this.Lbrack, this.Rbrack.add(']')];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isComprehension(n: Node): n is Comprehension {
  return n instanceof Comprehension;
}
