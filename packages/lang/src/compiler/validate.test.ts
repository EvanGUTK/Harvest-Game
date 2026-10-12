import { describe, expect, it } from 'vitest';
import { InvariantError } from '../invariant';
import { assemble, type AssemblyFunction } from '../test-support/assemble';
import type { ModuleData } from './bytecode';
import { Op } from './opcodes';
import { measureMaxStack } from './stack';
import { assertValidModule, moduleProblems, validateModule } from './validate';
import { LANGUAGE_VERSION } from '../version';

const span = { file: 'main.sprout', line: 1, col: 1, endLine: 1, endCol: 2 };

/** Module body `x = 5; tend()`, and `def tend(a)` returning its local. */
const valid = (): ModuleData =>
  assemble({
    globals: ['x', 'tend'],
    statements: [{ file: 'main.sprout', line: 1, span }],
    constantDefs: [{ name: 'RADISH', id: 10, group: 'crop' }],
    functions: [
      {
        name: '<module>',
        body: (e, pool) => {
          e.emit(Op.LINE, 0);
          e.emit(Op.CONST, pool.add({ kind: 'int', value: 5 }));
          e.emit(Op.STORE_GLOBAL, 0);
          e.emit(Op.CONST, pool.add({ kind: 'fn', index: 1 }));
          e.emit(Op.CONST, pool.add({ kind: 'const', id: 10 }));
          e.emit(Op.CALL, 1);
          e.emit(Op.POP);
          e.emit(Op.HALT);
        },
      },
      {
        name: 'tend',
        arity: 1,
        locals: ['a'],
        body: (e) => {
          e.emit(Op.LOAD_LOCAL, 0);
          e.emit(Op.RETURN);
        },
      },
    ],
  });

const withCode = (data: ModuleData, patch: (code: Int32Array) => void): ModuleData => {
  const code = Int32Array.from(data.code);
  patch(code);
  return { ...data, code };
};

/** A one-function module from raw words, with a pool of `poolSize` ints. */
const single = (words: readonly number[], poolSize = 0): ModuleData => ({
  languageVersion: LANGUAGE_VERSION,
  tokenCount: 0,
  code: Int32Array.from(words),
  pool: Array.from({ length: poolSize }, (_, value) => ({ kind: 'int' as const, value })),
  functions: [
    {
      name: '<module>',
      arity: 0,
      localNames: [],
      entry: 0,
      end: words.length,
      file: 'main.sprout',
      maxStack: measureMaxStack(Int32Array.from(words), 0, words.length),
    },
  ],
  globals: [],
  constantDefs: [],
  statements: [],
  opSpans: new Map(),
  operandNames: new Map(),
});

describe('moduleProblems (interpreter-vm.md §Bytecode: module layout)', () => {
  it('accepts a well-formed module', () => {
    expect(moduleProblems(valid())).toEqual([]);
    expect(() => {
      assertValidModule(valid());
    }).not.toThrow();
  });

  it('requires contiguous, non-empty functions starting at pc 0 and covering the code', () => {
    const data = valid();
    const [body, tend] = data.functions;
    if (!body || !tend) throw new Error('fixture');
    expect(moduleProblems({ ...data, functions: [] })).toContain('the module has no functions');
    expect(moduleProblems({ ...data, functions: [{ ...body, entry: 1 }, tend] })[0]).toContain('starts at 1');
    expect(moduleProblems({ ...data, functions: [body] })[0]).toContain('functions end at');
    expect(moduleProblems({ ...data, functions: [body, { ...tend, arity: 2 }] })[0]).toContain(
      'more parameters',
    );
  });

  it('rejects operands out of range for their kind', () => {
    const data = valid();
    expect(moduleProblems(withCode(data, (c) => (c[1] = 99))).join()).toContain('LINE statement operand 99');
    expect(moduleProblems(withCode(data, (c) => (c[3] = 99))).join()).toContain('CONST pool operand 99');
    expect(moduleProblems(withCode(data, (c) => (c[5] = 2))).join()).toContain(
      'STORE_GLOBAL global operand 2',
    );
    const tendEntry = data.functions[1]?.entry ?? 0;
    expect(moduleProblems(withCode(data, (c) => (c[tendEntry + 1] = 1))).join()).toContain(
      'LOAD_LOCAL local operand 1',
    );
  });

  it('rejects a jump to the middle of an instruction or into another function', () => {
    expect(moduleProblems(single([Op.JUMP, 3, Op.CONST, 0, Op.HALT], 1)).join()).toContain('JUMP target 3');
    const data = valid();
    const tendEntry = data.functions[1]?.entry ?? 0;
    const lastBodyPc = (data.functions[0]?.end ?? 1) - 1;
    const intoTend = withCode(data, (c) => {
      c[lastBodyPc - 1] = Op.JUMP;
      c[lastBodyPc] = tendEntry;
    });
    expect(moduleProblems(intoTend).join()).toContain(`JUMP target ${String(tendEntry)}`);
  });

  it('rejects code that does not decode and functions that can fall off their end', () => {
    const data = valid();
    expect(moduleProblems(withCode(data, (c) => (c[0] = 99))).join()).toContain(
      'no instruction decodes at pc 0',
    );
    expect(moduleProblems(single([Op.CONST, 0, Op.POP], 1)).join()).toContain(
      'POP falls off the end of the function',
    );
  });

  it('rejects pool entries naming a missing function or constant, or an unsafe int', () => {
    const data = valid();
    expect(moduleProblems({ ...data, pool: [...data.pool, { kind: 'fn', index: 9 }] }).join()).toContain(
      'function 9 does not exist',
    );
    expect(moduleProblems({ ...data, pool: [...data.pool, { kind: 'const', id: 3 }] }).join()).toContain(
      'constant 3 is not defined',
    );
    expect(
      moduleProblems({ ...data, pool: [...data.pool, { kind: 'int', value: 2 ** 53 }] }).join(),
    ).toContain('not a safe integer');
  });

  it('checks flag, cost, intrinsic, method and range-argument operands', () => {
    expect(moduleProblems(single([Op.CALL_HOST, 1, 0, 5, 2, Op.HALT])).join()).toContain('flag operand 2');
    expect(moduleProblems(single([Op.CALL_HOST, 1, 0, -1, 1, Op.HALT])).join()).toContain('cost operand -1');
    expect(moduleProblems(single([Op.CALL_INTRINSIC, 7, 1, Op.HALT])).join()).toContain(
      'intrinsic operand 7',
    );
    expect(moduleProblems(single([Op.CALL_METHOD, 3, 1, Op.HALT])).join()).toContain('method operand 3');
    expect(moduleProblems(single([Op.ITER_INIT, 4, Op.HALT])).join()).toContain('iterArgs operand 4');
    const C = [Op.CONST, 0];
    const valid = [
      ...C,
      ...C,
      ...C,
      Op.ITER_INIT,
      3,
      Op.POP,
      ...C,
      Op.CALL_INTRINSIC,
      6,
      1,
      ...C,
      ...C,
      ...C,
    ];
    expect(moduleProblems(single([...valid, Op.CALL_METHOD, 2, 2, Op.POP, Op.POP, Op.HALT], 1))).toEqual([]);
  });

  it('throws LANG-BAD-BYTECODE from assertValidModule', () => {
    expect(() => {
      assertValidModule(withCode(valid(), (c) => (c[0] = 99)));
    }).toThrow(InvariantError);
  });
});

describe('stack analysis (chief ruling 2026-10-12 on #45: malformed bytecode never reaches the VM)', () => {
  /** A one-function module assembled from raw words, so maxStack is measured, not hand-declared. */
  const words = (code: readonly number[]) => moduleProblems(single(code, 1)).join(' | ');
  const C = [Op.CONST, 0];

  it('rejects an op that pops more than the stack holds', () => {
    expect(words([...C, Op.ADD, Op.RETURN])).toContain('ADD needs 2 stack slots but has 1');
    expect(words([Op.POP, Op.HALT])).toContain('POP needs 1 stack slot but has 0');
    expect(words([Op.BUILD_LIST, 5, Op.HALT])).toContain('BUILD_LIST needs 5 stack slots but has 0');
    expect(words([...C, ...C, Op.BUILD_DICT, 2, Op.HALT])).toContain(
      'BUILD_DICT needs 4 stack slots but has 2',
    );
    expect(words([...C, Op.CALL, 1, Op.HALT])).toContain('CALL needs 2 stack slots but has 1');
  });

  it('rejects RETURN without a value', () => {
    const data = single([Op.RETURN], 1);
    expect(moduleProblems(data).join()).toContain('RETURN needs 1 stack slot but has 0');
  });

  it('rejects a join reached with two different stacks', () => {
    // CONST; JUMP_IF_FALSE L; CONST; L: HALT  -> L (pc 6) is reached with [] and [value]
    expect(words([...C, Op.JUMP_IF_FALSE, 6, ...C, Op.HALT])).toContain(
      'pc 6 is reached with stacks [] and [value]',
    );
  });

  it('rejects a slot of the wrong kind: ITER_NEXT without an iterator, REPEAT_NEXT on an iterator', () => {
    expect(words([...C, Op.ITER_NEXT, 4, Op.HALT])).toContain(
      'ITER_NEXT expects an iterator but finds a value',
    );
    expect(words([...C, Op.ITER_INIT, 0, Op.REPEAT_NEXT, 6, Op.HALT])).toContain(
      'REPEAT_NEXT expects a counter but finds an iterator',
    );
    expect(words([...C, Op.ITER_INIT, 0, Op.NOT, Op.HALT])).toContain(
      'NOT expects a value but finds an iterator',
    );
  });

  it('accepts POP of loop state, as break does, and a well-formed loop', () => {
    // CONST; ITER_INIT 0; top: ITER_NEXT out; POP; JUMP top; out: HALT
    expect(words([...C, Op.ITER_INIT, 0, Op.ITER_NEXT, 9, Op.POP, Op.JUMP, 4, Op.HALT])).toBe('');
    // CONST; ITER_INIT 0; ITER_NEXT out; POP; POP (break); JUMP out; out: HALT
    expect(words([...C, Op.ITER_INIT, 0, Op.ITER_NEXT, 10, Op.POP, Op.POP, Op.JUMP, 10, Op.HALT])).toBe('');
  });

  it('reports one LANG-BAD-MAX-STACK problem for a declared maxStack below or above the measured height', () => {
    const data = single([...C, ...C, Op.POP, Op.POP, Op.HALT], 1);
    const [fn] = data.functions;
    if (!fn) throw new Error('fixture');
    expect(fn.maxStack).toBe(2);
    const declare = (maxStack: number) => validateModule({ ...data, functions: [{ ...fn, maxStack }] });
    expect(declare(2)).toEqual([]);
    expect(declare(1)).toEqual([
      { code: 'LANG-BAD-MAX-STACK', message: 'fn 0 declares maxStack 1 but reaches 2' },
    ]);
    expect(declare(3)).toEqual([
      { code: 'LANG-BAD-MAX-STACK', message: 'fn 0 declares maxStack 3 but reaches 2' },
    ]);
    expect(declare(Number.MAX_SAFE_INTEGER)).toHaveLength(1);
    let thrown: unknown;
    try {
      assertValidModule({ ...data, functions: [{ ...fn, maxStack: 1 }] });
    } catch (e) {
      thrown = e;
    }
    expect(thrown instanceof InvariantError && thrown.code).toBe('LANG-BAD-MAX-STACK');
  });

  it('runs no stack analysis on structurally broken code, so one fault gives one problem', () => {
    // CONST 0; JUMP 1; HALT — the jump lands inside CONST's operand; nothing else may be reported.
    expect(validateModule(single([...C, Op.JUMP, 1, Op.HALT], 1))).toEqual([
      { code: 'LANG-BAD-BYTECODE', message: 'pc 2: JUMP target 1 is not an instruction of fn 0' },
    ]);
  });

  it('rejects the reviewer’s five malformed modules, built with assemble()', () => {
    const bodies: AssemblyFunction['body'][] = [
      (e, pool) => (e.emit(Op.CONST, pool.add({ kind: 'int', value: 1 })), e.emit(Op.ADD), e.emit(Op.HALT)),
      (e) => (e.emit(Op.POP), e.emit(Op.HALT)),
      (e, pool) => {
        const join = e.newLabel();
        e.emit(Op.CONST, pool.add({ kind: 'bool', value: true }));
        e.emitJump(Op.JUMP_IF_FALSE, join);
        e.emit(Op.CONST, pool.add({ kind: 'int', value: 1 }));
        e.mark(join);
        e.emit(Op.HALT);
      },
      (e, pool) => {
        const out = e.newLabel();
        e.emit(Op.CONST, pool.add({ kind: 'int', value: 1 }));
        e.emitJump(Op.ITER_NEXT, out);
        e.mark(out);
        e.emit(Op.HALT);
      },
      (e) => (e.emit(Op.BUILD_LIST, 5), e.emit(Op.HALT)),
    ];
    for (const body of bodies) {
      expect(() => assemble({ functions: [{ name: '<module>', body }] })).toThrow(InvariantError);
    }
  });
});

describe('module layout nits (#45 review)', () => {
  it('requires the module body to take no parameters', () => {
    const data = single([Op.HALT]);
    const [fn] = data.functions;
    if (!fn) throw new Error('fixture');
    expect(moduleProblems({ ...data, functions: [{ ...fn, arity: 1, localNames: ['x'] }] })).toContain(
      'fn 0 (the module body) must take no parameters',
    );
  });

  it('rejects a pool string over the 256-unit limit and accepts one at it', () => {
    const data = single([Op.HALT]);
    expect(moduleProblems({ ...data, pool: [{ kind: 'str', text: 'x'.repeat(256) }] })).toEqual([]);
    expect(moduleProblems({ ...data, pool: [{ kind: 'str', text: 'x'.repeat(257) }] }).join()).toContain(
      'a string literal of 257 units is over the limit',
    );
  });
});
