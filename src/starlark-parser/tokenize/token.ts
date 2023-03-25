import { Position } from './position';

// A Token represents a Starlark lexical token.
export enum Token {
  // illegal token
  ILLEGAL = 'illegal token',
  // end of file
  EOF = 'end of file',
  // newline
  NEWLINE = 'newline',
  // indent
  INDENT = 'indent',
  // outdent
  OUTDENT = 'outdent',
  // identifier
  IDENT = 'identifier',
  // int literal
  INT = 'int literal',
  // float literal
  FLOAT = 'float literal',
  // string literal
  STRING = 'string literal',
  // bytes literal
  BYTES = 'bytes literal',
  // +
  PLUS = '+',
  // -
  MINUS = '-',
  // *
  STAR = '*',
  // /
  SLASH = '/',
  // //
  SLASHSLASH = '//',
  // %
  PERCENT = '%',
  // &
  AMP = '&',
  // |
  PIPE = '|',
  // ^
  CIRCUMFLEX = '^',
  // <<
  LTLT = '<<',
  // >>
  GTGT = '>>',
  // ~
  TILDE = '~',
  // .
  DOT = '.',
  //,
  COMMA = ',',
  // =
  EQ = '=',
  // ;
  SEMI = ';',
  // :
  COLON = ':',
  // (
  LPAREN = '(',
  // )
  RPAREN = ')',
  // [
  LBRACK = '[',
  // ]
  RBRACK = ']',
  // {
  LBRACE = '{',
  // }
  RBRACE = '}',
  // <
  LT = '<',
  // >
  GT = '>',
  // >=
  GE = '>=',
  // <=
  LE = '<=',
  // ==
  EQL = '==',
  // !=
  NEQ = '!=',
  // +=
  PLUS_EQ = '+=',
  // -=
  MINUS_EQ = '-=',
  // *=
  STAR_EQ = '*=',
  // /=
  SLASH_EQ = '/=',
  // //=
  SLASHSLASH_EQ = '//=',
  // %=
  PERCENT_EQ = '%=',
  // &=
  AMP_EQ = '&=',
  // |=
  PIPE_EQ = '|=',
  // ^=
  CIRCUMFLEX_EQ = '^=',
  // <<=
  LTLT_EQ = '<<=',
  // >>=
  GTGT_EQ = '>>=',
  // **
  STARSTAR = '**',
  // and
  AND = 'and',
  // break
  BREAK = 'break',
  // continue
  CONTINUE = 'continue',
  // def
  DEF = 'def',
  // elif
  ELIF = 'elif',
  // else
  ELSE = 'else',
  // for
  FOR = 'for',
  // if
  IF = 'if',
  // in
  IN = 'in',
  // lambda
  LAMBDA = 'lambda',
  // load
  LOAD = 'load',
  // not
  NOT = 'not',
  // not in (synthesized by parser)
  NOT_IN = 'not in',
  // or
  OR = 'or',
  // pass
  PASS = 'pass',
  // return
  RETURN = 'return',
  // while
  WHILE = 'while',
}

// BUG:
export const keywordToken: Record<string, Token> = {
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
  raw: string; // raw text of token
  int: number; // decoded int
  bigInt: bigint | null; // decoded integers > int64
  float: number; // decoded float
  string: string; // decoded string or bytes
  pos: Position; // start position of token

  constructor(
    raw?: string,
    int?: number,
    bigInt?: bigint | null,
    float?: number,
    string?: string,
    pos?: Position
  ) {
    this.raw = raw || '';
    this.int = int || 0;
    this.bigInt = bigInt || null;
    this.float = float || 0;
    this.string = string || '';
    this.pos = pos == undefined ? Position.default() : pos;
  }
}
