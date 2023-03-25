import { Expr } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "../../tokenize";
import { Comments } from "../comments";
import { Node } from "../interface";

// A DictExpr represents a dictionary literal: { List }.
export class DictExpr implements Expr {
  commentsRef: CommentsRef;
  Lbrace: Position;
  List: DictEntry[]; // all DictEntrys
  Rbrace: Position;

  constructor(Lbrace: Position, List: DictEntry[], Rbrace: Position) {
    this.commentsRef = new CommentsRef();
    this.Lbrace = Lbrace;
    this.List = List;
    this.Rbrace = Rbrace;
  }

  span(): [Position, Position] {
    return [this.Lbrace, this.Rbrace.add("}")];
  }
  expr() { }
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

// A DictEntry represents a dictionary entry: Key: Value.
// Used only within a DictExpr.
export class DictEntry implements Expr {
  commentsRef: CommentsRef;
  Key: Expr;
  Colon: Position;
  Value: Expr;

  constructor(Key: Expr, Colon: Position, Value: Expr) {
    this.commentsRef = new CommentsRef();
    this.Key = Key;
    this.Colon = Colon;
    this.Value = Value;
  }

  span(): [Position, Position] {
    let [start] = this.Key.span();
    let [, end] = this.Value.span();
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
export function isDictEntry(n: Node): n is DictEntry {
  return n instanceof DictEntry;
}

export function isDictExpr(n: Node): n is DictExpr {
  return n instanceof DictExpr;
}
