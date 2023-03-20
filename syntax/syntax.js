"use strict";
exports.__esModule = true;
exports.isIfClause = exports.isComprehension = exports.isSliceExpr = exports.isDictEntry = exports.isIndexExpr = exports.isCondExpr = exports.isParenExpr = exports.isListExpr = exports.isLiteral = exports.isIdent = exports.isLoadStmt = exports.isReturnStmt = exports.isForStmt = exports.isDefStmt = exports.isAssignStmt = exports.isIfStmt = exports.isBranchStmt = exports.isExprStmt = exports.isFile = exports.IndexExpr = exports.SliceExpr = exports.BinaryExpr = exports.UnaryExpr = exports.TupleExpr = exports.CondExpr = exports.ListExpr = exports.LambdaExpr = exports.DictEntry = exports.DictExpr = exports.IfClause = exports.ForClause = exports.WhileStmt = exports.ForStmt = exports.Comprehension = exports.DotExpr = exports.CallExpr = exports.ParenExpr = exports.Literal = exports.Ident = exports.ReturnStmt = exports.BranchStmt = exports.LoadStmt = exports.IfStmt = exports.ExprStmt = exports.DefStmt = exports.AssignStmt = exports.File = exports.CommentsRef = exports.Comments = exports.Comment = void 0;
exports.isLambdaExpr = exports.isCallExpr = exports.isDotExpr = exports.isBinaryExpr = exports.isUnaryExpr = exports.isDictExpr = exports.isTupleExpr = exports.isForClause = void 0;
// A Comment represents a single # comment.
var Comment = /** @class */ (function () {
    function Comment(start, text) {
        this.start = start;
        this.text = text;
    }
    return Comment;
}());
exports.Comment = Comment;
// Comments collects the comments associated with an expression.
var Comments = /** @class */ (function () {
    function Comments(before, suffix, after) {
        this.before = before || new Array();
        this.suffix = suffix || new Array();
        this.after = after || new Array();
    }
    return Comments;
}());
exports.Comments = Comments;
// A commentsRef is a possibly-nil reference to a set of comments.
// A commentsRef is embedded in each type of syntax node,
// and provides its Comments and AllocComments methods.
var CommentsRef = /** @class */ (function () {
    function CommentsRef() {
        this.ref = null;
    }
    CommentsRef.prototype.comments = function () {
        return this.ref;
    };
    CommentsRef.prototype.allocComments = function () {
        if (this.ref == null) {
            this.ref = new Comments();
        }
    };
    return CommentsRef;
}());
exports.CommentsRef = CommentsRef;
// A File represents a Starlark file.
var File = /** @class */ (function () {
    function File(path, stmts, module) {
        if (path === void 0) { path = ""; }
        this.commentsRef = undefined;
        this.Path = path;
        this.Stmts = stmts;
        this.Module = module;
    }
    File.prototype.span = function () {
        // asserts(this.Stmts.length != 0);
        // if (this.Stmts.length === 0) {
        //   return [null, null];
        // }
        var start = this.Stmts[0].span()[0];
        var end = this.Stmts[this.Stmts.length - 1].span()[1];
        return [start, end];
    };
    File.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    File.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return File;
}());
exports.File = File;
// An AssignStmt represents an assignment:
//	x = 0
//	x, y = y, x
// 	x += 1
var AssignStmt = /** @class */ (function () {
    function AssignStmt(opPos, op, lhs, rhs) {
        this.commentsRef = new CommentsRef();
        this.OpPos = opPos;
        this.Op = op;
        this.LHS = lhs;
        this.RHS = rhs;
    }
    AssignStmt.prototype.span = function () {
        var start = this.LHS.span()[0];
        var end = this.RHS.span()[1];
        return [start, end];
    };
    AssignStmt.prototype.stmt = function () { };
    AssignStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    AssignStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return AssignStmt;
}());
exports.AssignStmt = AssignStmt;
// A DefStmt represents a function definition.
var DefStmt = /** @class */ (function () {
    function DefStmt(Def, Name, Params, Body) {
        this.commentsRef = new CommentsRef();
        this.Def = Def;
        this.Name = Name;
        this.Params = Params;
        this.Body = Body;
    }
    DefStmt.prototype.span = function () {
        var _a = this.Body[this.Body.length - 1].span(), _ = _a[0], end = _a[1];
        return [this.Def, end];
    };
    DefStmt.prototype.stmt = function () { };
    DefStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    DefStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return DefStmt;
}());
exports.DefStmt = DefStmt;
var ExprStmt = /** @class */ (function () {
    function ExprStmt(X) {
        this.commentsRef = new CommentsRef();
        this.X = X;
    }
    ExprStmt.prototype.span = function () {
        return this.X.span();
    };
    ExprStmt.prototype.stmt = function () { };
    ExprStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    ExprStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return ExprStmt;
}());
exports.ExprStmt = ExprStmt;
// An IfStmt is a conditional: If Cond: True; else: False.
// 'elseif' is desugared into a chain of IfStmts.
var IfStmt = /** @class */ (function () {
    function IfStmt(ifPos, cond, trueBody, elsePos, falseBody) {
        this.commentsRef = new CommentsRef();
        this.ifPos = ifPos;
        this.cond = cond;
        this.trueBody = trueBody;
        this.elsePos = elsePos;
        this.falseBody = falseBody;
    }
    IfStmt.prototype.span = function () {
        var body = this.falseBody;
        if (body == null) {
            body = this.trueBody;
        }
        var _a = body[body.length - 1].span(), _ = _a[0], end = _a[1];
        return [this.ifPos, end];
    };
    IfStmt.prototype.stmt = function () { };
    IfStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    IfStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return IfStmt;
}());
exports.IfStmt = IfStmt;
// A LoadStmt loads another module and binds names from it:
// load(Module, "x", y="foo").
//
// The AST is slightly unfaithful to the concrete syntax here because
// Starlark's load statement, so that it can be implemented in Python,
// binds some names (like y above) with an identifier and some (like x)
// without. For consistency we create fake identifiers for all the
// strings.
var LoadStmt = /** @class */ (function () {
    function LoadStmt(load, module, from, to, rparen) {
        this.commentsRef = new CommentsRef();
        this.Load = load;
        this.Module = module;
        this.From = from;
        this.To = to;
        this.Rparen = rparen;
    }
    LoadStmt.prototype.span = function () {
        return [this.Load, this.Rparen];
    };
    // ModuleName returns the name of the module loaded by this statement.
    LoadStmt.prototype.ModuleName = function () {
        return this.Module.value;
    };
    LoadStmt.prototype.stmt = function () { };
    LoadStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    LoadStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return LoadStmt;
}());
exports.LoadStmt = LoadStmt;
// A BranchStmt changes the flow of control: break, continue, pass.
var BranchStmt = /** @class */ (function () {
    function BranchStmt(token, tokenPos) {
        this.commentsRef = new CommentsRef();
        this.token = token;
        this.tokenPos = tokenPos;
    }
    BranchStmt.prototype.span = function () {
        return [this.tokenPos, this.tokenPos.add(this.token.toString())];
    };
    BranchStmt.prototype.stmt = function () { };
    BranchStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    BranchStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return BranchStmt;
}());
exports.BranchStmt = BranchStmt;
// A ReturnStmt returns from a function.
var ReturnStmt = /** @class */ (function () {
    function ReturnStmt(Return, Result) {
        this.commentsRef = new CommentsRef();
        this.Return = Return;
        this.Result = Result;
    }
    ReturnStmt.prototype.span = function () {
        if (!this.Result) {
            return [this.Return, this.Return.add("return")];
        }
        var _a = this.Result.span(), end = _a[1];
        return [this.Return, end];
    };
    ReturnStmt.prototype.stmt = function () { };
    ReturnStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    ReturnStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return ReturnStmt;
}());
exports.ReturnStmt = ReturnStmt;
// An Ident represents an identifier.
var Ident = /** @class */ (function () {
    function Ident(NamePos, Name, Binding // a *resolver.Binding, set by resolver
    ) {
        this.commentsRef = new CommentsRef();
        this.NamePos = NamePos;
        this.Name = Name;
        this.Binding = Binding;
    }
    Ident.prototype.span = function () {
        return [this.NamePos, this.NamePos.add(this.Name)];
    };
    Ident.prototype.expr = function () { };
    Ident.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    Ident.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return Ident;
}());
exports.Ident = Ident;
// A Literal represents a literal string or number.
var Literal = /** @class */ (function () {
    function Literal(token, tokenPos, raw, value) {
        this.commentsRef = new CommentsRef();
        this.token = token;
        this.tokenPos = tokenPos;
        this.raw = raw;
        this.value = value;
    }
    Literal.prototype.span = function () {
        return [this.tokenPos, this.tokenPos.add(this.raw)];
    };
    Literal.prototype.expr = function () { };
    Literal.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    Literal.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return Literal;
}());
exports.Literal = Literal;
// A ParenExpr represents a parenthesized expression: (X).
var ParenExpr = /** @class */ (function () {
    function ParenExpr(lparen, x, rparen) {
        this.commentsRef = new CommentsRef();
        this.lparen = lparen;
        this.x = x;
        this.rparen = rparen;
    }
    ParenExpr.prototype.span = function () {
        return [this.lparen, this.rparen.add(")")];
    };
    ParenExpr.prototype.expr = function () { };
    ParenExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    ParenExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return ParenExpr;
}());
exports.ParenExpr = ParenExpr;
// A CallExpr represents a function call expression: Fn(Args).
var CallExpr = /** @class */ (function () {
    function CallExpr(Fn, Lparen, Args, Rparen) {
        this.commentsRef = new CommentsRef();
        this.Fn = Fn;
        this.Lparen = Lparen;
        this.Args = Args;
        this.Rparen = Rparen;
    }
    CallExpr.prototype.span = function () {
        var _a = this.Fn.span(), start = _a[0], _ = _a[1];
        return [start, this.Rparen.add(")")];
    };
    CallExpr.prototype.expr = function () { };
    CallExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    CallExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return CallExpr;
}());
exports.CallExpr = CallExpr;
// A DotExpr represents a field or method selector: X.Name.
var DotExpr = /** @class */ (function () {
    function DotExpr(X, Dot, NamePos, Name) {
        this.commentsRef = new CommentsRef();
        this.X = X;
        this.Dot = Dot;
        this.NamePos = NamePos;
        this.Name = Name;
    }
    DotExpr.prototype.span = function () {
        var _a;
        var start, end;
        start = this.X.span()[0];
        _a = this.Name.span(), end = _a[1];
        return [start, end];
    };
    DotExpr.prototype.expr = function () { };
    DotExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    DotExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return DotExpr;
}());
exports.DotExpr = DotExpr;
// A Comprehension represents a list or dict comprehension:
// [Body for ... if ...] or {Body for ... if ...}
var Comprehension = /** @class */ (function () {
    function Comprehension(Curly, Lbrack, Body, Clauses, Rbrack) {
        this.commentsRef = new CommentsRef();
        this.Curly = Curly;
        this.Lbrack = Lbrack;
        this.Body = Body;
        this.Clauses = Clauses;
        this.Rbrack = Rbrack;
    }
    Comprehension.prototype.span = function () {
        return [this.Lbrack, this.Rbrack.add("]")];
    };
    Comprehension.prototype.expr = function () { };
    Comprehension.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    Comprehension.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return Comprehension;
}());
exports.Comprehension = Comprehension;
// A ForStmt represents a loop: for Vars in X: Body.
var ForStmt = /** @class */ (function () {
    function ForStmt(For, Vars, X, Body) {
        this.commentsRef = new CommentsRef();
        this.For = For;
        this.Vars = Vars;
        this.X = X;
        this.Body = Body;
    }
    ForStmt.prototype.span = function () {
        var _a = this.Body[this.Body.length - 1].span(), end = _a[1];
        return [this.For, end];
    };
    ForStmt.prototype.stmt = function () { };
    ForStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    ForStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return ForStmt;
}());
exports.ForStmt = ForStmt;
// A WhileStmt represents a while loop: while X: Body.
var WhileStmt = /** @class */ (function () {
    function WhileStmt(While, Cond, Body) {
        this.commentsRef = new CommentsRef();
        this.While = While;
        this.Cond = Cond;
        this.Body = Body;
    }
    WhileStmt.prototype.span = function () {
        var _a = this.Body[this.Body.length - 1].span(), end = _a[1];
        return [this.While, end];
    };
    WhileStmt.prototype.stmt = function () { };
    WhileStmt.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    WhileStmt.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return WhileStmt;
}());
exports.WhileStmt = WhileStmt;
// A ForClause represents a for clause in a list comprehension: for Vars in X.
var ForClause = /** @class */ (function () {
    function ForClause(forPos, vars, inPos, x) {
        this.commentsRef = new CommentsRef();
        this.forPos = forPos;
        this.vars = vars;
        this.inPos = inPos;
        this.x = x;
    }
    ForClause.prototype.span = function () {
        var _a = this.x.span(), _ = _a[0], end = _a[1];
        return [this.forPos, end];
    };
    ForClause.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    ForClause.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return ForClause;
}());
exports.ForClause = ForClause;
// TypeScript equivalent of IfClause
var IfClause = /** @class */ (function () {
    function IfClause(If, Cond) {
        this.commentsRef = new CommentsRef();
        this.If = If;
        this.Cond = Cond;
    }
    IfClause.prototype.span = function () {
        var _a = this.Cond.span(), end = _a[1];
        return [this.If, end];
    };
    IfClause.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    IfClause.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return IfClause;
}());
exports.IfClause = IfClause;
// A DictExpr represents a dictionary literal: { List }.
var DictExpr = /** @class */ (function () {
    function DictExpr(Lbrace, List, Rbrace) {
        this.commentsRef = new CommentsRef();
        this.Lbrace = Lbrace;
        this.List = List;
        this.Rbrace = Rbrace;
    }
    DictExpr.prototype.span = function () {
        return [this.Lbrace, this.Rbrace.add("}")];
    };
    DictExpr.prototype.expr = function () { };
    DictExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    DictExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return DictExpr;
}());
exports.DictExpr = DictExpr;
// A DictEntry represents a dictionary entry: Key: Value.
// Used only within a DictExpr.
var DictEntry = /** @class */ (function () {
    function DictEntry(Key, Colon, Value) {
        this.commentsRef = new CommentsRef();
        this.Key = Key;
        this.Colon = Colon;
        this.Value = Value;
    }
    DictEntry.prototype.span = function () {
        var start = this.Key.span()[0];
        var _a = this.Value.span(), end = _a[1];
        return [start, end];
    };
    DictEntry.prototype.expr = function () { };
    DictEntry.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    DictEntry.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return DictEntry;
}());
exports.DictEntry = DictEntry;
// A LambdaExpr represents an inline function abstraction.
var LambdaExpr = /** @class */ (function () {
    function LambdaExpr(lambda, params, body) {
        this.lambda = lambda;
        this.params = params;
        this.body = body;
        this.commentsRef = new CommentsRef();
    }
    LambdaExpr.prototype.span = function () {
        var _a = this.body.span(), end = _a[1];
        return [this.lambda, end];
    };
    LambdaExpr.prototype.expr = function () { };
    LambdaExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    LambdaExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return LambdaExpr;
}());
exports.LambdaExpr = LambdaExpr;
// A ListExpr represents a list literal: [ List ].
var ListExpr = /** @class */ (function () {
    function ListExpr(lbrack, list, rbrack) {
        this.lbrack = lbrack;
        this.list = list;
        this.rbrack = rbrack;
        this.commentsRef = new CommentsRef();
    }
    ListExpr.prototype.span = function () {
        return [this.lbrack, this.rbrack.add("]")];
    };
    ListExpr.prototype.expr = function () { };
    ListExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    ListExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return ListExpr;
}());
exports.ListExpr = ListExpr;
// CondExpr represents the conditional: X if COND else ELSE.
var CondExpr = /** @class */ (function () {
    function CondExpr(If, Cond, True, ElsePos, False) {
        this.commentsRef = new CommentsRef();
        this.If = If;
        this.Cond = Cond;
        this.True = True;
        this.ElsePos = ElsePos;
        this.False = False;
    }
    CondExpr.prototype.span = function () {
        var _a = this.True.span(), startTrue = _a[0], endTrue = _a[1];
        var _b = this.False.span(), startFalse = _b[0], endFalse = _b[1];
        return [startTrue, endFalse];
    };
    CondExpr.prototype.expr = function () { };
    CondExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    CondExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return CondExpr;
}());
exports.CondExpr = CondExpr;
// A TupleExpr represents a tuple literal: (List).
var TupleExpr = /** @class */ (function () {
    function TupleExpr(List, Lparen, Rparen) {
        this.commentsRef = new CommentsRef();
        this.Lparen = Lparen;
        this.List = List;
        this.Rparen = Rparen;
    }
    TupleExpr.prototype.span = function () {
        var _a;
        if ((_a = this.Lparen) === null || _a === void 0 ? void 0 : _a.isValid()) {
            return [this.Lparen, this.Rparen];
        }
        else {
            return [
                this.List[0].span()[0],
                this.List[this.List.length - 1].span()[1],
            ];
        }
    };
    TupleExpr.prototype.expr = function () { };
    TupleExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    TupleExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return TupleExpr;
}());
exports.TupleExpr = TupleExpr;
// A UnaryExpr represents a unary expression: Op X.
//
// As a special case, UnaryOp{Op:Star} may also represent
// the star parameter in def f(...args: any[]) or def f(...: any[]).
var UnaryExpr = /** @class */ (function () {
    function UnaryExpr(OpPos, Op, X) {
        this.commentsRef = new CommentsRef();
        this.OpPos = OpPos;
        this.Op = Op;
        this.X = X;
    }
    UnaryExpr.prototype.span = function () {
        if (this.X !== null) {
            var _a = this.X.span(), end = _a[1];
            return [this.OpPos, end];
        }
        else {
            var end = this.OpPos.add("*");
            return [this.OpPos, end];
        }
    };
    UnaryExpr.prototype.expr = function () { };
    UnaryExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    UnaryExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return UnaryExpr;
}());
exports.UnaryExpr = UnaryExpr;
// A BinaryExpr represents a binary expression: X Op Y.
//
// As a special case, BinaryExpr{Op:EQ} may also
// represent a named argument in a call f(k=v)
// or a named parameter in a function declaration
// def f(param=default).
var BinaryExpr = /** @class */ (function () {
    function BinaryExpr(X, OpPos, Op, Y) {
        this.commentsRef = new CommentsRef();
        this.X = X;
        this.OpPos = OpPos;
        this.Op = Op;
        this.Y = Y;
    }
    BinaryExpr.prototype.span = function () {
        var start = this.X.span()[0];
        var _a = this.Y.span(), end = _a[1];
        return [start, end];
    };
    BinaryExpr.prototype.expr = function () { };
    BinaryExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    BinaryExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return BinaryExpr;
}());
exports.BinaryExpr = BinaryExpr;
// A SliceExpr represents a slice or substring expression: X[Lo:Hi:Step].
var SliceExpr = /** @class */ (function () {
    function SliceExpr(X, Lbrack, Lo, Hi, Step, Rbrack) {
        this.commentsRef = new CommentsRef();
        this.X = X;
        this.Lbrack = Lbrack;
        this.Lo = Lo;
        this.Hi = Hi;
        this.Step = Step;
        this.Rbrack = Rbrack;
    }
    SliceExpr.prototype.span = function () {
        var _a = this.X.span(), start = _a[0], _ = _a[1];
        return [start, this.Rbrack];
    };
    SliceExpr.prototype.expr = function () { };
    SliceExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    SliceExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return SliceExpr;
}());
exports.SliceExpr = SliceExpr;
// An IndexExpr represents an index expression: X[Y].
var IndexExpr = /** @class */ (function () {
    function IndexExpr(X, Lbrack, Y, Rbrack) {
        this.commentsRef = new CommentsRef();
        this.X = X;
        this.Lbrack = Lbrack;
        this.Y = Y;
        this.Rbrack = Rbrack;
    }
    IndexExpr.prototype.span = function () {
        var _a = this.X.span(), start = _a[0], _ = _a[1];
        return [start, this.Rbrack];
    };
    IndexExpr.prototype.expr = function () { };
    IndexExpr.prototype.comments = function () {
        return this.commentsRef.comments();
    };
    IndexExpr.prototype.allocComments = function () {
        this.commentsRef.allocComments();
    };
    return IndexExpr;
}());
exports.IndexExpr = IndexExpr;
function isFile(n) {
    return n instanceof File;
}
exports.isFile = isFile;
function isExprStmt(n) {
    return n instanceof ExprStmt;
}
exports.isExprStmt = isExprStmt;
function isBranchStmt(n) {
    return n instanceof BranchStmt;
}
exports.isBranchStmt = isBranchStmt;
function isIfStmt(n) {
    return n instanceof IfStmt;
}
exports.isIfStmt = isIfStmt;
function isAssignStmt(n) {
    return n instanceof AssignStmt;
}
exports.isAssignStmt = isAssignStmt;
function isDefStmt(n) {
    return n instanceof DefStmt;
}
exports.isDefStmt = isDefStmt;
function isForStmt(n) {
    return n instanceof ForStmt;
}
exports.isForStmt = isForStmt;
function isReturnStmt(n) {
    return n instanceof ReturnStmt;
}
exports.isReturnStmt = isReturnStmt;
function isLoadStmt(n) {
    return n instanceof LoadStmt;
}
exports.isLoadStmt = isLoadStmt;
function isIdent(n) {
    return n instanceof Ident;
}
exports.isIdent = isIdent;
function isLiteral(n) {
    return n instanceof Literal;
}
exports.isLiteral = isLiteral;
function isListExpr(n) {
    return n instanceof ListExpr;
}
exports.isListExpr = isListExpr;
function isParenExpr(n) {
    return n instanceof ParenExpr;
}
exports.isParenExpr = isParenExpr;
function isCondExpr(n) {
    return n instanceof CondExpr;
}
exports.isCondExpr = isCondExpr;
function isIndexExpr(n) {
    return n instanceof IndexExpr;
}
exports.isIndexExpr = isIndexExpr;
function isDictEntry(n) {
    return n instanceof DictEntry;
}
exports.isDictEntry = isDictEntry;
function isSliceExpr(n) {
    return n instanceof SliceExpr;
}
exports.isSliceExpr = isSliceExpr;
function isComprehension(n) {
    return n instanceof Comprehension;
}
exports.isComprehension = isComprehension;
function isIfClause(n) {
    return n instanceof IfClause;
}
exports.isIfClause = isIfClause;
function isForClause(n) {
    return n instanceof ForClause;
}
exports.isForClause = isForClause;
function isTupleExpr(n) {
    return n instanceof TupleExpr;
}
exports.isTupleExpr = isTupleExpr;
function isDictExpr(n) {
    return n instanceof DictExpr;
}
exports.isDictExpr = isDictExpr;
function isUnaryExpr(n) {
    return n instanceof UnaryExpr;
}
exports.isUnaryExpr = isUnaryExpr;
function isBinaryExpr(n) {
    return n instanceof BinaryExpr;
}
exports.isBinaryExpr = isBinaryExpr;
function isDotExpr(n) {
    return n instanceof DotExpr;
}
exports.isDotExpr = isDotExpr;
function isCallExpr(n) {
    return n instanceof CallExpr;
}
exports.isCallExpr = isCallExpr;
function isLambdaExpr(n) {
    return n instanceof LambdaExpr;
}
exports.isLambdaExpr = isLambdaExpr;
