// Package compile defines the Starlark bytecode compiler.
// It is an internal package of the Starlark interpreter and is not directly accessible to clients.
//
// The compiler generates byte code with optional uint32 operands for a
// virtual machine with the following components:
//   - a program counter, which is an index into the byte code array.
//   - an operand stack, whose maximum size is computed for each function by the compiler.
//   - an stack of active iterators.
//   - an array of local variables.
//     The number of local variables and their indices are computed by the resolver.
//     Locals (possibly including parameters) that are shared with nested functions
//     are 'cells': their locals array slot will contain a value of type 'cell',
//     an indirect value in a box that is explicitly read/updated by instructions.
//   - an array of free variables, for nested functions.
//     Free variables are a subset of the ancestors' cell variables.
//     As with locals and cells, these are computed by the resolver.
//   - an array of global variables, shared among all functions in the same module.
//     All elements are initially nil.
//   - two maps of predeclared and universal identifiers.
//
// Each function has a line number table that maps each program counter
// offset to a source position, including the column number.
//
// Operands, logically uint32s, are encoded using little-endian 7-bit
// varints, the top bit indicating that more bytes follow.
import * as binding from '../resolve/binding';
import * as resolve from '../resolve/resolve';
import { Token } from '../starlark-parser';
import { Position } from '../starlark-parser';
import * as syntax from '../starlark-parser/syntax';

// Disassemble causes the assembly code for each function
// to be printed to stderr as it is generated.
var Disassemble = false;

var debug = require('debug')('compiler');

// Increment this to force recompilation of saved bytecode files.
export const Version = 13;
const variableStackEffect = 0x7f;

// "x DUP x x" is a "stack picture" that describes the state of the
// stack before and after execution of the instruction.
//
// OP<index> indicates an immediate operand that is an index into the
// specified table: locals, names, freevars, constants.
export enum Opcode {
  NOP,
  DUP,
  DUP2,
  POP,
  EXCH,
  LT,
  GT,
  GE,
  LE,
  EQL,
  NEQ,
  PLUS,
  MINUS,
  STAR,
  SLASH,
  SLASHSLASH,
  PERCENT,
  AMP,
  PIPE,
  CIRCUMFLEX,
  LTLT,
  GTGT,
  IN,
  UPLUS,
  UMINUS,
  TILDE,
  NONE,
  TRUE,
  FALSE,
  MANDATORY,
  ITERPUSH,
  ITERPOP,
  NOT,
  RETURN,
  SETINDEX,
  INDEX,
  SETDICT,
  SETDICTUNIQ,
  APPEND,
  SLICE,
  INPLACE_ADD,
  INPLACE_PIPE,
  MAKEDICT,
  JMP,
  CJMP,
  ITERJMP,
  CONSTANT,
  MAKETUPLE,
  MAKELIST,
  MAKEFUNC,
  LOAD,
  SETLOCAL,
  SETGLOBAL,
  LOCAL,
  FREE,
  FREECELL,
  LOCALCELL,
  SETLOCALCELL,
  GLOBAL,
  PREDECLARED,
  UNIVERSAL,
  ATTR,
  SETFIELD,
  UNPACK,
  CALL,
  CALL_VAR,
  CALL_KW,
  CALL_VAR_KW,
}
export const OpcodeArgMin = Opcode.JMP;
export const OpcodeMax = Opcode.CALL_VAR_KW;

var opcodeNames = new Map<Opcode, string>([
  [Opcode.AMP, 'amp'],
  [Opcode.APPEND, 'append'],
  [Opcode.ATTR, 'attr'],
  [Opcode.CALL, 'call'],
  [Opcode.CALL_KW, 'call_kw '],
  [Opcode.CALL_VAR, 'call_var'],
  [Opcode.CALL_VAR_KW, 'call_var_kw'],
  [Opcode.CIRCUMFLEX, 'circumflex'],
  [Opcode.CJMP, 'cjmp'],
  [Opcode.CONSTANT, 'constant'],
  [Opcode.DUP2, 'dup2'],
  [Opcode.DUP, 'dup'],
  [Opcode.EQL, 'eql'],
  [Opcode.EXCH, 'exch'],
  [Opcode.FALSE, 'false'],
  [Opcode.FREE, 'free'],
  [Opcode.FREECELL, 'freecell'],
  [Opcode.GE, 'ge'],
  [Opcode.GLOBAL, 'global'],
  [Opcode.GT, 'gt'],
  [Opcode.GTGT, 'gtgt'],
  [Opcode.IN, 'in'],
  [Opcode.INDEX, 'index'],
  [Opcode.INPLACE_ADD, 'inplace_add'],
  [Opcode.INPLACE_PIPE, 'inplace_pipe'],
  [Opcode.ITERJMP, 'iterjmp'],
  [Opcode.ITERPOP, 'iterpop'],
  [Opcode.ITERPUSH, 'iterpush'],
  [Opcode.JMP, 'jmp'],
  [Opcode.LE, 'le'],
  [Opcode.LOAD, 'load'],
  [Opcode.LOCAL, 'local'],
  [Opcode.LOCALCELL, 'localcell'],
  [Opcode.LT, 'lt'],
  [Opcode.LTLT, 'ltlt'],
  [Opcode.MAKEDICT, 'makedict'],
  [Opcode.MAKEFUNC, 'makefunc'],
  [Opcode.MAKELIST, 'makelist'],
  [Opcode.MAKETUPLE, 'maketuple'],
  [Opcode.MANDATORY, 'mandatory'],
  [Opcode.MINUS, 'minus'],
  [Opcode.NEQ, 'neq'],
  [Opcode.NONE, 'none'],
  [Opcode.NOP, 'nop'],
  [Opcode.NOT, 'not'],
  [Opcode.PERCENT, 'percent'],
  [Opcode.PIPE, 'pipe'],
  [Opcode.PLUS, 'plus'],
  [Opcode.POP, 'pop'],
  [Opcode.PREDECLARED, 'predeclared'],
  [Opcode.RETURN, 'return'],
  [Opcode.SETDICT, 'setdict'],
  [Opcode.SETDICTUNIQ, 'setdictuniq'],
  [Opcode.SETFIELD, 'setfield'],
  [Opcode.SETGLOBAL, 'setglobal'],
  [Opcode.SETINDEX, 'setindex'],
  [Opcode.SETLOCAL, 'setlocal'],
  [Opcode.SETLOCALCELL, 'setlocalcell'],
  [Opcode.SLASH, 'slash'],
  [Opcode.SLASHSLASH, 'slashslash'],
  [Opcode.SLICE, 'slice'],
  [Opcode.STAR, 'star'],
  [Opcode.TILDE, 'tilde'],
  [Opcode.TRUE, 'true'],
  [Opcode.UMINUS, 'uminus'],
  [Opcode.UNIVERSAL, 'universal'],
  [Opcode.UNPACK, 'unpack'],
  [Opcode.UPLUS, 'uplus'],
]);

export namespace Opcode {
  export function String(c: Opcode): string {
    return opcodeNames.get(c) || 'illegal op (${c})';
  }
}

// stackEffect records the effect on the size of the operand stack of
// each kind of instruction. For some instructions this requires computation.
const stackEffect: Map<Opcode, number> = new Map([
  [Opcode.AMP, -1],
  [Opcode.APPEND, -2],
  [Opcode.ATTR, 0],
  [Opcode.CALL, variableStackEffect],
  [Opcode.CALL_KW, variableStackEffect],
  [Opcode.CALL_VAR, variableStackEffect],
  [Opcode.CALL_VAR_KW, variableStackEffect],
  [Opcode.CIRCUMFLEX, -1],
  [Opcode.CJMP, -1],
  [Opcode.CONSTANT, +1],
  [Opcode.DUP2, +2],
  [Opcode.DUP, +1],
  [Opcode.EQL, -1],
  [Opcode.FALSE, +1],
  [Opcode.FREE, +1],
  [Opcode.FREECELL, +1],
  [Opcode.GE, -1],
  [Opcode.GLOBAL, +1],
  [Opcode.GT, -1],
  [Opcode.GTGT, -1],
  [Opcode.IN, -1],
  [Opcode.INDEX, -1],
  [Opcode.INPLACE_ADD, -1],
  [Opcode.INPLACE_PIPE, -1],
  [Opcode.ITERJMP, variableStackEffect],
  [Opcode.ITERPOP, 0],
  [Opcode.ITERPUSH, -1],
  [Opcode.JMP, 0],
  [Opcode.LE, -1],
  [Opcode.LOAD, -1],
  [Opcode.LOCAL, +1],
  [Opcode.LOCALCELL, +1],
  [Opcode.LT, -1],
  [Opcode.LTLT, -1],
  [Opcode.MAKEDICT, +1],
  [Opcode.MAKEFUNC, 0],
  [Opcode.MAKELIST, variableStackEffect],
  [Opcode.MAKETUPLE, variableStackEffect],
  [Opcode.MANDATORY, +1],
  [Opcode.MINUS, -1],
  [Opcode.NEQ, -1],
  [Opcode.NONE, +1],
  [Opcode.NOP, 0],
  [Opcode.NOT, 0],
  [Opcode.PERCENT, -1],
  [Opcode.PIPE, -1],
  [Opcode.PLUS, -1],
  [Opcode.POP, -1],
  [Opcode.PREDECLARED, +1],
  [Opcode.RETURN, -1],
  [Opcode.SETLOCALCELL, -1],
  [Opcode.SETDICT, -3],
  [Opcode.SETDICTUNIQ, -3],
  [Opcode.SETFIELD, -2],
  [Opcode.SETGLOBAL, -1],
  [Opcode.SETINDEX, -3],
  [Opcode.SETLOCAL, -1],
  [Opcode.SLASH, -1],
  [Opcode.SLASHSLASH, -1],
  [Opcode.SLICE, -3],
  [Opcode.STAR, -1],
  [Opcode.TRUE, +1],
  [Opcode.UMINUS, 0],
  [Opcode.UNIVERSAL, +1],
  [Opcode.UNPACK, variableStackEffect],
  [Opcode.UPLUS, 0],
]);

// The type of a bytes literal value, to distinguish from text string.
export type Bytes = string;

// A Binding is the name and position of a binding identifier.
export class Binding {
  name: string;
  pos: Position;

  constructor(name: string, pos: Position) {
    this.name = name;
    this.pos = pos;
  }
}

class Pclinecol {
  pc: number;
  line: number;
  col: number;
}

// A Funcode is the code of a compiled Starlark function.
//
// Funcodes are serialized by the encoder.function method,
// which must be updated whenever this declaration is changed.
export class Funcode {
  prog: Program;
  pos: Position;
  name: string;
  doc: string;
  // TODO: type bytes u8
  code: number[];
  pclinetab: number[];
  locals: Binding[];
  cells: number[];
  freevars: Binding[];
  maxStack: number;
  numParams: number;
  numKwonlyParams: number;
  hasVarargs: boolean;
  hasKwargs: boolean;

  // -- transient state --
  // BUG:
  // lntOnce: SyncOnce;
  lnt: Pclinecol[]; // TODO: define pclinecol type

  constructor(
    prog: Program,
    pos: Position,
    name: string,
    doc: string,
    locals: Binding[],
    freevars: Binding[]
  ) {
    this.prog = prog;
    this.pos = pos;
    this.name = name;
    this.doc = doc;
    this.code = new Array();
    this.pclinetab = new Array();
    this.locals = locals;
    this.cells = new Array();
    this.freevars = freevars;
    this.maxStack = 0;
    this.numParams = 0;
    this.numKwonlyParams = 0;
    this.hasKwargs = false;
    this.hasKwargs = false;
  }

  // Position returns the source position for program counter pc.
  position(pc: number): Position {
    // BUG:
    this.decodeLNT();

    let n = this.lnt.length;
    let i = 0;
    let j = n;

    while (i < j) {
      let h = Math.floor((i + j) / 2);
      if (!(h >= n - 1 || this.lnt[h + 1].pc > pc)) {
        i = h + 1;
      } else {
        j = h;
      }
    }

    let line: number = 0;
    let col: number = 0;
    if (i < n) {
      line = this.lnt[i].line;
      col = this.lnt[i].col;
    }

    let pos = this.pos;
    pos.col = col;
    pos.line = line;
    return pos;
  }

  // decodeLNT decodes the line number table and populates fn.lnt.
  // It is called at most once.
  decodeLNT(): void {
    // Conceptually the table contains rows of the form
    // (pc uint32, line int32, col int32), sorted by pc.
    // We use a delta encoding, since the differences
    // between successive pc, line, and column values
    // are typically small and positive (though line and
    // especially column differences may be negative).
    // The delta encoding starts from
    // {pc: 0, line: fn.Pos.Line, col: fn.Pos.Col}.
    //
    // Each entry is packed into one or more 16-bit values:
    // Δpc uint4
    // Δline int5
    // Δcol int6
    // incomplete uint1
    // The top 4 bits are the unsigned delta pc.
    // The next 5 bits are the signed line number delta.
    // The next 6 bits are the signed column number delta.
    // The bottom bit indicates that more rows follow because
    // one of the deltas was maxed out.
    // These field widths were chosen from a sample of real programs,
    // and allow >97% of rows to be encoded in a single uint16.

    this.lnt = new Array<Pclinecol>(); // a minor overapproximation
    let entry: Pclinecol = {
      pc: 0,
      line: this.pos.line,
      col: this.pos.col,
    };
    for (const x of this.pclinetab) {
      entry.pc += x >>> 12;
      entry.line += (x << 4) >> (16 - 5); // sign extend Δline
      entry.col += (x << 9) >> (16 - 6); // sign extend Δcol
      if ((x & 1) === 0) {
        this.lnt.push(entry);
      }
    }
  }
}

// Programs are serialized by the Program.Encode method,
// which must be updated whenever this declaration is changed.
export class Program {
  loads: Binding[];
  names: string[];
  constants: any[];
  functions: Funcode[];
  globals: Binding[];
  toplevel: Funcode | null;

  constructor(globals: Binding[]) {
    this.loads = new Array();
    this.names = new Array();
    this.constants = new Array();
    this.functions = new Array();
    this.globals = globals;
    this.toplevel = null;
  }
}

// A pcomp holds the compiler state for a Program.
class Pcomp {
  prog: Program;
  names: Map<string, number>;
  constants: Map<any, number>;
  functions: Map<Funcode, number>;

  constructor(
    prog: Program,
    names: Map<string, number>,
    constants: Map<any, number>,
    functions: Map<Funcode, number>
  ) {
    this.prog = prog;
    this.names = names;
    this.constants = constants;
    this.functions = functions;
  }

  func(
    name: string,
    pos: Position,
    stmts: syntax.Stmt[],
    locals: binding.Binding[],
    freevars: binding.Binding[]
  ): Funcode {
    debug('=============Exec Pcomp func==================');
    let fcomp = new Fcomp(
      this,
      pos,
      new Funcode(
        this.prog,
        pos,
        name,
        docStringFromBody(stmts),
        bindings(locals),
        bindings(freevars)
      ),
      new Array(),
      null
    );

    // Record indices of locals that require cells.
    for (let i = 0; i < locals.length; i++) {
      const local = locals[i];
      //@ts-ignore
      if (local.Scope === binding.Scope.Cell) {
        fcomp.fn.cells.push(i);
      }
    }

    debug(`start function(${name} @ ${pos})`);

    // Convert AST to a CFG of instructions.
    const entry = fcomp.newBlock();
    fcomp.block = entry;
    fcomp.stmts(stmts);
    debug('block is', fcomp.block);
    if (fcomp.block !== null) {
      fcomp.emit(Opcode.NONE);
      fcomp.emit(Opcode.RETURN);
    }

    let oops = false; // something bad happened

    const setinitialstack = (b: Block, depth: number): void => {
      if (b.initialstack === -1) {
        b.initialstack = depth;
      } else if (b.initialstack !== depth) {
        debug(
          `${b.index}: setinitialstack: depth mismatch: ${b.initialstack} vs ${depth}`
        );
        oops = true;
      }
    };

    // Linearize the CFG:
    // compute order, address, and initial
    // stack depth of each reachable block.
    let pc: number = 0;
    const blocks: Block[] = [];
    let maxstack: number = 0;

    let visit = (b: Block) => {
      debug('visit', b.insns);
      if (b.index >= 0) {
        return; // already visited
      }
      b.index = blocks.length;
      b.addr = pc;
      blocks.push(b);

      let stack = b.initialstack;
      debug(`${name} block ${b.index}: (stack = ${stack})`);
      // Begin
      debug('PC is', pc);
      let cjmpAddr: Insn | null = null;
      let isiterjmp = 0;
      for (let i = 0; i < b.insns.length; i++) {
        pc++;

        // Compute size of argument.
        let insn = b.insns[i];
        if (insn.op >= OpcodeArgMin) {
          switch (insn.op) {
            case Opcode.ITERJMP:
              isiterjmp = 1;
              cjmpAddr = b.insns[i];
              pc += 4;
              break;
            case Opcode.CJMP:
              cjmpAddr = b.insns[i];
              pc += 4;
              break;
            default:
              pc += argLen(insn.arg);
              break;
          }
        }

        // Compute effect on stack.
        let se = insn.stackeffect();
        debug(`\t${Opcode.String(insn.op)} ${stack} ${stack + se}`);
        stack += se;
        if (stack < 0) {
          debug(`After pc=${pc}: stack underflow`);
          oops = true;
        }
        if (stack + isiterjmp > maxstack) {
          maxstack = stack + isiterjmp;
        }
      }
      // After

      debug('PC after', pc);
      debug(`successors of block ${b.addr} (start=${b.index}):`);
      if (b.jmp) {
        debug(`jmp to ${b.jmp.index}`);
      }
      if (b.cjmp) {
        debug(`cjmp to ${b.cjmp.index}`);
      }

      // Place the jmp block next.
      if (b.jmp) {
        // jump threading (empty cycles are impossible)
        while (b.jmp?.insns === null) {
          b.jmp = b.jmp.jmp;
        }

        setinitialstack(b.jmp!, stack + isiterjmp);
        if (b.jmp && b.jmp.index < 0) {
          // Successor is not yet visited:
          // place it next and fall through.
          visit(b.jmp);
        } else {
          // Successor already visited;
          // explicit backward jump required.
          pc += 5;
        }
      }

      // Then the cjmp block.
      if (b.cjmp) {
        // jump threading (empty cycles are impossible)
        while (b.cjmp && b.cjmp.insns === null) {
          b.cjmp = b.cjmp.jmp;
        }

        setinitialstack(b.cjmp!, stack);
        visit(b.cjmp!);

        // Patch the CJMP/ITERJMP, if present.
        if (cjmpAddr !== null) {
          cjmpAddr.arg = b.cjmp!.addr;
        }
      }
    };
    setinitialstack(entry, 0);
    debug('visit entry', entry);
    visit(entry);

    const fn = fcomp.fn;
    debug('^^^^^^^^^^^^^^^^^^^^^', maxstack);
    fn.maxStack = maxstack;

    // Emit bytecode (and position table).
    if (Disassemble) {
      debug(`Function ${name}: (${blocks.length} blocks, ${pc} bytes)`);
    }
    fcomp.generate(blocks, pc);

    debug(`code = ${fn.code} maxstack = ${fn.maxStack}`);

    // Don't panic until we've completed printing of the function.
    if (oops) {
      throw new Error('internal error');
    }

    debug(`end function(${name} @${pos})`);

    return fn;
  }
  // nameIndex returns the index of the specified name
  // within the name pool, adding it if necessary.
  nameIndex(name: string): number {
    let index = this.names.get(name);
    if (index === undefined) {
      index = this.prog.names.length;
      this.names.set(name, index);
      this.prog.names.push(name);
    }
    return index;
  }

  // constantIndex returns the index of the specified constant
  // within the constant pool, adding it if necessary.
  constantIndex(v: any): number {
    // BUG:
    let index = this.constants.get(v);
    if (index === undefined) {
      index = this.prog.constants.length;
      this.constants.set(v, index!);
      this.prog.constants.push(v);
    }
    return index!;
  }

  // functionIndex returns the index of the specified function
  // AST the nestedfun pool, adding it if necessary.
  functionIndex(fn: Funcode): number {
    let index = this.functions.get(fn);
    if (index === undefined) {
      index = this.prog.functions.length;
      this.functions.set(fn, index);
      this.prog.functions.push(fn);
    }
    return index;
  }
}

class Fcomp {
  public pcomp: Pcomp;
  public pos: Position;
  public fn: Funcode;
  public loops: Loop[];
  public block: Block | null;

  constructor(
    pcomp: Pcomp,
    pos: Position,
    fn: Funcode,
    loops: Loop[],
    block: Block | null
  ) {
    this.pcomp = pcomp;
    this.pos = pos;
    this.fn = fn;
    this.loops = loops;
    this.block = block;
  }

  generate(blocks: Block[], codelen: number): void {
    let code: number[] = [];
    let pclinetab: number[] = [];
    let prev: Pclinecol = {
      pc: 0,
      line: this.fn.pos.line,
      col: this.fn.pos.col,
    };

    for (const b of blocks) {
      if (Disassemble) {
        console.error(`${b.index}: `);
      }
      let pc: number = b.addr;
      for (const insn of b.insns) {
        debug('IIIIIIIIIIII', insn);
        if (insn.line !== 0) {
          // Instruction has a source position. Delta-encode it.
          // See Funcode.Position for the encoding.
          while (true) {
            let incomplete: number = 0;
            // Δpc, uint4
            const deltapc: number = pc - prev.pc;
            if (deltapc > 0x0f) {
              incomplete = 1;
            }
            prev.pc += deltapc;

            // Δline, int5
            const deltaline: number = clip(
              insn.line - prev.line,
              -0x10,
              0x0f
            )[0];
            if (!clip(insn.line - prev.line, -0x10, 0x0f)[1]) {
              incomplete = 1;
            }
            prev.line += deltaline;

            // Δcol, int6
            const deltacol: number = clip(insn.col - prev.col, -0x20, 0x1f)[0];
            if (!clip(insn.col - prev.col, -0x20, 0x1f)[1]) {
              incomplete = 1;
            }
            prev.col += deltacol;

            const entry: number =
              ((deltapc << 12) & 0xf000) |
              ((deltaline << 7) & 0x3f80) |
              ((deltacol << 1) & 0x7e) |
              incomplete;
            pclinetab.push(entry);

            if (incomplete === 0) {
              break;
            }
          }

          if (Disassemble) {
            debug('Disassemble todo');
            // console.error(
            //   `\t\t\t\t\t; ${path.basename(this.fn.pos.filename())}:${insn.line
            //   }:${insn.col}`
            // );
          }
        }

        if (Disassemble) {
          PrintOp(this.fn, pc, insn.op, insn.arg);
        }

        // debug("code is", code, insn.op);
        code.push(insn.op);
        pc++;

        if (insn.op >= OpcodeArgMin) {
          if (insn.op === Opcode.CJMP || insn.op === Opcode.ITERJMP) {
            code = addUint32(code, insn.arg, 4); // pad arg to 4 bytes
          } else {
            code = addUint32(code, insn.arg, 0);
          }
          pc = code.length;
        }
      }

      if (b.jmp && b.jmp.index !== b.index + 1) {
        const addr: number = b.jmp.addr;
        if (Disassemble) {
          console.error(`\t${pc}\tjmp\t\t${addr}\t; block ${b.jmp.index}`);
        }

        code.push(Opcode.JMP);
        code = addUint32(code, addr, 4);
      }
    }

    if (code.length !== codelen) {
      throw new Error('internal error: wrong code length');
    }

    this.fn.pclinetab = pclinetab;
    this.fn.code = code;
  }

  newBlock(): Block {
    return new Block();
  }

  emit(op: Opcode): void {
    debug('EMIT', Opcode.String(op));
    if (op >= OpcodeArgMin) {
      throw new Error('missing arg: ' + op.toString());
    }

    let insn: Insn = new Insn(op, 0, this.pos.line, this.pos.col);
    this.block?.insns.push(insn);
    this.pos.line = 0;
    this.pos.col = 0;
  }

  emit1(op: Opcode, arg: number): void {
    if (op < OpcodeArgMin) {
      throw new Error('unwanted arg: ' + op.toString());
    }

    debug('EMIT1', Opcode.String(op), op, arg);
    const insn: Insn = new Insn(op, arg, this.pos.line, this.pos.col);
    this.block?.insns.push(insn);
    this.pos.line = 0;
    this.pos.col = 0;
  }

  // jump emits a jump to the specified block.
  // On return, the current block is unset.
  jump(b: Block) {
    if (b === this.block) {
      throw new Error('self-jump'); // unreachable: Starlark has no arbitrary looping constructs
    }
    this.block!.jmp = b;
    this.block = null;
  }

  // condjump emits a conditional jump (CJMP or ITERJMP)
  // to the specified true/false blocks.
  // (For ITERJMP, the cases are jmp/f/ok and cjmp/t/exhausted.)
  // On return, the current block is unset.
  condjump(op: Opcode, t: Block, f: Block) {
    if (!(op === Opcode.CJMP || op === Opcode.ITERJMP)) {
      throw new Error('not a conditional jump: ' + op.toString());
    }
    this.emit1(op, 0); // fill in address later
    this.block!.cjmp = t;
    this.jump(f);
  }

  // string emits code to push the specified string.
  string(s: string): void {
    this.emit1(Opcode.CONSTANT, this.pcomp.constantIndex(s));
  }

  // setPos sets the current source position.
  // It should be called prior to any operation that can fail dynamically.
  // All positions are assumed to belong to the same file.
  setPos(pos: Position): void {
    this.pos = pos;
  }

  // set emits code to store the top-of-stack value
  // to the specified local, cell, or global variable.
  set(id: syntax.Ident): void {
    const bind: binding.Binding = id.Binding as binding.Binding;
    switch (bind.scope) {
      case binding.Scope.Local:
        this.emit1(Opcode.SETLOCAL, bind.index);
        break;
      case binding.Scope.Cell:
        this.emit1(Opcode.SETLOCALCELL, bind.index);
        break;
      case binding.Scope.Global:
        this.emit1(Opcode.SETGLOBAL, bind.index);
        break;
      default:
        debug('should panic here');
        // log.Panicf(
        //   `${id.NamePos}: set(${id.Name}): not global/local/cell (${bind.scope})`
        // );
        break;
    }
  }

  // lookup emits code to push the value of the specified variable.
  lookup(id: syntax.Ident): void {
    debug('>>>>', id.Binding);
    const bind = id.Binding as binding.Binding;
    if (bind.scope !== binding.Scope.Universal) {
      // (universal lookup can't fail)
      this.setPos(id.NamePos);
    }
    switch (bind.scope) {
      case binding.Scope.Local:
        this.emit1(Opcode.LOCAL, bind.index);
        break;
      case binding.Scope.Free:
        this.emit1(Opcode.FREECELL, bind.index);
        break;
      case binding.Scope.Cell:
        this.emit1(Opcode.LOCALCELL, bind.index);
        break;
      case binding.Scope.Global:
        this.emit1(Opcode.GLOBAL, bind.index);
        break;
      case binding.Scope.Predeclared:
        this.emit1(Opcode.PREDECLARED, this.pcomp.nameIndex(id.Name));
        break;
      case binding.Scope.Universal:
        this.emit1(Opcode.UNIVERSAL, this.pcomp.nameIndex(id.Name));
        break;
      default:
        throw new Error(
          `${id.NamePos}: compiler.lookup(${id.Name}): scope = ${bind.scope}`
        );
    }
  }

  stmts(stmts: syntax.Stmt[]) {
    for (const stmt of stmts) {
      this.stmt(stmt);
    }
  }

  stmt(stmt: syntax.Stmt) {
    if (stmt instanceof syntax.ExprStmt) {
      if (stmt.X instanceof syntax.Literal) {
        // Opt: don't compile doc comments only to pop them.
        return;
      }
      this.expr(stmt.X);
      this.emit(Opcode.POP);
      return;
    }

    if (stmt instanceof syntax.BranchStmt) {
      // Resolver invariant: break/continue appear only within loops.
      switch (stmt.token) {
        case Token.PASS:
          // no-op
          break;
        case Token.BREAK:
          const b = this.loops[this.loops.length - 1].break_;
          this.jump(b);
          this.block = this.newBlock(); // dead code
          break;
        case Token.CONTINUE:
          const c = this.loops[this.loops.length - 1].continue_;
          this.jump(c);
          this.block = this.newBlock(); // dead code
          break;
      }
      return;
    }

    if (stmt instanceof syntax.IfStmt) {
      // Keep consistent with CondExpr.
      const t = this.newBlock();
      const f = this.newBlock();
      const done = this.newBlock();

      this.ifelse(stmt.cond, t, f);

      this.block = t;
      this.stmts(stmt.trueBody);
      this.jump(done);

      this.block = f;
      this.stmts(stmt.falseBody);
      this.jump(done);

      this.block = done;
      return;
    }

    if (stmt instanceof syntax.AssignStmt) {
      switch (stmt.Op) {
        case Token.EQ:
          // simple assignment: x = y
          this.expr(stmt.RHS);
          this.assign(stmt.OpPos, stmt.LHS);
          break;

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
          // augmented assignment: x += y
          let set: () => void;

          // Evaluate "address" of x exactly once to avoid duplicate side-effects.
          const lhs = unparen(stmt.LHS);
          if (lhs instanceof syntax.Ident) {
            // x = ...
            this.lookup(lhs);
            set = () => {
              this.set(lhs);
            };
          } else if (lhs instanceof syntax.IndexExpr) {
            // x[y] = ...
            this.expr(lhs.X);
            this.expr(lhs.Y);
            this.emit(Opcode.DUP2);
            this.setPos(lhs.Lbrack);
            this.emit(Opcode.INDEX);
            set = () => {
              this.setPos(lhs.Lbrack);
              this.emit(Opcode.SETINDEX);
            };
          } else if (lhs instanceof syntax.DotExpr) {
            // x.f = ...
            this.expr(lhs.X);
            this.emit(Opcode.DUP);
            const name = this.pcomp.nameIndex(lhs.Name.Name);
            this.setPos(lhs.Dot);
            this.emit1(Opcode.ATTR, name);
            set = () => {
              this.setPos(lhs.Dot);
              this.emit1(Opcode.SETFIELD, name);
            };
          } else {
            throw new Error(`Unexpected LHS type ${lhs}`);
          }

          this.expr(stmt.RHS);

          switch (stmt.Op) {
            case Token.PLUS_EQ:
              this.setPos(stmt.OpPos);
              this.emit(Opcode.INPLACE_ADD);
              set();
              break;

            case Token.PIPE_EQ:
              this.setPos(stmt.OpPos);
              this.emit(Opcode.INPLACE_PIPE);
              set();
              break;

            default:
              // BUG:
              // this.binop(stmt.OpPos, stmt.Op - Token.PLUS_EQ + Token.PLUS);
              set();
              break;
          }
      }
      return;
    }

    if (stmt instanceof syntax.DefStmt) {
      this.func(stmt.Function);
      this.set(stmt.Name);
      return;
    }

    if (stmt instanceof syntax.ForStmt) {
      // Keep consistent with ForClause.
      const head = this.newBlock();
      const body = this.newBlock();
      const tail = this.newBlock();

      this.expr(stmt.X);
      this.setPos(stmt.For);
      this.emit(Opcode.ITERPUSH);
      this.jump(head);

      this.block = head;
      this.condjump(Opcode.ITERJMP, tail, body);

      this.block = body;
      this.assign(stmt.For, stmt.Vars);
      this.loops.push(new Loop(tail, head));
      this.stmts(stmt.Body);
      this.loops.pop();
      this.jump(head);

      this.block = tail;
      this.emit(Opcode.ITERPOP);
      return;
    }

    if (stmt instanceof syntax.WhileStmt) {
      const head = this.newBlock();
      const body = this.newBlock();
      const done = this.newBlock();

      this.jump(head);
      this.block = head;
      this.ifelse(stmt.Cond, body, done);

      this.block = body;
      this.loops.push(new Loop(done, head));
      this.stmts(stmt.Body);
      this.loops.pop();
      this.jump(head);

      this.block = done;
      return;
    }

    if (stmt instanceof syntax.ReturnStmt) {
      if (stmt.Result) {
        this.expr(stmt.Result);
      } else {
        this.emit(Opcode.NONE);
      }
      this.emit(Opcode.RETURN);
      this.block = this.newBlock(); // dead code
      return;
    }

    if (stmt instanceof syntax.LoadStmt) {
      for (const name of stmt.From) {
        this.string(name.Name);
      }
      const module = stmt.Module.value as string;
      this.pcomp.prog.loads.push(new Binding(module, stmt.Module.tokenPos!));

      this.string(module);
      this.setPos(stmt.Load);
      this.emit1(Opcode.LOAD, stmt.From.length);
      for (const name of stmt.To.reverse()) {
        this.set(name);
      }
      return;
    }
    const [start, _] = stmt.span();
    debug(`${start}: exec: unexpected statement ${stmt} `);
  }

  assign(pos: Position, lhs: syntax.Expr): void {
    debug('-----');
    debug(pos, lhs);
    debug('-----');
    if (lhs instanceof syntax.ParenExpr) {
      // (lhs) = rhs
      this.assign(pos, lhs.x);
      return;
    }

    if (lhs instanceof syntax.Ident) {
      // x = rhs
      this.set(lhs);
      return;
    }
    if (lhs instanceof syntax.TupleExpr) {
      // x, y = rhs
      this.assignSequence(pos, lhs.List);
      return;
    }

    if (lhs instanceof syntax.ListExpr) {
      // [x, y] = rhs
      this.assignSequence(pos, lhs.list);
      return;
    }

    if (lhs instanceof syntax.IndexExpr) {
      // x[y] = rhs
      this.expr(lhs.X);
      this.emit(Opcode.EXCH);
      this.expr(lhs.Y);
      this.emit(Opcode.EXCH);
      this.setPos(lhs.Lbrack);
      this.emit(Opcode.SETINDEX);
      return;
    }

    if (lhs instanceof syntax.DotExpr) {
      // x.f = rhs
      this.expr(lhs.X);
      this.emit(Opcode.EXCH);
      this.setPos(lhs.Dot);
      this.emit1(Opcode.SETFIELD, this.pcomp.nameIndex(lhs.Name.Name));
      return;
    }
    throw new Error(`Unexpected expression type: ${lhs} `);
  }

  assignSequence(pos: Position, lhs: syntax.Expr[]): void {
    this.setPos(pos);
    this.emit1(Opcode.UNPACK, lhs.length);
    for (let i = 0; i < lhs.length; i++) {
      this.assign(pos, lhs[i]);
    }
  }

  expr(e: syntax.Expr) {
    debug('==========================');
    debug(e);
    debug('==========================');
    if (e instanceof syntax.ParenExpr) {
      this.expr(e.x);
      return;
    }

    if (e instanceof syntax.Ident) {
      this.lookup(e);
      return;
    }

    if (e instanceof syntax.Literal) {
      // e.Value is int64, float64, *bigInt, string
      let v = e.value;
      if (e.token === Token.BYTES) {
        v = v as string as Bytes;
      }
      this.emit1(Opcode.CONSTANT, this.pcomp.constantIndex(v));
      return;
    }
    if (e instanceof syntax.ListExpr) {
      for (let x of e.list) {
        this.expr(x);
      }
      this.emit1(Opcode.MAKELIST, e.list.length);
      return;
    }

    if (e instanceof syntax.CondExpr) {
      // Keep consistent with IfStmt.
      const t = this.newBlock();
      const f = this.newBlock();
      const done = this.newBlock();

      this.ifelse(e.Cond, t, f);

      this.block = t;
      this.expr(e.True);
      this.jump(done);

      this.block = f;
      this.expr(e.False);
      this.jump(done);

      this.block = done;
      return;
    }

    if (e instanceof syntax.IndexExpr) {
      this.expr(e.X);
      this.expr(e.Y);
      this.setPos(e.Lbrack);
      this.emit(Opcode.INDEX);
      return;
    }

    if (e instanceof syntax.SliceExpr) {
      this.setPos(e.Lbrack);
      this.expr(e.X);
      if (e.Lo != null) {
        this.expr(e.Lo);
      } else {
        this.emit(Opcode.NONE);
      }
      if (e.Hi != null) {
        this.expr(e.Hi);
      } else {
        this.emit(Opcode.NONE);
      }
      if (e.Step != null) {
        this.expr(e.Step);
      } else {
        this.emit(Opcode.NONE);
      }
      this.emit(Opcode.SLICE);
      return;
    }

    if (e instanceof syntax.Comprehension) {
      if (e.Curly) {
        this.emit(Opcode.MAKEDICT);
      } else {
        this.emit1(Opcode.MAKELIST, 0);
      }
      this.comprehension(e, 0);
      return;
    }

    if (e instanceof syntax.TupleExpr) {
      this.tuple(e.List);
      return;
    }

    if (e instanceof syntax.DictExpr) {
      this.emit(Opcode.MAKEDICT);
      for (const entry of e.List) {
        const dictEntry = entry as syntax.DictEntry;
        this.emit(Opcode.DUP);
        this.expr(dictEntry.Key);
        this.expr(dictEntry.Value);
        this.setPos(dictEntry.Colon);
        this.emit(Opcode.SETDICTUNIQ);
      }
      return;
    }

    if (e instanceof syntax.UnaryExpr) {
      this.expr(e.X!);
      this.setPos(e.OpPos);
      switch (e.Op) {
        case Token.MINUS:
          this.emit(Opcode.UMINUS);
          break;
        case Token.PLUS:
          this.emit(Opcode.UPLUS);
          break;
        case Token.NOT:
          this.emit(Opcode.NOT);
          break;
        case Token.TILDE:
          this.emit(Opcode.TILDE);
          break;
        default:
          throw new Error(`${e.OpPos}: unexpected unary op: ${e.Op} `);
      }
      return;
    }

    if (e instanceof syntax.BinaryExpr) {
      switch (e.Op) {
        case Token.OR:
          // x or y  =>  if x then x else y
          const done = this.newBlock();
          const y = this.newBlock();

          this.expr(e.X);
          this.emit(Opcode.DUP);
          this.condjump(Opcode.CJMP, done, y);

          this.block = y;
          this.emit(Opcode.POP); // discard X
          this.expr(e.Y);
          this.jump(done);

          this.block = done;
          break;

        case Token.AND:
          // x and y  =>  if x then y else x
          const done1 = this.newBlock();
          const y1 = this.newBlock();

          this.expr(e.X);
          this.emit(Opcode.DUP);
          this.condjump(Opcode.CJMP, y1, done1);

          this.block = y1;
          this.emit(Opcode.POP); // discard X
          this.expr(e.Y);
          this.jump(done1);

          this.block = done1;
          break;

        case Token.PLUS:
          this.plus(e);
          break;

        default:
          // all other strict binary operator (includes comparisons)
          this.expr(e.X);
          this.expr(e.Y);
          this.binop(e.OpPos, e.Op);
          break;
      }
      return;
    }

    if (e instanceof syntax.DotExpr) {
      this.expr(e.X);
      this.setPos(e.Dot);
      this.emit1(Opcode.ATTR, this.pcomp.nameIndex(e.Name.Name));
      return;
    }

    if (e instanceof syntax.CallExpr) {
      this.call(e);
      return;
    }

    if (e instanceof syntax.LambdaExpr) {
      this.func(e._function);
      return;
    }

    const start = e.span()[0];
    debug(`${start}: unexpected expr ${e.constructor.name} `);
  }

  plus(e: syntax.BinaryExpr): void {
    // Gather all the right operands of the left tree of plusses.
    // A tree (((a+b)+c)+d) becomes args=[a +b +c +d].
    const args: Summand[] = new Array();
    for (let plus = e; ; ) {
      args.push(new Summand(unparen(plus.Y), plus.OpPos));
      const left = unparen(plus.X) as syntax.Expr;
      if (!(left instanceof syntax.BinaryExpr) || left.Op !== Token.PLUS) {
        args.push(new Summand(left, null));
        break;
      }
      plus = left;
    }
    // Reverse args to syntactic order.
    args.reverse();

    // Fold sums of adjacent literals of the same type: ""+"", []+[], ()+().
    const out: Summand[] = []; // compact in situ
    for (let i = 0; i < args.length; ) {
      let j = i + 1;
      const code = addable(args[i].x);
      if (code) {
        while (j < args.length && addable(args[j].x) === code) {
          j++;
        }
        if (j > i + 1) {
          args[i].x = add(code!, args.slice(i, j));
        }
      }
      out.push(args[i]);
      i = j;
    }
    const compactArgs = out;

    // Emit code for an n-ary sum (n > 0).
    this.expr(compactArgs[0].x);
    for (let i = 1; i < compactArgs.length; i++) {
      const summand = compactArgs[i];
      this.expr(summand.x);
      this.setPos(summand.plusPos!);
      this.emit(Opcode.PLUS);
    }
  }

  binop(pos: Position, op: Token): void {
    // TODO(adonovan): simplify by assuming syntax and compiler constants align.
    this.setPos(pos);
    switch (op) {
      // arithmetic
      case Token.PLUS:
        this.emit(Opcode.PLUS);
        break;
      case Token.MINUS:
        this.emit(Opcode.MINUS);
        break;
      case Token.STAR:
        this.emit(Opcode.STAR);
        break;
      case Token.SLASH:
        this.emit(Opcode.SLASH);
        break;
      case Token.SLASHSLASH:
        this.emit(Opcode.SLASHSLASH);
        break;
      case Token.PERCENT:
        this.emit(Opcode.PERCENT);
        break;
      case Token.AMP:
        this.emit(Opcode.AMP);
        break;
      case Token.PIPE:
        this.emit(Opcode.PIPE);
        break;
      case Token.CIRCUMFLEX:
        this.emit(Opcode.CIRCUMFLEX);
        break;
      case Token.LTLT:
        this.emit(Opcode.LTLT);
        break;
      case Token.GTGT:
        this.emit(Opcode.GTGT);
        break;
      case Token.IN:
        this.emit(Opcode.IN);
        break;
      case Token.NOT_IN:
        this.emit(Opcode.IN);
        this.emit(Opcode.NOT);
        break;

      // comparisons
      case Token.EQL:
        this.emit(Opcode.EQL);
        break;
      case Token.NEQ:
        this.emit(Opcode.NEQ);
        break;
      case Token.GT:
        this.emit(Opcode.GT);
        break;
      case Token.LT:
        this.emit(Opcode.LT);
        break;
      case Token.LE:
        this.emit(Opcode.LE);
        break;
      case Token.GE:
        this.emit(Opcode.GE);
        break;
      default:
        debug(`${pos}: unexpected binary op: ${op} `);
        throw new Error('Unexpected binary op');
    }
  }

  call(call: syntax.CallExpr): void {
    // usual case
    this.expr(call.Fn);
    const [op, arg] = this.args(call);
    this.setPos(call.Lparen);
    this.emit1(op, arg);
  }

  // args emits code to push a tuple of positional arguments
  // and a tuple of named arguments containing alternating keys and values.
  // Either or both tuples may be empty.
  args(call: syntax.CallExpr): [Opcode, number] {
    let callmode = 0;
    // Compute the number of each kind of parameter.
    let p = 0; // number of positional arguments
    let n = 0; // number of named arguments
    let varargs: syntax.Expr | undefined;
    let kwargs: syntax.Expr | undefined;
    for (const arg of call.Args) {
      if (arg instanceof syntax.BinaryExpr && arg.Op === Token.EQ) {
        // named argument (name, value)
        // BUG: here
        // this.string(arg.X.(* syntax.Ident).Name);
        this.expr(arg.Y);
        n++;
        continue;
      }
      if (arg instanceof syntax.UnaryExpr) {
        if (arg.Op === Token.STAR) {
          callmode |= 1;
          varargs = arg.X!;
          continue;
        } else if (arg.Op === Token.STARSTAR) {
          callmode |= 2;
          kwargs = arg.X!;
          continue;
        }
      }
      // positional argument
      this.expr(arg);
      p++;
    }

    // *args
    if (varargs !== undefined) {
      this.expr(varargs);
    }

    // **kwargs
    if (kwargs !== undefined) {
      this.expr(kwargs);
    }

    // TODO: avoid this with a more flexible encoding.
    if (p >= 256 || n >= 256) {
      // resolve already checked this; should be unreachable
      throw new Error('too many arguments in call');
    }

    return [Opcode.CALL + callmode, (p << 8) | n];
  }

  tuple(elems: syntax.Expr[]): void {
    elems.forEach((elem) => this.expr(elem));
    this.emit1(Opcode.MAKETUPLE, elems.length);
  }

  // emit a comprehension with the given syntax comprehension and clause index
  comprehension(comp: syntax.Comprehension, clauseIndex: number): void {
    if (clauseIndex == comp.Clauses.length) {
      this.emit(Opcode.DUP);
      if (comp.Curly) {
        // dict: {k:v for ...}
        // Parser ensures that body is of form k:v.
        // Python-style set comprehensions {body for vars in x}
        // are not supported.
        const entry = comp.Body as syntax.DictEntry;
        this.expr(entry.Key);
        this.expr(entry.Value);
        this.setPos(entry.Colon);
        this.emit(Opcode.SETDICT);
      } else {
        // list: [body for vars in x]
        this.expr(comp.Body);
        this.emit(Opcode.APPEND);
      }
      return;
    }

    const clause = comp.Clauses[clauseIndex];
    if (clause instanceof syntax.IfClause) {
      const t = this.newBlock();
      const done = this.newBlock();
      this.ifelse((clause as syntax.IfClause).Cond, t, done);

      this.block = t;
      this.comprehension(comp, clauseIndex + 1);
      this.jump(done);

      this.block = done;
      return;
    }
    if (clause instanceof syntax.ForClause) {
      // Keep consistent with ForStmt.
      const head = this.newBlock();
      const body = this.newBlock();
      const tail = this.newBlock();

      this.expr(clause.x);
      this.setPos(clause.forPos);
      this.emit(Opcode.ITERPUSH);

      this.jump(head);

      this.block = head;
      this.condjump(Opcode.ITERJMP, tail, body);

      this.block = body;
      this.assign(clause.forPos, clause.vars); // TODO: Implement variable assignment
      this.comprehension(comp, clauseIndex + 1);
      this.jump(head);

      this.block = tail;
      this.emit(Opcode.ITERPOP);
      return;
    }

    let [start, _] = clause.span();
    throw new Error(`${start}: unexpected comprehension clause ${clause} `);
  }

  // TypeScript equivalent of the given Golang code
  func(f: binding.Function): void {
    // Evaluation of the defaults may fail, so record the position.
    this.setPos(f.pos);

    // To reduce allocation, we emit a combined tuple
    // for the defaults and the freevars.
    // The function knows where to split it at run time.

    // Generate tuple of parameter defaults. For:
    // def f(p1, p2=dp2, p3=dp3, *, k1, k2=dk2, k3, **kwargs)
    // the tuple is:
    // (dp2, dp3, MANDATORY, dk2, MANDATORY).
    let ndefaults = 0;
    let seenStar = false;
    for (const param of f.params) {
      if (param instanceof syntax.BinaryExpr) {
        this.expr(param.Y);
        ndefaults++;
      }
      if (param instanceof syntax.UnaryExpr) {
        seenStar = true; // * or *args (also **kwargs)
      }
      if (param instanceof syntax.Ident) {
        if (seenStar) {
          this.emit(Opcode.MANDATORY);
          ndefaults++;
        }
      }
    }

    // Capture the cells of the function's
    // free variables from the lexical environment.
    for (const freevar of f.freeVars) {
      // Don't call fcomp.lookup because we want
      // the cell itself, not its content.
      switch (freevar.scope) {
        case binding.Scope.Free:
          this.emit1(Opcode.FREE, freevar.index);
          break;
        case binding.Scope.Cell:
          this.emit1(Opcode.LOCAL, freevar.index);
          break;
      }
    }

    this.emit1(Opcode.MAKETUPLE, ndefaults + f.freeVars.length);

    const funcode = this.pcomp.func(
      f.name,
      f.pos,
      f.body,
      f.locals,
      f.freeVars
    );

    // TODO(adonovan): do compilations sequentially not as a tree,
    // to make the log easier to read.
    // Simplify by identifying Toplevel and functionIndex 0.
    // FIXME: missing debug
    debug(`resuming ${this.fn.name} @${this.pos} `);

    // def f(a, *, b=1) has only 2 parameters.
    let numParams = f.params.length;
    if (f.numKwonlyParams > 0 && !f.hasVarargs) {
      numParams--;
    }

    funcode.numParams = numParams;
    funcode.numKwonlyParams = f.numKwonlyParams;
    funcode.hasVarargs = f.hasVarargs;
    funcode.hasKwargs = f.hasKwargs;
    this.emit1(Opcode.MAKEFUNC, this.pcomp.functionIndex(funcode));
  }

  // ifelse emits a Boolean control flow decision.
  // On return, the current block is unset.
  ifelse(cond: syntax.Expr, t: Block, f: Block) {
    let y;
    if (cond instanceof syntax.UnaryExpr) {
      if (cond.Op == Token.NOT) {
        // if not x then goto t else goto f
        // =>
        // if x then goto f else goto t
        this.ifelse(cond.X!, f, t);
        return;
      }
    }
    if (cond instanceof syntax.BinaryExpr) {
      switch (cond.Op) {
        case Token.AND:
          // if x and y then goto t else goto f
          // =>
          // if x then ifelse(y, t, f) else goto f
          this.expr(cond.X);
          y = this.newBlock();
          this.condjump(Opcode.CJMP, y, f);

          this.block = y;
          this.ifelse(cond.Y, t, f);
          return;
        case Token.OR:
          // if x or y then goto t else goto f
          //    =>
          // if x then goto t else ifelse(y, t, f)
          this.expr(cond.X);
          y = this.newBlock();
          this.condjump(Opcode.CJMP, t, y);

          this.block = y;
          this.ifelse(cond.Y, t, f);
          return;
        case Token.NOT_IN:
          // if x not in y then goto t else goto f
          //    =>
          // if x in y then goto f else goto t
          const copy = cond;
          // BUG:
          copy.Op = Token.IN;
          this.expr(copy);
          this.condjump(Opcode.CJMP, f, t);
          return;
      }
    }
    // general case
    this.expr(cond);
    this.condjump(Opcode.CJMP, t, f);
  }
}

class Loop {
  public break_: Block;
  public continue_: Block;

  constructor(break_: Block, continue_: Block) {
    this.break_ = break_;
    this.continue_ = continue_;
  }
}

class Block {
  public insns: Insn[];
  public jmp?: Block;
  public cjmp?: Block;
  public initialstack: number = -1;
  public index: number = -1; // -1 => not encoded yet
  public addr: number = 0;

  constructor() {
    this.insns = new Array();
  }
}

class Insn {
  op: Opcode;
  arg: number;
  line: number;
  col: number;

  constructor(op: Opcode, arg: number, line: number, col: number) {
    this.op = op;
    this.arg = arg;
    this.line = line;
    this.col = col;
  }

  stackeffect(): number {
    let se: number = stackEffect.get(this.op)!;
    if (se === variableStackEffect) {
      const arg: number = Number(this.arg);
      switch (this.op) {
        case Opcode.CALL:
        case Opcode.CALL_KW:
        case Opcode.CALL_VAR:
        case Opcode.CALL_VAR_KW:
          se = -(2 * (this.arg & 0xff) + (this.arg >> 8));
          if (this.op !== Opcode.CALL) {
            se--;
          }
          if (this.op === Opcode.CALL_VAR_KW) {
            se--;
          }
          break;
        case Opcode.ITERJMP:
          se = 0;
          // Stack effect differs by successor:
          // +1 for jmp/false/ok
          //  0 for cjmp/true/exhausted
          // Handled specially in caller.
          break;
        case Opcode.MAKELIST:
        case Opcode.MAKETUPLE:
          se = 1 - arg;
          break;
        case Opcode.UNPACK:
          se = arg - 1;
          break;
        default:
          throw new Error(this.op.toString());
      }
    }
    return se;
  }
}

function bindings(bindings: binding.Binding[]): Binding[] {
  let res = new Array();
  for (var b of bindings) {
    res.push(new Binding(b.first!.Name, b.first!.NamePos));
  }
  return res;
}

// Expr compiles an expression to a program whose toplevel function evaluates it.
export function Expr(
  expr: syntax.Expr,
  name: string,
  locals: binding.Binding[]
): Program {
  const pos = expr.span()[0];
  const stmts: syntax.Stmt[] = [new syntax.ReturnStmt(null, expr)];
  return File(stmts, pos, name, locals, new Array());
}

// File compiles the statements of a file into a program.
export function File(
  stmts: syntax.Stmt[],
  pos: Position,
  name: string,
  locals: binding.Binding[],
  globals: binding.Binding[]
): Program {
  let pcomp = new Pcomp(
    new Program(bindings(globals)),
    new Map(),
    new Map(),
    new Map()
  );
  pcomp.prog.toplevel = pcomp.func(name, pos, stmts, locals, new Array());

  return pcomp.prog;
}

function docStringFromBody(body: syntax.Stmt[]): string {
  if (body.length === 0) {
    return '';
  }
  const expr = body[0] as syntax.ExprStmt;
  if (!expr) {
    return '';
  }
  const lit = expr.X as syntax.Literal;
  if (!lit || lit.token !== Token.STRING) {
    return '';
  }
  return lit.value as string;
}

function clip(x: number, min: number, max: number): [number, boolean] {
  if (x > max) {
    return [max, false];
  } else if (x < min) {
    return [min, false];
  } else {
    return [x, true];
  }
}

function addUint32(code: number[], x: number, min: number): number[] {
  let end: number = code.length + min;
  while (x >= 0x80) {
    code.push((x & 0xff) | 0x80);
    x >>= 7;
  }
  code.push(x);
  // Pad the operand with NOPs to exactly min bytes.
  while (code.length < end) {
    code.push(Opcode.NOP);
  }
  return code;
}

function argLen(x: number): number {
  let n = 0;
  while (x >= 0x80) {
    n++;
    x >>= 7;
  }
  return n + 1;
}

// PrintOp prints an instruction.
// It is provided for debugging.
export function PrintOp(
  fn: Funcode,
  pc: number,
  op: Opcode,
  arg: number
): void {
  if (op < OpcodeArgMin) {
    debug(`\t${pc} \t${Opcode.String(op)}`);
    return;
  }

  let comment = '';
  switch (op) {
    case Opcode.CONSTANT:
      const constant = fn.prog.constants[arg];
      if (typeof constant === 'string') {
        comment = JSON.stringify(constant);
        // FIXME:
        // } else if (constant instanceof Bytes) {
        //   comment = `b${JSON.stringify(constant.toString())} `;
      } else {
        comment = String(constant);
      }
      break;
    case Opcode.MAKEFUNC:
      comment = fn.prog.functions[arg].name;
      break;
    case Opcode.SETLOCAL:
    case Opcode.LOCAL:
      comment = fn.locals[arg].name;
      break;
    case Opcode.SETGLOBAL:
    case Opcode.GLOBAL:
      comment = fn.prog.globals[arg].name;
      break;
    case Opcode.ATTR:
    case Opcode.SETFIELD:
    case Opcode.PREDECLARED:
    case Opcode.UNIVERSAL:
      comment = fn.prog.names[arg];
      break;
    case Opcode.FREE:
      comment = fn.freevars[arg].name;
      break;
    case Opcode.CALL:
    case Opcode.CALL_VAR:
    case Opcode.CALL_KW:
    case Opcode.CALL_VAR_KW:
      comment = `${arg >> 8} pos, ${arg & 0xff} named`;
      break;
    default:
      // JMP, CJMP, ITERJMP, MAKETUPLE, MAKELIST, LOAD, UNPACK:
      // arg is just a number
      break;
  }
  const buf = new Array<string>();
  buf.push(`\t${pc} \t${Opcode.String(op)} \t${arg} `);
  if (comment !== '') {
    buf.push(`\t; ${comment} `);
  }
  debug(buf.join(''));
}

class Summand {
  x: syntax.Expr;
  plusPos: Position | null;

  constructor(x: syntax.Expr, plusPos: Position | null) {
    this.x = x;
    this.plusPos = plusPos;
  }
}

// addable reports whether e is a statically addable
// expression: a [s]tring, [b]ytes, [a]rray, or [t]uple.
function addable(e: syntax.Expr): string | null {
  if (e instanceof syntax.Literal) {
    if (e.token === Token.STRING) {
      return 's';
    } else if (e.token === Token.BYTES) {
      return 'b';
    }
  }
  if (e instanceof syntax.ListExpr) {
    return 'l';
  }
  if (e instanceof syntax.TupleExpr) {
    return 't';
  }
  return '';
}

// add returns an expression denoting the sum of args,
// which are all addable values of the type indicated by code.
// The resulting syntax is degenerate, lacking position, etc.
function add(code: string, args: Summand[]): syntax.Expr {
  switch (code) {
    case 's':
    case 'b': {
      let buf = '';
      for (const arg of args) {
        buf += arg.x instanceof syntax.Literal ? arg.x.value : '';
      }
      const tok = code === 'b' ? Token.BYTES : Token.STRING;
      return new syntax.Literal(tok, null, buf, buf);
    }
    case 'l': {
      let elems: syntax.Expr[] = [];
      for (const arg of args) {
        elems = elems.concat(
          arg.x instanceof syntax.ListExpr ? arg.x.list : []
        );
      }
      return new syntax.ListExpr(null, elems, null);
    }
    case 't': {
      let elems: syntax.Expr[] = [];
      for (const arg of args) {
        elems = elems.concat(
          arg.x instanceof syntax.TupleExpr ? arg.x.List : []
        );
      }
      return { List: elems } as syntax.TupleExpr;
    }
  }
  throw new Error('Unsupported code: ' + code);
}

function unparen(e: syntax.Expr): syntax.Expr {
  if (e instanceof syntax.ParenExpr) {
    return unparen(e.x);
  }
  return e;
}
