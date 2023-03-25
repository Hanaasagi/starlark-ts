import { Position } from '../../tokenize';
import { Token } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// A Literal represents a literal string or number.
export class Literal implements Expr {
  private commentsRef: CommentsRef;
  public token: Token; // = STRING | BYTES | INT | FLOAT
  public tokenPos: Position | null;
  public raw: string; // uninterpreted text
  public value: string | number | bigint | number;

  constructor(
    token: Token,
    tokenPos: Position | null,
    raw: string,
    value: string | number | bigint | number
  ) {
    this.commentsRef = new CommentsRef();
    this.token = token;
    this.tokenPos = tokenPos;
    this.raw = raw;
    this.value = value;
  }

  public span(): [start: Position, end: Position] {
    return [this.tokenPos!, this.tokenPos!.add(this.raw)];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isLiteral(n: Node): n is Literal {
  return n instanceof Literal;
}
