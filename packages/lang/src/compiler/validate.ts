/**
 * Structural validation of a bytecode module, so a compiler bug or a damaged snapshot fails loudly
 * before the VM runs it, instead of misbehaving mid-run.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (module layout).
 * Invariants checked: function 0 is the module body at pc 0; functions are contiguous and cover the
 * code; every word decodes as an instruction of its function; every operand is in range for its kind;
 * every jump lands on an instruction start of the same function; every function ends in RETURN,
 * HALT or JUMP, so execution never falls off its end.
 */

import { InvariantError, assertNever } from '../invariant';
import { CALLABLE_INTRINSICS, METHOD_IDS } from '../intrinsics/intrinsics';
import type { FunctionInfo, ModuleData } from './bytecode';
import {
  Op,
  decodeInstruction,
  instructionWidth,
  type DecodedInstruction,
  type OperandKind,
} from './opcodes';

const MAX_RANGE_ARGS = 3;
const FINAL_OPS: ReadonlySet<number> = new Set([Op.RETURN, Op.HALT, Op.JUMP]);

/** Every structural problem found, in code order; an empty list means the module is valid. */
export function moduleProblems(data: ModuleData): string[] {
  const problems = [...layoutProblems(data), ...poolProblems(data)];
  if (problems.length > 0) return problems;
  data.functions.forEach((fn, index) => problems.push(...functionProblems(data, fn, index)));
  return problems;
}

/** Throws LANG-BAD-BYTECODE naming the first problem, if there is one. */
export function assertValidModule(data: ModuleData): void {
  const [first] = moduleProblems(data);
  if (first !== undefined) throw new InvariantError('LANG-BAD-BYTECODE', first);
}

function layoutProblems(data: ModuleData): string[] {
  const problems: string[] = [];
  if (data.functions.length === 0) return ['the module has no functions'];
  let expectedEntry = 0;
  data.functions.forEach((fn, index) => {
    if (fn.entry !== expectedEntry)
      problems.push(`fn ${String(index)} starts at ${String(fn.entry)}, not ${String(expectedEntry)}`);
    if (fn.end <= fn.entry) problems.push(`fn ${String(index)} is empty`);
    if (fn.arity > fn.localNames.length) problems.push(`fn ${String(index)} has more parameters than locals`);
    expectedEntry = fn.end;
  });
  if (expectedEntry !== data.code.length)
    problems.push(`functions end at ${String(expectedEntry)}, code at ${String(data.code.length)}`);
  return problems;
}

function functionProblems(data: ModuleData, fn: FunctionInfo, index: number): string[] {
  const problems: string[] = [];
  const starts = new Set<number>();
  const jumps: DecodedInstruction[] = [];
  let last: DecodedInstruction | undefined;
  for (let pc = fn.entry; pc < fn.end;) {
    const instruction = decodeInstruction(data.code, pc, fn.end);
    if (instruction === undefined)
      return [...problems, `fn ${String(index)}: no instruction decodes at pc ${String(pc)}`];
    starts.add(pc);
    instruction.spec.operands.forEach((kind, i) => {
      const value = instruction.operands[i] ?? -1;
      if (kind === 'target') jumps.push(instruction);
      else if (!operandInRange(data, fn, kind, value))
        problems.push(
          `pc ${String(pc)}: ${instruction.spec.name} ${kind} operand ${String(value)} out of range`,
        );
    });
    last = instruction;
    pc += instructionWidth(instruction.spec);
  }
  for (const jump of jumps) {
    const target = jump.operands[0] ?? -1;
    if (!starts.has(target))
      problems.push(
        `pc ${String(jump.pc)}: ${jump.spec.name} target ${String(target)} is not an instruction of fn ${String(index)}`,
      );
  }
  if (last === undefined || !FINAL_OPS.has(data.code[last.pc] ?? -1))
    problems.push(`fn ${String(index)} does not end in RETURN, HALT or JUMP`);
  return problems;
}

function operandInRange(
  data: ModuleData,
  fn: FunctionInfo,
  kind: Exclude<OperandKind, 'target'>,
  value: number,
): boolean {
  switch (kind) {
    case 'pool':
      return value >= 0 && value < data.pool.length;
    case 'local':
      return value >= 0 && value < fn.localNames.length;
    case 'global':
      return value >= 0 && value < data.globals.length;
    case 'count':
    case 'host':
    case 'cost':
      return value >= 0;
    case 'flag':
      return value === 0 || value === 1;
    case 'intrinsic':
      return value >= 0 && value < CALLABLE_INTRINSICS.length;
    case 'method':
      return value >= 0 && value < METHOD_IDS.length;
    case 'statement':
      return value >= 0 && value < data.statements.length;
    case 'iterArgs':
      return value >= 0 && value <= MAX_RANGE_ARGS;
    default:
      return assertNever(kind);
  }
}

function poolProblems(data: ModuleData): string[] {
  const constantIds = new Set(data.constantDefs.map((d) => d.id));
  const problems: string[] = [];
  data.pool.forEach((entry, i) => {
    if (entry.kind === 'fn' && (entry.index < 0 || entry.index >= data.functions.length)) {
      problems.push(`pool ${String(i)}: function ${String(entry.index)} does not exist`);
    }
    if (entry.kind === 'const' && !constantIds.has(entry.id)) {
      problems.push(`pool ${String(i)}: constant ${String(entry.id)} is not defined`);
    }
    if (entry.kind === 'int' && !Number.isSafeInteger(entry.value)) {
      problems.push(`pool ${String(i)}: ${String(entry.value)} is not a safe integer`);
    }
  });
  return problems;
}
