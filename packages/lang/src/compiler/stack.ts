/**
 * Stack analysis of one function: an abstract run over the instruction stream that tracks the kind of
 * every operand-stack slot (value, iterator, repeat counter) at every reachable pc.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (op list, Loop exits); chief ruling
 * 2026-10-12 on #45: malformed bytecode fails validation and never reaches the VM loop.
 * Invariants: each op's effect comes from OP_SPECS; a pc is visited with one stack shape only (a join
 * reached with two shapes is rejected); the analysis is a worklist, never recursion; it stops at a
 * function's first problem, so one defect gives one message.
 */

import { decodeInstruction, instructionWidth, type PopKind, type SlotKind, type Transition } from './opcodes';

export type StackAnalysis = { readonly problem?: string; readonly maxHeight: number };

type Shape = readonly SlotKind[];

/**
 * Runs the abstract stack over code[entry, end), starting empty at `entry`. `limit` (the function's
 * declared maxStack) is enforced when given; without it the deepest height is just measured.
 */
export function analyzeStack(code: Int32Array, entry: number, end: number, limit?: number): StackAnalysis {
  const shapes = new Map<number, Shape>([[entry, []]]);
  const pending: number[] = [entry];
  let maxHeight = 0;
  for (let pc = pending.pop(); pc !== undefined; pc = pending.pop()) {
    const shape = shapes.get(pc) ?? [];
    const instruction = decodeInstruction(code, pc, end);
    if (instruction === undefined)
      return { problem: `no instruction decodes at pc ${String(pc)}`, maxHeight };
    const effect = instruction.spec.effect(instruction.operands);
    const name = instruction.spec.name;
    const edges: [Transition | undefined, number | undefined][] = [
      [effect.next, pc + instructionWidth(instruction.spec)],
      [effect.jump, instruction.operands[0]],
      [effect.final, undefined],
    ];
    for (const [transition, successor] of edges) {
      if (transition === undefined) continue;
      const after = apply(shape, transition);
      if (typeof after === 'string') return { problem: `pc ${String(pc)}: ${name} ${after}`, maxHeight };
      maxHeight = Math.max(maxHeight, after.length);
      if (limit !== undefined && after.length > limit) {
        return {
          problem: `pc ${String(pc)}: ${name} grows the stack past its declared maximum ${String(limit)}`,
          maxHeight,
        };
      }
      if (successor === undefined) continue;
      if (successor >= end)
        return { problem: `pc ${String(pc)}: ${name} falls off the end of the function`, maxHeight };
      const known = shapes.get(successor);
      if (known === undefined) {
        shapes.set(successor, after);
        pending.push(successor);
      } else if (!sameShape(known, after)) {
        return {
          problem: `pc ${String(successor)} is reached with stacks [${known.join(', ')}] and [${after.join(', ')}]`,
          maxHeight,
        };
      }
    }
  }
  return { maxHeight };
}

/** The deepest stack a well-formed function reaches; producers store it as FunctionInfo.maxStack. */
export function measureMaxStack(code: Int32Array, entry: number, end: number): number {
  return analyzeStack(code, entry, end).maxHeight;
}

/** The stack after `transition`, or why it cannot apply (underflow, or a slot of the wrong kind). */
function apply(shape: Shape, transition: Transition): Shape | string {
  const { pops, pushes } = transition;
  if (shape.length < pops.length) {
    return `needs ${String(pops.length)} stack slots but has ${String(shape.length)}`;
  }
  const base = shape.length - pops.length;
  for (let i = 0; i < pops.length; i += 1) {
    const found = shape[base + i];
    const wanted: PopKind | undefined = pops[i];
    if (wanted !== 'any' && found !== wanted)
      return `expects a ${String(wanted)} but finds a ${String(found)}`;
  }
  return [...shape.slice(0, base), ...pushes];
}

function sameShape(a: Shape, b: Shape): boolean {
  return a.length === b.length && a.every((kind, i) => kind === b[i]);
}
