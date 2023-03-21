import { Comment } from "./syntax.js";
import { readFileSync } from "fs";

// A Token represents a Starlark lexical token.
export enum Token {
  // illegal token
  ILLEGAL = "illegal token",
  // end of file
  EOF = "end of file",
  // newline
  NEWLINE = "newline",
  // indent
  INDENT = "indent",
  // outdent
  OUTDENT = "outdent",
  // identifier
  IDENT = "identifier",
  // int literal
  INT = "int literal",
  // float literal
  FLOAT = "float literal",
  // string literal
  STRING = "string literal",
  // bytes literal
  BYTES = "bytes literal",
  // +
  PLUS = "+",
  // -
  MINUS = "-",
  // *
  STAR = "*",
  // /
  SLASH = "/",
  // //
  SLASHSLASH = "//",
  // %
  PERCENT = "%",
  // &
  AMP = "&",
  // |
  PIPE = "|",
  // ^
  CIRCUMFLEX = "^",
  // <<
  LTLT = "<<",
  // >>
  GTGT = ">>",
  // ~
  TILDE = "~",
  // .
  DOT = ".",
  //,
  COMMA = ",",
  // =
  EQ = "=",
  // ;
  SEMI = ";",
  // :
  COLON = ":",
  // (
  LPAREN = "(",
  // )
  RPAREN = ")",
  // [
  LBRACK = "[",
  // ]
  RBRACK = "]",
  // {
  LBRACE = "{",
  // }
  RBRACE = "}",
  // <
  LT = "<",
  // >
  GT = ">",
  // >=
  GE = ">=",
  // <=
  LE = "<=",
  // ==
  EQL = "==",
  // !=
  NEQ = "!=",
  // +=
  PLUS_EQ = "+=",
  // -=
  MINUS_EQ = "-=",
  // *=
  STAR_EQ = "*=",
  // /=
  SLASH_EQ = "/=",
  // //=
  SLASHSLASH_EQ = "//=",
  // %=
  PERCENT_EQ = "%=",
  // &=
  AMP_EQ = "&=",
  // |=
  PIPE_EQ = "|=",
  // ^=
  CIRCUMFLEX_EQ = "^=",
  // <<=
  LTLT_EQ = "<<=",
  // >>=
  GTGT_EQ = ">>=",
  // **
  STARSTAR = "**",
  // and
  AND = "and",
  // break
  BREAK = "break",
  // continue
  CONTINUE = "continue",
  // def
  DEF = "def",
  // elif
  ELIF = "elif",
  // else
  ELSE = "else",
  // for
  FOR = "for",
  // if
  IF = "if",
  // in
  IN = "in",
  // lambda
  LAMBDA = "lambda",
  // load
  LOAD = "load",
  // not
  NOT = "not",
  // not in (synthesized by parser)
  NOT_IN = "not in",
  // or
  OR = "or",
  // pass
  PASS = "pass",
  // return
  RETURN = "return",
  // while
  WHILE = "while",
}

const keywordToken: Record<string, Token> = {
  and: Token.AND,
  break: Token.BREAK,
  continue: Token.CONTINUE,
  def: Token.DEF,
  elif: Token.ELIF,
  else: Token.ELSE,
  for: Token.FOR,
  if: Token.IF,
  in: Token.IN,
  lambda: Token.LAMBDA,
  load: Token.LOAD,
  not: Token.NOT,
  or: Token.OR,
  pass: Token.PASS,
  return: Token.RETURN,
  while: Token.WHILE,

  // reserved words:
  as: Token.ILLEGAL,
  // "assert":   ILLEGAL, // heavily used by our tests
  class: Token.ILLEGAL,
  del: Token.ILLEGAL,
  except: Token.ILLEGAL,
  finally: Token.ILLEGAL,
  from: Token.ILLEGAL,
  global: Token.ILLEGAL,
  import: Token.ILLEGAL,
  is: Token.ILLEGAL,
  nonlocal: Token.ILLEGAL,
  raise: Token.ILLEGAL,
  try: Token.ILLEGAL,
  with: Token.ILLEGAL,
  yield: Token.ILLEGAL,
};

// tokenValue records the position and value associated with each token.
// @ts-ignore
export class TokenValue {
  // @ts-ignore
  raw: string; // raw text of token
  // @ts-ignore
  int: number; // decoded int
  // @ts-ignore
  bigInt: bigint | null; // decoded integers > int64
  // @ts-ignore
  float: number; // decoded float
  // @ts-ignore
  string: string; // decoded string or bytes
  // @ts-ignore
  pos: Position; // start position of token
}

// A FilePortion describes the content of a portion of a file.
// Callers may provide a FilePortion for the src argument of Parse
// when the desired initial line and column numbers are not (1, 1),
// such as when an expression is parsed from within larger file.
class FilePortion {
  Content: Uint8Array;
  FirstLine: number;
  FirstCol: number;
}

// A Position dethisribes the location of a rune of input.
export class Position {
  file: string | null; // filename (indirect for compactness)
  line: number; // 1-based line number; 0 if line unknown
  col: number; // 1-based column (rune) number; 0 if column unknown

  // MakePosition returns position with the specified components.
  constructor(file: string | null, line: number, col: number) {
    this.file = file;
    this.line = line;
    this.col = col;
  }

  // IsValid reports whether the position is valid.
  isValid(): boolean {
    return this.file !== null;
  }

  // Filename returns the name of the file containing this position.
  filename(): string {
    if (this.file !== null) {
      return this.file;
    }
    return "<invalid>";
  }

  // add returns the position at the end of s, assuming it starts at p.
  add(s: string): Position {
    if (s.includes("\n")) {
      const n = s.split("\n").length - 1;
      this.line += n;
      s = s.substring(s.lastIndexOf("\n")! + 1, s.length);
      this.col = 1;
    }
    this.col += s.length;
    return this;
  }

  toString(): string {
    const file = this.filename();
    if (this.line > 0) {
      if (this.col > 0) {
        return `${file}:${this.line}:${this.col}`;
      }
      return `${file}:${this.line}`;
    }
    return file;
  }

  isBefore(q: Position): boolean {
    if (this.line !== q.line) {
      return this.line < q.line;
    }
    return this.col < q.col;
  }
}

class ScannerError extends Error {
  constructor(public pos: Position, public msg: string) {
    super(`${pos.toString()}: ${msg}`);
  }
}

export class Scanner {
  // rest of input (in REPL, a line of input)
  rest: string = "";
  // token being thisanned
  token: string = "";
  // current input position
  pos: Position;
  // nesting of [ ] { } ( )
  depth: number = 0;
  // stack of indentation levels
  indentstk: number[] = [];
  // number of saved INDENT (>0) or OUTDENT (<0) tokens to return
  dents: number = 0;
  // after NEWLINE; convert spaces to indentation tokens
  lineStart: boolean = false;
  // accumulate comments in slice
  keepComments: boolean = false;
  // list of full line comments (if keepComments)
  lineComments: Comment[] = [];
  // list of suffix comments (if keepComments)
  suffixComments: Comment[] = [];
  // read next line of input (REPL only)
  readline?: () => Promise<Uint8Array>;

  // TODO: check this function
  constructor(filename: string, src: unknown, keepComments: boolean) {
    let firstLine = 1;
    let firstCol = 1;
    if (isFilePortion(src)) {
      firstLine = src.FirstLine;
      firstCol = src.FirstCol;
    }
    this.pos = new Position(filename, firstLine, firstCol);
    this.indentstk = [0];
    this.lineStart = true;
    this.keepComments = keepComments;

    if (typeof src === "function") {
      this.readline = src as () => Promise<Uint8Array>;
    } else {
      // BUG:
      const data = readFileSync(filename, "utf8");
      this.rest = data;
    }
  }

  error(pos: Position, msg: string): never {
    throw new ScannerError(pos, msg);
  }

  // TODO: recover
  // The scanner and parser panic both for routine errors like
  // syntax errors and for programmer bugs like array index
  // errors.  Turn both into error returns.  Catching bug panics
  // is especially important when processing many files.
  // recover(err: Error | null | undefined): void {
  //   if (err instanceof Error) {
  //     throw err;
  //   } else if (err) {
  //     throw new ScannerError(this.pos, `internal error: ${err}`);
  //   }
  // }

  recover(err: any) { }

  // eof reports whether the input has reached end of file.
  isEof(): boolean {
    return (
      this.rest.length == 0 &&
      (this.readLine == null || this.readLine() == false)
    );
  }

  readLine(): boolean {
    if (this.readline != null) {
      try {
        // TODO:
        // this.rest = await this.readline();
      } catch (err) {
        this.error(this.pos, (err as Error).toString()); // EOF or ErrInterrupt
      }
      return this.rest.length > 0;
    }
    return false;
  }

  // peekRune returns the next rune in the input without consuming it.
  // Newlines in Unix, DOS, or Mac format are treated as one rune, '\n'.
  peekRune(): string {
    // eof() has been inlined here, both to avoid a call
    // and to establish len(rest)>0 to avoid a bounds check.
    if (this.rest.length === 0 && !this.readLine()) {
      return "\0";
    }

    // BUG:
    return this.rest[0];

    // fast path: ASCII

    // // BUG: stream encoding utf-8
    // const b = this.rest[0];
    // if (b < 0x80) {
    //   if (b === 0x0d) {
    //     return "\n";
    //   }
    //   return this.rest[0].toString();
    // }

    // // Use the textDecoder object to decode the rest of the byte sequence
    // const textDecoder = new TextDecoder();
    // const result = textDecoder.decode(this.rest.slice(0, 4), { stream: true });
    // const r = result[0];
    // return r;
  }

  // readRune consumes and returns the next rune in the input.
  // Newlines in Unix, DOS, or Mac format are treated as one rune, '\n'.
  readRune(): string {
    // eof() has been inlined here, both to avoid a call
    // and to establish len(rest)>0 to avoid a bounds check.
    if (this.rest.length === 0 && !this.readLine()) {
      return "\0";
    }

    // fast path: AthisII
    // const b = this.rest[0];
    // this.rest = this.rest.slice(1);

    let r = this.rest[0].toString();
    this.rest = this.rest.slice(1);
    if (r === "\r") {
      if (this.rest.length > 0 && this.rest[0].toString() === "\n") {
        this.rest = this.rest.slice(1);
      }
      r = "\n";
    }
    if (r === "\n") {
      this.pos.line++;
      this.pos.col = 1;
    } else {
      this.pos.col++;
    }
    return r;

    // // Use the textDecoder object to decode the rest of the byte sequence
    // const textDecoder = new TextDecoder();
    // const result = textDecoder.decode(this.rest.slice(0, 4), { stream: true });
    // const r = result[0];
    // const size = result.length;
    // this.rest = this.rest.slice(size);
    // this.pos.col++;
    // return r;
  }

  // startToken marks the beginning of the next input token.
  // It must be followed by a call to endToken once the token has
  // been consumed using readRune.
  startToken(val: TokenValue): void {
    this.token = this.rest;
    val.raw = "";
    val.pos = new Position(this.pos.file, this.pos.line, this.pos.col);
  }

  // endToken marks the end of an input token.
  // It records the actual token string in val.raw if the caller
  // has not done that already.
  endToken(val: TokenValue): void {
    if (val.raw === "") {
      val.raw = this.token
        .slice(0, this.token.length - this.rest.length)
        .toString();
    }
  }

  // nextToken is called by the parser to obtain the next input token.
  // It returns the token value and sets val to the data associated with
  // the token.
  //
  // For all our input tokens, the associated data is val.pos (the
  // position where the token begins), val.raw (the input string
  // corresponding to the token).  For string and int tokens, the string
  // and int fields additionally contain the token's interpreted value.
  nextToken(val: TokenValue): Token {
    // The following distribution of tokens guides case ordering:
    //
    //      COMMA          27   %
    //      STRING         23   %
    //      IDENT          15   %
    //      EQL            11   %
    //      LBRACK          5.5 %
    //      RBRACK          5.5 %
    //      NEWLINE         3   %
    //      LPAREN          2.9 %
    //      RPAREN          2.9 %
    //      INT             2   %
    //      others        < 1   %
    //
    // Although NEWLINE tokens are infrequent, and lineStart is
    // usually (~97%) false on entry, skipped newlines account for
    // about 50% of all iterations of the 'start' loop.

    let c: string;

    // Deal with leading spaces and indentation.
    let blank = false;
    const savedLineStart = this.lineStart;
    if (this.lineStart) {
      this.lineStart = false;
      let col = 0;
      while (true) {
        c = this.peekRune();
        if (c === " ") {
          col++;
          this.readRune();
        } else if (c === "\t") {
          const tab = 8;
          col += tab - ((this.pos.col - 1) % tab);
          this.readRune();
        } else {
          break;
        }
      }

      // The third clause matches EOF.
      if (c === "#" || c === "\n" || c === "\0") {
        blank = true;
      }

      // Compute indentation level for non-blank lines not
      // inside an expression.  This is not the common case.
      if (!blank && this.depth === 0) {
        const cur = this.indentstk[this.indentstk.length - 1];
        if (col > cur) {
          // indent
          this.dents++;
          this.indentstk.push(col);
        } else if (col < cur) {
          // outdent(s)
          while (
            this.indentstk.length > 0 &&
            col < this.indentstk[this.indentstk.length - 1]
          ) {
            this.dents--;
            this.indentstk.pop();
          }
          if (col !== this.indentstk[this.indentstk.length - 1]) {
            this.error(
              this.pos,
              "unindent does not match any outer indentation level"
            );
          }
        }
      }
    }
    // Return saved indentation tokens.
    if (this.dents !== 0) {
      this.startToken(val);
      this.endToken(val);
      if (this.dents < 0) {
        this.dents++;
        return Token.OUTDENT;
      } else {
        this.dents--;
        return Token.INDENT;
      }
    }

    // start of line proper
    c = this.peekRune();

    // Skip spaces.
    while (c === " " || c === "\t") {
      this.readRune();
      c = this.peekRune();
    }

    // comment
    if (c === "#") {
      if (this.keepComments) {
        this.startToken(val);
      }
      // Consume up to newline (included).
      while (c !== "\0" && c !== "\n") {
        this.readRune();
        c = this.peekRune();
      }
      if (this.keepComments) {
        this.endToken(val);
        if (blank) {
          this.lineComments.push(new Comment(val.pos, val.raw));
        } else {
          this.suffixComments.push(new Comment(val.pos, val.raw));
        }
      }
    }

    // newline
    if (c === "\n") {
      this.lineStart = true;

      // Ignore newlines within expressions (common case).
      if (this.depth > 0) {
        this.readRune();
        return this.nextToken(val);
      }

      // Ignore blank lines, except in the REPL,
      // where they emit OUTDENTs and NEWLINE.
      if (blank) {
        if (!this.readline) {
          this.readRune();
          return this.nextToken(val);
        } else if (this.indentstk.length > 1) {
          this.dents = 1 - this.indentstk.length;
          this.indentstk = this.indentstk.slice(0, 1);
          return this.nextToken(val);
        }
      }

      // At top-level (not in an expression).
      this.startToken(val);
      this.readRune();
      val.raw = "\n";
      return Token.NEWLINE;
    }

    // end of file
    if (c === "\0") {
      // Emit OUTDENTs for unfinished indentation,
      // preceded by a NEWLINE if we haven't just emitted one.
      if (this.indentstk.length > 1) {
        if (savedLineStart) {
          this.dents = 1 - this.indentstk.length;
          this.indentstk = this.indentstk.slice(0, 1);
          return this.nextToken(val);
        } else {
          this.lineStart = true;
          this.startToken(val);
          val.raw = "\n";
          return Token.EOF;
        }
      }

      this.startToken(val);
      this.endToken(val);
      return Token.EOF;
    }

    // line continuation
    if (c === "\\") {
      this.readRune();
      if (this.peekRune() !== "\n") {
        this.error(this.pos, "stray backslash in program");
      }
      this.readRune();
      return this.nextToken(val);
    }

    // start of the next token
    this.startToken(val);

    // comma (common case)
    if (c === ",") {
      this.readRune();
      this.endToken(val);
      return Token.COMMA;
    }

    // string literal
    if (c === '"' || c === "'") {
      return this.scanString(val, c);
    }

    // identifier or keyword
    if (isIdentStart(c)) {
      if (
        (c === "r" || c === "b") &&
        this.rest.length > 1 &&
        (this.rest[1] === '"' || this.rest[1] === "'")
      ) {
        //  r"..."
        //  b"..."
        this.readRune();
        c = this.peekRune();
        return this.scanString(val, c);
      } else if (
        c === "r" &&
        this.rest.length > 2 &&
        this.rest[1] === "b" &&
        (this.rest[2] === '"' || this.rest[2] === "'")
      ) {
        // rb"..."
        this.readRune();
        this.readRune();
        c = this.peekRune();
        return this.scanString(val, c);
      }

      while (isIdent(c)) {
        this.readRune();
        c = this.peekRune();
      }
      this.endToken(val);
      if (val.raw in keywordToken) {
        return keywordToken[val.raw];
      }

      return Token.IDENT;
    }

    // brackets
    switch (c) {
      case "[":
      case "(":
      case "{":
        this.depth++;
        this.readRune();
        this.endToken(val);
        switch (c) {
          case "[":
            return Token.LBRACK;
          case "(":
            return Token.LPAREN;
          case "{":
            return Token.LBRACE;
          default:
            throw new Error("unreachable");
        }

      case "]":
      case ")":
      case "}":
        if (this.depth == 0) {
          this.error(this.pos, `unexpected ${c}`);
        } else {
          this.depth--;
        }
        this.readRune();
        this.endToken(val);
        switch (c) {
          case "]":
            return Token.RBRACK;
          case ")":
            return Token.RPAREN;
          case "}":
            return Token.RBRACE;
          default:
            throw new Error("unreachable");
        }
    }

    // int or float literal, or period
    if (isdigit(c) || c == ".") {
      return this.scanNumber(val, c);
    }

    // other punctuation
    this.endToken(val);
    switch (c) {
      case "=":
      case "<":
      case ">":
      case "!":
      case "+":
      case "-":
      case "%":
      case "/":
      case "&":
      case "|":
      case "^": // possibly followed by '='
        const start = this.pos;
        this.readRune();
        if (this.peekRune() == "=") {
          this.readRune();
          switch (c) {
            case "<":
              return Token.LE;
            case ">":
              return Token.GE;
            case "=":
              return Token.EQL;
            case "!":
              return Token.NEQ;
            case "+":
              return Token.PLUS_EQ;
            case "-":
              return Token.MINUS_EQ;
            case "/":
              return Token.SLASH_EQ;
            case "%":
              return Token.PERCENT_EQ;
            case "&":
              return Token.AMP_EQ;
            case "|":
              return Token.PIPE_EQ;
            case "^":
              return Token.CIRCUMFLEX_EQ;
          }
        }
        switch (c) {
          case "=":
            return Token.EQ;
          case "<":
            if (this.peekRune() == "<") {
              this.readRune();
              if (this.peekRune() == "=") {
                this.readRune();
                return Token.LTLT_EQ;
              } else {
                return Token.LTLT;
              }
            }
            return Token.LT;
          case ">":
            if (this.peekRune() == ">") {
              this.readRune();
              if (this.peekRune() == "=") {
                this.readRune();
                return Token.GTGT_EQ;
              } else {
                return Token.GTGT;
              }
            }
            return Token.GT;
          case "!":
            this.error(start, "unexpected input character '!'");
          case "+":
            return Token.PLUS;
          case "-":
            return Token.MINUS;
          case "/":
            if (this.peekRune() == "/") {
              this.readRune();
              if (this.peekRune() == "=") {
                this.readRune();
                return Token.SLASHSLASH_EQ;
              } else {
                return Token.SLASHSLASH;
              }
            }
            return Token.SLASH;
          case "%":
            return Token.PERCENT;
          case "&":
            return Token.AMP;
          case "|":
            return Token.PIPE;
          case "^":
            return Token.CIRCUMFLEX;
          default:
            throw new Error("unreachable");
        }

      case ":":
      case ";":
      case "~": // single-char tokens (except comma)
        this.readRune();
        switch (c) {
          case ":":
            return Token.COLON;
          case ";":
            return Token.SEMI;
          case "~":
            return Token.TILDE;
          default:
            throw new Error("unreachable");
        }

      case "*": // possibly followed by '*' or '='
        this.readRune();
        switch (this.peekRune()) {
          case "*":
            this.readRune();
            return Token.STARSTAR;
          case "=":
            this.readRune();
            return Token.STAR_EQ;
        }
        return Token.STAR;
    }

    this.error(this.pos, `unexpected input character ${c}`);
  }

  scanString(val: TokenValue, quote: string): Token {
    const start = this.pos;
    const triple =
      this.rest.length >= 3 &&
      //BUG:
      //@ts-ignore
      this.rest[0] === quote &&
      this.rest[1] === quote &&
      this.rest[2] === quote;
    this.readRune();

    // String literals may contain escaped or unescaped newlines,
    // causing them to span multiple lines (gulps) of REPL input;
    // they are the only such token. Thus we cannot call endToken,
    // as it assumes this.rest is unchanged since startToken.
    // Instead, buffer the token here.
    // TODO(adonovan): opt: buffer only if we encounter a newline.
    const raw = new Array();

    // Copy the prefix, e.g. r' or " (see startToken).
    raw.push(this.token.slice(0, this.token.length - this.rest.length));

    if (!triple) {
      // single-quoted string literal
      while (true) {
        if (this.isEof()) {
          this.error(val.pos, "unexpected EOF in string");
        }
        const c = this.readRune();
        raw.push(c);
        if (c === quote) {
          break;
        }
        if (c === "\n") {
          this.error(val.pos, "unexpected newline in string");
        }
        if (c === "\\") {
          if (this.isEof()) {
            this.error(val.pos, "unexpected EOF in string");
          }
          const c = this.readRune();
          raw.push(c);
        }
      }
    } else {
      // triple-quoted string literal
      this.readRune();
      raw.push(quote);
      this.readRune();
      raw.push(quote);

      let quoteCount = 0;
      while (true) {
        if (this.isEof()) {
          this.error(val.pos, "unexpected EOF in string");
        }
        const c = this.readRune();
        raw.push(c);
        if (c === quote) {
          quoteCount++;
          if (quoteCount === 3) {
            break;
          }
        } else {
          quoteCount = 0;
        }
        if (c === "\\") {
          if (this.isEof()) {
            this.error(val.pos, "unexpected EOF in string");
          }
          const c = this.readRune();
          raw.push(c);
        }
      }
    }

    val.raw = raw.toString();

    // BUG:
    // const { s, isByte, err } = unquote(val.raw);
    const [s, isByte, err] = [val.raw, false, null];
    // if (err) {
    //   this.error(start, err.message);
    // }
    val.string = s;
    return isByte ? Token.BYTES : Token.STRING;
  }

  scanNumber(val: TokenValue, c: string): Token {
    const start = this.pos;
    let fraction = false;
    let exponent = false;

    if (c === ".") {
      // dot or start of fraction
      this.readRune();
      c = this.peekRune();
      if (!isdigit(c)) {
        this.endToken(val);
        return Token.DOT;
      }
      fraction = true;
    } else if (c === "0") {
      // hex, octal, binary or float
      this.readRune();
      c = this.peekRune();

      if (c === ".") {
        fraction = true;
      } else if (c === "x" || c === "X") {
        // hex
        this.readRune();
        c = this.peekRune();
        if (!isxdigit(c)) {
          this.error(start, "invalid hex literal");
        }
        while (isxdigit(c)) {
          this.readRune();
          c = this.peekRune();
        }
      } else if (c === "o" || c === "O") {
        // octal
        this.readRune();
        c = this.peekRune();
        if (!isodigit(c)) {
          this.error(this.pos, "invalid octal literal");
        }
        while (isodigit(c)) {
          this.readRune();
          c = this.peekRune();
        }
      } else if (c === "b" || c === "B") {
        // binary
        this.readRune();
        c = this.peekRune();
        if (!isbdigit(c)) {
          this.error(this.pos, "invalid binary literal");
        }
        while (isbdigit(c)) {
          this.readRune();
          c = this.peekRune();
        }
      } else {
        // float (or obsolete octal "0755")
        let allzeros = true;
        let octal = true;
        while (isdigit(c)) {
          if (c !== "0") {
            allzeros = false;
          }
          if (c > "7") {
            octal = false;
          }
          this.readRune();
          c = this.peekRune();
        }
        if (c === ".") {
          fraction = true;
        } else if (c === "e" || c === "E") {
          exponent = true;
        } else if (octal && !allzeros) {
          this.endToken(val);
          this.error(
            this.pos,
            `obsolete form of octal literal; use 0o${val.raw.slice(1)}`
          );
        }
      }
    } else {
      // decimal
      while (isdigit(c)) {
        this.readRune();
        c = this.peekRune();
      }

      if (c === ".") {
        fraction = true;
      } else if (c === "e" || c === "E") {
        exponent = true;
      }
    }

    if (fraction) {
      this.readRune(); // consume '.'
      c = this.peekRune();
      while (isdigit(c)) {
        this.readRune();
        c = this.peekRune();
      }

      if (c === "e" || c === "E") {
        exponent = true;
      }
    }

    if (exponent) {
      this.readRune();
      c = this.peekRune();
      if (c === "+" || c === "-") {
        this.readRune();
        c = this.peekRune();
        if (!isdigit(c)) {
          this.error(this.pos, "invalid float literal");
        }
      }
      while (isdigit(c)) {
        this.readRune();
        c = this.peekRune();
      }
    }

    this.endToken(val);
    if (fraction || exponent) {
      // TODO: missing
      let v = parseFloat(val.raw);
      if (isNaN(v)) {
        this.error(this.pos, "invalid float literal");
      }
      val.float = v;
      return Token.FLOAT;
    } else {
      let err: Error | null = null;
      const s: string = val.raw;
      val.bigInt = null;
      if (s.length > 2 && s[0] === "0" && (s[1] === "o" || s[1] === "O")) {
        val.int = parseInt(s.substring(2), 8);
      } else if (
        s.length > 2 &&
        s[0] === "0" &&
        (s[1] === "b" || s[1] === "B")
      ) {
        val.int = parseInt(s.substring(2), 2);
      } else {
        val.int = parseInt(s, 10);
        // FIXME: fuck
        // if (isNaN(val.int)) {
        //   const num: bigInt.BigInteger = bigInt(s, 10);
        //   if (!num.isNaN()) {
        //     val.bigInt = num;
        //     err = null;
        //   }
        // }
      }
      if (err !== null) {
        this.error(start, "invalid int literal");
      }
      return Token.INT;
    }
  }
}

// isIdent reports whether c is an identifier rune.
function isIdent(c: string): boolean {
  return isdigit(c) || isIdentStart(c);
}

function isIdentStart(c: string): boolean {
  return (
    ("a" <= c && c <= "z") ||
    ("A" <= c && c <= "Z") ||
    c == "_" ||
    /[a-zA-Z]/.test(c)
  );
}

function isdigit(c: string): boolean {
  return "0" <= c && c <= "9";
}
function isodigit(c: string): boolean {
  return "0" <= c && c <= "7";
}
function isxdigit(c: string): boolean {
  return isdigit(c) || ("A" <= c && c <= "F") || ("a" <= c && c <= "f");
}
function isbdigit(c: string): boolean {
  return "0" == c || c == "1";
}

// BUG:
function isFilePortion(src: unknown): src is FilePortion {
  return (
    typeof src === "object" &&
    src !== null &&
    "Content" in src &&
    "FirstLine" in src &&
    "FirstCol" in src
  );
}

// import * as fs from "fs";
// import * as path from "path";

// function readSource(filename: string, src: unknown): Promise<Buffer> {
//   switch (typeof src) {
//     case "string":
//       return Promise.resolve(Buffer.from(src));
//     case "object":
//       if (Buffer.isBuffer(src)) {
//         return Promise.resolve(src);
//       } else if (typeof src === "function") {
//         return src().then((data: unknown) => readSource(filename, data));
//       } else if ("Content" in src) {
//         return Promise.resolve(src.Content);
//       } else if (src === null) {
//         return fs.promises.readFile(filename);
//       }
//     default:
//       throw new Error(`invalid source: ${typeof src}`);
//   }
// }
