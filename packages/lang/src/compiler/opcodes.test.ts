import { describe, expect, it } from 'vitest';
import { OP_SPECS, Op, decodeInstruction, instructionWidth, opSpec } from './opcodes';

describe('opcode table (interpreter-vm.md §Bytecode)', () => {
  it('numbers every op by its position in OP_SPECS', () => {
    OP_SPECS.forEach((spec, index) => {
      expect(Op[spec.name]).toBe(index);
    });
  });

  it('has the operand kinds the chief rulings fixed (B1-B3, B6)', () => {
    expect(opSpec(Op.SWAP)?.operands).toEqual([]);
    expect(opSpec(Op.ROT3)?.operands).toEqual([]);
    expect(opSpec(Op.DUP2)?.operands).toEqual([]);
    expect(opSpec(Op.CALL_HOST)?.operands).toEqual(['host', 'count', 'cost', 'flag']);
    expect(opSpec(Op.CALL_INTRINSIC)?.operands).toEqual(['intrinsic', 'count']);
    expect(opSpec(Op.ITER_INIT)?.operands).toEqual(['iterArgs']);
    expect(opSpec(Op.LINE)?.operands).toEqual(['statement']);
  });

  it('rejects numbers that are not opcodes', () => {
    expect(opSpec(-1)).toBeUndefined();
    expect(opSpec(OP_SPECS.length)).toBeUndefined();
  });

  it('decodes an instruction with its operands and refuses one that runs past the end', () => {
    const code = Int32Array.from([Op.CALL_HOST, 7, 2, 30, 1, Op.RETURN]);
    const callHost = decodeInstruction(code, 0, code.length);
    expect(callHost?.spec.name).toBe('CALL_HOST');
    expect(callHost?.operands).toEqual([7, 2, 30, 1]);
    expect(callHost && instructionWidth(callHost.spec)).toBe(5);
    expect(decodeInstruction(code, 0, 4)).toBeUndefined();
    expect(decodeInstruction(Int32Array.from([99]), 0, 1)).toBeUndefined();
  });
});
