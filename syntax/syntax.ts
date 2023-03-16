import { Position } from "./scan";
import { Token } from "./scan";

// A Node is a node in a Starlark syntax tree.
export interface Node {
  // Span returns the start and end position of the expression.
  span(): [Position, Position];

  // Comments returns the comments associated with this node.
  // It returns nil if RetainComments was not specified during parsing,
  // or if AllocComments was not called.
  comments(): Comments | null;

  // AllocComments allocates a new Comments node if there was none.
  // This makes possible to add new comments using Comments() method.
  allocComments(): void;

  // start(): Position {
  // let start, _ = this.span();
  // return start;
  // }
}

// A Comment represents a single # comment.
export class Comment {
  start: Position;
  text: string; // without trailing newline
  constructor(start: Position, text: string) {
    this.start = start;
    this.text = text;
  }
}

// Comments collects the comments associated with an expression.
export class Comments {
  // Whole-line comments before this expression.
  before: Comment[];

  // End-of-line comments after this expression (up to 1).
  suffix: Comment[];

  // For top-level expressions only, whole-line comments
  // following the expression.
  after: Comment[];

  constructor(before?: Comment[], suffix?: Comment[], after?: Comment[]) {
    this.before = before || new Array();
    this.suffix = suffix || new Array();
    this.after = after || new Array();
  }
}

// A commentsRef is a possibly-nil reference to a set of comments.
// A commentsRef is embedded in each type of syntax node,
// and provides its Comments and AllocComments methods.
export class CommentsRef {
  ref: Comments | null;
  constructor() {
    this.ref = null;
  }

  comments(): Comments | null {
    return this.ref;
  }

  allocComments() {
    if (this.ref == null) {
      this.ref = new Comments();
    }
  }
}

// A File represents a Starlark file.
class File {
  private commentsRef: any;
  public Path: string;
  public Stmts: Stmt[];
  public Module: any; // a *resolve.Module, set by resolver

  constructor(path: string, stmts: Stmt[], module: any) {
    this.commentsRef = undefined;
    this.Path = path;
    this.Stmts = stmts;
    this.Module = module;
  }

  public span(): [Position, Position] {
    if (this.Stmts.length === 0) {
      return [null, null];
    }
    const start = this.Stmts[0].span()[0];
    const end = this.Stmts[this.Stmts.length - 1].span()[1];
    return [start, end];
  }
}

export interface Stmt extends Node {
  // TODO: stmt()?
  stmt();
}

// An AssignStmt represents an assignment:
//	x = 0
//	x, y = y, x
// 	x += 1
class AssignStmt implements Stmt {
  // BUG:
  private commentsRef: CommentsRef;
  public OpPos: Position;
  public Op: Token; // = EQ | {PLUS,MINUS,STAR,PERCENT}_EQ
  public LHS: Expr;
  public RHS: Expr;

  constructor(opPos: Position, op: Token, lhs: Expr, rhs: Expr) {
    this.commentsRef = new CommentsRef();
    this.OpPos = opPos;
    this.Op = op;
    this.LHS = lhs;
    this.RHS = rhs;
  }

  public span(): [Position, Position] {
    const start = this.LHS.span()[0];
    const end = this.RHS.span()[1];
    return [start, end];
  }

  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

// A DefStmt represents a function definition.
class DefStmt implements Stmt {
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

export class ExprStmt implements Stmt {
  private commentsRef: CommentsRef;
  public X: Expr;

  constructor(X: Expr) {
    this.commentsRef = new CommentsRef();
    this.X = X;
  }

  public span(): [Position, Position] {
    return this.X.span();
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

// An IfStmt is a conditional: If Cond: True; else: False.
// 'elseif' is desugared into a chain of IfStmts.
class IfStmt implements Stmt {
  private commentsRef: CommentsRef;
  private ifPos: Position; // IF or ELIF
  private cond: Expr;
  private trueBody: Stmt[];
  private elsePos: Position; // ELSE or ELIF
  private falseBody: Stmt[]; // optional

  constructor(
    ifPos: Position,
    cond: Expr,
    trueBody: Stmt[],
    elsePos: Position,
    falseBody: Stmt[]
  ) {
    this.commentsRef = new CommentsRef();
    this.ifPos = ifPos;
    this.cond = cond;
    this.trueBody = trueBody;
    this.elsePos = elsePos;
    this.falseBody = falseBody;
  }

  span(): [start: Position, end: Position] {
    let body = this.falseBody;
    if (body == null) {
      body = this.trueBody;
    }
    const [_, end] = body[body.length - 1].span();
    return [this.ifPos, end];
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

// A LoadStmt loads another module and binds names from it:
// load(Module, "x", y="foo").
//
// The AST is slightly unfaithful to the concrete syntax here because
// Starlark's load statement, so that it can be implemented in Python,
// binds some names (like y above) with an identifier and some (like x)
// without. For consistency we create fake identifiers for all the
// strings.
class LoadStmt implements Stmt {
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
    return this.Module.Value as string;
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

// A BranchStmt changes the flow of control: break, continue, pass.
class BranchStmt implements Stmt {
  private commentsRef: CommentsRef;
  private token: Token; // = BREAK | CONTINUE | PASS
  private tokenPos: Position;

  constructor(token: Token, tokenPos: Position) {
    this.commentsRef = new CommentsRef();
    this.token = token;
    this.tokenPos = tokenPos;
  }

  public span(): [Position, Position] {
    return [this.tokenPos, this.tokenPos.add(this.token.toString())];
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

// A ReturnStmt returns from a function.
class ReturnStmt implements Stmt {
  private commentsRef: CommentsRef;
  public readonly Return: Position;
  public readonly Result?: Expr;

  constructor(Return: Position, Result?: Expr) {
    this.commentsRef = new CommentsRef();
    this.Return = Return;
    this.Result = Result;
  }

  public span(): [start: Position, end: Position] {
    if (!this.Result) {
      return [this.Return, this.Return.add("return")];
    }
    const [, end] = this.Result.span();
    return [this.Return, end];
  }
  stmt() {}
  public comments(): Comments | null {
    return this.commentsRef.comments();
  }
  public allocComments(): void {
    this.commentsRef.allocComments();
  }
}

interface Expr extends Node {}

// An Ident represents an identifier.
class Ident {
  private commentsRef: CommentsRef;

  public NamePos: Position;
  public Name: string;

  public Binding: any; // a *resolver.Binding, set by resolver

  constructor(
    NamePos: Position,
    Name: string,
    Binding: any // a *resolver.Binding, set by resolver
  ) {
    this.commentsRef = new CommentsRef();
    this.NamePos = NamePos;
    this.Name = Name;
    this.Binding = Binding;
  }

  public span(): [Position, Position] {
    return [this.NamePos, this.NamePos.add(this.Name)];
  }
}

// A Literal represents a literal string or number.
class Literal {
  private commentsRef: CommentsRef;
  public token: Token; // = STRING | BYTES | INT | FLOAT
  public tokenPos: Position;
  public raw: string; // uninterpreted text
  public value: string | number | bigint | number;

  constructor(
    token: Token,
    tokenPos: Position,
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
    return [this.tokenPos, this.tokenPos.add(this.raw)];
  }
}

// A ParenExpr represents a parenthesized expression: (X).
class ParenExpr {
  private commentsRef: CommentsRef;
  private lparen: Position;
  private x: Expr;
  private rparen: Position;

  constructor(lparen: Position, x: Expr, rparen: Position) {
    this.commentsRef = new CommentsRef();
    this.lparen = lparen;
    this.x = x;
    this.rparen = rparen;
  }

  public span(): [Position, Position] {
    return [this.lparen, this.rparen.add(")")];
  }
}

// A CallExpr represents a function call expression: Fn(Args).
class CallExpr {
  private commentsRef: CommentsRef;
  public Fn: Expr;
  public Lparen: Position;
  public Args: Expr[]; // arg = expr | ident=expr | *expr | **expr
  public Rparen: Position;

  constructor(Fn: Expr, Lparen: Position, Args: Expr[], Rparen: Position) {
    this.commentsRef = new CommentsRef();
    this.Fn = Fn;
    this.Lparen = Lparen;
    this.Args = Args;
    this.Rparen = Rparen;
  }

  public Span(): [Position, Position] {
    const [start, _] = this.Fn.span();
    return [start, this.Rparen.add(")")] as [Position, Position];
  }
}

// A DotExpr represents a field or method selector: X.Name.
class DotExpr {
  private commentsRef: CommentsRef;
  private X: Expr;
  private Dot: Position;
  private NamePos: Position;
  private Name: Ident;

  constructor(X: Expr, Dot: Position, NamePos: Position, Name: Ident) {
    this.commentsRef = new CommentsRef();
    this.X = X;
    this.Dot = Dot;
    this.NamePos = NamePos;
    this.Name = Name;
  }

  public Span(): [Position, Position] {
    let start: Position, end: Position;
    [start] = this.X.span();
    [, end] = this.Name.span();
    return [start, end];
  }
}

// A Comprehension represents a list or dict comprehension:
// [Body for ... if ...] or {Body for ... if ...}
class Comprehension {
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

  public Span(): [Position, Position] {
    return [this.Lbrack, this.Rbrack.add("]")];
  }
}

// A ForStmt represents a loop: for Vars in X: Body.
class ForStmt {
  private commentsRef: CommentsRef;
  public For: Position;
  public Vars: Expr; // name, or tuple of names
  public X: Expr;
  public Body: Stmt[];

  constructor(For: Position, Vars: Expr, X: Expr, Body: Stmt[]) {
    this.commentsRef = new CommentsRef();
    this.For = For;
    this.Vars = Vars;
    this.X = X;
    this.Body = Body;
  }

  public Span(): [Position, Position] {
    const [, end] = this.Body[this.Body.length - 1].span();
    return [this.For, end];
  }
}

// A WhileStmt represents a while loop: while X: Body.
class WhileStmt {
  private commentsRef: CommentsRef;
  public While: Position;
  public Cond: Expr;
  public Body: Stmt[];

  constructor(While: Position, Cond: Expr, Body: Stmt[]) {
    this.commentsRef = new CommentsRef();
    this.While = While;
    this.Cond = Cond;
    this.Body = Body;
  }

  public Span(): [start: Position, end: Position] {
    const [, end] = this.Body[this.Body.length - 1].span();
    return [this.While, end];
  }
}

// A ForClause represents a for clause in a list comprehension: for Vars in X.
class ForClause {
  private commentsRef: CommentsRef;
  public forPos: Position;
  public vars: Expr;
  public inPos: Position;
  public x: Expr;

  constructor(forPos: Position, vars: Expr, inPos: Position, x: Expr) {
    this.commentsRef = new CommentsRef();
    this.forPos = forPos;
    this.vars = vars;
    this.inPos = inPos;
    this.x = x;
  }

  public Span(): [Position, Position] {
    let [_, end] = this.x.span();
    return [this.forPos, end];
  }
}

// TypeScript equivalent of IfClause
class IfClause {
  private commentsRef: any;
  public If: Position;
  public Cond: Expr;

  constructor(If: Position, Cond: Expr) {
    this.commentsRef = new CommentsRef();
    this.If = If;
    this.Cond = Cond;
  }

  span(): [Position, Position] {
    const [, end] = this.Cond.span();
    return [this.If, end];
  }
}

// A DictExpr represents a dictionary literal: { List }.
class DictExpr {
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

  Span(): [Position, Position] {
    return [this.Lbrace, this.Rbrace.add("}")];
  }
}

// A DictEntry represents a dictionary entry: Key: Value.
// Used only within a DictExpr.
class DictEntry {
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

  Span(): [Position, Position] {
    let [start] = this.Key.span();
    let [, end] = this.Value.span();
    return [start, end];
  }
}

// A LambdaExpr represents an inline function abstraction.
class LambdaExpr {
  private lambda: Position;
  private params: Expr[]; // param = ident | ident=expr | * | *ident | **ident
  private body: Expr;
  private _function: any; // a *resolve.Function, set by resolver

  constructor(lambda: Position, params: Expr[], body: Expr) {
    this.lambda = lambda;
    this.params = params;
    this.body = body;
  }

  public Span(): [Position, Position] {
    const [, end] = this.body.span();
    return [this.lambda, end];
  }
}

// A ListExpr represents a list literal: [ List ].
class ListExpr {
  private lbrack: Position;
  private list: Expr[];
  private rbrack: Position;

  constructor(lbrack: Position, list: Expr[], rbrack: Position) {
    this.lbrack = lbrack;
    this.list = list;
    this.rbrack = rbrack;
  }

  public Span(): [Position, Position] {
    return [this.lbrack, this.rbrack.add("]")];
  }
}

// CondExpr represents the conditional: X if COND else ELSE.
class CondExpr {
  private commentsRef: CommentsRef;
  private If: Position;
  private Cond: Expr;
  private True: Expr;
  private ElsePos: any;
  private False: Expr;

  constructor(
    commentsRef: any,
    If: any,
    Cond: Expr,
    True: Expr,
    ElsePos: any,
    False: Expr
  ) {
    this.commentsRef = new CommentsRef();
    this.If = If;
    this.Cond = Cond;
    this.True = True;
    this.ElsePos = ElsePos;
    this.False = False;
  }

  public Span(): [start: Position, end: Position] {
    const [startTrue, endTrue] = this.True.span();
    const [startFalse, endFalse] = this.False.span();
    return [startTrue, endFalse];
  }
}

// A TupleExpr represents a tuple literal: (List).
class TupleExpr {
  private commentsRef: CommentsRef;
  private Lparen: Position; // optional (e.g. in x, y = 0, 1), but required if List is empty
  private List: Expr[];
  private Rparen: Position;

  constructor(
    commentsRef: any,
    Lparen: Position,
    List: Expr[],
    Rparen: Position
  ) {
    this.commentsRef = new CommentsRef();
    this.Lparen = Lparen;
    this.List = List;
    this.Rparen = Rparen;
  }

  public Span(): [start: Position, end: Position] {
    if (this.Lparen.isValid()) {
      return [this.Lparen, this.Rparen];
    } else {
      return [
        this.List[0].span()[0],
        this.List[this.List.length - 1].span()[1],
      ];
    }
  }
}

// A UnaryExpr represents a unary expression: Op X.
//
// As a special case, UnaryOp{Op:Star} may also represent
// the star parameter in def f(...args: any[]) or def f(...: any[]).
class UnaryExpr {
  commentsRef: CommentsRef;
  OpPos: Position;
  Op: Token;
  X: Expr | null;

  constructor(commentsRef: any, OpPos: Position, Op: Token, X: Expr | null) {
    this.commentsRef = new CommentsRef();
    this.OpPos = OpPos;
    this.Op = Op;
    this.X = X;
  }

  Span(): [start: Position, end: Position] {
    if (this.X !== null) {
      const [, end] = this.X.span();
      return [this.OpPos, end];
    } else {
      const end = this.OpPos.add("*");
      return [this.OpPos, end];
    }
  }
}

// A BinaryExpr represents a binary expression: X Op Y.
//
// As a special case, BinaryExpr{Op:EQ} may also
// represent a named argument in a call f(k=v)
// or a named parameter in a function declaration
// def f(param=default).
class BinaryExpr {
  private X: Expr;
  private OpPos: Position;
  private Op: Token;
  private Y: Expr;

  constructor(X: Expr, OpPos: Position, Op: Token, Y: Expr) {
    this.X = X;
    this.OpPos = OpPos;
    this.Op = Op;
    this.Y = Y;
  }

  public Span(): [start: Position, end: Position] {
    const [start] = this.X.span();
    const [, end] = this.Y.span();
    return [start, end];
  }
}

// A SliceExpr represents a slice or substring expression: X[Lo:Hi:Step].
class SliceExpr {
  commentsRef: any;
  X: Expr;
  Lbrack: Position;
  Lo: Expr | null;
  Hi: Expr | null;
  Step: Expr | null;
  Rbrack: Position;

  constructor(
    X: Expr,
    Lbrack: Position,
    Lo: Expr | null,
    Hi: Expr | null,
    Step: Expr | null,
    Rbrack: Position
  ) {
    this.commentsRef = new CommentsRef();
    this.X = X;
    this.Lbrack = Lbrack;
    this.Lo = Lo;
    this.Hi = Hi;
    this.Step = Step;
    this.Rbrack = Rbrack;
  }

  Span(): [start: Position, end: Position] {
    const [start, _] = this.X.span();
    return [start, this.Rbrack];
  }
}

// An IndexExpr represents an index expression: X[Y].
class IndexExpr {
  commentsRef: CommentsRef;
  X: Expr;
  Lbrack: Position;
  Y: Expr;
  Rbrack: Position;

  constructor(X: Expr, Lbrack: Position, Y: Expr, Rbrack: Position) {
    this.commentsRef = new CommentsRef();
    this.X = X;
    this.Lbrack = Lbrack;
    this.Y = Y;
    this.Rbrack = Rbrack;
  }

  Span(): [start: Position, end: Position] {
    const [start, _] = this.X.span();
    return [start, this.Rbrack];
  }
}