/**
 * The Sprout VM: a resumable, cycle-metered stack machine over a bytecode module.
 * Spec: docs/03-architecture/interpreter-vm.md §Public API, §Bytecode (op cost table, Loop exits),
 * §VM; docs/03-architecture/simulation-engine.md §Clock arithmetic; chief rulings 2026-10-11 (B1-B6,
 * V1-V7, raise()).
 * Invariants: an explicit loop over `ip`, never JS recursion, so it can stop after any instruction;
 * an op starts only while at least 1 cycle remains and is charged in full (a failed op only its base
 * cycle); every CALL_HOST yields; the cycle counter equals the scheduler's agent clock whenever the VM
 * is resumed; every stack slot, local and global owns one reference, released when it is dropped.
 */

import type { BytecodeModule, Diagnostic, Limits, Span, Value, VMYield } from '../types';
import { InvariantError, assertNever } from '../invariant';
import { CALLABLE_INTRINSICS, METHOD_IDS } from '../intrinsics/intrinsics';
import { moduleData, type FunctionInfo, type ModuleData, type PoolEntry } from '../compiler/bytecode';
import { Op } from '../compiler/opcodes';
import { add, floorDivide, modulo, multiply, negate, subtract } from './arith';
import {
  absBuiltin,
  intBuiltin,
  lenBuiltin,
  maxBuiltin,
  minBuiltin,
  printLine,
  strBuiltin,
} from './builtins';
import { contains, equals, greaterEqual, greaterThan, lessEqual, lessThan, notEquals } from './compare';
import { appendMethod, buildDict, buildList, getMethod, indexGet, indexSet, popMethod } from './containers';
import { runtimeDiagnostic } from './diagnostics';
import {
  countRound,
  isLoopState,
  iterate,
  iterateRange,
  nextItem,
  releaseLoopState,
  repeatCounter,
  type Iterator,
  type LoopState,
  type RepeatCounter,
  type StackItem,
} from './loops';
import { createOpContext, type OpContext } from './op-context';
import { reprForMessage } from './repr';
import { formatCount } from '../format';
import type { OpResult, RuntimeError } from './runtime-error';
import { constValue, fnValue, fromPublic, isFn, isTruthy, literalStr, toPublic, type RtValue } from './value';

/** A local or global slot: undefined until first assigned. */
type Slot = RtValue | undefined;

type Frame = {
  readonly fnIndex: number;
  /** Where the caller continues after RETURN (unused for the module body). */
  readonly returnPc: number;
  /** Stack height when the frame started; everything above belongs to it. */
  readonly base: number;
  readonly locals: Slot[];
};

type PendingHost = { readonly pc: number; readonly cost: number; readonly args: readonly RtValue[] };

type Status =
  | { readonly kind: 'running' }
  | { readonly kind: 'awaiting-host'; readonly call: PendingHost }
  | { readonly kind: 'finished'; readonly final: VMYield };

/** What one instruction did: charged its cycles and continued, or produced a yield. */
type Step = number | VMYield;

/** One-argument intrinsics and min/max share the (ctx, args) shape; print is handled apart. */
const INTRINSIC_CALLS: ReadonlyMap<string, (ctx: OpContext, args: readonly RtValue[]) => OpResult> = new Map([
  ['len', lenBuiltin],
  ['abs', absBuiltin],
  ['min', minBuiltin],
  ['max', maxBuiltin],
  ['str', strBuiltin],
  ['int', intBuiltin],
]);

const METHOD_CALLS: ReadonlyMap<
  string,
  (ctx: OpContext, receiver: RtValue, args: readonly RtValue[]) => OpResult
> = new Map([
  ['append', appendMethod],
  ['pop', popMethod],
  ['get', getMethod],
]);

const BINARY_OPS: ReadonlyMap<number, (ctx: OpContext, a: RtValue, b: RtValue) => OpResult> = new Map([
  [Op.ADD, add],
  [Op.SUB, subtract],
  [Op.MUL, multiply],
  [Op.FLOORDIV, floorDivide],
  [Op.MOD, modulo],
  [Op.EQ, equals],
  [Op.NE, notEquals],
  [Op.LT, lessThan],
  [Op.LE, lessEqual],
  [Op.GT, greaterThan],
  [Op.GE, greaterEqual],
  [Op.IN, contains],
]);

export class Machine {
  private readonly data: ModuleData;
  private readonly ctx: OpContext;
  private readonly poolValues: readonly RtValue[];
  private readonly stack: StackItem[] = [];
  private readonly frames: Frame[] = [];
  private readonly globals: Slot[];
  private readonly printed: string[] = [];
  private ip = 0;
  private cycleCount = 0;
  private dropped = 0;
  private statement = -1;
  private status: Status = { kind: 'running' };
  /**
   * True while the LINE at ip must not stop a stopAtLine run: at program start, and right after this
   * very LINE was yielded. Cleared by any executed instruction. Machine state, not per-run state, so
   * line stops do not depend on how the cycles were chunked into runs (chief ruling on #58).
   */
  private lineStopTaken = true;

  constructor(module: BytecodeModule, limits: Limits) {
    this.data = moduleData(module);
    this.ctx = createOpContext(
      limits,
      this.data.constantDefs,
      this.data.functions.map((fn) => fn.name),
    );
    this.poolValues = this.data.pool.map(poolValue);
    this.globals = this.data.globals.map(() => undefined);
    this.frames.push({ fnIndex: 0, returnPc: -1, base: 0, locals: [] });
  }

  get cycles(): number {
    return this.cycleCount;
  }

  get output(): readonly string[] {
    return this.printed;
  }

  get droppedLines(): number {
    return this.dropped;
  }

  /** Live heap cells (language-spec.md §Limits); for tests, the debugger and snapshots. */
  get liveCells(): number {
    return this.ctx.heap.liveCells;
  }

  run(maxCycles: number, opts?: { stopAtLine?: boolean }): VMYield {
    if (this.status.kind === 'awaiting-host') {
      throw new InvariantError(
        'LANG-VM-PENDING-HOST',
        'run() before resume() or raise() of the pending host call',
      );
    }
    if (this.status.kind === 'finished') return this.status.final;
    const stopAtLine = opts?.stopAtLine === true;
    let remaining = maxCycles;
    for (;;) {
      if (remaining < 1) return { kind: 'budget', atCycle: this.cycleCount };
      if (stopAtLine && !this.lineStopTaken && this.code(this.ip) === Op.LINE) {
        this.lineStopTaken = true;
        return this.lineYield(this.code(this.ip + 1));
      }
      const step = this.step();
      this.lineStopTaken = false;
      if (typeof step !== 'number') return step;
      remaining -= step;
    }
  }

  resume(value: Value, cost?: number): void {
    const call = this.pendingCall();
    this.chargeHostCost(cost ?? call.cost);
    const result = fromPublic(value);
    this.ctx.heap.retain(result);
    this.releaseAll(call.args);
    this.stack.push(result);
    this.status = { kind: 'running' };
  }

  raise(error: { code: string; message: string }, cost?: number): void {
    const call = this.pendingCall();
    // Default 0: a host-side error charges nothing beyond the 1-cycle call, like a VM runtime error.
    this.chargeHostCost(cost ?? 0);
    this.releaseAll(call.args);
    const diagnostic: Diagnostic = {
      code: error.code,
      severity: 'error',
      range: this.data.opSpans.get(call.pc) ?? this.statementSpan(),
      message: error.message,
    };
    this.status = { kind: 'finished', final: { kind: 'error', error: diagnostic, atCycle: this.cycleCount } };
  }

  /** Executes the instruction at ip: charges its cycles, or returns the yield it produced. */
  private step(): Step {
    const pc = this.ip;
    const op = this.code(pc);
    const binary = BINARY_OPS.get(op);
    if (binary !== undefined) return this.binaryOp(pc, binary);
    switch (op) {
      case Op.LINE:
        this.statement = this.code(pc + 1);
        this.ip = pc + 2;
        return this.charge(0);
      case Op.CONST:
        this.stack.push(this.poolValues[this.code(pc + 1)] ?? null);
        return this.advance(pc, 2, 1);
      case Op.POP:
        this.releaseItem(this.popItem());
        return this.advance(pc, 1, 1);
      case Op.DUP:
        return this.duplicate(pc, 1);
      case Op.DUP2:
        return this.duplicate(pc, 2);
      case Op.SWAP:
        this.rotate(2);
        return this.advance(pc, 1, 1);
      case Op.ROT3:
        this.rotate(3);
        return this.advance(pc, 1, 1);
      case Op.LOAD_LOCAL:
        return this.loadLocal(pc);
      case Op.STORE_LOCAL:
        this.storeSlot(this.frame().locals, this.code(pc + 1));
        return this.advance(pc, 2, 1);
      case Op.LOAD_GLOBAL:
        return this.loadGlobal(pc);
      case Op.STORE_GLOBAL:
        this.storeSlot(this.globals, this.code(pc + 1));
        return this.advance(pc, 2, 1);
      case Op.NEG:
        return this.unaryOp(pc);
      case Op.NOT: {
        const v = this.popValue();
        this.stack.push(!isTruthy(v));
        this.ctx.heap.release(v);
        return this.advance(pc, 1, 1);
      }
      case Op.JUMP:
        this.ip = this.code(pc + 1);
        return this.charge(1);
      case Op.JUMP_IF_FALSE:
        return this.jumpIfFalse(pc);
      case Op.JUMP_IF_TRUE_KEEP:
        return this.jumpKeep(pc, true);
      case Op.JUMP_IF_FALSE_KEEP:
        return this.jumpKeep(pc, false);
      case Op.ITER_INIT:
        return this.iterInit(pc);
      case Op.ITER_NEXT:
        return this.iterNext(pc);
      case Op.REPEAT_INIT:
        return this.repeatInit(pc);
      case Op.REPEAT_NEXT:
        return this.repeatNext(pc);
      case Op.CALL:
        return this.call(pc);
      case Op.CALL_HOST:
        return this.callHost(pc);
      case Op.CALL_INTRINSIC:
        return this.callIntrinsic(pc);
      case Op.CALL_METHOD:
        return this.callMethod(pc);
      case Op.RETURN:
        return this.returnFromCall();
      case Op.HALT:
        this.ip = pc + 1;
        this.charge(1);
        return this.finish({ kind: 'halt', atCycle: this.cycleCount });
      case Op.BUILD_LIST:
        return this.buildList(pc);
      case Op.BUILD_DICT:
        return this.buildDict(pc);
      case Op.INDEX_GET:
        return this.indexGet(pc);
      case Op.INDEX_SET:
        return this.indexSet(pc);
      default:
        throw new InvariantError('LANG-BAD-BYTECODE', `unknown opcode ${String(op)} at pc ${String(pc)}`);
    }
  }

  // ---------- Values and slots ----------

  private loadLocal(pc: number): Step {
    const slot = this.code(pc + 1);
    const value = this.frame().locals[slot];
    if (value === undefined) {
      const name = this.currentFunction().localNames[slot] ?? '?';
      return this.fail(pc, {
        code: 'R-UNBOUND-LOCAL',
        message: `\`${name}\` is used before it gets a value in this function. Did you mean \`global ${name}\`?`,
      });
    }
    this.ctx.heap.retain(value);
    this.stack.push(value);
    return this.advance(pc, 2, 1);
  }

  private loadGlobal(pc: number): Step {
    const slot = this.code(pc + 1);
    const value = this.globals[slot];
    if (value === undefined) {
      const name = this.data.globals[slot] ?? '?';
      return this.fail(pc, {
        code: 'R-UNBOUND-GLOBAL',
        message: `\`${name}\` isn't defined yet at this line. Move the \`def\` above.`,
      });
    }
    this.ctx.heap.retain(value);
    this.stack.push(value);
    return this.advance(pc, 2, 1);
  }

  /** The popped value moves into the slot; the slot's old value is released. */
  private storeSlot(slots: Slot[], index: number): void {
    const value = this.popValue();
    const old = slots[index];
    slots[index] = value;
    if (old !== undefined) this.ctx.heap.release(old);
  }

  private duplicate(pc: number, count: number): Step {
    const top = this.stack.slice(this.stack.length - count);
    for (const item of top) {
      if (isLoopState(item)) throw stackError('DUP of loop state');
      this.ctx.heap.retain(item);
      this.stack.push(item);
    }
    return this.advance(pc, 1, 1);
  }

  /** Moves the top item down `depth - 1` places: SWAP is depth 2 (a b → b a), ROT3 depth 3 (a b c → c a b). */
  private rotate(depth: number): void {
    const top = this.popItem();
    this.stack.splice(this.stack.length - (depth - 1), 0, top);
  }

  // ---------- Operators ----------

  private binaryOp(pc: number, fn: (ctx: OpContext, a: RtValue, b: RtValue) => OpResult): Step {
    const b = this.popValue();
    const a = this.popValue();
    return this.complete(pc, 1, fn(this.ctx, a, b), [a, b]);
  }

  private unaryOp(pc: number): Step {
    const a = this.popValue();
    return this.complete(pc, 1, negate(this.ctx, a), [a]);
  }

  /**
   * Finishes an op whose operands were popped: on success pushes the result and charges 1 + surcharge;
   * on failure builds the diagnostic first (operands are borrowed) and charges the base cycle. Either
   * way the operands' references are released.
   */
  private complete(pc: number, width: number, r: OpResult, operands: readonly RtValue[]): Step {
    if (!r.ok) {
      const failed = this.fail(pc, r.error);
      this.releaseAll(operands);
      return failed;
    }
    this.releaseAll(operands);
    this.stack.push(r.value);
    return this.advance(pc, width, 1 + r.cost);
  }

  // ---------- Control flow ----------

  private jumpIfFalse(pc: number): Step {
    const v = this.popValue();
    const truthy = isTruthy(v);
    this.ctx.heap.release(v);
    this.ip = truthy ? pc + 2 : this.code(pc + 1);
    return this.charge(1);
  }

  /** `or` (jumpWhen = true) and `and` (false): keep the deciding operand, else drop it and go on. */
  private jumpKeep(pc: number, jumpWhen: boolean): Step {
    const v = this.peekValue();
    if (isTruthy(v) === jumpWhen) {
      this.ip = this.code(pc + 1);
    } else {
      this.ctx.heap.release(this.popValue());
      this.ip = pc + 2;
    }
    return this.charge(1);
  }

  private iterInit(pc: number): Step {
    const rangeArgs = this.code(pc + 1);
    if (rangeArgs === 0) {
      const iterable = this.popValue();
      const r = iterate(this.ctx, iterable);
      if (!r.ok) return this.failReleasing(pc, r.error, [iterable]);
      this.stack.push(r.state);
      return this.advance(pc, 2, 1 + r.cost);
    }
    const args = this.popValues(rangeArgs);
    const r = iterateRange(this.ctx, args);
    if (!r.ok) return this.failReleasing(pc, r.error, args);
    this.releaseAll(args);
    this.stack.push(r.state);
    return this.advance(pc, 2, 1);
  }

  private iterNext(pc: number): Step {
    const it = this.peekIterator();
    const step = nextItem(this.ctx, it);
    if (step.kind === 'error') return this.fail(pc, step.error);
    if (step.kind === 'item') {
      this.stack.push(step.value);
      return this.advance(pc, 2, 1);
    }
    this.releaseItem(this.popItem());
    this.ip = this.code(pc + 1);
    return this.charge(1);
  }

  private repeatInit(pc: number): Step {
    const n = this.popValue();
    const r = repeatCounter(this.ctx, n);
    if (!r.ok) return this.failReleasing(pc, r.error, [n]);
    this.ctx.heap.release(n);
    this.stack.push(r.state);
    return this.advance(pc, 1, 1);
  }

  private repeatNext(pc: number): Step {
    const counter = this.peekCounter();
    if (countRound(counter)) return this.advance(pc, 2, 1);
    this.popItem();
    this.ip = this.code(pc + 1);
    return this.charge(1);
  }

  // ---------- Calls ----------

  private call(pc: number): Step {
    const argc = this.code(pc + 1);
    const args = this.popValues(argc);
    const callee = this.popValue();
    if (!isFn(callee)) {
      return this.failReleasing(pc, notCallable(this.ctx, callee), [callee, ...args]);
    }
    const fn = this.functionAt(callee.index);
    if (argc !== fn.arity) return this.failReleasing(pc, wrongArgCount(fn, argc), args);
    if (this.frames.length - 1 >= this.ctx.limits.maxCallDepth) {
      return this.failReleasing(pc, tooDeep(this.ctx), args);
    }
    const locals: Slot[] = fn.localNames.map((_, i) => (i < args.length ? args[i] : undefined));
    this.frames.push({ fnIndex: callee.index, returnPc: pc + 2, base: this.stack.length, locals });
    this.ip = fn.entry;
    return this.charge(1);
  }

  private returnFromCall(): Step {
    const frame = this.frames.pop();
    if (frame === undefined || this.frames.length === 0) throw stackError('RETURN from the module body');
    const result = this.popValue();
    while (this.stack.length > frame.base) this.releaseItem(this.popItem());
    for (const local of frame.locals) if (local !== undefined) this.ctx.heap.release(local);
    this.stack.push(result);
    this.ip = frame.returnPc;
    return this.charge(1);
  }

  /** Every CALL_HOST yields; the base cycle is charged first, so atCycle is when the action starts. */
  private callHost(pc: number): Step {
    const fn = this.code(pc + 1);
    const args = this.popValues(this.code(pc + 2));
    const cost = this.code(pc + 3);
    this.ip = pc + 5;
    this.charge(1);
    this.status = { kind: 'awaiting-host', call: { pc, cost, args } };
    return { kind: 'host', fn, args: args.map(toPublic), cost, atCycle: this.cycleCount };
  }

  private callIntrinsic(pc: number): Step {
    const name = CALLABLE_INTRINSICS[this.code(pc + 1)];
    const args = this.popValues(this.code(pc + 2));
    if (name === 'print') return this.print(pc, args);
    const fn = name === undefined ? undefined : INTRINSIC_CALLS.get(name);
    if (fn === undefined) throw stackError(`no intrinsic ${String(name)}`);
    return this.complete(pc, 3, fn(this.ctx, args), args);
  }

  private print(pc: number, args: readonly RtValue[]): Step {
    const r = printLine(this.ctx, args);
    if (!r.ok) return this.failReleasing(pc, r.error, args);
    if (this.printed.length < this.ctx.limits.maxPrintLines) this.printed.push(r.line);
    else this.dropped += 1;
    this.releaseAll(args);
    this.stack.push(null);
    return this.advance(pc, 3, 1 + r.cost);
  }

  private callMethod(pc: number): Step {
    const name = METHOD_IDS[this.code(pc + 1)];
    const args = this.popValues(this.code(pc + 2));
    const receiver = this.popValue();
    const fn = name === undefined ? undefined : METHOD_CALLS.get(name);
    if (fn === undefined) throw stackError(`no method ${String(name)}`);
    return this.complete(pc, 3, fn(this.ctx, receiver, args), [receiver, ...args]);
  }

  // ---------- Data ----------

  private buildList(pc: number): Step {
    const items = this.popValues(this.code(pc + 1));
    return this.complete(pc, 2, buildList(this.ctx, items), items);
  }

  private buildDict(pc: number): Step {
    const keysAndValues = this.popValues(2 * this.code(pc + 1));
    return this.complete(pc, 2, buildDict(this.ctx, keysAndValues), keysAndValues);
  }

  private indexGet(pc: number): Step {
    const index = this.popValue();
    const object = this.popValue();
    const receiver = this.data.operandNames.get(pc)?.[0] ?? undefined;
    return this.complete(pc, 1, indexGet(this.ctx, object, index, receiver), [object, index]);
  }

  private indexSet(pc: number): Step {
    const value = this.popValue();
    const index = this.popValue();
    const object = this.popValue();
    const r = indexSet(this.ctx, object, index, value);
    if (!r.ok) return this.failReleasing(pc, r.error, [object, index, value]);
    this.releaseAll([object, index, value]);
    return this.advance(pc, 1, 1);
  }

  // ---------- Bookkeeping ----------

  private charge(cycles: number): number {
    this.cycleCount += cycles;
    return cycles;
  }

  private advance(pc: number, width: number, cycles: number): number {
    this.ip = pc + width;
    return this.charge(cycles);
  }

  /** A runtime error: the base cycle is charged and the VM finishes with an error yield. */
  private fail(pc: number, error: RuntimeError): Step {
    const diagnostic = runtimeDiagnostic(this.ctx, this.data, error, pc, this.statementSpan());
    this.charge(1);
    return this.finish({ kind: 'error', error: diagnostic, atCycle: this.cycleCount });
  }

  private failReleasing(pc: number, error: RuntimeError, held: readonly RtValue[]): Step {
    const failed = this.fail(pc, error);
    this.releaseAll(held);
    return failed;
  }

  private finish(final: VMYield): VMYield {
    this.status = { kind: 'finished', final };
    return final;
  }

  private lineYield(statementIndex: number): VMYield {
    const statement = this.data.statements[statementIndex];
    if (statement === undefined) throw stackError(`no statement ${String(statementIndex)}`);
    return { kind: 'line', file: statement.file, line: statement.line, atCycle: this.cycleCount };
  }

  private pendingCall(): PendingHost {
    if (this.status.kind !== 'awaiting-host')
      throw new InvariantError('LANG-VM-NO-PENDING-HOST', 'no host call is pending');
    return this.status.call;
  }

  private chargeHostCost(cost: number): void {
    if (!Number.isSafeInteger(cost) || cost < 0) {
      throw new InvariantError(
        'LANG-VM-BAD-COST',
        `host cost must be a whole number >= 0, got ${String(cost)}`,
      );
    }
    this.charge(cost);
  }

  private statementSpan(): Span {
    const statement = this.data.statements[this.statement];
    if (statement !== undefined) return statement.span;
    const file = this.currentFunction().file;
    return { file, line: 1, col: 1, endLine: 1, endCol: 1 };
  }

  private code(pc: number): number {
    return this.data.code[pc] ?? -1;
  }

  private frame(): Frame {
    const frame = this.frames.at(-1);
    if (frame === undefined) throw stackError('no frame');
    return frame;
  }

  private currentFunction(): FunctionInfo {
    return this.functionAt(this.frame().fnIndex);
  }

  private functionAt(index: number): FunctionInfo {
    const fn = this.data.functions[index];
    if (fn === undefined) throw stackError(`no function ${String(index)}`);
    return fn;
  }

  private popItem(): StackItem {
    if (this.stack.length <= this.frame().base) throw stackError('stack underflow');
    return this.stack.pop() ?? null;
  }

  private popValue(): RtValue {
    const item = this.popItem();
    if (isLoopState(item)) throw stackError('expected a value, found loop state');
    return item;
  }

  /** The top `count` values in push order (the first pushed comes first). */
  private popValues(count: number): RtValue[] {
    const values: RtValue[] = [];
    for (let i = 0; i < count; i += 1) values.push(this.popValue());
    return values.reverse();
  }

  private peekValue(): RtValue {
    const item = this.stack.at(-1);
    if (item === undefined || isLoopState(item)) throw stackError('expected a value on top');
    return item;
  }

  private peekLoop(): LoopState {
    const item = this.stack.at(-1);
    if (item === undefined || !isLoopState(item)) throw stackError('expected loop state on top');
    return item;
  }

  private peekIterator(): Iterator {
    const state = this.peekLoop();
    if (state.tag === 'repeat') throw stackError('ITER_NEXT on a repeat counter');
    return state;
  }

  private peekCounter(): RepeatCounter {
    const state = this.peekLoop();
    if (state.tag !== 'repeat') throw stackError('REPEAT_NEXT on an iterator');
    return state;
  }

  private releaseItem(item: StackItem): void {
    if (isLoopState(item)) releaseLoopState(this.ctx, item);
    else this.ctx.heap.release(item);
  }

  private releaseAll(values: readonly RtValue[]): void {
    for (const v of values) this.ctx.heap.release(v);
  }
}

function poolValue(entry: PoolEntry): RtValue {
  switch (entry.kind) {
    case 'int':
      return entry.value;
    case 'str':
      return literalStr(entry.text);
    case 'bool':
      return entry.value;
    case 'none':
      return null;
    case 'fn':
      return fnValue(entry.index);
    case 'const':
      return constValue(entry.id);
    default:
      return assertNever(entry);
  }
}

function notCallable(ctx: OpContext, callee: RtValue): RuntimeError {
  const note = callee === null ? ' (`None` is what a function with no `return` gives back.)' : '';
  return {
    code: 'R-NOT-CALLABLE',
    message: `\`${reprForMessage(ctx, callee)}\` isn't a function, so it can't be called with \`()\`.${note}`,
  };
}

function wrongArgCount(fn: FunctionInfo, got: number): RuntimeError {
  const things = fn.arity === 1 ? 'thing' : 'things';
  return {
    code: 'R-WRONG-ARG-COUNT',
    message: `\`${fn.name}\` needs ${String(fn.arity)} ${things} in the brackets, but got ${String(got)}.`,
  };
}

function tooDeep(ctx: OpContext): RuntimeError {
  return {
    code: 'R-STACK-OVERFLOW',
    message: `A function called itself too many times (${formatCount(ctx.limits.maxCallDepth)} max). Check your stopping condition.`,
  };
}

function stackError(message: string): InvariantError {
  return new InvariantError('LANG-VM-STACK', message);
}
