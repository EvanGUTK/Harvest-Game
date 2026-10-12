/**
 * Validation of a restored machine's state against its module, so a damaged or hand-edited snapshot
 * fails at restore (LANG-BAD-SNAPSHOT) instead of running silently wrong.
 * Spec: docs/03-architecture/interpreter-vm.md §VM (Snapshots); chief rulings 2026-10-12 on #59.
 * Invariants checked, for every status: frames are a chain from the module body within the call-depth
 * limit, with in-range functions, non-decreasing bases no higher than the stack, locals and globals
 * the module's sizes, return pcs right after a CALL, and the statement index in range; a pending host
 * call sits on a CALL_HOST. For a running or awaiting machine, ip is an instruction the analysis
 * reaches and every frame's stack segment has exactly the analysed slot kinds (#45 stack analysis): the
 * top segment matches the shape at ip, less the pending result when awaiting a host; a caller's
 * segment matches the shape at its continuation, less the callee's result still to come. A finished
 * machine never runs again, so it keeps the structural checks and skips only the shape check.
 */

import type { FunctionInfo, ModuleData } from '../compiler/bytecode';
import { Op } from '../compiler/opcodes';
import { analyzeStack, type Shape, type StackAnalysis } from '../compiler/stack';
import type { Limits } from '../types';
import { isLoopState, type StackItem } from './loops';
import type { MachineState } from './machine';

/** CALL is the opcode word plus its argc operand; a return pc is the word after it. */
const CALL_WIDTH = 2;
/** CALL_HOST is the opcode word plus id, argc, cost and touchesWorld. */
const CALL_HOST_WIDTH = 5;

/** The first reason `state` cannot belong to `data`, or undefined when it is consistent. */
export function machineStateProblem(
  data: ModuleData,
  limits: Limits,
  state: MachineState,
): string | undefined {
  const analyses = new Map<number, StackAnalysis>();
  const analysisOf = (fnIndex: number, fn: FunctionInfo): StackAnalysis => {
    const known = analyses.get(fnIndex);
    if (known !== undefined) return known;
    const fresh = analyzeStack(data.code, fn.entry, fn.end);
    analyses.set(fnIndex, fresh);
    return fresh;
  };
  return (
    frameProblem(data, limits, state, analysisOf) ??
    slotsProblem(data, state) ??
    statusProblem(data, state) ??
    (state.status.kind === 'finished' ? undefined : shapeProblem(data, state, analysisOf))
  );
}

type AnalysisOf = (fnIndex: number, fn: FunctionInfo) => StackAnalysis;

function frameProblem(
  data: ModuleData,
  limits: Limits,
  state: MachineState,
  analysisOf: AnalysisOf,
): string | undefined {
  const [body] = state.frames;
  if (body?.fnIndex !== 0 || body.base !== 0) return 'the first frame is not the module body';
  if (state.frames.length - 1 > limits.maxCallDepth) {
    return `${String(state.frames.length - 1)} nested calls exceed the depth limit ${String(limits.maxCallDepth)}`;
  }
  for (const [i, frame] of state.frames.entries()) {
    const fn = data.functions[frame.fnIndex];
    if (fn === undefined)
      return `frame ${String(i)} runs function ${String(frame.fnIndex)}, which does not exist`;
    if (frame.locals.length !== fn.localNames.length) {
      return `frame ${String(i)} has ${String(frame.locals.length)} locals, not ${String(fn.localNames.length)}`;
    }
    const next = state.frames[i + 1];
    const top = next?.base ?? state.stack.length;
    if (frame.base > top || top > state.stack.length)
      return `frame ${String(i)} has stack base ${String(frame.base)} out of order`;
    if (next !== undefined && !returnsAfterCall(data, fn, next.returnPc, analysisOf(frame.fnIndex, fn))) {
      return `frame ${String(i + 1)} returns to pc ${String(next.returnPc)}, which does not follow a CALL in its caller`;
    }
  }
  return undefined;
}

function returnsAfterCall(
  data: ModuleData,
  caller: FunctionInfo,
  returnPc: number,
  analysis: StackAnalysis,
): boolean {
  const callPc = returnPc - CALL_WIDTH;
  return callPc >= caller.entry && analysis.shapes.has(callPc) && data.code[callPc] === Op.CALL;
}

function slotsProblem(data: ModuleData, state: MachineState): string | undefined {
  if (state.globals.length !== data.globals.length) {
    return `${String(state.globals.length)} globals, not ${String(data.globals.length)}`;
  }
  if (state.statement < -1 || state.statement >= data.statements.length) {
    return `statement ${String(state.statement)} is not in the statement table`;
  }
  return undefined;
}

function statusProblem(data: ModuleData, state: MachineState): string | undefined {
  const top = state.frames.at(-1);
  const fn = top === undefined ? undefined : data.functions[top.fnIndex];
  if (fn === undefined) return 'no frame is running';
  // A finished machine's ip may sit just past its last instruction (after HALT).
  if (state.ip < fn.entry || state.ip > fn.end) return `ip ${String(state.ip)} is outside its function`;
  if (state.status.kind !== 'awaiting-host') return undefined;
  const pc = state.status.call.pc;
  if (data.code[pc] !== Op.CALL_HOST || pc + CALL_HOST_WIDTH !== state.ip) {
    return `the pending host call at pc ${String(pc)} is not the CALL_HOST before ip`;
  }
  return undefined;
}

function shapeProblem(data: ModuleData, state: MachineState, analysisOf: AnalysisOf): string | undefined {
  for (const [i, frame] of state.frames.entries()) {
    const fn = data.functions[frame.fnIndex];
    if (fn === undefined) return `frame ${String(i)} runs a function that does not exist`;
    const shapes = analysisOf(frame.fnIndex, fn).shapes;
    const next = state.frames[i + 1];
    const at = next === undefined ? state.ip : next.returnPc;
    const analysed = shapes.get(at);
    if (analysed === undefined)
      return `pc ${String(at)} of fn ${String(frame.fnIndex)} is not a reachable instruction`;
    // A caller waits for its callee's result; an awaiting machine waits for the host's.
    const pending = next !== undefined || state.status.kind === 'awaiting-host';
    const expected = pending ? analysed.slice(0, -1) : analysed;
    const segment = state.stack.slice(frame.base, next?.base ?? state.stack.length).map(slotKind);
    if (!sameShape(segment, expected)) {
      return `frame ${String(i)} holds [${segment.join(', ')}] where the code expects [${expected.join(', ')}]`;
    }
  }
  return undefined;
}

function slotKind(item: StackItem): Shape[number] {
  if (!isLoopState(item)) return 'value';
  return item.tag === 'repeat' ? 'counter' : 'iterator';
}

function sameShape(a: Shape, b: Shape): boolean {
  return a.length === b.length && a.every((kind, i) => kind === b[i]);
}
