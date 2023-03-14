import { Node, Stmt } from "./syntax"; // 根据需要更改导入语句

import {*} from "./syntax"; // 根据需要更改导入语句

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

  // TODO(adonovan): opt: order cases using profile data.
  switch (n.type) {
    case "File":
      walkStmts((n as File).Stmts, f);
      break;

    case "ExprStmt":
      Walk((n as ExprStmt).X, f);
      break;

    case "BranchStmt":
      // no-op
      break;

    case "IfStmt":
      Walk((n as IfStmt).Cond, f);
      walkStmts((n as IfStmt).True, f);
      walkStmts((n as IfStmt).False, f);
      break;

    case "AssignStmt":
      Walk((n as AssignStmt).LHS, f);
      Walk((n as AssignStmt).RHS, f);
      break;

    case "DefStmt":
      Walk((n as DefStmt).Name, f);
      for (const param of (n as DefStmt).Params) {
        Walk(param, f);
      }
      walkStmts((n as DefStmt).Body, f);
      break;

    case "ForStmt":
      Walk((n as ForStmt).Vars, f);
      Walk((n as ForStmt).X, f);
      walkStmts((n as ForStmt).Body, f);
      break;

    case "ReturnStmt":
      if ((n as ReturnStmt).Result !== null) {
        Walk((n as ReturnStmt).Result, f);
      }
      break;

    case "LoadStmt":
      Walk((n as LoadStmt).Module, f);
      for (const from of (n as LoadStmt).From) {
        Walk(from, f);
      }
      for (const to of (n as LoadStmt).To) {
        Walk(to, f);
      }
      break;

    case "Ident":
    case "Literal":
      // no-op
      break;

    case "ListExpr":
      for (const x of (n as ListExpr).List) {
        Walk(x, f);
      }
      break;

    case "ParenExpr":
      Walk((n as ParenExpr).X, f);
      break;

    case "CondExpr":
      Walk((n as CondExpr).Cond, f);
      Walk((n as CondExpr).True, f);
      Walk((n as CondExpr).False, f);
      break;

    case "IndexExpr":
      Walk((n as IndexExpr).X, f);
      Walk((n as IndexExpr).Y, f);
      break;

    case "DictEntry":
      Walk((n as DictEntry).Key, f);
      Walk((n as DictEntry).Value, f);
      break;

    case "SliceExpr":
      Walk((n as SliceExpr).X, f);
      if ((n as SliceExpr).Lo !== null) {
        Walk((n as SliceExpr).Lo, f);
      }
      if ((n as SliceExpr).Hi !== null) {
        Walk((n as SliceExpr).Hi, f);
      }
      if ((n as SliceExpr).Step !== null) {
        Walk((n as SliceExpr).Step, f);
      }
      break;

    case "Comprehension":
      Walk((n as Comprehension).Body, f);
      for (const clause of (n as Comprehension).Clauses) {
        Walk(clause

    case "IfClause":
      Walk((n as IfClause).Cond, f);
      break;
    case "ForClause":
      Walk((n as ForClause).Vars, f);
      Walk((n as ForClause).X, f);
      break;
    case "TupleExpr":
      for (const x of (n as TupleExpr).List) {
        Walk(x, f);
      }
      break;
    case "DictExpr":
      for (const entry of (n as DictExpr).List) {
        Walk(entry, f);
      }
      break;
    case "UnaryExpr":
      const unaryExpr = n as UnaryExpr;
      if (unaryExpr.X !== null) {
        Walk(unaryExpr.X, f);
      }
      break;
    case "BinaryExpr":
      Walk((n as BinaryExpr).X, f);
      Walk((n as BinaryExpr).Y, f);
      break;
    case "DotExpr":
      Walk((n as DotExpr).X, f);
      Walk((n as DotExpr).Name, f);
      break;
    case "CallExpr":
      const callExpr = n as CallExpr;
      Walk(callExpr.Fn, f);
      for (const arg of callExpr.Args) {
        Walk(arg, f);
      }
      break;
    case "LambdaExpr":
      const lambdaExpr = n as LambdaExpr;
      for (const param of lambdaExpr.Params) {
        Walk(param, f);
      }
      Walk(lambdaExpr.Body, f);
      break;
    default:
      throw new Error(n.toString());
  }
}
