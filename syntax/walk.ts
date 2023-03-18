import { Node, Stmt } from "./syntax";
import {
  isFile,
  isExprStmt,
  isBranchStmt,
  isIfStmt,
  isAssignStmt,
  isDefStmt,
  isForStmt,
  isReturnStmt,
  isLoadStmt,
  isIdent,
  isLiteral,
  isListExpr,
  isParenExpr,
  isCondExpr,
  isIndexExpr,
  isDictEntry,
  isSliceExpr,
  isComprehension,
  isIfClause,
  isForClause,
  isTupleExpr,
  isDictExpr,
  isUnaryExpr,
  isBinaryExpr,
  isDotExpr,
  isCallExpr,
  isLambdaExpr,
} from "./syntax";

function walkStmts(stmts: Stmt[], f: (node: Node) => boolean): void {
  for (const stmt of stmts) {
    Walk(stmt, f);
  }
}

function Walk(n: Node, f: (n: Node) => boolean): void {
  if (n === null) {
    throw new Error("nil");
  }
  if (!f(n)) {
    return;
  }

  if (isFile(n)) {
    walkStmts(n.Stmts, f);
  } else if (isExprStmt(n)) {
    Walk(n.X, f);
    Walk(n.X, f);
  } else if (isBranchStmt(n)) {
    // nop
    //
  } else if (isIfStmt(n)) {
    Walk(n.cond, f);
    walkStmts(n.trueBody, f);
    walkStmts(n.falseBody, f);
  } else if (isAssignStmt(n)) {
    Walk(n.LHS, f);
    Walk(n.RHS, f);
  } else if (isDefStmt(n)) {
    Walk(n.Name, f);
    for (const param of n.Params) {
      Walk(param, f);
    }
    walkStmts(n.Body, f);
  } else if (isForStmt(n)) {
    Walk(n.Vars, f);
    Walk(n.X, f);
    walkStmts(n.Body, f);
  } else if (isReturnStmt(n)) {
    if (n.Result != null && n.Result != undefined) {
      Walk(n.Result, f);
    }
  } else if (isLoadStmt(n)) {
    Walk(n.Module, f);
    for (const from of n.From) {
      Walk(from, f);
    }
    for (const to of n.To) {
      Walk(to, f);
    }
  } else if (isIdent(n) || isLiteral(n)) {
    // nop
    //
  } else if (isListExpr(n)) {
    for (const x of n.list) {
      Walk(x, f);
    }
  } else if (isParenExpr(n)) {
    Walk(n.x, f);
  } else if (isCondExpr(n)) {
    Walk(n.Cond, f);
    Walk(n.True, f);
    Walk(n.False, f);
  } else if (isIndexExpr(n)) {
    Walk(n.X, f);
    Walk(n.Y, f);
  } else if (isDictEntry(n)) {
    Walk(n.Key, f);
    Walk(n.Value, f);
  } else if (isSliceExpr(n)) {
    Walk(n.X, f);
    if (n.Lo !== null) {
      Walk(n.Lo, f);
    }
    if (n.Hi !== null) {
      Walk(n.Hi, f);
    }
    if (n.Step !== null) {
      Walk(n.Step, f);
    }
  } else if (isComprehension(n)) {
    Walk(n.Body, f);
    for (const clause of n.Clauses) {
      Walk(clause, f);
    }
  } else if (isIfClause(n)) {
    Walk(n.Cond, f);
  } else if (isForClause(n)) {
    Walk(n.vars, f);
    Walk(n.x, f);
  } else if (isTupleExpr(n)) {
    for (const x of n.List) {
      Walk(x, f);
    }
  } else if (isDictExpr(n)) {
    for (const entry of n.List) {
      Walk(entry, f);
    }
  } else if (isUnaryExpr(n)) {
    const unaryExpr = n;
    if (unaryExpr.X !== null) {
      Walk(unaryExpr.X, f);
    }
  } else if (isBinaryExpr(n)) {
    Walk(n.X, f);
    Walk(n.Y, f);
  } else if (isDotExpr(n)) {
    Walk(n.X, f);
    Walk(n.Name, f);
  } else if (isCallExpr(n)) {
    const callExpr = n;
    Walk(callExpr.Fn, f);
    for (const arg of callExpr.Args) {
      Walk(arg, f);
    }
  } else if (isLambdaExpr(n)) {
    const lambdaExpr = n;
    for (const param of lambdaExpr.params) {
      Walk(param, f);
    }
    Walk(lambdaExpr.body, f);
  } else {
    throw new Error(n.toString());
  }
}
