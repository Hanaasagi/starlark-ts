import { Position } from '../../tokenize';
import { CommentsRef } from '../comments';
import { Comments } from '../comments';
import { Expr } from '../interface';
import { Node } from '../interface';

// An Ident represents an identifier.
export class Ident implements Expr {
  private commentsRef: CommentsRef;

  public NamePos: Position;
  public Name: string;

  public Binding: any; // a *resolver.Binding, set by resolver

  constructor(
    NamePos: Position,
    Name: string,
    Binding: any | null // a *resolver.Binding, set by resolver
  ) {
    this.commentsRef = new CommentsRef();
    this.NamePos = NamePos;
    this.Name = Name;
    this.Binding = Binding;
  }

  public span(): [Position, Position] {
    return [this.NamePos, this.NamePos.add(this.Name)];
  }
  expr() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isIdent(n: Node): n is Ident {
  return n instanceof Ident;
}
