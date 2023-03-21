"use strict";
exports.__esModule = true;
exports.Walk = void 0;
var syntax_1 = require("./syntax");
function walkStmts(stmts, f) {
    for (var _i = 0, stmts_1 = stmts; _i < stmts_1.length; _i++) {
        var stmt = stmts_1[_i];
        Walk(stmt, f);
    }
}
function Walk(n, f) {
    if (n === null) {
        throw new Error("nil");
    }
    if (!f(n)) {
        return;
    }
    if ((0, syntax_1.isFile)(n)) {
        walkStmts(n.Stmts, f);
    }
    else if ((0, syntax_1.isExprStmt)(n)) {
        Walk(n.X, f);
        Walk(n.X, f);
    }
    else if ((0, syntax_1.isBranchStmt)(n)) {
        // nop
        //
    }
    else if ((0, syntax_1.isIfStmt)(n)) {
        Walk(n.cond, f);
        walkStmts(n.trueBody, f);
        walkStmts(n.falseBody, f);
    }
    else if ((0, syntax_1.isAssignStmt)(n)) {
        Walk(n.LHS, f);
        Walk(n.RHS, f);
    }
    else if ((0, syntax_1.isDefStmt)(n)) {
        Walk(n.Name, f);
        for (var _i = 0, _a = n.Params; _i < _a.length; _i++) {
            var param = _a[_i];
            Walk(param, f);
        }
        walkStmts(n.Body, f);
    }
    else if ((0, syntax_1.isForStmt)(n)) {
        Walk(n.Vars, f);
        Walk(n.X, f);
        walkStmts(n.Body, f);
    }
    else if ((0, syntax_1.isReturnStmt)(n)) {
        if (n.Result != null && n.Result != undefined) {
            Walk(n.Result, f);
        }
    }
    else if ((0, syntax_1.isLoadStmt)(n)) {
        Walk(n.Module, f);
        for (var _b = 0, _c = n.From; _b < _c.length; _b++) {
            var from = _c[_b];
            Walk(from, f);
        }
        for (var _d = 0, _e = n.To; _d < _e.length; _d++) {
            var to = _e[_d];
            Walk(to, f);
        }
    }
    else if ((0, syntax_1.isIdent)(n) || (0, syntax_1.isLiteral)(n)) {
        // nop
        //
    }
    else if ((0, syntax_1.isListExpr)(n)) {
        for (var _f = 0, _g = n.list; _f < _g.length; _f++) {
            var x = _g[_f];
            Walk(x, f);
        }
    }
    else if ((0, syntax_1.isParenExpr)(n)) {
        Walk(n.x, f);
    }
    else if ((0, syntax_1.isCondExpr)(n)) {
        Walk(n.Cond, f);
        Walk(n.True, f);
        Walk(n.False, f);
    }
    else if ((0, syntax_1.isIndexExpr)(n)) {
        Walk(n.X, f);
        Walk(n.Y, f);
    }
    else if ((0, syntax_1.isDictEntry)(n)) {
        Walk(n.Key, f);
        Walk(n.Value, f);
    }
    else if ((0, syntax_1.isSliceExpr)(n)) {
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
    }
    else if ((0, syntax_1.isComprehension)(n)) {
        Walk(n.Body, f);
        for (var _h = 0, _j = n.Clauses; _h < _j.length; _h++) {
            var clause = _j[_h];
            Walk(clause, f);
        }
    }
    else if ((0, syntax_1.isIfClause)(n)) {
        Walk(n.Cond, f);
    }
    else if ((0, syntax_1.isForClause)(n)) {
        Walk(n.vars, f);
        Walk(n.x, f);
    }
    else if ((0, syntax_1.isTupleExpr)(n)) {
        for (var _k = 0, _l = n.List; _k < _l.length; _k++) {
            var x = _l[_k];
            Walk(x, f);
        }
    }
    else if ((0, syntax_1.isDictExpr)(n)) {
        for (var _m = 0, _o = n.List; _m < _o.length; _m++) {
            var entry = _o[_m];
            Walk(entry, f);
        }
    }
    else if ((0, syntax_1.isUnaryExpr)(n)) {
        var unaryExpr = n;
        if (unaryExpr.X !== null) {
            Walk(unaryExpr.X, f);
        }
    }
    else if ((0, syntax_1.isBinaryExpr)(n)) {
        Walk(n.X, f);
        Walk(n.Y, f);
    }
    else if ((0, syntax_1.isDotExpr)(n)) {
        Walk(n.X, f);
        Walk(n.Name, f);
    }
    else if ((0, syntax_1.isCallExpr)(n)) {
        var callExpr = n;
        Walk(callExpr.Fn, f);
        for (var _p = 0, _q = callExpr.Args; _p < _q.length; _p++) {
            var arg = _q[_p];
            Walk(arg, f);
        }
    }
    else if ((0, syntax_1.isLambdaExpr)(n)) {
        var lambdaExpr = n;
        for (var _r = 0, _s = lambdaExpr.params; _r < _s.length; _r++) {
            var param = _s[_r];
            Walk(param, f);
        }
        Walk(lambdaExpr.body, f);
    }
    else {
        throw new Error(n.toString());
    }
}
exports.Walk = Walk;
