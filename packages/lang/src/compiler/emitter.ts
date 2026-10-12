/**
 * Instruction emitter: appends instructions to a code buffer and resolves jump labels at the end.
 * Used by the compiler (LANG-04) and by VM tests to hand-assemble modules.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode.
 * Invariants: every instruction is emitted with exactly its spec's operand count; a label is marked
 * once; `finish` refuses to return code while any jump still points at an unmarked label.
 */

import { InvariantError } from '../invariant';
import { opSpec, type OpSpec } from './opcodes';

/** A forward or backward jump target, resolved to an absolute pc by `finish`. */
export type Label = { readonly id: number };

export class Emitter {
  private readonly words: number[] = [];
  private readonly marks: (number | undefined)[] = [];
  private readonly fixups: { readonly at: number; readonly label: Label }[] = [];

  /** The pc the next instruction will get. */
  get pc(): number {
    return this.words.length;
  }

  /** Appends one instruction and returns its pc. */
  emit(opcode: number, ...operands: readonly number[]): number {
    const spec = specOf(opcode);
    if (operands.length !== spec.operands.length) {
      throw new InvariantError(
        'LANG-BAD-BYTECODE',
        `${spec.name} takes ${String(spec.operands.length)} operands, got ${String(operands.length)}`,
      );
    }
    const at = this.pc;
    this.words.push(opcode, ...operands);
    return at;
  }

  newLabel(): Label {
    this.marks.push(undefined);
    return { id: this.marks.length - 1 };
  }

  /** Binds `label` to the current pc. */
  mark(label: Label): void {
    if (this.marks[label.id] !== undefined) {
      throw new InvariantError('LANG-BAD-BYTECODE', `label ${String(label.id)} marked twice`);
    }
    this.marks[label.id] = this.pc;
  }

  /** Appends an instruction whose only operand is a jump target (JUMP*, ITER_NEXT, REPEAT_NEXT). */
  emitJump(opcode: number, label: Label): number {
    const spec = specOf(opcode);
    if (spec.operands.length !== 1 || spec.operands[0] !== 'target') {
      throw new InvariantError('LANG-BAD-BYTECODE', `${spec.name} is not a jump`);
    }
    const at = this.emit(opcode, 0);
    this.fixups.push({ at: at + 1, label });
    return at;
  }

  /** The finished code with every jump target resolved. */
  finish(): Int32Array {
    const code = Int32Array.from(this.words);
    for (const fixup of this.fixups) {
      const target = this.marks[fixup.label.id];
      if (target === undefined) {
        throw new InvariantError('LANG-UNRESOLVED-LABEL', `label ${String(fixup.label.id)} was never marked`);
      }
      code[fixup.at] = target;
    }
    return code;
  }
}

function specOf(opcode: number): OpSpec {
  const spec = opSpec(opcode);
  if (spec === undefined) throw new InvariantError('LANG-BAD-BYTECODE', `unknown opcode ${String(opcode)}`);
  return spec;
}
