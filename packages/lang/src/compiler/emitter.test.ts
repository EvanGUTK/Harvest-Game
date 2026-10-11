import { describe, expect, it } from 'vitest';
import { InvariantError } from '../invariant';
import { Emitter } from './emitter';
import { Op } from './opcodes';

const codeOf = (thrower: () => unknown): string | undefined => {
  try {
    thrower();
  } catch (e) {
    return e instanceof InvariantError ? e.code : 'not an InvariantError';
  }
  return undefined;
};

describe('Emitter', () => {
  it('appends instructions and reports each one’s pc', () => {
    const e = new Emitter();
    expect(e.emit(Op.CONST, 0)).toBe(0);
    expect(e.emit(Op.DUP)).toBe(2);
    expect(e.pc).toBe(3);
    expect(Array.from(e.finish())).toEqual([Op.CONST, 0, Op.DUP]);
  });

  it('resolves forward and backward jumps to absolute pcs', () => {
    const e = new Emitter();
    const top = e.newLabel();
    const out = e.newLabel();
    e.mark(top);
    e.emitJump(Op.JUMP_IF_FALSE, out);
    e.emitJump(Op.JUMP, top);
    e.mark(out);
    e.emit(Op.HALT);
    expect(Array.from(e.finish())).toEqual([Op.JUMP_IF_FALSE, 4, Op.JUMP, 0, Op.HALT]);
  });

  it('throws on a wrong operand count, a non-jump given a label, and a label marked twice', () => {
    const e = new Emitter();
    expect(codeOf(() => e.emit(Op.CONST))).toBe('LANG-BAD-BYTECODE');
    expect(codeOf(() => e.emit(Op.POP, 1))).toBe('LANG-BAD-BYTECODE');
    expect(codeOf(() => e.emit(99))).toBe('LANG-BAD-BYTECODE');
    expect(codeOf(() => e.emitJump(Op.CALL, e.newLabel()))).toBe('LANG-BAD-BYTECODE');
    const label = e.newLabel();
    e.mark(label);
    expect(
      codeOf(() => {
        e.mark(label);
      }),
    ).toBe('LANG-BAD-BYTECODE');
  });

  it('refuses to finish while a jump points at an unmarked label', () => {
    const e = new Emitter();
    e.emitJump(Op.JUMP, e.newLabel());
    expect(codeOf(() => e.finish())).toBe('LANG-UNRESOLVED-LABEL');
  });
});
