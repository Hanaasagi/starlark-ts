import * as resolve from '../resolve/resolve';
import { ExprStmt } from '../starlark-parser';
import { ParseCompoundStmt } from '../starlark-parser/parse';
import { EvalExpr, ExecREPLChunk, Thread } from '../starlark-runtime/eval';
import { StringDict } from '../starlark-runtime/values';
import * as rl from './readline';

export function REPL(thread: Thread, globals: StringDict) {
  while (true) {
    repl(thread, globals);
  }
}

function repl(thread: Thread, globals: StringDict) {
  rl.setPrompt('>>> ');
  rl.prompt();

  let flag = false;

  let readline_ = (): [string, Error | null] => {
    if (flag) {
      rl.prompt();
    }
    try {
      return [rl.readline(), null];
    } catch (error) {
      return ['', err];
    } finally {
      flag = true;
      rl.setPrompt('... ');
    }
  };

  let [f, err] = ParseCompoundStmt('<stdin>', readline_);
  if (err || f == null) {
    return;
  }

  if (f.Stmts.length == 1) {
    let expr = f.Stmts[0];
    if (expr instanceof ExprStmt) {
      // console.log('##########', 'EXEC EvalExpr');

      const [v, err] = EvalExpr(thread, expr.X, globals);
      if (err) {
        throw err;
      }

      // print
      // console.log(v);
      return;
    }
  }

  // console.log('##########', 'ExecREPLChunk');
  ExecREPLChunk(f, thread, globals);
}
