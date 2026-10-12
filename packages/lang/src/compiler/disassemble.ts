/**
 * Human-readable listing of a bytecode module, for compiler golden tests and debugging.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode.
 * Invariants: deterministic text (pc padded to 4 digits, one instruction per line); pool operands
 * are annotated with their literal, so a listing reads without the pool.
 */

import { assertNever } from '../invariant';
import { CALLABLE_INTRINSICS, METHOD_IDS } from '../intrinsics/intrinsics';
import type { ModuleData, PoolEntry } from './bytecode';
import { decodeInstruction, instructionWidth, type DecodedInstruction } from './opcodes';
import { quoteStr } from '../vm/repr';

const PC_WIDTH = 4;

export function disassemble(data: ModuleData): string[] {
  const lines: string[] = [];
  data.functions.forEach((fn, index) => {
    lines.push(
      `fn ${String(index)} ${fn.name}(${fn.localNames.slice(0, fn.arity).join(', ')}) locals=${String(fn.localNames.length)} file=${fn.file}`,
    );
    for (let pc = fn.entry; pc < fn.end;) {
      const instruction = decodeInstruction(data.code, pc, fn.end);
      if (instruction === undefined) {
        lines.push(`  ${pad(pc)}  ??? ${String(data.code[pc])}`);
        break;
      }
      lines.push(`  ${pad(pc)}  ${describe(data, instruction)}`);
      pc += instructionWidth(instruction.spec);
    }
  });
  return lines;
}

function describe(data: ModuleData, instruction: DecodedInstruction): string {
  const words = [instruction.spec.name, ...instruction.operands.map(String)];
  const note = annotation(data, instruction);
  return note === undefined ? words.join(' ') : `${words.join(' ')}  ; ${note}`;
}

function annotation(data: ModuleData, instruction: DecodedInstruction): string | undefined {
  const [first] = instruction.operands;
  const [kind] = instruction.spec.operands;
  if (first === undefined || kind === undefined) return undefined;
  switch (kind) {
    case 'pool':
      return poolText(data, data.pool[first]);
    case 'global':
      return data.globals[first];
    case 'intrinsic':
      return CALLABLE_INTRINSICS[first];
    case 'method':
      return METHOD_IDS[first];
    case 'statement': {
      const statement = data.statements[first];
      return statement === undefined ? undefined : `${statement.file}:${String(statement.line)}`;
    }
    case 'local':
    case 'target':
    case 'count':
    case 'host':
    case 'cost':
    case 'flag':
    case 'iterArgs':
      return undefined;
    default:
      return assertNever(kind);
  }
}

function poolText(data: ModuleData, entry: PoolEntry | undefined): string | undefined {
  if (entry === undefined) return undefined;
  switch (entry.kind) {
    case 'int':
      return String(entry.value);
    case 'str':
      return quoteStr(entry.text);
    case 'bool':
      return entry.value ? 'True' : 'False';
    case 'none':
      return 'None';
    case 'fn':
      return `<function ${data.functions[entry.index]?.name ?? '?'}>`;
    case 'const':
      return data.constantDefs.find((d) => d.id === entry.id)?.name ?? '?';
    default:
      return assertNever(entry);
  }
}

function pad(pc: number): string {
  return String(pc).padStart(PC_WIDTH, '0');
}
