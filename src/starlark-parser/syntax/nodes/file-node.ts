import { Position } from '../../tokenize';
import { Comments } from '../comments';
import { Node } from '../interface';
import { Stmt } from '../interface';

// A File represents a Starlark file.
export class File implements Node {
  private commentsRef: any;
  public Path: string;
  public Stmts: Stmt[];
  public Module: any; // a *resolve.Module, set by resolver

  constructor(path: string = '', stmts: Stmt[], module: any | null) {
    this.commentsRef = undefined;
    this.Path = path;
    this.Stmts = stmts;
    this.Module = module;
  }

  public span(): [Position, Position] {
    // asserts(this.Stmts.length != 0);
    // if (this.Stmts.length === 0) {
    //   return [null, null];
    // }
    const start = this.Stmts[0].span()[0];
    const end = this.Stmts[this.Stmts.length - 1].span()[1];
    return [start, end];
  }

  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

export function isFile(n: Node): n is File {
  return n instanceof File;
}
