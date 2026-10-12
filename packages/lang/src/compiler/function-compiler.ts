/**
 * Compiles the statements and expressions of one function body into the module's shared emitter.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode, "Canonical emissions (normative)": every
 * sequence here is the one that section lists, because emitted code fixes the cycle count of a program.
 * Invariants: the value stack between two statements holds only the iterators and counters of the
 * enclosing `for` and `repeat` loops, so `break` pops exactly one of them; each statement except `global`
 * starts with `LINE s`; names are resolved by ScopeInfo, never re-derived.
 *
 * A class because a function body carries state while it compiles (its scope and the open loops).
 */

import { joinSpans } from '../parser/cursor';
import type {
  AssignStmt,
  AugAssignStmt,
  BinaryOp,
  CallExpr,
  CompareExpr,
  CompareOp,
  Expression,
  ForStmt,
  Identifier,
  IfStmt,
  IndexExpr,
  LogicalExpr,
  MethodCallExpr,
  NameExpr,
  RepeatStmt,
  Statement,
  WhileStmt,
} from '../parser/ast';
import { assertNever } from '../invariant';
import { CALLABLE_INTRINSICS, METHOD_IDS } from '../intrinsics/intrinsics';
import type { Span } from '../types';
import type { Label } from './emitter';
import { unchecked, type ModuleBuilder } from './module-builder';
import { Op } from './opcodes';

/** The two labels of an open loop, and whether leaving it early must drop an iterator or counter. */
type LoopLabels = { readonly top: Label; readonly end: Label; readonly holdsState: boolean };

const RANGE = 'range';

const BINARY_OPCODES: ReadonlyMap<BinaryOp, number> = new Map<BinaryOp, number>([
  ['+', Op.ADD],
  ['-', Op.SUB],
  ['*', Op.MUL],
  ['//', Op.FLOORDIV],
  ['%', Op.MOD],
]);

/** Comparison operators that are one instruction (`not in` is IN then NOT). */
const COMPARE_OPCODES: ReadonlyMap<CompareOp, number> = new Map<CompareOp, number>([
  ['==', Op.EQ],
  ['!=', Op.NE],
  ['<', Op.LT],
  ['<=', Op.LE],
  ['>', Op.GT],
  ['>=', Op.GE],
  ['in', Op.IN],
  ['not in', Op.IN],
]);

export class FunctionCompiler {
  private readonly loops: LoopLabels[] = [];

  constructor(private readonly b: ModuleBuilder) {}

  compileBlock(stmts: readonly Statement[]): void {
    for (const stmt of stmts) this.statement(stmt);
  }

  // ---------- statements ----------

  private statement(stmt: Statement): void {
    switch (stmt.type) {
      case 'ExprStmt':
        this.b.emitLine(stmt.span);
        this.expression(stmt.expr);
        this.b.emitter.emit(Op.POP);
        return;
      case 'AssignStmt':
        this.b.emitLine(stmt.span);
        this.assign(stmt);
        return;
      case 'AugAssignStmt':
        this.b.emitLine(stmt.span);
        this.augAssign(stmt);
        return;
      case 'PassStmt':
        this.b.emitLine(stmt.span);
        return;
      case 'BreakStmt':
        this.b.emitLine(stmt.span);
        this.breakLoop();
        return;
      case 'ContinueStmt':
        this.b.emitLine(stmt.span);
        this.b.emitter.emitJump(Op.JUMP, this.innermostLoop().top);
        return;
      case 'GlobalStmt':
        // A declaration, not an action: it compiles to nothing (ScopeInfo already applied it).
        return;
      case 'IfStmt':
        this.ifStatement(stmt);
        return;
      case 'WhileStmt':
        this.whileStatement(stmt);
        return;
      case 'ForStmt':
        this.forStatement(stmt);
        return;
      case 'RepeatStmt':
        this.repeatStatement(stmt);
        return;
      case 'DefStmt':
      case 'ReturnStmt':
        throw unchecked('functions are compiled by LANG-04.3');
      default:
        assertNever(stmt);
    }
  }

  /** `x = v`: v, STORE x. `a[i] = v`: a, i, v, INDEX_SET. */
  private assign(stmt: AssignStmt): void {
    if (stmt.target.type === 'NameExpr') {
      this.expression(stmt.value);
      this.store(stmt.target);
      return;
    }
    this.expression(stmt.target.object);
    this.expression(stmt.target.index);
    this.expression(stmt.value);
    this.b.emitAt(stmt.target.span, Op.INDEX_SET);
  }

  /** `x op= v`: LOAD x, v, op, STORE x. `a[i] op= v`: a, i, DUP2, INDEX_GET, v, op, INDEX_SET. */
  private augAssign(stmt: AugAssignStmt): void {
    if (stmt.target.type === 'NameExpr') {
      this.load(stmt.target);
      this.expression(stmt.value);
      this.binaryOp(stmt.op, stmt.span, stmt.target, stmt.value);
      this.store(stmt.target);
      return;
    }
    const target = stmt.target;
    this.expression(target.object);
    this.expression(target.index);
    this.b.emitter.emit(Op.DUP2);
    this.indexGet(target);
    this.expression(stmt.value);
    this.binaryOp(stmt.op, stmt.span, target, stmt.value);
    this.b.emitAt(target.span, Op.INDEX_SET);
  }

  /**
   * `if t: A elif u: B else: C` → LINE, t, JUMP_IF_FALSE L1, A, JUMP Lend, L1: LINE, u, JUMP_IF_FALSE L2,
   * B, JUMP Lend, L2: C, Lend. The last branch has no JUMP Lend.
   */
  private ifStatement(stmt: IfStmt): void {
    const e = this.b.emitter;
    const end = e.newLabel();
    const branches = [
      { span: headerSpan(stmt.span, stmt.test.span), test: stmt.test, body: stmt.body },
      ...stmt.elifs.map((c) => ({ span: headerSpan(c.span, c.test.span), test: c.test, body: c.body })),
    ];
    branches.forEach((branch, i) => {
      const next = e.newLabel();
      const isLast = i === branches.length - 1 && stmt.orelse === null;
      this.b.emitLine(branch.span);
      this.expression(branch.test);
      e.emitJump(Op.JUMP_IF_FALSE, isLast ? end : next);
      this.compileBlock(branch.body);
      if (!isLast) {
        e.emitJump(Op.JUMP, end);
        e.mark(next);
      }
    });
    if (stmt.orelse !== null) this.compileBlock(stmt.orelse);
    e.mark(end);
  }

  /** Ltop: LINE, test, JUMP_IF_FALSE Lend, body, JUMP Ltop, Lend. Emitted literally (no constant folding). */
  private whileStatement(stmt: WhileStmt): void {
    const e = this.b.emitter;
    const loop: LoopLabels = { top: e.newLabel(), end: e.newLabel(), holdsState: false };
    e.mark(loop.top);
    this.b.emitLine(headerSpan(stmt.span, stmt.test.span));
    this.expression(stmt.test);
    e.emitJump(Op.JUMP_IF_FALSE, loop.end);
    this.loopBody(loop, stmt.body);
    e.emitJump(Op.JUMP, loop.top);
    e.mark(loop.end);
  }

  /**
   * LINE, then the range arguments and ITER_INIT k (k = 1..3), or the iterable and ITER_INIT 0; then
   * Ltop: ITER_NEXT Lend, STORE target, body, JUMP Ltop, Lend. ITER_NEXT pops the iterator when it finishes.
   */
  private forStatement(stmt: ForStmt): void {
    const e = this.b.emitter;
    this.b.emitLine(headerSpan(stmt.span, stmt.iterable.span));
    const rangeArgs = this.rangeArguments(stmt.iterable);
    if (rangeArgs === null) this.expression(stmt.iterable);
    else for (const arg of rangeArgs) this.expression(arg);
    this.b.emitAt(stmt.iterable.span, Op.ITER_INIT, rangeArgs?.length ?? 0);
    const loop: LoopLabels = { top: e.newLabel(), end: e.newLabel(), holdsState: true };
    e.mark(loop.top);
    const next = e.emitJump(Op.ITER_NEXT, loop.end);
    this.b.opSpans.set(next, stmt.iterable.span);
    this.store(stmt.target);
    this.loopBody(loop, stmt.body);
    e.emitJump(Op.JUMP, loop.top);
    e.mark(loop.end);
  }

  /** LINE, count, REPEAT_INIT, Ltop: REPEAT_NEXT Lend, body, JUMP Ltop, Lend. */
  private repeatStatement(stmt: RepeatStmt): void {
    const e = this.b.emitter;
    this.b.emitLine(headerSpan(stmt.span, stmt.count.span));
    this.expression(stmt.count);
    this.b.emitAt(stmt.count.span, Op.REPEAT_INIT);
    const loop: LoopLabels = { top: e.newLabel(), end: e.newLabel(), holdsState: true };
    e.mark(loop.top);
    e.emitJump(Op.REPEAT_NEXT, loop.end);
    this.loopBody(loop, stmt.body);
    e.emitJump(Op.JUMP, loop.top);
    e.mark(loop.end);
  }

  private loopBody(loop: LoopLabels, body: readonly Statement[]): void {
    this.loops.push(loop);
    this.compileBlock(body);
    this.loops.pop();
  }

  /** `break`: JUMP Lend in a while; POP, JUMP Lend in a for or repeat (drops its iterator or counter). */
  private breakLoop(): void {
    const loop = this.innermostLoop();
    if (loop.holdsState) this.b.emitter.emit(Op.POP);
    this.b.emitter.emitJump(Op.JUMP, loop.end);
  }

  private innermostLoop(): LoopLabels {
    const loop = this.loops[this.loops.length - 1];
    if (loop === undefined) throw unchecked('break or continue outside a loop');
    return loop;
  }

  // ---------- expressions ----------

  private expression(expr: Expression): void {
    const e = this.b.emitter;
    switch (expr.type) {
      case 'IntLiteral':
        e.emit(Op.CONST, this.b.pool.add({ kind: 'int', value: expr.value }));
        return;
      case 'StringLiteral':
        e.emit(Op.CONST, this.b.pool.add({ kind: 'str', text: expr.value }));
        return;
      case 'BoolLiteral':
        e.emit(Op.CONST, this.b.pool.add({ kind: 'bool', value: expr.value }));
        return;
      case 'NoneLiteral':
        e.emit(Op.CONST, this.b.pool.add({ kind: 'none' }));
        return;
      case 'NameExpr':
        this.load(expr);
        return;
      case 'ListLiteral':
        for (const element of expr.elements) this.expression(element);
        this.b.emitAt(expr.span, Op.BUILD_LIST, expr.elements.length);
        return;
      case 'DictLiteral':
        for (const entry of expr.entries) {
          this.expression(entry.key);
          this.expression(entry.value);
        }
        this.b.emitAt(expr.span, Op.BUILD_DICT, expr.entries.length);
        return;
      case 'UnaryExpr':
        this.expression(expr.operand);
        if (expr.op === 'not') e.emit(Op.NOT);
        else this.b.nameOperands(this.b.emitAt(expr.span, Op.NEG), [plainName(expr.operand)]);
        return;
      case 'BinaryExpr':
        this.expression(expr.left);
        this.expression(expr.right);
        this.binaryOp(expr.op, expr.span, expr.left, expr.right);
        return;
      case 'LogicalExpr':
        this.logical(expr);
        return;
      case 'CompareExpr':
        this.compare(expr);
        return;
      case 'CallExpr':
        this.call(expr);
        return;
      case 'MethodCallExpr':
        this.methodCall(expr);
        return;
      case 'IndexExpr':
        this.expression(expr.object);
        this.expression(expr.index);
        this.indexGet(expr);
        return;
      default:
        assertNever(expr);
    }
  }

  private binaryOp(op: BinaryOp, span: Span, left: Expression, right: Expression): void {
    const opcode = BINARY_OPCODES.get(op);
    if (opcode === undefined) throw unchecked(`unknown operator ${op}`);
    this.b.nameOperands(this.b.emitAt(span, opcode), [plainName(left), plainName(right)]);
  }

  private indexGet(expr: IndexExpr): void {
    this.b.nameOperands(this.b.emitAt(expr.span, Op.INDEX_GET), [plainName(expr.object)]);
  }

  /** `a and b`: a, JUMP_IF_FALSE_KEEP L, b, L. `or` uses JUMP_IF_TRUE_KEEP. */
  private logical(expr: LogicalExpr): void {
    const e = this.b.emitter;
    const end = e.newLabel();
    this.expression(expr.left);
    e.emitJump(expr.op === 'and' ? Op.JUMP_IF_FALSE_KEEP : Op.JUMP_IF_TRUE_KEEP, end);
    this.expression(expr.right);
    e.mark(end);
  }

  /**
   * `a op b`: a, b, OP. A chain evaluates each middle operand once: every link but the last is
   * DUP, ROT3, OP, JUMP_IF_FALSE_KEEP Lf; the last is c, OP, JUMP Le; then Lf: SWAP, POP; Le.
   */
  private compare(expr: CompareExpr): void {
    const e = this.b.emitter;
    const [first, ...rest] = expr.operands;
    if (first === undefined || rest.length !== expr.operators.length) throw unchecked('malformed comparison');
    this.expression(first);
    const falsy = e.newLabel();
    const end = e.newLabel();
    expr.operators.forEach((operator, i) => {
      const left = expr.operands[i] ?? first;
      const right = rest[i] ?? first;
      const isLast = i === expr.operators.length - 1;
      this.expression(right);
      if (!isLast) {
        e.emit(Op.DUP);
        e.emit(Op.ROT3);
      }
      this.compareOp(operator.op, joinSpans(left.span, right.span), left, right);
      if (!isLast) e.emitJump(Op.JUMP_IF_FALSE_KEEP, falsy);
    });
    if (expr.operators.length === 1) return;
    e.emitJump(Op.JUMP, end);
    e.mark(falsy);
    e.emit(Op.SWAP);
    e.emit(Op.POP);
    e.mark(end);
  }

  /** One comparison instruction; `not in` is IN then NOT. */
  private compareOp(op: CompareOp, span: Span, left: Expression, right: Expression): void {
    const opcode = COMPARE_OPCODES.get(op);
    if (opcode === undefined) throw unchecked(`unknown comparison ${op}`);
    this.b.nameOperands(this.b.emitAt(span, opcode), [plainName(left), plainName(right)]);
    if (op === 'not in') this.b.emitter.emit(Op.NOT);
  }

  /**
   * A host builtin: args, CALL_HOST id argc cost touchesWorld. An intrinsic: args, CALL_INTRINSIC id argc.
   * Anything else (a user function value): callee, args, CALL argc.
   */
  private call(expr: CallExpr): void {
    const kind =
      expr.callee.type === 'NameExpr' ? this.b.scopes.resolutions.get(expr.callee)?.kind : undefined;
    if (expr.callee.type === 'NameExpr' && kind === 'builtin') {
      const sig = this.b.host(expr.callee.name);
      for (const arg of expr.args) this.expression(arg);
      this.b.emitAt(expr.span, Op.CALL_HOST, sig.id, expr.args.length, sig.cost, sig.touchesWorld ? 1 : 0);
      return;
    }
    if (expr.callee.type === 'NameExpr' && kind === 'intrinsic') {
      const id = intrinsicId(expr.callee.name);
      for (const arg of expr.args) this.expression(arg);
      this.b.emitAt(expr.span, Op.CALL_INTRINSIC, id, expr.args.length);
      return;
    }
    this.expression(expr.callee);
    for (const arg of expr.args) this.expression(arg);
    this.b.emitAt(expr.span, Op.CALL, expr.args.length);
  }

  /** receiver, args, CALL_METHOD m argc. */
  private methodCall(expr: MethodCallExpr): void {
    const id = methodId(expr.method.name);
    this.expression(expr.object);
    for (const arg of expr.args) this.expression(arg);
    this.b.emitAt(expr.span, Op.CALL_METHOD, id, expr.args.length);
  }

  /** The arguments of `range(...)` when it is a `for` iterable (ITER_INIT k), else null. */
  private rangeArguments(iterable: Expression): readonly Expression[] | null {
    if (iterable.type !== 'CallExpr' || iterable.callee.type !== 'NameExpr') return null;
    const isRange =
      iterable.callee.name === RANGE && this.b.scopes.resolutions.get(iterable.callee)?.kind === 'intrinsic';
    return isRange ? iterable.args : null;
  }

  // ---------- names ----------

  /** LOAD_LOCAL / LOAD_GLOBAL (which can fail when unbound), or CONST for a game constant. */
  private load(name: NameExpr): void {
    const resolution = this.b.scopes.resolutions.get(name);
    switch (resolution?.kind) {
      case 'local':
        this.b.emitAt(name.span, Op.LOAD_LOCAL, resolution.slot);
        return;
      case 'global':
        this.b.emitAt(name.span, Op.LOAD_GLOBAL, resolution.slot);
        return;
      case 'constant':
        this.b.emitter.emit(Op.CONST, this.b.pool.add({ kind: 'const', id: this.b.constantId(name.name) }));
        return;
      case 'intrinsic':
      case 'builtin':
      case 'unknown':
      case undefined:
        throw unchecked(`${name.name} cannot be read as a value`);
      default:
        assertNever(resolution);
    }
  }

  private store(target: NameExpr | Identifier): void {
    const resolution = this.b.scopes.resolutions.get(target);
    switch (resolution?.kind) {
      case 'local':
        this.b.emitter.emit(Op.STORE_LOCAL, resolution.slot);
        return;
      case 'global':
        this.b.emitter.emit(Op.STORE_GLOBAL, resolution.slot);
        return;
      case 'intrinsic':
      case 'builtin':
      case 'constant':
      case 'unknown':
      case undefined:
        throw unchecked(`${target.name} cannot be assigned`);
      default:
        assertNever(resolution);
    }
  }
}

/** The span of a compound statement's header line: from its keyword to the end of its test or iterable. */
function headerSpan(statement: Span, headerEnd: Span): Span {
  return joinSpans(statement, headerEnd);
}

/** An operand's plain variable name for "`x` is `5`" messages, or null when it is not a bare name. */
function plainName(expr: Expression): string | null {
  return expr.type === 'NameExpr' ? expr.name : null;
}

function intrinsicId(name: string): number {
  const id = CALLABLE_INTRINSICS.findIndex((intrinsic) => intrinsic === name);
  if (id < 0) throw unchecked(`${name} is not a callable intrinsic`);
  return id;
}

function methodId(name: string): number {
  const id = METHOD_IDS.findIndex((method) => method === name);
  if (id < 0) throw unchecked(`.${name} is not a method (E-UNKNOWN-METHOD)`);
  return id;
}
