import { Position } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// A TupleExpr represents a tuple literal: (List).
export class TupleExpr implements Expr {
  private commentsRef: CommentsRef;
  private Lparen: Position | null; // optional (e.g. in x, y = 0, 1), but required if List is empty
  public List: Expr[];
  private Rparen: Position | null;

  constructor(List: Expr[], Lparen: Position | null, Rparen: Position | null) {
    this.commentsRef = new CommentsRef();
    this.Lparen = Lparen;
    this.List = List;
    this.Rparen = Rparen;
  }

  public span(): [Position, Position] {
    if (this.Lparen?.isValid()) {
      return [this.Lparen!, this.Rparen!];
    } else {
      return [
        this.List[0].span()[0],
        this.List[this.List.length - 1].span()[1],
      ];
    }
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isTupleExpr(n: Node): n is TupleExpr {
  return n instanceof TupleExpr;
}
