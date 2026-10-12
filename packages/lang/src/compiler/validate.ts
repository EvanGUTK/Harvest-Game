/**
 * Structural validation of a bytecode module, so a compiler bug or a damaged snapshot fails loudly
 * before the VM runs it, instead of misbehaving mid-run.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (module layout).
 * Invariants checked: function 0 is the module body at pc 0; functions are contiguous and cover the
 * code; every word decodes as an instruction of its function; every operand is in range for its kind;
 * every jump lands on an instruction start of the same function. Only then, once per function, the
 * stack analysis (stack.ts) runs and finds no underflow, no slot of the wrong kind, no join reached
 * with two stack shapes, no RETURN without a value and no fall-through off a function's end; its
 * measured height must equal the declared maxStack (chief rulings 2026-10-12 on #45: one fault, one
 * problem; a mismatch either way is LANG-BAD-MAX-STACK). Function 0 takes no parameters, and pool strings respect the 256-unit limit.
 */

import { InvariantError, assertNever } from '../invariant';
import { CALLABLE_INTRINSICS, METHOD_IDS } from '../intrinsics/intrinsics';
import type { FunctionInfo, ModuleData } from './bytecode';
import { DEFAULT_LIMITS } from '../types';
import { analyzeStack } from './stack';
import { decodeInstruction, instructionWidth, type DecodedInstruction, type OperandKind } from './opcodes';

const MAX_RANGE_ARGS = 3;

/**
 * A validation failure. LANG-BAD-MAX-STACK marks a declared maxStack that differs from the measured
 * height (chief ruling 2026-10-12: maxStack is a cached, checked result, not a free bound); every
 * other malformation is LANG-BAD-BYTECODE.
 */
export type ModuleProblem = {
  readonly code: 'LANG-BAD-BYTECODE' | 'LANG-BAD-MAX-STACK';
  readonly message: string;
};

/** Every problem found, in code order; an empty list means the module is valid. */
export function validateModule(data: ModuleData): ModuleProblem[] {
  const structural = [...layoutProblems(data), ...poolProblems(data)].map(badBytecode);
  if (structural.length > 0) return structural;
  return data.functions.flatMap((fn, index) => functionProblems(data, fn, index));
}

/** The messages of validateModule's problems. */
export function moduleProblems(data: ModuleData): string[] {
  return validateModule(data).map((problem) => problem.message);
}

/** Throws the first problem as an InvariantError with its own code, if there is one. */
export function assertValidModule(data: ModuleData): void {
  const [first] = validateModule(data);
  if (first !== undefined) throw new InvariantError(first.code, first.message);
}

function badBytecode(message: string): ModuleProblem {
  return { code: 'LANG-BAD-BYTECODE', message };
}

function layoutProblems(data: ModuleData): string[] {
  const problems: string[] = [];
  if (data.functions.length === 0) return ['the module has no functions'];
  if (data.functions[0]?.arity !== 0) problems.push('fn 0 (the module body) must take no parameters');
  let expectedEntry = 0;
  data.functions.forEach((fn, index) => {
    if (fn.entry !== expectedEntry)
      problems.push(`fn ${String(index)} starts at ${String(fn.entry)}, not ${String(expectedEntry)}`);
    if (fn.end <= fn.entry) problems.push(`fn ${String(index)} is empty`);
    if (fn.arity > fn.localNames.length) problems.push(`fn ${String(index)} has more parameters than locals`);
    if (!Number.isSafeInteger(fn.maxStack) || fn.maxStack < 0) {
      problems.push(`fn ${String(index)} declares an invalid maxStack ${String(fn.maxStack)}`);
    }
    expectedEntry = fn.end;
  });
  if (expectedEntry !== data.code.length)
    problems.push(`functions end at ${String(expectedEntry)}, code at ${String(data.code.length)}`);
  return problems;
}

/** Structural checks first; the stack analysis runs once, and only on structurally sound code. */
function functionProblems(data: ModuleData, fn: FunctionInfo, index: number): ModuleProblem[] {
  const structural = structuralProblems(data, fn, index);
  if (structural.length > 0) return structural.map(badBytecode);
  const stack = analyzeStack(data.code, fn.entry, fn.end);
  if (stack.problem !== undefined) return [badBytecode(`fn ${String(index)}: ${stack.problem}`)];
  if (stack.maxHeight === fn.maxStack) return [];
  return [
    {
      code: 'LANG-BAD-MAX-STACK',
      message: `fn ${String(index)} declares maxStack ${String(fn.maxStack)} but reaches ${String(stack.maxHeight)}`,
    },
  ];
}

function structuralProblems(data: ModuleData, fn: FunctionInfo, index: number): string[] {
  const problems: string[] = [];
  const starts = new Set<number>();
  const jumps: DecodedInstruction[] = [];
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
    pc += instructionWidth(instruction.spec);
  }
  for (const jump of jumps) {
    const target = jump.operands[0] ?? -1;
    if (!starts.has(target))
      problems.push(
        `pc ${String(jump.pc)}: ${jump.spec.name} target ${String(target)} is not an instruction of fn ${String(index)}`,
      );
  }
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
    if (entry.kind === 'str' && entry.text.length > DEFAULT_LIMITS.maxStringLength) {
      problems.push(
        `pool ${String(i)}: a string literal of ${String(entry.text.length)} units is over the limit`,
      );
    }
    if (entry.kind === 'int' && !Number.isSafeInteger(entry.value)) {
      problems.push(`pool ${String(i)}: ${String(entry.value)} is not a safe integer`);
    }
  });
  return problems;
}
