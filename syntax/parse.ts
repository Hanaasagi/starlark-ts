import { TokenValue, Scanner, Token, Position } from "./scan.js";
import * as syntax from "./syntax.js";
import { Walk } from "./walk.js";

// A Mode value is a set of flags (or 0) that controls optional parser functionality.
type Mode = number;

// Enable this flag to print the token stream and log.Fatal on the first error.
export const debug = true;

const RetainComments: Mode = 1 << 0; // retain comments in AST; see Node.Comments

// Parse parses the input data and returns the corresponding parse tree.
//
// If src != nil, ParseFile parses the source from src and the filename
// is only used when recording position information.
// The type of the argument for the src parameter must be string,
// []byte, io.Reader, or FilePortion.
// If src == nil, ParseFile parses the file specified by filename.
export function parse(
  filename: string,
  src: any,
  mode: Mode
): [syntax.File | null, Error | null] {
  let input = new Scanner(filename, src, (mode & RetainComments) != 0);
  // if (err) {
  //   return [null, err];
  // }
  let p = new Parser(input);

  try {
    p.nextToken(); // read first lookahead token
    let f = p.parseFile();
    if (f) {
      f.Path = filename;
    }
    p.assignComments(f);
    return [f, null];
  } catch (e) {
    p.input.recover(e);
    return [null, e as Error];
  }
}

// ParseCompoundStmt parses a single compound statement:
// a blank line, a def, for, while, or if statement, or a
// semicolon-separated list of simple statements followed
// by a newline. These are the units on which the REPL operates.
// ParseCompoundStmt does not consume any following input.
// The parser calls the readline function each
// time it needs a new line of input.
export function ParseCompoundStmt(
  filename: string,
  readline: () => [Uint8Array, Error]
): [syntax.File | null, Error | null] {
  const input = new Scanner(filename, readline, false);
  let p: Parser = new Parser(input);
  let err: Error;

  try {
    p.nextToken(); // read first lookahead token
    let stmts: syntax.Stmt[] = [];

    switch (p.tok) {
      case Token.DEF:
      case Token.IF:
      case Token.FOR:
      case Token.WHILE:
        stmts = p.parseStmt(stmts);
        break;
      case Token.NEWLINE:
        // blank line
        break;
      default:
        stmts = p.parseSimpleStmt(stmts, false);
        // Require but don't consume newline, to avoid blocking again.
        // BUG:?
        // @ts-ignore
        if (p.tok !== Token.NEWLINE) {
          p.input.error(p.input.pos, "invalid syntax");
        }
    }

    let f = new syntax.File(filename, stmts, null);
    return [f, null];
  } catch (e) {
    err = e as Error;
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
export function ParseExpr(
  filename: string,
  src: unknown,
  mode: Mode
): [syntax.Expr | null, Error | null] {
  let input = new Scanner(filename, src, (mode & RetainComments) !== 0);
  // if (err !== null) {
  //   return [null, err];
  // }

  let p: Parser = new Parser(input);

  try {
    p.nextToken(); // read first lookahead token
    let expr = p.parseExpr(false);

    if (p.tok === Token.NEWLINE) {
      p.nextToken();
    }

    if (p.tok !== Token.EOF) {
      p.input.error(p.input.pos, `got ${p.tok} after expression, want EOF`);
    }
    p.assignComments(expr);
    return [expr, null];
  } catch (e) {
    return [null, e as Error];
  }
}

class Parser {
  public input: Scanner;
  public tok: Token;
  public tokval: TokenValue;

  constructor(input: Scanner) {
    this.input = input;
    this.tok = Token.ILLEGAL;
    this.tokval = new TokenValue();
  }

  // nextToken advances the scanner and returns the position of the
  // previous token.
  nextToken(): Position {
    const oldpos = this.tokval.pos;
    this.tok = this.input.nextToken(this.tokval);
    // enable to see the token stream
    if (debug) {
      console.log(`nextToken: ${this.tok} ${this.tokval.pos}`);
    }
    return oldpos;
  }

  // file_input = (NEWLINE | stmt)* EOF
  parseFile(): syntax.File {
    let stmts: syntax.Stmt[] = [];
    while (this.tok !== Token.EOF) {
      if (this.tok === Token.NEWLINE) {
        this.nextToken();
        continue;
      }
      stmts = this.parseStmt(stmts);
    }
    return new syntax.File("", stmts, null);
  }

  parseStmt(stmts: syntax.Stmt[]): syntax.Stmt[] {
    if (this.tok === Token.DEF) {
      return [...stmts, this.parseDefStmt()];
    } else if (this.tok === Token.IF) {
      return [...stmts, this.parseIfStmt()];
    } else if (this.tok === Token.FOR) {
      return [...stmts, this.parseForStmt()];
    } else if (this.tok === Token.WHILE) {
      return [...stmts, this.parseWhileStmt()];
    }
    return this.parseSimpleStmt(stmts, true);
  }

  parseDefStmt(): syntax.Stmt {
    const defpos = this.nextToken(); // consume DEF
    const id = this.parseIdent();
    this.consume(Token.LPAREN);
    const params = this.parseParams();
    this.consume(Token.RPAREN);
    this.consume(Token.COLON);
    const body = this.parseSuite();
    // BUG:
    return new syntax.DefStmt(defpos, id, params, body);
  }

  parseIfStmt(): syntax.Stmt {
    const ifpos = this.nextToken(); // consume IF
    const cond = this.parseTest();
    this.consume(Token.COLON);
    const body = this.parseSuite();
    const ifStmt = new syntax.IfStmt(ifpos, cond, body, null, []);
    let tail = ifStmt;
    while (this.tok === Token.ELIF) {
      const elifpos = this.nextToken(); // consume ELIF
      const cond = this.parseTest();
      this.consume(Token.COLON);
      const body = this.parseSuite();
      const elif = new syntax.IfStmt(elifpos, cond, body, null, []);
      tail.elsePos = elifpos;
      tail.falseBody = [elif];
      tail = elif;
    }
    if (this.tok === Token.ELSE) {
      tail.elsePos = this.nextToken(); // consume ELSE
      this.consume(Token.COLON);
      tail.falseBody = this.parseSuite();
    }
    return ifStmt;
  }

  parseForStmt(): syntax.Stmt {
    const forpos = this.nextToken(); // consume FOR
    const vars = this.parseForLoopVariables();
    this.consume(Token.IN);
    const x = this.parseExpr(false);
    this.consume(Token.COLON);
    const body = this.parseSuite();
    return new syntax.ForStmt(forpos, vars, x, body);
  }

  parseWhileStmt(): syntax.Stmt {
    const whilepos: Position = this.nextToken(); // consume WHILE
    const cond: syntax.Expr = this.parseTest();
    this.consume(Token.COLON);
    const body: syntax.Stmt[] = this.parseSuite();
    return new syntax.WhileStmt(whilepos, cond, body);
  }

  // Equivalent to 'exprlist' production in Python grammar.
  //
  // loop_variables = primary_with_suffix (COMMA primary_with_suffix)* COMMA?
  parseForLoopVariables(): syntax.Expr {
    // Avoid parseExpr because it would consume the IN token
    // following x in "for x in y: ...".
    const v = this.parsePrimaryWithSuffix();
    if (this.tok !== Token.COMMA) {
      return v;
    }

    const list: syntax.Expr[] = [v];
    while (this.tok === Token.COMMA) {
      this.nextToken();
      if (terminatesExprList(this.tok)) {
        break;
      }
      list.push(this.parsePrimaryWithSuffix());
    }
    return new syntax.TupleExpr(list, null, null);
  }

  parseSimpleStmt(stmts: syntax.Stmt[], consumeNL: boolean): syntax.Stmt[] {
    while (true) {
      stmts.push(this.parseSmallStmt());
      if (this.tok !== Token.SEMI) {
        break;
      }
      this.nextToken(); // consume SEMI
      //@ts-ignore
      if (this.tok === Token.NEWLINE || this.tok === Token.EOF) {
        break;
      }
    }
    // EOF without NEWLINE occurs in `if x: pass`, for example.
    if (this.tok !== Token.EOF && consumeNL) {
      this.consume(Token.NEWLINE);
    }
    return stmts;
  }

  parseSmallStmt(): syntax.Stmt {
    switch (this.tok) {
      case Token.RETURN:
        const pos = this.nextToken(); // consume RETURN
        let result: syntax.Expr | undefined;
        if (
          //@ts-ignore
          this.tok !== Token.EOF &&
          //@ts-ignore
          this.tok !== Token.NEWLINE &&
          //@ts-ignore
          this.tok !== Token.SEMI
        ) {
          result = this.parseExpr(false);
        }
        return new syntax.ReturnStmt(pos, result);

      case Token.BREAK:
      case Token.CONTINUE:
      case Token.PASS:
        const tok = this.tok;
        const tokenPos = this.nextToken(); // consume it
        return new syntax.BranchStmt(tok, tokenPos);

      case Token.LOAD:
        return this.parseLoadStmt();
    }

    // Assignment
    const x = this.parseExpr(false);
    switch (this.tok) {
      case Token.EQ:
      case Token.PLUS_EQ:
      case Token.MINUS_EQ:
      case Token.STAR_EQ:
      case Token.SLASH_EQ:
      case Token.SLASHSLASH_EQ:
      case Token.PERCENT_EQ:
      case Token.AMP_EQ:
      case Token.PIPE_EQ:
      case Token.CIRCUMFLEX_EQ:
      case Token.LTLT_EQ:
      case Token.GTGT_EQ:
        const op = this.tok;
        const pos = this.nextToken(); // consume op
        const rhs = this.parseExpr(false);
        return new syntax.AssignStmt(pos, op, x, rhs);
    }

    // Expression statement (e.g. function call, doc string).
    return new syntax.ExprStmt(x);
  }

  parseLoadStmt(): syntax.LoadStmt {
    const loadPos = this.nextToken(); // consume LOAD
    const lparen = this.consume(Token.LPAREN);

    if (this.tok !== Token.STRING) {
      this.input.error(
        this.input.pos,
        "first operand of load statement must be a string literal"
      );
    }
    const module = this.parsePrimary() as syntax.Literal;

    const from: syntax.Ident[] = [];
    const to: syntax.Ident[] = [];
    //@ts-ignore
    while (this.tok !== Token.RPAREN && this.tok !== Token.EOF) {
      this.consume(Token.COMMA);
      //@ts-ignore
      if (this.tok === Token.RPAREN) {
        break; // allow trailing comma
      }
      switch (this.tok) {
        case Token.STRING: {
          // load("module", "id")
          // To name is same as original.
          const lit = this.parsePrimary() as syntax.Literal;
          const id = new syntax.Ident(
            lit.tokenPos.add('"'),
            lit.value as string,
            null
          );
          to.push(id);
          from.push(id);
          break;
        }
        //@ts-ignore
        case Token.IDENT: {
          // load("module", to="from")
          const id = this.parseIdent();
          to.push(id);
          if (this.tok !== Token.EQ) {
            this.input.error(
              this.input.pos,
              `load operand must be "%[1]s" or %[1]s="originalname" (want '=' after %[1]s)`
              // id.Name
            );
          }
          this.consume(Token.EQ);
          if (this.tok !== Token.STRING) {
            this.input.error(
              this.input.pos,
              `original name of loaded symbol must be quoted: %s="originalname"`
              // id.Name
            );
          }
          const lit = this.parsePrimary() as syntax.Literal;
          from.push(
            new syntax.Ident(lit.tokenPos.add(`"`), lit.value as string, null)
          );
          break;
        }

        //@ts-ignore
        case Token.RPAREN:
          this.input.error(this.input.pos, "trailing comma in load statement");

        default:
          this.input.error(
            this.input.pos,
            `load operand must be "name" or localname="name" (got %#v)`
          );
      }
    }
    const rparen = this.consume(Token.RPAREN);

    if (to.length === 0) {
      this.input.error(lparen, "load statement must import at least 1 symbol");
    }
    return new syntax.LoadStmt(loadPos, module, to, from, rparen);
  }

  // suite is typically what follows a COLON (e.g. after DEF or FOR).
  // suite = simple_stmt | NEWLINE INDENT stmt+ OUTDENT
  parseSuite(): syntax.Stmt[] {
    if (this.tok === Token.NEWLINE) {
      this.nextToken(); // consume NEWLINE
      this.consume(Token.INDENT);
      let stmts: syntax.Stmt[] = [];
      //@ts-ignore
      while (this.tok !== Token.OUTDENT && this.tok !== Token.EOF) {
        stmts = this.parseStmt(stmts);
      }
      this.consume(Token.OUTDENT);
      return stmts;
    }

    return this.parseSimpleStmt([], true);
  }

  parseIdent(): syntax.Ident {
    if (this.tok !== Token.IDENT) {
      this.input.error(this.input.pos, "not an identifier");
    }
    const id = new syntax.Ident(this.tokval.pos, this.tokval.raw, null);
    this.nextToken();
    return id;
  }

  consume(t: Token): Position {
    if (this.tok !== t) {
      this.input.error(this.input.pos, `got ${this.tok}, want ${t}`);
    }
    return this.nextToken();
  }

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
  parseParams(): syntax.Expr[] {
    const params: syntax.Expr[] = [];
    while (
      this.tok !== Token.RPAREN &&
      this.tok !== Token.COLON &&
      this.tok !== Token.EOF
    ) {
      if (params.length > 0) {
        this.consume(Token.COMMA);
      }
      //@ts-ignore
      if (this.tok === Token.RPAREN) {
        break;
      }

      // * or *args or **kwargs
      if (this.tok === Token.STAR || this.tok === Token.STARSTAR) {
        const op = this.tok;
        const pos = this.nextToken();
        let x: syntax.Expr | null = null;
        //@ts-ignore
        if (op === Token.STARSTAR || this.tok === Token.IDENT) {
          x = this.parseIdent();
        }
        params.push(new syntax.UnaryExpr(pos, op, x));
        continue;
      }

      // IDENT
      // IDENT = test
      const id = this.parseIdent();
      if (this.tok === Token.EQ) {
        // default value
        const eq = this.nextToken();
        const dflt = this.parseTest();
        params.push(new syntax.BinaryExpr(id, eq, Token.EQ, dflt));
        continue;
      }

      params.push(id);
    }
    return params;
  }

  // parseExpr parses an expression, possible consisting of a
  // comma-separated list of 'test' expressions.
  //
  // In many cases we must use parseTest to avoid ambiguity such as
  // f(x, y) vs. f((x, y)).
  parseExpr(inParens: boolean): syntax.Expr {
    const x: syntax.Expr = this.parseTest();
    if (this.tok !== Token.COMMA) {
      return x;
    }

    // tuple
    const exprs: syntax.Expr[] = this.parseExprs([x], inParens);
    return new syntax.TupleExpr(exprs, null, null);
  }

  // parseExprs parses a comma-separated list of expressions, starting with the comma.
  // It is used to parse tuples and list elements.
  // expr_list = (',' expr)* ','?
  parseExprs(exprs: syntax.Expr[], allowTrailingComma: boolean): syntax.Expr[] {
    while (this.tok === Token.COMMA) {
      const pos = this.nextToken();
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
  }

  // parseTest parses a 'test', a single-component expression.
  parseTest(): syntax.Expr {
    let p = this;
    if (p.tok === Token.LAMBDA) {
      return p.parseLambda(true);
    }

    let x = p.parseTestPrec(0);

    // conditional expression (t IF cond ELSE f)
    if (p.tok === Token.IF) {
      const ifpos = p.nextToken();
      const cond = this.parseTestPrec(0);
      //@ts-ignore
      if (p.tok !== Token.ELSE) {
        p.input.error(ifpos, "conditional expression without else clause");
      }
      const elsepos = p.nextToken();
      const else_ = this.parseTest();
      return new syntax.CondExpr(ifpos, cond, x, elsepos, else_);
    }

    return x;
  }

  /**
   * parseTestNoCond parses a a single-component expression without
   * consuming a trailing 'if expr else expr'.
   */
  parseTestNoCond(): syntax.Expr {
    if (this.tok === Token.LAMBDA) {
      return this.parseLambda(false);
    }
    return this.parseTestPrec(0);
  }

  // parseLambda parses a lambda expression.
  // The allowCond flag allows the body to be an 'a if b else c' conditional.
  parseLambda(allowCond: boolean): syntax.Expr {
    const lambda = this.nextToken();
    let params: syntax.Expr[] = [];
    if (this.tok !== Token.COLON) {
      params = this.parseParams();
    }
    this.consume(Token.COLON);

    let body: syntax.Expr;
    if (allowCond) {
      body = this.parseTest();
    } else {
      body = this.parseTestNoCond();
    }

    return new syntax.LambdaExpr(lambda, params, body);
  }

  parseTestPrec(prec: number): syntax.Expr {
    let p = this;
    if (prec >= precLevels.length) {
      return this.parsePrimaryWithSuffix();
    }

    // expr = NOT expr
    let idx = Object.keys(Token).indexOf(Token.NOT.toString());
    if (p.tok === Token.NOT && prec === precedence[idx]) {
      const pos = p.nextToken();
      const x = this.parseTestPrec(prec);
      return new syntax.UnaryExpr(pos, Token.NOT, x);
    }

    return this.parseBinopExpr(prec);
  }

  parseBinopExpr(prec: number): syntax.Expr {
    let x = this.parseTestPrec(prec + 1);
    let first = true;

    while (true) {
      if (this.tok === Token.NOT) {
        this.nextToken();
        //@ts-ignore
        if (this.tok !== Token.IN) {
          this.input.error(this.input.pos, `got ${this.tok}, want in`);
        }
        this.tok = Token.NOT_IN;
      }

      //@ts-ignore
      let idx = Object.values(Token).indexOf(this.tok.toString());

      let opprec = precedence[idx];
      // console.log(opprec, this.tok, idx, precedence);
      if (opprec < prec) {
        return x;
      }

      //@ts-ignore
      idx = Object.values(Token).indexOf(Token.EQL.toString());
      if (!first && opprec === precedence[idx]) {
        this.input.error(
          this.input.pos,
          `${(x as syntax.BinaryExpr).Op} does not associate with ${this.tok
          } (use parens)`
        );
      }

      const op = this.tok;
      const pos = this.nextToken();
      const y = this.parseTestPrec(opprec + 1);
      x = new syntax.BinaryExpr(x, pos, op, y);
      first = false;
    }
  }

  // primary_with_suffix = primary
  //                     | primary '.' IDENT
  //                     | primary slice_suffix
  //                     | primary call_suffix
  parsePrimaryWithSuffix(): syntax.Expr {
    let x = this.parsePrimary();
    while (true) {
      switch (this.tok) {
        case Token.DOT:
          const dot = this.nextToken();
          const id = this.parseIdent();
          x = new syntax.DotExpr(x, dot, null, id);
          break;
        case Token.LBRACK:
          x = this.parseSliceSuffix(x);
          break;
        case Token.LPAREN:
          x = this.parseCallSuffix(x);
          break;
        default:
          return x;
      }
    }
  }

  // slice_suffix = '[' expr? ':' expr?  ':' expr? ']'
  parseSliceSuffix(x: syntax.Expr): syntax.Expr {
    const lbrack = this.consume(Token.LBRACK);
    let lo: syntax.Expr | null = null;
    let hi: syntax.Expr | null = null;
    let step: syntax.Expr | null = null;

    if (this.tok !== Token.COLON) {
      const y = this.parseExpr(false);

      // index x[y]
      if (this.tok === Token.RBRACK) {
        const rbrack = this.nextToken();
        return new syntax.IndexExpr(x, lbrack, y, rbrack);
      }

      lo = y;
    }

    // slice or substring x[lo:hi:step]
    if (this.tok === Token.COLON) {
      this.nextToken();
      if (this.tok !== Token.COLON && this.tok !== Token.RBRACK) {
        hi = this.parseTest();
      }
    }
    if (this.tok === Token.COLON) {
      this.nextToken();
      //@ts-ignore
      if (this.tok !== Token.RBRACK) {
        step = this.parseTest();
      }
    }
    const rbrack = this.consume(Token.RBRACK);
    return new syntax.SliceExpr(x, lbrack, lo, hi, step, rbrack);
  }

  // call_suffix = '(' arg_list? ')'
  parseCallSuffix(fn: syntax.Expr): syntax.Expr {
    let lparen = this.consume(Token.LPAREN);
    let rparen: Position;

    let args: syntax.Expr[] = [];

    if (this.tok == Token.RPAREN) {
      rparen = this.nextToken();
    } else {
      args = this.parseArgs();
      rparen = this.consume(Token.RPAREN);
    }
    return new syntax.CallExpr(fn, lparen, args, rparen);
  }

  parseArgs(): syntax.Expr[] {
    const args: syntax.Expr[] = [];
    while (this.tok !== Token.RPAREN && this.tok !== Token.EOF) {
      if (args.length > 0) {
        this.consume(Token.COMMA);
      }

      //@ts-ignore
      if (this.tok === Token.RPAREN) {
        break;
      }

      // *args or **kwargs
      if (this.tok === Token.STAR || this.tok === Token.STARSTAR) {
        const op = this.tok;
        const pos = this.nextToken();
        const x = this.parseTest();
        args.push(new syntax.UnaryExpr(pos, op, x));
        continue;
      }

      // We use a different strategy from Bazel here to stay within LL(1).
      // Instead of looking ahead two tokens (IDENT, EQ) we parse
      // 'test = test' then check that the first was an IDENT.
      let x = this.parseTest();

      if (this.tok === Token.EQ) {
        // name = value
        if (!(x instanceof syntax.Ident)) {
          throw new Error("keyword argument must have form name=expr");
        }
        const eq = this.nextToken();
        const y = this.parseTest();
        x = new syntax.BinaryExpr(x, eq, Token.EQ, y);
      }

      args.push(x);
    }
    return args;
  }

  //  primary = IDENT
  //          | INT | FLOAT | STRING | BYTES
  //          | '[' ...                    // list literal or comprehension
  //          | '{' ...                    // dict literal or comprehension
  //          | '(' ...                    // tuple or parenthesized expression
  //          | ('-'|'+'|'~') primary_with_suffix
  parsePrimary(): syntax.Expr {
    var tok = this.tok;
    var pos: Position;

    switch (this.tok) {
      case Token.IDENT:
        return this.parseIdent();

      case Token.INT:
      case Token.FLOAT:
      case Token.STRING:
      case Token.BYTES:
        let val: number | string | bigint | undefined;
        tok = this.tok;
        switch (tok) {
          case Token.INT:
            val =
              this.tokval.bigInt !== null
                ? this.tokval.bigInt
                : this.tokval.int;
            break;
          case Token.FLOAT:
            val = this.tokval.float;
            break;
          case Token.STRING:
          case Token.BYTES:
            val = this.tokval.string;
            break;
        }
        const raw = this.tokval.raw;
        pos = this.nextToken();
        return new syntax.Literal(tok, pos, raw, val);

      case Token.LBRACK:
        return this.parseList();

      case Token.LBRACE:
        return this.parseDict();

      case Token.LPAREN:
        const lparen = this.nextToken();
        //@ts-ignore
        if (this.tok === Token.RPAREN) {
          // empty tuple
          const rparen = this.nextToken();
          return new syntax.TupleExpr([], lparen, rparen);
        }
        const e = this.parseExpr(true); // allow trailing comma
        const rparen = this.consume(Token.RPAREN);
        return new syntax.ParenExpr(lparen, e, rparen);

      case Token.MINUS:
      case Token.PLUS:
      case Token.TILDE: // unary
        tok = this.tok;
        pos = this.nextToken();
        const x = this.parsePrimaryWithSuffix();
        return new syntax.UnaryExpr(pos, tok, x);
    }
    throw new Error(`got ${this.tok}, want primary expression`);
  }

  // list = '[' ']'
  //      | '[' expr ']'
  //      | '[' expr expr_list ']'
  //      | '[' expr (FOR loop_variables IN expr)+ ']'
  parseList(): syntax.Expr {
    const lbrack = this.nextToken();
    if (this.tok === Token.RBRACK) {
      // empty List
      const rbrack = this.nextToken();
      return new syntax.ListExpr(lbrack, [], rbrack);
    }

    const x = this.parseTest();

    if (this.tok === Token.FOR) {
      // list comprehension
      return this.parseComprehensionSuffix(lbrack, x, Token.RBRACK);
    }

    let exprs = [x];
    if (this.tok === Token.COMMA) {
      // multi-item list literal
      exprs = this.parseExprs(exprs, true); // allow trailing comma
    }

    const rbrack = this.consume(Token.RBRACK);
    return new syntax.ListExpr(lbrack, exprs, rbrack);
  }

  // dict = '{' '}'
  //      | '{' dict_entry_list '}'
  //      | '{' dict_entry FOR loop_variables IN expr '}'

  parseDict(): syntax.Expr {
    const lbrace = this.nextToken();
    if (this.tok === Token.RBRACE) {
      // empty dict
      const rbrace = this.nextToken();
      return new syntax.DictExpr(lbrace, [], rbrace);
    }

    const x = this.parseDictEntry();

    if (this.tok === Token.FOR) {
      // dict comprehension
      return this.parseComprehensionSuffix(lbrace, x, Token.RBRACE);
    }

    const entries = [x];
    while (this.tok === Token.COMMA) {
      this.nextToken();
      //@ts-ignore
      if (this.tok === Token.RBRACE) {
        break;
      }
      entries.push(this.parseDictEntry());
    }

    const rbrace = this.consume(Token.RBRACE);
    return new syntax.DictExpr(lbrace, entries, rbrace);
  }

  // dict_entry = test ':' test
  parseDictEntry(): syntax.DictEntry {
    const key = this.parseTest();
    const colon = this.consume(Token.COLON);
    const value = this.parseTest();
    return new syntax.DictEntry(key, colon, value);
  }

  // comp_suffix = FOR loopvars IN expr comp_suffix
  //             | IF expr comp_suffix
  //             | ']'  or  ')'                              (end)
  //
  // There can be multiple FOR/IF clauses; the first is always a FOR.

  parseComprehensionSuffix(
    lbrace: Position,
    body: syntax.Expr,
    endBrace: Token
  ): syntax.Expr {
    const clauses: syntax.Node[] = [];
    while (this.tok !== endBrace) {
      if (this.tok === Token.FOR) {
        const pos = this.nextToken();
        const vars = this.parseForLoopVariables();
        const inToken = this.consume(Token.IN);
        // Following Python 3, the operand of IN cannot be:
        // - a conditional expression ('x if y else z'),
        //   due to conflicts in Python grammar
        //  ('if' is used by the comprehension);
        // - a lambda expression
        // - an unparenthesized tuple.
        const x = this.parseTestPrec(0);
        clauses.push(new syntax.ForClause(pos, vars, inToken, x));
      } else if (this.tok === Token.IF) {
        const pos = this.nextToken();
        const cond = this.parseTestNoCond();
        clauses.push(new syntax.IfClause(pos, cond));
      } else {
        this.input.error(
          this.input.pos,
          `got ${this.tok}, want ${endBrace}, for, or if`
        );
      }
    }
    const rbrace = this.nextToken();

    return new syntax.Comprehension(
      endBrace === Token.RBRACE,
      lbrace,
      body,
      clauses,
      rbrace
    );
  }

  // assignComments attaches comments to nearby syntax.
  assignComments(n: syntax.Node): void {
    // Leave early if there are no comments
    if (
      this.input.lineComments.length + this.input.suffixComments.length ==
      0
    ) {
      return;
    }

    const [pre, post] = flattenAST(n);

    // Assign line comments to syntax immediately following.
    let line = this.input.lineComments;
    for (const x of pre) {
      const [start] = x.span();

      if (x instanceof syntax.File) {
        continue;
      }

      while (line.length > 0 && !start.isBefore(line[0].start)) {
        x.allocComments();
        x.comments()?.before.push(line[0]);
        line = line.slice(1);
      }
    }

    // Remaining line comments go at end of file.
    if (line.length > 0) {
      n.allocComments();
      n.comments()?.after.push(...line);
    }

    // Assign suffix comments to syntax immediately before.
    let suffix = this.input.suffixComments;
    for (let i = post.length - 1; i >= 0; i--) {
      const x = post[i];

      // Do not assign suffix comments to file
      if (x instanceof syntax.File) {
        continue;
      }

      const [, end] = x.span();
      if (suffix.length > 0 && end.isBefore(suffix[suffix.length - 1].start)) {
        x.allocComments();
        x.comments()?.suffix.push(suffix[suffix.length - 1]);
        suffix = suffix.slice(0, -1);
      }
    }
  }
}

function terminatesExprList(tok: Token): boolean {
  switch (tok) {
    case Token.EOF:
    case Token.NEWLINE:
    case Token.EQ:
    case Token.RBRACE:
    case Token.RBRACK:
    case Token.RPAREN:
    case Token.SEMI:
      return true;

    default:
      return false;
  }
}

// BUG: hashmap?
var precedence: Array<number> = new Array(128).fill(-1);

var precLevels: Token[][] = [
  [Token.OR], // or
  [Token.AND], // and
  [Token.NOT], // not (unary)
  [
    Token.EQL,
    Token.NEQ,
    Token.LT,
    Token.GT,
    Token.LE,
    Token.GE,
    Token.IN,
    Token.NOT_IN,
  ], // == != < > <= >= in not in
  [Token.PIPE], // |
  [Token.CIRCUMFLEX], // ^
  [Token.AMP], // &
  [Token.LTLT, Token.GTGT], // << >>
  [Token.MINUS, Token.PLUS], // -
  [Token.STAR, Token.PERCENT, Token.SLASH, Token.SLASHSLASH], // * % / //
];

// console.log(Object.keys(Token));
for (let i = 0; i < precLevels.length; i++) {
  let tokens = precLevels[i];
  for (var tok of tokens) {
    //@ts-ignore
    let idx = Object.values(Token).indexOf(tok.toString());
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
function flattenAST(root: syntax.Node): [syntax.Node[], syntax.Node[]] {
  const pre: syntax.Node[] = [];
  const post: syntax.Node[] = [];
  const stack: syntax.Node[] = [];
  Walk(root, (n: syntax.Node): boolean => {
    if (n !== null) {
      pre.push(n);
      stack.push(n);
    } else {
      post.push(stack[stack.length - 1]);
      stack.pop();
    }
    return true;
  });
  return [pre, post];
}
