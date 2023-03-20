"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
exports.debug = void 0;
var scan_1 = require("./scan");
var syntax = require("./syntax");
var walk_1 = require("./walk");
// Enable this flag to print the token stream and log.Fatal on the first error.
exports.debug = false;
var RetainComments = 1 << 0; // retain comments in AST; see Node.Comments
// Parse parses the input data and returns the corresponding parse tree.
//
// If src != nil, ParseFile parses the source from src and the filename
// is only used when recording position information.
// The type of the argument for the src parameter must be string,
// []byte, io.Reader, or FilePortion.
// If src == nil, ParseFile parses the file specified by filename.
function parse(filename, src, mode) {
    var input = new scan_1.Scanner(filename, src, (mode & RetainComments) != 0);
    // if (err) {
    //   return [null, err];
    // }
    var p = new Parser(input);
    try {
        p.nextToken(); // read first lookahead token
        var f = p.parseFile();
        if (f) {
            f.Path = filename;
        }
        p.assignComments(f);
        return [f, null];
    }
    catch (e) {
        p.input.recover(e);
        return [null, e];
    }
}
// ParseCompoundStmt parses a single compound statement:
// a blank line, a def, for, while, or if statement, or a
// semicolon-separated list of simple statements followed
// by a newline. These are the units on which the REPL operates.
// ParseCompoundStmt does not consume any following input.
// The parser calls the readline function each
// time it needs a new line of input.
function ParseCompoundStmt(filename, readline) {
    var input = new scan_1.Scanner(filename, readline, false);
    var p = new Parser(input);
    var err;
    try {
        p.nextToken(); // read first lookahead token
        var stmts = [];
        switch (p.tok) {
            case scan_1.Token.DEF:
            case scan_1.Token.IF:
            case scan_1.Token.FOR:
            case scan_1.Token.WHILE:
                stmts = p.parseStmt(stmts);
                break;
            case scan_1.Token.NEWLINE:
                // blank line
                break;
            default:
                stmts = p.parseSimpleStmt(stmts, false);
                // Require but don't consume newline, to avoid blocking again.
                // BUG:?
                // @ts-ignore
                if (p.tok !== scan_1.Token.NEWLINE) {
                    p.input.error(p.input.pos, "invalid syntax");
                }
        }
        var f = new syntax.File(filename, stmts, null);
        return [f, null];
    }
    catch (e) {
        err = e;
        p.input.recover(err);
        if (err) {
            throw err;
        }
    }
    return [null, null];
}
// ParseExpr parses a Starlark expression.
// A comma-separated list of expressions is parsed as a tuple.
// See Parse for explanation of parameters.
function ParseExpr(filename, src, mode) {
    var input = new scan_1.Scanner(filename, src, (mode & RetainComments) !== 0);
    // if (err !== null) {
    //   return [null, err];
    // }
    var p = new Parser(input);
    try {
        p.nextToken(); // read first lookahead token
        var expr = p.parseExpr(false);
        if (p.tok === scan_1.Token.NEWLINE) {
            p.nextToken();
        }
        if (p.tok !== scan_1.Token.EOF) {
            p.input.error(p.input.pos, "got ".concat(p.tok, " after expression, want EOF"));
        }
        p.assignComments(expr);
        return [expr, null];
    }
    catch (e) {
        return [null, e];
    }
}
var Parser = /** @class */ (function () {
    function Parser(input) {
        this.input = input;
        this.tok = scan_1.Token.EQ;
        this.tokval = new scan_1.TokenValue();
    }
    // nextToken advances the scanner and returns the position of the
    // previous token.
    Parser.prototype.nextToken = function () {
        var oldpos = this.tokval.pos;
        this.tok = this.input.nextToken(this.tokval);
        // enable to see the token stream
        if (exports.debug) {
            console.log("nextToken: ".concat(this.tok, " ").concat(this.tokval.pos));
        }
        return oldpos;
    };
    // file_input = (NEWLINE | stmt)* EOF
    Parser.prototype.parseFile = function () {
        var stmts = [];
        while (this.tok !== scan_1.Token.EOF) {
            if (this.tok === scan_1.Token.NEWLINE) {
                this.nextToken();
                continue;
            }
            stmts = this.parseStmt(stmts);
        }
        return new syntax.File("", stmts, null);
    };
    Parser.prototype.parseStmt = function (stmts) {
        if (this.tok === scan_1.Token.DEF) {
            return __spreadArray(__spreadArray([], stmts, true), [this.parseDefStmt()], false);
        }
        else if (this.tok === scan_1.Token.IF) {
            return __spreadArray(__spreadArray([], stmts, true), [this.parseIfStmt()], false);
        }
        else if (this.tok === scan_1.Token.FOR) {
            return __spreadArray(__spreadArray([], stmts, true), [this.parseForStmt()], false);
        }
        else if (this.tok === scan_1.Token.WHILE) {
            return __spreadArray(__spreadArray([], stmts, true), [this.parseWhileStmt()], false);
        }
        return this.parseSimpleStmt(stmts, true);
    };
    Parser.prototype.parseDefStmt = function () {
        var defpos = this.nextToken(); // consume DEF
        var id = this.parseIdent();
        this.consume(scan_1.Token.LPAREN);
        var params = this.parseParams();
        this.consume(scan_1.Token.RPAREN);
        this.consume(scan_1.Token.COLON);
        var body = this.parseSuite();
        // BUG:
        return new syntax.DefStmt(defpos, id, params, body);
    };
    Parser.prototype.parseIfStmt = function () {
        var ifpos = this.nextToken(); // consume IF
        var cond = this.parseTest();
        this.consume(scan_1.Token.COLON);
        var body = this.parseSuite();
        var ifStmt = new syntax.IfStmt(ifpos, cond, body, null, []);
        var tail = ifStmt;
        while (this.tok === scan_1.Token.ELIF) {
            var elifpos = this.nextToken(); // consume ELIF
            var cond_1 = this.parseTest();
            this.consume(scan_1.Token.COLON);
            var body_1 = this.parseSuite();
            var elif = new syntax.IfStmt(elifpos, cond_1, body_1, null, []);
            tail.elsePos = elifpos;
            tail.falseBody = [elif];
            tail = elif;
        }
        if (this.tok === scan_1.Token.ELSE) {
            tail.elsePos = this.nextToken(); // consume ELSE
            this.consume(scan_1.Token.COLON);
            tail.falseBody = this.parseSuite();
        }
        return ifStmt;
    };
    Parser.prototype.parseForStmt = function () {
        var forpos = this.nextToken(); // consume FOR
        var vars = this.parseForLoopVariables();
        this.consume(scan_1.Token.IN);
        var x = this.parseExpr(false);
        this.consume(scan_1.Token.COLON);
        var body = this.parseSuite();
        return new syntax.ForStmt(forpos, vars, x, body);
    };
    Parser.prototype.parseWhileStmt = function () {
        var whilepos = this.nextToken(); // consume WHILE
        var cond = this.parseTest();
        this.consume(scan_1.Token.COLON);
        var body = this.parseSuite();
        return new syntax.WhileStmt(whilepos, cond, body);
    };
    // Equivalent to 'exprlist' production in Python grammar.
    //
    // loop_variables = primary_with_suffix (COMMA primary_with_suffix)* COMMA?
    Parser.prototype.parseForLoopVariables = function () {
        // Avoid parseExpr because it would consume the IN token
        // following x in "for x in y: ...".
        var v = this.parsePrimaryWithSuffix();
        if (this.tok !== scan_1.Token.COMMA) {
            return v;
        }
        var list = [v];
        while (this.tok === scan_1.Token.COMMA) {
            this.nextToken();
            if (terminatesExprList(this.tok)) {
                break;
            }
            list.push(this.parsePrimaryWithSuffix());
        }
        return new syntax.TupleExpr(list);
    };
    Parser.prototype.parseSimpleStmt = function (stmts, consumeNL) {
        while (true) {
            stmts.push(this.parseSmallStmt());
            if (this.tok !== scan_1.Token.SEMI) {
                break;
            }
            this.nextToken(); // consume SEMI
            //@ts-ignore
            if (this.tok === scan_1.Token.NEWLINE || this.tok === scan_1.Token.EOF) {
                break;
            }
        }
        // EOF without NEWLINE occurs in `if x: pass`, for example.
        if (this.tok !== scan_1.Token.EOF && consumeNL) {
            this.consume(scan_1.Token.NEWLINE);
        }
        return stmts;
    };
    Parser.prototype.parseSmallStmt = function () {
        switch (this.tok) {
            case scan_1.Token.RETURN:
                var pos = this.nextToken(); // consume RETURN
                var result = void 0;
                if (
                //@ts-ignore
                this.tok !== scan_1.Token.EOF &&
                    //@ts-ignore
                    this.tok !== scan_1.Token.NEWLINE &&
                    //@ts-ignore
                    this.tok !== scan_1.Token.SEMI) {
                    result = this.parseExpr(false);
                }
                return new syntax.ReturnStmt(pos, result);
            case scan_1.Token.BREAK:
            case scan_1.Token.CONTINUE:
            case scan_1.Token.PASS:
                var tok_1 = this.tok;
                var tokenPos = this.nextToken(); // consume it
                return new syntax.BranchStmt(tok_1, tokenPos);
            case scan_1.Token.LOAD:
                return this.parseLoadStmt();
        }
        // Assignment
        var x = this.parseExpr(false);
        switch (this.tok) {
            case scan_1.Token.EQ:
            case scan_1.Token.PLUS_EQ:
            case scan_1.Token.MINUS_EQ:
            case scan_1.Token.STAR_EQ:
            case scan_1.Token.SLASH_EQ:
            case scan_1.Token.SLASHSLASH_EQ:
            case scan_1.Token.PERCENT_EQ:
            case scan_1.Token.AMP_EQ:
            case scan_1.Token.PIPE_EQ:
            case scan_1.Token.CIRCUMFLEX_EQ:
            case scan_1.Token.LTLT_EQ:
            case scan_1.Token.GTGT_EQ:
                var op = this.tok;
                var pos = this.nextToken(); // consume op
                var rhs = this.parseExpr(false);
                return new syntax.AssignStmt(pos, op, x, rhs);
        }
        // Expression statement (e.g. function call, doc string).
        return new syntax.ExprStmt(x);
    };
    Parser.prototype.parseLoadStmt = function () {
        var loadPos = this.nextToken(); // consume LOAD
        var lparen = this.consume(scan_1.Token.LPAREN);
        if (this.tok !== scan_1.Token.STRING) {
            this.input.error(this.input.pos, "first operand of load statement must be a string literal");
        }
        var module = this.parsePrimary();
        var from = [];
        var to = [];
        //@ts-ignore
        while (this.tok !== scan_1.Token.RPAREN && this.tok !== scan_1.Token.EOF) {
            this.consume(scan_1.Token.COMMA);
            //@ts-ignore
            if (this.tok === scan_1.Token.RPAREN) {
                break; // allow trailing comma
            }
            switch (this.tok) {
                case scan_1.Token.STRING: {
                    // load("module", "id")
                    // To name is same as original.
                    var lit = this.parsePrimary();
                    var id = new syntax.Ident(lit.tokenPos.add('"'), lit.value, null);
                    to.push(id);
                    from.push(id);
                    break;
                }
                //@ts-ignore
                case scan_1.Token.IDENT: {
                    // load("module", to="from")
                    var id = this.parseIdent();
                    to.push(id);
                    if (this.tok !== scan_1.Token.EQ) {
                        this.input.error(this.input.pos, "load operand must be \"%[1]s\" or %[1]s=\"originalname\" (want '=' after %[1]s)"
                        // id.Name
                        );
                    }
                    this.consume(scan_1.Token.EQ);
                    if (this.tok !== scan_1.Token.STRING) {
                        this.input.error(this.input.pos, "original name of loaded symbol must be quoted: %s=\"originalname\""
                        // id.Name
                        );
                    }
                    var lit = this.parsePrimary();
                    from.push(new syntax.Ident(lit.tokenPos.add("\""), lit.value, null));
                    break;
                }
                //@ts-ignore
                case scan_1.Token.RPAREN:
                    this.input.error(this.input.pos, "trailing comma in load statement");
                default:
                    this.input.error(this.input.pos, "load operand must be \"name\" or localname=\"name\" (got %#v)");
            }
        }
        var rparen = this.consume(scan_1.Token.RPAREN);
        if (to.length === 0) {
            this.input.error(lparen, "load statement must import at least 1 symbol");
        }
        return new syntax.LoadStmt(loadPos, module, to, from, rparen);
    };
    // suite is typically what follows a COLON (e.g. after DEF or FOR).
    // suite = simple_stmt | NEWLINE INDENT stmt+ OUTDENT
    Parser.prototype.parseSuite = function () {
        if (this.tok === scan_1.Token.NEWLINE) {
            this.nextToken(); // consume NEWLINE
            this.consume(scan_1.Token.INDENT);
            var stmts = [];
            //@ts-ignore
            while (this.tok !== scan_1.Token.OUTDENT && this.tok !== scan_1.Token.EOF) {
                stmts = this.parseStmt(stmts);
            }
            this.consume(scan_1.Token.OUTDENT);
            return stmts;
        }
        return this.parseSimpleStmt([], true);
    };
    Parser.prototype.parseIdent = function () {
        if (this.tok !== scan_1.Token.IDENT) {
            this.input.error(this.input.pos, "not an identifier");
        }
        var id = new syntax.Ident(this.tokval.pos, this.tokval.raw, null);
        this.nextToken();
        return id;
    };
    Parser.prototype.consume = function (t) {
        if (this.tok !== t) {
            this.input.error(this.input.pos, "got ".concat(this.tok, ", want ").concat(t));
        }
        return this.nextToken();
    };
    // params = (param COMMA)* param COMMA?
    //        |
    //
    // param = IDENT
    //       | IDENT EQ test
    //       | STAR
    //       | STAR IDENT
    //       | STARSTAR IDENT
    //
    // parseParams parses a parameter list.  The resulting expressions are of the form:
    //
    //      *Ident                                          x
    //      *Binary{Op: EQ, X: *Ident, Y: Expr}             x=y
    //      *Unary{Op: STAR}                                *
    //      *Unary{Op: STAR, X: *Ident}                     *args
    //      *Unary{Op: STARSTAR, X: *Ident}                 **kwargs
    Parser.prototype.parseParams = function () {
        var params = [];
        while (this.tok !== scan_1.Token.RPAREN &&
            this.tok !== scan_1.Token.COLON &&
            this.tok !== scan_1.Token.EOF) {
            if (params.length > 0) {
                this.consume(scan_1.Token.COMMA);
            }
            //@ts-ignore
            if (this.tok === scan_1.Token.RPAREN) {
                break;
            }
            // * or *args or **kwargs
            if (this.tok === scan_1.Token.STAR || this.tok === scan_1.Token.STARSTAR) {
                var op = this.tok;
                var pos = this.nextToken();
                var x = null;
                //@ts-ignore
                if (op === scan_1.Token.STARSTAR || this.tok === scan_1.Token.IDENT) {
                    x = this.parseIdent();
                }
                params.push(new syntax.UnaryExpr(pos, op, x));
                continue;
            }
            // IDENT
            // IDENT = test
            var id = this.parseIdent();
            if (this.tok === scan_1.Token.EQ) {
                // default value
                var eq = this.nextToken();
                var dflt = this.parseTest();
                params.push(new syntax.BinaryExpr(id, eq, scan_1.Token.EQ, dflt));
                continue;
            }
            params.push(id);
        }
        return params;
    };
    // parseExpr parses an expression, possible consisting of a
    // comma-separated list of 'test' expressions.
    //
    // In many cases we must use parseTest to avoid ambiguity such as
    // f(x, y) vs. f((x, y)).
    Parser.prototype.parseExpr = function (inParens) {
        var x = this.parseTest();
        if (this.tok !== scan_1.Token.COMMA) {
            return x;
        }
        // tuple
        var exprs = this.parseExprs([x], inParens);
        return new syntax.TupleExpr(exprs);
    };
    // parseExprs parses a comma-separated list of expressions, starting with the comma.
    // It is used to parse tuples and list elements.
    // expr_list = (',' expr)* ','?
    Parser.prototype.parseExprs = function (exprs, allowTrailingComma) {
        while (this.tok === scan_1.Token.COMMA) {
            var pos = this.nextToken();
            this.nextToken();
            if (terminatesExprList(this.tok)) {
                if (!allowTrailingComma) {
                    this.input.error(pos, "unparenthesized tuple with trailing comma");
                }
                break;
            }
            exprs.push(this.parseTest());
        }
        return exprs;
    };
    // parseTest parses a 'test', a single-component expression.
    Parser.prototype.parseTest = function () {
        var p = this;
        if (p.tok === scan_1.Token.LAMBDA) {
            return p.parseLambda(true);
        }
        var x = p.parseTestPrec(0);
        // conditional expression (t IF cond ELSE f)
        if (p.tok === scan_1.Token.IF) {
            var ifpos = p.nextToken();
            var cond = this.parseTestPrec(0);
            //@ts-ignore
            if (p.tok !== scan_1.Token.ELSE) {
                p.input.error(ifpos, "conditional expression without else clause");
            }
            var elsepos = p.nextToken();
            var else_ = this.parseTest();
            return new syntax.CondExpr(ifpos, cond, x, elsepos, else_);
        }
        return x;
    };
    /**
     * parseTestNoCond parses a a single-component expression without
     * consuming a trailing 'if expr else expr'.
     */
    Parser.prototype.parseTestNoCond = function () {
        if (this.tok === scan_1.Token.LAMBDA) {
            return this.parseLambda(false);
        }
        return this.parseTestPrec(0);
    };
    // parseLambda parses a lambda expression.
    // The allowCond flag allows the body to be an 'a if b else c' conditional.
    Parser.prototype.parseLambda = function (allowCond) {
        var lambda = this.nextToken();
        var params = [];
        if (this.tok !== scan_1.Token.COLON) {
            params = this.parseParams();
        }
        this.consume(scan_1.Token.COLON);
        var body;
        if (allowCond) {
            body = this.parseTest();
        }
        else {
            body = this.parseTestNoCond();
        }
        return new syntax.LambdaExpr(lambda, params, body);
    };
    Parser.prototype.parseTestPrec = function (prec) {
        var p = this;
        if (prec >= precLevels.length) {
            return this.parsePrimaryWithSuffix();
        }
        // expr = NOT expr
        var idx = Object.keys(scan_1.Token).indexOf(scan_1.Token.NOT.toString());
        if (p.tok === scan_1.Token.NOT && prec === precedence[idx]) {
            var pos = p.nextToken();
            var x = this.parseTestPrec(prec);
            return new syntax.UnaryExpr(pos, scan_1.Token.NOT, x);
        }
        return this.parseBinopExpr(prec);
    };
    Parser.prototype.parseBinopExpr = function (prec) {
        var x = this.parseTestPrec(prec + 1);
        var first = true;
        while (true) {
            if (this.tok === scan_1.Token.NOT) {
                this.nextToken();
                //@ts-ignore
                if (this.tok !== scan_1.Token.IN) {
                    this.input.error(this.input.pos, "got ".concat(this.tok, ", want in"));
                }
                this.tok = scan_1.Token.NOT_IN;
            }
            var idx = Object.keys(scan_1.Token).indexOf(this.tok.toString());
            var opprec = precedence[idx];
            if (opprec < prec) {
                return x;
            }
            idx = Object.keys(scan_1.Token).indexOf(scan_1.Token.EQL.toString());
            if (!first && opprec === precedence[idx]) {
                this.input.error(this.input.pos, "".concat(x.Op, " does not associate with ").concat(this.tok, " (use parens)"));
            }
            var op = this.tok;
            var pos = this.nextToken();
            var y = this.parseTestPrec(opprec + 1);
            x = new syntax.BinaryExpr(x, pos, op, y);
            first = false;
        }
    };
    // primary_with_suffix = primary
    //                     | primary '.' IDENT
    //                     | primary slice_suffix
    //                     | primary call_suffix
    Parser.prototype.parsePrimaryWithSuffix = function () {
        var x = this.parsePrimary();
        while (true) {
            switch (this.tok) {
                case scan_1.Token.DOT:
                    var dot = this.nextToken();
                    var id = this.parseIdent();
                    x = new syntax.DotExpr(x, dot, null, id);
                    break;
                case scan_1.Token.LBRACK:
                    x = this.parseSliceSuffix(x);
                    break;
                case scan_1.Token.LPAREN:
                    x = this.parseCallSuffix(x);
                    break;
                default:
                    return x;
            }
        }
    };
    // slice_suffix = '[' expr? ':' expr?  ':' expr? ']'
    Parser.prototype.parseSliceSuffix = function (x) {
        var lbrack = this.consume(scan_1.Token.LBRACK);
        var lo = null;
        var hi = null;
        var step = null;
        if (this.tok !== scan_1.Token.COLON) {
            var y = this.parseExpr(false);
            // index x[y]
            if (this.tok === scan_1.Token.RBRACK) {
                var rbrack_1 = this.nextToken();
                return new syntax.IndexExpr(x, lbrack, y, rbrack_1);
            }
            lo = y;
        }
        // slice or substring x[lo:hi:step]
        if (this.tok === scan_1.Token.COLON) {
            this.nextToken();
            if (this.tok !== scan_1.Token.COLON && this.tok !== scan_1.Token.RBRACK) {
                hi = this.parseTest();
            }
        }
        if (this.tok === scan_1.Token.COLON) {
            this.nextToken();
            //@ts-ignore
            if (this.tok !== scan_1.Token.RBRACK) {
                step = this.parseTest();
            }
        }
        var rbrack = this.consume(scan_1.Token.RBRACK);
        return new syntax.SliceExpr(x, lbrack, lo, hi, step, rbrack);
    };
    // call_suffix = '(' arg_list? ')'
    Parser.prototype.parseCallSuffix = function (fn) {
        var lparen = this.consume(scan_1.Token.LPAREN);
        var rparen;
        var args = [];
        if (this.tok == scan_1.Token.RPAREN) {
            rparen = this.nextToken();
        }
        else {
            args = this.parseArgs();
            rparen = this.consume(scan_1.Token.RPAREN);
        }
        return new syntax.CallExpr(fn, lparen, args, rparen);
    };
    Parser.prototype.parseArgs = function () {
        var args = [];
        while (this.tok !== scan_1.Token.RPAREN && this.tok !== scan_1.Token.EOF) {
            if (args.length > 0) {
                this.consume(scan_1.Token.COMMA);
            }
            //@ts-ignore
            if (this.tok === scan_1.Token.RPAREN) {
                break;
            }
            // *args or **kwargs
            if (this.tok === scan_1.Token.STAR || this.tok === scan_1.Token.STARSTAR) {
                var op = this.tok;
                var pos = this.nextToken();
                var x_1 = this.parseTest();
                args.push(new syntax.UnaryExpr(pos, op, x_1));
                continue;
            }
            // We use a different strategy from Bazel here to stay within LL(1).
            // Instead of looking ahead two tokens (IDENT, EQ) we parse
            // 'test = test' then check that the first was an IDENT.
            var x = this.parseTest();
            if (this.tok === scan_1.Token.EQ) {
                // name = value
                if (!(x instanceof syntax.Ident)) {
                    throw new Error("keyword argument must have form name=expr");
                }
                var eq = this.nextToken();
                var y = this.parseTest();
                x = new syntax.BinaryExpr(x, eq, scan_1.Token.EQ, y);
            }
            args.push(x);
        }
        return args;
    };
    //  primary = IDENT
    //          | INT | FLOAT | STRING | BYTES
    //          | '[' ...                    // list literal or comprehension
    //          | '{' ...                    // dict literal or comprehension
    //          | '(' ...                    // tuple or parenthesized expression
    //          | ('-'|'+'|'~') primary_with_suffix
    Parser.prototype.parsePrimary = function () {
        var tok = this.tok;
        var pos;
        switch (this.tok) {
            case scan_1.Token.IDENT:
                return this.parseIdent();
            case scan_1.Token.INT:
            case scan_1.Token.FLOAT:
            case scan_1.Token.STRING:
            case scan_1.Token.BYTES:
                var val = void 0;
                tok = this.tok;
                switch (tok) {
                    case scan_1.Token.INT:
                        val =
                            this.tokval.bigInt !== null
                                ? this.tokval.bigInt
                                : this.tokval.int;
                        break;
                    case scan_1.Token.FLOAT:
                        val = this.tokval.float;
                        break;
                    case scan_1.Token.STRING:
                    case scan_1.Token.BYTES:
                        val = this.tokval.string;
                        break;
                }
                var raw = this.tokval.raw;
                pos = this.nextToken();
                return new syntax.Literal(tok, pos, raw, val);
            case scan_1.Token.LBRACK:
                return this.parseList();
            case scan_1.Token.LBRACE:
                return this.parseDict();
            case scan_1.Token.LPAREN:
                var lparen = this.nextToken();
                //@ts-ignore
                if (this.tok === scan_1.Token.RPAREN) {
                    // empty tuple
                    var rparen_1 = this.nextToken();
                    return new syntax.TupleExpr([], lparen, rparen_1);
                }
                var e = this.parseExpr(true); // allow trailing comma
                var rparen = this.consume(scan_1.Token.RPAREN);
                return new syntax.ParenExpr(lparen, e, rparen);
            case scan_1.Token.MINUS:
            case scan_1.Token.PLUS:
            case scan_1.Token.TILDE: // unary
                tok = this.tok;
                pos = this.nextToken();
                var x = this.parsePrimaryWithSuffix();
                return new syntax.UnaryExpr(pos, tok, x);
        }
        throw new Error("got ".concat(this.tok, ", want primary expression"));
    };
    // list = '[' ']'
    //      | '[' expr ']'
    //      | '[' expr expr_list ']'
    //      | '[' expr (FOR loop_variables IN expr)+ ']'
    Parser.prototype.parseList = function () {
        var lbrack = this.nextToken();
        if (this.tok === scan_1.Token.RBRACK) {
            // empty List
            var rbrack_2 = this.nextToken();
            return new syntax.ListExpr(lbrack, [], rbrack_2);
        }
        var x = this.parseTest();
        if (this.tok === scan_1.Token.FOR) {
            // list comprehension
            return this.parseComprehensionSuffix(lbrack, x, scan_1.Token.RBRACK);
        }
        var exprs = [x];
        if (this.tok === scan_1.Token.COMMA) {
            // multi-item list literal
            exprs = this.parseExprs(exprs, true); // allow trailing comma
        }
        var rbrack = this.consume(scan_1.Token.RBRACK);
        return new syntax.ListExpr(lbrack, exprs, rbrack);
    };
    // dict = '{' '}'
    //      | '{' dict_entry_list '}'
    //      | '{' dict_entry FOR loop_variables IN expr '}'
    Parser.prototype.parseDict = function () {
        var lbrace = this.nextToken();
        if (this.tok === scan_1.Token.RBRACE) {
            // empty dict
            var rbrace_1 = this.nextToken();
            return new syntax.DictExpr(lbrace, [], rbrace_1);
        }
        var x = this.parseDictEntry();
        if (this.tok === scan_1.Token.FOR) {
            // dict comprehension
            return this.parseComprehensionSuffix(lbrace, x, scan_1.Token.RBRACE);
        }
        var entries = [x];
        while (this.tok === scan_1.Token.COMMA) {
            this.nextToken();
            //@ts-ignore
            if (this.tok === scan_1.Token.RBRACE) {
                break;
            }
            entries.push(this.parseDictEntry());
        }
        var rbrace = this.consume(scan_1.Token.RBRACE);
        return new syntax.DictExpr(lbrace, entries, rbrace);
    };
    // dict_entry = test ':' test
    Parser.prototype.parseDictEntry = function () {
        var key = this.parseTest();
        var colon = this.consume(scan_1.Token.COLON);
        var value = this.parseTest();
        return new syntax.DictEntry(key, colon, value);
    };
    // comp_suffix = FOR loopvars IN expr comp_suffix
    //             | IF expr comp_suffix
    //             | ']'  or  ')'                              (end)
    //
    // There can be multiple FOR/IF clauses; the first is always a FOR.
    Parser.prototype.parseComprehensionSuffix = function (lbrace, body, endBrace) {
        var clauses = [];
        while (this.tok !== endBrace) {
            if (this.tok === scan_1.Token.FOR) {
                var pos = this.nextToken();
                var vars = this.parseForLoopVariables();
                var inToken = this.consume(scan_1.Token.IN);
                // Following Python 3, the operand of IN cannot be:
                // - a conditional expression ('x if y else z'),
                //   due to conflicts in Python grammar
                //  ('if' is used by the comprehension);
                // - a lambda expression
                // - an unparenthesized tuple.
                var x = this.parseTestPrec(0);
                clauses.push(new syntax.ForClause(pos, vars, inToken, x));
            }
            else if (this.tok === scan_1.Token.IF) {
                var pos = this.nextToken();
                var cond = this.parseTestNoCond();
                clauses.push(new syntax.IfClause(pos, cond));
            }
            else {
                this.input.error(this.input.pos, "got ".concat(this.tok, ", want ").concat(endBrace, ", for, or if"));
            }
        }
        var rbrace = this.nextToken();
        return new syntax.Comprehension(endBrace === scan_1.Token.RBRACE, lbrace, body, clauses, rbrace);
    };
    // assignComments attaches comments to nearby syntax.
    Parser.prototype.assignComments = function (n) {
        var _a;
        var _b, _c, _d;
        // Leave early if there are no comments
        if (this.input.lineComments.length + this.input.suffixComments.length ==
            0) {
            return;
        }
        var _e = flattenAST(n), pre = _e[0], post = _e[1];
        // Assign line comments to syntax immediately following.
        var line = this.input.lineComments;
        for (var _i = 0, pre_1 = pre; _i < pre_1.length; _i++) {
            var x = pre_1[_i];
            var start = x.span()[0];
            if (x instanceof syntax.File) {
                continue;
            }
            while (line.length > 0 && !start.isBefore(line[0].start)) {
                x.allocComments();
                (_b = x.comments()) === null || _b === void 0 ? void 0 : _b.before.push(line[0]);
                line = line.slice(1);
            }
        }
        // Remaining line comments go at end of file.
        if (line.length > 0) {
            n.allocComments();
            (_c = n.comments()) === null || _c === void 0 ? void 0 : (_a = _c.after).push.apply(_a, line);
        }
        // Assign suffix comments to syntax immediately before.
        var suffix = this.input.suffixComments;
        for (var i = post.length - 1; i >= 0; i--) {
            var x = post[i];
            // Do not assign suffix comments to file
            if (x instanceof syntax.File) {
                continue;
            }
            var _f = x.span(), end = _f[1];
            if (suffix.length > 0 && end.isBefore(suffix[suffix.length - 1].start)) {
                x.allocComments();
                (_d = x.comments()) === null || _d === void 0 ? void 0 : _d.suffix.push(suffix[suffix.length - 1]);
                suffix = suffix.slice(0, -1);
            }
        }
    };
    return Parser;
}());
function terminatesExprList(tok) {
    switch (tok) {
        case scan_1.Token.EOF:
        case scan_1.Token.NEWLINE:
        case scan_1.Token.EQ:
        case scan_1.Token.RBRACE:
        case scan_1.Token.RBRACK:
        case scan_1.Token.RPAREN:
        case scan_1.Token.SEMI:
            return true;
        default:
            return false;
    }
}
// BUG: hashmap?
var precedence = new Array(64).fill(-1);
var precLevels = [
    [scan_1.Token.OR],
    [scan_1.Token.AND],
    [scan_1.Token.NOT],
    [
        scan_1.Token.EQL,
        scan_1.Token.NEQ,
        scan_1.Token.LT,
        scan_1.Token.GT,
        scan_1.Token.LE,
        scan_1.Token.GE,
        scan_1.Token.IN,
        scan_1.Token.NOT_IN,
    ],
    [scan_1.Token.PIPE],
    [scan_1.Token.CIRCUMFLEX],
    [scan_1.Token.AMP],
    [scan_1.Token.LTLT, scan_1.Token.GTGT],
    [scan_1.Token.MINUS, scan_1.Token.PLUS],
    [scan_1.Token.STAR, scan_1.Token.PERCENT, scan_1.Token.SLASH, scan_1.Token.SLASHSLASH], // * % / //
];
for (var i = 0; i < precLevels.length; i++) {
    var tokens = precLevels[i];
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var tok = tokens_1[_i];
        var idx = Object.keys(scan_1.Token).indexOf(tok.toString());
        precedence[idx] = i;
    }
}
// Comment assignment.
// We build two lists of all subnodes, preorder and postorder.
// The preorder list is ordered by start location, with outer nodes first.
// The postorder list is ordered by end location, with outer nodes last.
// We use the preorder list to assign each whole-line comment to the syntax
// immediately following it, and we use the postorder list to assign each
// end-of-line comment to the syntax immediately preceding it.
// flattenAST returns the list of AST nodes, both in prefix order and in postfix
// order.
function flattenAST(root) {
    var pre = [];
    var post = [];
    var stack = [];
    (0, walk_1.Walk)(root, function (n) {
        if (n !== null) {
            pre.push(n);
            stack.push(n);
        }
        else {
            post.push(stack[stack.length - 1]);
            stack.pop();
        }
        return true;
    });
    return [pre, post];
}
