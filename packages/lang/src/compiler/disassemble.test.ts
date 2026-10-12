import { describe, expect, it } from 'vitest';
import { assemble } from '../test-support/assemble';
import { disassemble } from './disassemble';
import { Op } from './opcodes';

describe('disassemble', () => {
  it('lists each function and annotates pool, global, intrinsic, method and statement operands', () => {
    const data = assemble({
      globals: ['xs'],
      statements: [
        {
          file: 'main.sprout',
          line: 3,
          span: { file: 'main.sprout', line: 3, col: 1, endLine: 3, endCol: 9 },
        },
      ],
      constantDefs: [{ name: 'RADISH', id: 10, group: 'crop' }],
      functions: [
        {
          name: '<module>',
          body: (e, pool) => {
            e.emit(Op.LINE, 0);
            e.emit(Op.CONST, pool.add({ kind: 'str', text: "it's" }));
            e.emit(Op.CONST, pool.add({ kind: 'const', id: 10 }));
            e.emit(Op.BUILD_LIST, 2);
            e.emit(Op.STORE_GLOBAL, 0);
            e.emit(Op.LOAD_GLOBAL, 0);
            e.emit(Op.CALL_INTRINSIC, 0, 1);
            e.emit(Op.POP);
            e.emit(Op.LOAD_GLOBAL, 0);
            e.emit(Op.CALL_METHOD, 1, 0);
            e.emit(Op.POP);
            e.emit(Op.CONST, pool.add({ kind: 'fn', index: 1 }));
            e.emit(Op.POP);
            e.emit(Op.HALT);
          },
        },
        {
          name: 'tend',
          arity: 1,
          locals: ['a', 'b'],
          body: (e, pool) => {
            e.emit(Op.CONST, pool.add({ kind: 'none' }));
            e.emit(Op.RETURN);
          },
        },
      ],
    });
    expect(disassemble(data)).toEqual([
      'fn 0 <module>() locals=0 file=main.sprout',
      '  0000  LINE 0  ; main.sprout:3',
      '  0002  CONST 0  ; "it\'s"',
      '  0004  CONST 1  ; RADISH',
      '  0006  BUILD_LIST 2',
      '  0008  STORE_GLOBAL 0  ; xs',
      '  0010  LOAD_GLOBAL 0  ; xs',
      '  0012  CALL_INTRINSIC 0 1  ; len',
      '  0015  POP',
      '  0016  LOAD_GLOBAL 0  ; xs',
      '  0018  CALL_METHOD 1 0  ; pop',
      '  0021  POP',
      '  0022  CONST 2  ; <function tend>',
      '  0024  POP',
      '  0025  HALT',
      'fn 1 tend(a) locals=2 file=main.sprout',
      '  0026  CONST 3  ; None',
      '  0028  RETURN',
    ]);
  });
});
