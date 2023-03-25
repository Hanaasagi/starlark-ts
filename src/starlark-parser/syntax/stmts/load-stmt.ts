import { Stmt } from "../interface";
import { CommentsRef } from "../comments";
import { Position } from "src/syntax/tokenize";
import { Token } from "src/syntax/tokenize";
import { Expr } from "../interface";
import { Comments } from "../comments";
import { Ident } from "../exprs";
import { Literal } from "../exprs";
import { Node } from "../interface";

// A LoadStmt loads another module and binds names from it:
// load(Module, "x", y="foo").
//
// The AST is slightly unfaithful to the concrete syntax here because
// Starlark's load statement, so that it can be implemented in Python,
// binds some names (like y above) with an identifier and some (like x)
// without. For consistency we create fake identifiers for all the
// strings.
export class LoadStmt implements Stmt {
  private commentsRef: CommentsRef;
  Load: Position;
  Module: Literal; // a string
  From: Ident[]; // name defined in loading module
  To: Ident[]; // name in loaded module
  Rparen: Position;
  constructor(
    load: Position,
    module: Literal,
    from: Ident[],
    to: Ident[],
    rparen: Position
  ) {
    this.commentsRef = new CommentsRef();
    this.Load = load;
    this.Module = module;
    this.From = from;
    this.To = to;
    this.Rparen = rparen;
  }
  span(): [Position, Position] {
    return [this.Load, this.Rparen];
  }
  // ModuleName returns the name of the module loaded by this statement.
  ModuleName(): string {
    return this.Module.value as string;
  }
  stmt() { }
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}
export function isLoadStmt(n: Node): n is LoadStmt {
  return n instanceof LoadStmt;
}
