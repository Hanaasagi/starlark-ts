import { TokenValue, Scanner, Token, Position } from "./scan";

const debug = false;

class Parser {
  private in: Scanner;
  private tok: Token;
  private tokval: TokenValue;

  constructor(in: Scanner) {
    this.in = in;
  }

  // nextToken advances the scanner and returns the position of the
  // previous token.
  nextToken(): Position {
    const oldpos = this.tokval.pos;
    this.tok = this.in.nextToken(this.tokval);
    // enable to see the token stream
    if (debug) {
      console.log(`nextToken: ${this.tok} ${this.tokval.pos}`);
    }
    return oldpos;
  }

  // file_input = (NEWLINE | stmt)* EOF
  parseFile(): File {
    const stmts: Stmt[] = []
    while (this.tok !== Token.EOF) {
      if (this.tok === Token.NEWLINE) {
        this.nextToken()
        continue
      }
      stmts = this.parseStmt(stmts))
    }
    // BUG:
    return { Stmts: stmts }
  }

  parseStmt(stmts: Stmt[]): Stmt[] {
    if (this.tok === Token.DEF) {
      return [...stmts, this.parseDefStmt()]
    } else if (this.tok === Token.IF) {
      return [...stmts, this.parseIfStmt()]
    } else if (this.tok === Token.FOR) {
      return [...stmts, this.parseForStmt()]
    } else if (this.tok === Token.WHILE) {
      return [...stmts, this.parseWhileStmt()]
    }
    return this.parseSimpleStmt(stmts, true)
  }

  parseDefStmt(): Stmt {
    const defpos = this.nextToken(); // consume DEF
    const id = this.parseIdent();
    this.consume(Token.LPAREN);
    const params = this.parseParams();
    this.consume(Token.RPAREN);
    this.consume(Token.COLON);
    const body = this.parseSuite();
    // BUG:
    return {
      type: "DefStmt",
      def: defpos,
      name: id,
      params: params,
      body: body,
    };
  }

  parseIfStmt(): Stmt {
    const ifpos = this.nextToken(); // consume IF
    const cond = this.parseTest();
    this.consume(Token.COLON);
    const body = this.parseSuite();
    const ifStmt: IfStmt = {
      type: 'if',
      ifPos: ifpos,
      cond: cond,
      trueBranch: body,
      elseBranch: null,
    };
    let tail = ifStmt;
    while (this.tok === Token.ELIF) {
      const elifpos = this.nextToken(); // consume ELIF
      const cond = this.parseTest();
      this.consume(Token.COLON);
      const body = this.parseSuite();
      const elif: IfStmt = {
        type: 'if',
        ifPos: elifpos,
        cond: cond,
        trueBranch: body,
        elseBranch: null,
      };
      tail.elsePos = elifpos;
      tail.elseBranch = [elif];
      tail = elif;
    }
    if (this.tok === Token.ELSE) {
      tail.elsePos = this.nextToken(); // consume ELSE
      this.consume(Token.COLON);
      tail.elseBranch = this.parseSuite();
    }
    return ifStmt;
  }

  parseForStmt(): Stmt {
    const forpos = this.nextToken() // consume FOR
    const vars = this.parseForLoopVariables()
    this.consume(Token.IN)
    const x = this.parseExpr(false)
    this.consume(Token.COLON)
    const body = this.parseSuite()
    return {
      type: "ForStmt",
      for: forpos,
      vars: vars,
      x: x,
      body: body,
    }
  }

  parseWhileStmt(): Stmt {
    const whilepos: Position = this.nextToken(); // consume WHILE
    const cond: Expr = this.parseTest();
    this.consume(Token.COLON);
    const body: Stmt[] = this.parseSuite();
    return new WhileStmt({
      while: whilepos,
      cond: cond,
      body: body
    });
  }

  // Equivalent to 'exprlist' production in Python grammar.
  //
  // loop_variables = primary_with_suffix (COMMA primary_with_suffix)* COMMA?
  parseForLoopVariables(): Expr {
    // Avoid parseExpr because it would consume the IN token
    // following x in "for x in y: ...".
    const v = this.parsePrimaryWithSuffix();
    if (this.tok !== Token.COMMA) {
      return v;
    }

    const list: Expr[] = [v];
    while (this.tok === Token.COMMA) {
      this.nextToken();
      if (terminatesExprList(this.tok)) {
        break;
      }
      list.push(this.parsePrimaryWithSuffix());
    }
    return new TupleExpr(list);
  }

  parseSimpleStmt(stmts: Stmt[], consumeNL: boolean): Stmt[] {
    while (true) {
      stmts.push(this.parseSmallStmt());
      if (this.tok !== Token.SEMI) {
        break;
      }
      this.nextToken(); // consume SEMI
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

  parseSmallStmt(): Stmt {
    switch (this.tok) {
      case Token.RETURN:
        const pos = this.nextToken(); // consume RETURN
        let result: Expr | undefined;
        if (this.tok !== Token.EOF && this.tok !== Token.NEWLINE && this.tok !== Token.SEMI) {
          result = this.parseExpr(false);
        }
        return new ReturnStmt(pos, result);

      case Token.BREAK:
      case Token.CONTINUE:
      case Token.PASS:
        const tok = this.tok;
        const tokenPos = this.nextToken(); // consume it
        return new BranchStmt(tok, tokenPos);

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
        return new AssignStmt(pos, op, x, rhs);
    }

    // Expression statement (e.g. function call, doc string).
    return new ExprStmt(x);
  }

  // TODO: parseLoadStmt

  // suite is typically what follows a COLON (e.g. after DEF or FOR).
  // suite = simple_stmt | NEWLINE INDENT stmt+ OUTDENT
  parseSuite(this: parser): Stmt[] {
    if (this.tok === Token.NEWLINE) {
      this.nextToken(); // consume NEWLINE
      this.consume(Token.INDENT);
      const stmts: Stmt[] = [];
      while (this.tok !== Token.OUTDENT && this.tok !== Token.EOF) {
        stmts.push(...this.parseStmt());
      }
      this.consume(Token.OUTDENT);
      return stmts;
    }

    return this.parseSimpleStmt(undefined, true);
  }

  parseIdent(this: parser): Ident {
    if (this.tok !== Token.IDENT) {
      this.in.error(this.in.pos, "not an identifier");
    }
    const id: Ident = {
      NamePos: this.tokval.pos,
      Name: this.tokval.raw,
    };
    this.nextToken();
    return id;
  }

  consume(t: Token): Position {
    if (this.tok !== t) {
      this.in.errorf(this.in.pos, `got ${Token[this.tok]}, want ${Token[t]}`);
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
  parseParams(): Expr[] {
    const params: Expr[] = [];
    while (
      this.tok !== Token.RPAREN &&
      this.tok !== Token.COLON &&
      this.tok !== Token.EOF
    ) {
      if (params.length > 0) {
        this.consume(Token.COMMA);
      }
      if (this.tok === Token.RPAREN) {
        break;
      }

      // * or *args or **kwargs
      if (this.tok === Token.STAR || this.tok === Token.STARSTAR) {
        const op = this.tok;
        const pos = this.nextToken();
        let x: Expr | null = null;
        if (op === Token.STARSTAR || this.tok === Token.IDENT) {
          x = this.parseIdent();
        }
        params.push(new UnaryExpr(pos, op, x));
        continue;
      }

      // IDENT
      // IDENT = test
      const id = this.parseIdent();
      if (this.tok === Token.EQ) { // default value
        const eq = this.nextToken();
        const dflt = this.parseTest();
        params.push(new BinaryExpr(id, eq, Token.EQ, dflt));
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
  parseExpr(inParens: boolean): Expr {
    const x: Expr = this.parseTest();
    if (this.tok !== Token.COMMA) {
      return x;
    }

    // tuple
    const exprs: Expr[] = this.parseExprs([x], inParens);
    return new TupleExpr(exprs);
  }

  // parseExprs parses a comma-separated list of expressions, starting with the comma.
  // It is used to parse tuples and list elements.
  // expr_list = (',' expr)* ','?
  parseExprs(exprs: Expr[], allowTrailingComma: boolean): Expr[] {
    while (this.tok === Token.COMMA) {
      const pos = this.pos();
      this.nextToken();
      if (terminatesExprList(this.tok)) {
        if (!allowTrailingComma) {
          this.error(pos, "unparenthesized tuple with trailing comma");
        }
        break;
      }
      exprs.push(this.parseTest());
    }
    return exprs;
  }

  // parseTest parses a 'test', a single-component expression.
  parseTest(): Expr {
    let p = this;
    if (p.tok === Token.LAMBDA) {
      return p.parseLambda(true);
    }

    let x = p.parseTestPrec(0);

    // conditional expression (t IF cond ELSE f)
    if (p.tok === Token.IF) {
      const ifpos = p.nextToken();
      const cond = parseTestPrec(0);
      if (p.tok !== Token.ELSE) {
        p.in.error(ifpos, "conditional expression without else clause");
      }
      const elsepos = p.nextToken();
      const else_ = this.sparseTest();
      return {
        type: "CondExpr",
        If: ifpos,
        Cond: cond,
        True: x,
        ElsePos: elsepos,
        False: else_,
      };
    }

    return x;
  }

  /**
   * parseTestNoCond parses a a single-component expression without
   * consuming a trailing 'if expr else expr'.
   */
  parseTestNoCond(): Expr {
    if (this.tok === Token.LAMBDA) {
      return this.parseLambda(false);
    }
    return this.parseTestPrec(0);
  }

  // parseLambda parses a lambda expression.
  // The allowCond flag allows the body to be an 'a if b else c' conditional.
  parseLambda(allowCond: boolean): Expr {
    const lambda = this.nextToken();
    let params: Expr[] = [];
    if (this.tok !== Token..Colon) {
      params = this.parseParams();
    }
    this.consume(Token.Colon);

    let body: Expr;
    if (allowCond) {
      body = this.parseTest();
    } else {
      body = this.parseTestNoCond();
    }

    return new LambdaExpr(lambda, params, body);
  }

  parseTestPrec(prec: number): Expr {
    let p = this;
    if (prec >= precLevels.length) {
      return parsePrimaryWithSuffix(p);
    }

    // expr = NOT expr
    if (p.tok === NOT && prec === precedence.NOT) {
      const pos = p.nextToken();
      const x = this.parseTestPrec(prec);
      return {
        kind: "UnaryExpr",
        opPos: pos,
        op: NOT,
        x,
      };
    }

    return this.parseBinopExpr(prec);
  }

  parseBinopExpr(prec: number): Expr {
    let x = this.parseTestPrec(prec + 1);
    let first = true;

    while (true) {
      if (this.tok === Token.NOT) {
        this.nextToken();
        if (this.tok !== Token.IN) {
          this.in.error(this.in.pos, `got ${this.tok}, want in`);
        }
        this.tok = Token.NOT_IN;
      }

      let opprec = precedence[this.tok];
      if (opprec < prec) {
        return x;
      }

      if (!first && opprec === precedence[Token.EQL]) {
        this.in.errorf(this.in.pos, `${(x as BinaryExpr).Op} does not associate with ${this.tok} (use parens)`);
      }

      const op = this.tok;
      const pos = this.nextToken();
      const y = this.parseTestPrec(opprec + 1);
      x = new BinaryExpr(pos, op, x, y);
      first = false;
    }
  }

  // TODO: missing something

  // primary_with_suffix = primary
  //                     | primary '.' IDENT
  //                     | primary slice_suffix
  //                     | primary call_suffix
  parsePrimaryWithSuffix(): Expr {
    let x = this.parsePrimary();
    while (true) {
      switch (this.tok) {
        case Token.DOT:
          const dot = this.nextToken();
          const id = this.parseIdent();
          x = { kind: "DotExpr", dot: dot, x: x, name: id };
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
  parseSliceSuffix(x: Expr): Expr {
    const lbrack = this.consume(Token.LBRACK);
    let lo: Expr = null, hi: Expr = null, step: Expr = null;
    if (this.tok !== Token.COLON) {
      const y = this.parseExpr(false);

      // index x[y]
      if (this.tok === Token.RBRACK) {
        const rbrack = this.nextToken();
        return new IndexExpr(x, lbrack, y, rbrack);
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
      if (this.tok !== Token.RBRACK) {
        step = this.parseTest();
      }
    }
    const rbrack = this.consume(Token.RBRACK);
    return new SliceExpr(x, lbrack, lo, hi, step, rbrack);
  }

  // call_suffix = '(' arg_list? ')'
  parseCallSuffix(fn: Expr): Expr {
    const lparen = this.expectToken(Token.LPAREN);
    let args: Expr[] = [];
    if (this.speekToken().type !== Token.RPAREN) {
      args = this.parseArgs();
    }
    const rparen = this.expectToken(Token.RPAREN);
    return new CallExpr(fn, lparen.pos, args, rparen.pos);
  }

  parseArgs(): Expr[] {
    const args: Expr[] = [];
    while (this.tok !== Token.RPAREN && this.tok !== Token.EOF) {
      if (args.length > 0) {
        this.consume(Token.COMMA);
      }
      if (this.tok === Token.RPAREN) {
        break;
      }

      // *args or **kwargs
      if (this.tok === Token.STAR || this.tok === Token.STARSTAR) {
        const op = this.tok;
        const pos = this.nextToken();
        const x = this.parseTest();
        args.push({
          kind: "UnaryExpr",
          opPos: pos,
          op: op,
          x: x,
        });
        continue;
      }

      // We use a different strategy from Bazel here to stay within LL(1).
      // Instead of looking ahead two tokens (IDENT, EQ) we parse
      // 'test = test' then check that the first was an IDENT.
      let x = this.parseTest();

      if (this.tok === Token.EQ) {
        // name = value
        if (x.kind !== "Ident") {
          throw new Error("keyword argument must have form name=expr");
        }
        const eq = this.nextToken();
        const y = this.parseTest();
        x = {
          kind: "BinaryExpr",
          x: x,
          opPos: eq,
          op: Token.EQ,
          y: y,
        };
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

  parsePrimary(): Expr {
    switch (this.tok) {
      case Token.IDENT:
        return this.parseIdent();

      case Token.INT:
      case Token.FLOAT:
      case Token.STRING:
      case Token.BYTES:
        let val: number | string | bigint | undefined;
        const tok = this.tok;
        switch (tok) {
          case Token.INT:
            val = this.tokval.bigInt !== null ? this.tokval.bigInt : this.tokval.int;
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
        const pos = this.nextToken();
        return new Literal(tok, pos, raw, val);

      case Token.LBRACK:
        return this.parseList();

      case Token.LBRACE:
        return this.parseDict();

      case Token.LPAREN:
        const lparen = this.nextToken();
        if (this.tok === Token.RPAREN) {
          // empty tuple
          const rparen = this.nextToken();
          return new TupleExpr(lparen, rparen);
        }
        const e = this.parseExpr(true); // allow trailing comma
        const rparen = this.consume(RPAREN);
        return new ParenExpr(lparen, e, rparen);

      case Token.MINUS:
      case Token.PLUS:
      case Token.TILDE: // unary
        const tok = this.tok;
        const pos = this.nextToken();
        const x = this.parsePrimaryWithSuffix();
        return new UnaryExpr(pos, tok, x);
    }
    throw new Error(`got ${this.tok}, want primary expression`);
  }

  // list = '[' ']'
  //      | '[' expr ']'
  //      | '[' expr expr_list ']'
  //      | '[' expr (FOR loop_variables IN expr)+ ']'

  parseList(): Expr {
    const lbrack = this.nextToken();
    if (this.tok === Token.RBRACK) {
      // empty List
      const rbrack = this.nextToken();
      return { type: 'ListExpr', Lbrack: lbrack, Rbrack: rbrack };
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
    return { type: 'ListExpr', Lbrack: lbrack, List: exprs, Rbrack: rbrack };
  }

  // dict = '{' '}'
  //      | '{' dict_entry_list '}'
  //      | '{' dict_entry FOR loop_variables IN expr '}'

  parseDict(): Expr {
    const lbrace = this.nextToken();
    if (this.tok === Token.RBRACE) {
      // empty dict
      const rbrace = this.nextToken();
      return new DictExpr({ lbrace, rbrace });
    }

    const x = this.parseDictEntry();

    if (this.tok === Token.FOR) {
      // dict comprehension
      return this.parseComprehensionSuffix(lbrace, x, Token.RBRACE);
    }

    const entries = [x];
    while (this.tok === Token.COMMA) {
      this.nextToken();
      if (this.tok === Token.RBRACE) {
        break;
      }
      entries.push(this.parseDictEntry());
    }

    const rbrace = this.consume(Token.RBRACE);
    return new DictExpr({ lbrace, list: entries, rbrace });
  }

  // dict_entry = test ':' test
  parseDictEntry(): DictEntry {
    const key = this.parseTest();
    const colon = this.consume(Token.COLON);
    const value = this.parseTest();
    return new DictEntry(key, value);
  }

  // comp_suffix = FOR loopvars IN expr comp_suffix
  //             | IF expr comp_suffix
  //             | ']'  or  ')'                              (end)
  //
  // There can be multiple FOR/IF clauses; the first is always a FOR.

  private parseComprehensionSuffix(lbrace: Position, body: Expr, endBrace: Token): Expr {
    const clauses: Node[] = [];
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
        clauses.push(new ForClause(pos, vars, inToken, x));
      } else if (this.tok === Token.IF) {
        const pos = this.nextToken();
        const cond = this.parseTestNoCond();
        clauses.push(new IfClause(pos, cond));
      } else {
        this.in.errorf(this.in.pos, `got ${this.tok}, want ${endBrace}, for, or if`);
      }
    }
    const rbrace = this.nextToken();

    return new Comprehension(endBrace === Token.RBRACE, lbrace, body, clauses, rbrace);
  }

}
