import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type Limits, type VMYield } from '../types';
import { InvariantError } from '../invariant';
import { toBytecodeModule, type ConstantPool } from '../compiler/bytecode';
import type { Emitter } from '../compiler/emitter';
import { Op } from '../compiler/opcodes';
import { assemble, type Assembly, type AssemblyFunction } from '../test-support/assemble';
import { Machine } from './machine';
import { valueOps } from './value';

const span = (line: number) => ({ file: 'main.sprout', line, col: 1, endLine: line, endCol: 9 });
const RADISH = { name: 'RADISH', id: 10, group: 'crop' };

type Body = (e: Emitter, pool: ConstantPool) => void;

/** A VM over a module whose body is `body`; extra functions and tables come from `rest`. */
const vm = (
  body: Body,
  rest: Partial<Assembly> & { fns?: readonly AssemblyFunction[] } = {},
  limits?: Limits,
) => {
  const data = assemble({
    constantDefs: [RADISH],
    statements: [
      { file: 'main.sprout', line: 1, span: span(1) },
      { file: 'helpers.sprout', line: 2, span: { ...span(2), file: 'helpers.sprout' } },
    ],
    ...rest,
    functions: [{ name: '<module>', body }, ...(rest.fns ?? [])],
  });
  return new Machine(toBytecodeModule(data), limits ?? DEFAULT_LIMITS);
};

const int = (pool: ConstantPool, value: number) => pool.add({ kind: 'int', value });
const str = (pool: ConstantPool, text: string) => pool.add({ kind: 'str', text });
const none = (pool: ConstantPool) => pool.add({ kind: 'none' });

/** Emits CONST for each int, then BUILD_LIST. */
const listOf = (e: Emitter, pool: ConstantPool, xs: readonly number[]) => {
  for (const x of xs) e.emit(Op.CONST, int(pool, x));
  e.emit(Op.BUILD_LIST, xs.length);
};

/** Cycles a body costs up to and including its final HALT. */
const cyclesOf = (body: Body, rest?: Partial<Assembly> & { fns?: readonly AssemblyFunction[] }) => {
  const y = vm(body, rest).run(1_000_000);
  expect(y.kind).toBe('halt');
  return y.atCycle;
};

const errorOf = (y: VMYield) => {
  if (y.kind !== 'error') throw new Error(`expected an error, got ${y.kind}`);
  return y.error;
};

describe('op cost table: fixed rows (interpreter-vm.md §Op cost table)', () => {
  it('charges 1 per ordinary op and 0 for LINE', () => {
    expect(
      cyclesOf((e, pool) => {
        e.emit(Op.LINE, 0);
        e.emit(Op.CONST, int(pool, 2));
        e.emit(Op.CONST, int(pool, 3));
        e.emit(Op.ADD);
        e.emit(Op.DUP);
        e.emit(Op.SWAP);
        e.emit(Op.POP);
        e.emit(Op.NEG);
        e.emit(Op.NOT);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }),
    ).toBe(10);
  });

  it('charges 1 + len(result) for str and list concatenation', () => {
    const strAdd = cyclesOf((e, pool) => {
      e.emit(Op.CONST, str(pool, 'ab'));
      e.emit(Op.CONST, str(pool, 'cde'));
      e.emit(Op.ADD);
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });
    expect(strAdd).toBe(1 + 1 + (1 + 5) + 1 + 1);
    const listAdd = cyclesOf((e, pool) => {
      listOf(e, pool, [1, 2]);
      listOf(e, pool, [3]);
      e.emit(Op.ADD);
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });
    // [1, 2]: 2 + (1 + 2); [3]: 1 + (1 + 1); ADD 1 + 3; POP; HALT
    expect(listAdd).toBe(5 + 3 + 4 + 1 + 1);
  });

  it('charges 1 + len(result) for repetition, and 1 for a count below 1', () => {
    const repeat = (count: number) =>
      cyclesOf((e, pool) => {
        e.emit(Op.CONST, str(pool, 'ab'));
        e.emit(Op.CONST, int(pool, count));
        e.emit(Op.MUL);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      });
    expect(repeat(3)).toBe(1 + 1 + (1 + 6) + 1 + 1);
    expect(repeat(0)).toBe(1 + 1 + 1 + 1 + 1);
    expect(repeat(-4)).toBe(5);
  });

  it('charges 1 + min(len) for str ==, and 1 for scalars', () => {
    const eq = (a: string, b: string) =>
      cyclesOf((e, pool) => {
        e.emit(Op.CONST, str(pool, a));
        e.emit(Op.CONST, str(pool, b));
        e.emit(Op.EQ);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      });
    expect(eq('abc', 'abd')).toBe(1 + 1 + (1 + 3) + 1 + 1);
    expect(eq('ab', 'abc')).toBe(1 + 1 + (1 + 2) + 1 + 1);
    expect(
      cyclesOf((e, pool) => {
        e.emit(Op.CONST, int(pool, 1));
        e.emit(Op.CONST, int(pool, 1));
        e.emit(Op.NE);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }),
    ).toBe(5);
  });

  it('charges the structural surcharge for list ==, stopping at the first differing pair', () => {
    const eq = (a: number[], b: number[]) =>
      cyclesOf((e, pool) => {
        listOf(e, pool, a);
        listOf(e, pool, b);
        e.emit(Op.EQ);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }) -
      (a.length + 1 + a.length) -
      (b.length + 1 + b.length) -
      2;
    expect(eq([9, 2, 3], [1, 2, 3])).toBe(1 + 1);
    expect(eq([1, 2, 9], [1, 2, 3])).toBe(1 + 3);
    expect(eq([1, 2, 3], [1, 2, 3])).toBe(1 + 3);
    expect(eq([1, 2], [1, 2, 3])).toBe(1);
    expect(eq([], [])).toBe(1);
  });

  it('charges IN on a list per element up to the first match, on text len(haystack), on a dict 1', () => {
    const inList = (needle: number, xs: number[]) =>
      cyclesOf((e, pool) => {
        e.emit(Op.CONST, int(pool, needle));
        listOf(e, pool, xs);
        e.emit(Op.IN);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }) -
      1 -
      (xs.length + 1 + xs.length) -
      2;
    expect(inList(1, [1, 2, 3])).toBe(1 + 1);
    expect(inList(3, [1, 2, 3])).toBe(1 + 3);
    expect(inList(9, [1, 2, 3])).toBe(1 + 3);
    expect(inList(9, [])).toBe(1);
    expect(
      cyclesOf((e, pool) => {
        e.emit(Op.CONST, str(pool, 'b'));
        e.emit(Op.CONST, str(pool, 'abc'));
        e.emit(Op.IN);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }),
    ).toBe(1 + 1 + (1 + 3) + 1 + 1);
    expect(
      cyclesOf((e, pool) => {
        e.emit(Op.CONST, int(pool, 1));
        e.emit(Op.CONST, int(pool, 1));
        e.emit(Op.CONST, int(pool, 2));
        e.emit(Op.BUILD_DICT, 1);
        e.emit(Op.IN);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }),
    ).toBe(1 + 1 + 1 + (1 + 1) + 1 + 1 + 1);
  });

  it('charges 1 + n for BUILD_LIST n and BUILD_DICT n, and 1 for INDEX_GET and INDEX_SET', () => {
    expect(
      cyclesOf((e, pool) => {
        listOf(e, pool, [5, 6]);
        e.emit(Op.DUP);
        e.emit(Op.CONST, int(pool, 0));
        e.emit(Op.CONST, int(pool, 7));
        e.emit(Op.INDEX_SET);
        e.emit(Op.CONST, int(pool, 0));
        e.emit(Op.INDEX_GET);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }),
    ).toBe(2 + 3 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1);
  });
});

describe('op cost table: loops (iteration, repeat, Loop exits)', () => {
  /** for x in [1, 2, 3]: pass */
  const forOverList = (e: Emitter, pool: ConstantPool, xs: number[]) => {
    listOf(e, pool, xs);
    e.emit(Op.ITER_INIT, 0);
    const top = e.newLabel();
    const out = e.newLabel();
    e.mark(top);
    e.emitJump(Op.ITER_NEXT, out);
    e.emit(Op.POP);
    e.emitJump(Op.JUMP, top);
    e.mark(out);
  };

  it('charges ITER_INIT 1 and ITER_NEXT 1 per call, including the call that ends the loop', () => {
    const cycles = cyclesOf((e, pool) => {
      forOverList(e, pool, [1, 2, 3]);
      e.emit(Op.HALT);
    });
    // list 3 + 4; ITER_INIT 1; 3 × (ITER_NEXT + POP + JUMP); final ITER_NEXT 1; HALT 1
    expect(cycles).toBe(7 + 1 + 9 + 1 + 1);
  });

  it('charges 1 + len(dict) for ITER_INIT over a dict', () => {
    const cycles = cyclesOf((e, pool) => {
      for (const v of [1, 10, 2, 20]) e.emit(Op.CONST, int(pool, v));
      e.emit(Op.BUILD_DICT, 2);
      e.emit(Op.ITER_INIT, 0);
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });
    expect(cycles).toBe(4 + 3 + (1 + 2) + 1 + 1);
  });

  it('charges range a single ITER_INIT cycle with no call cycle (chief ruling B3)', () => {
    const cycles = cyclesOf((e, pool) => {
      e.emit(Op.CONST, int(pool, 2));
      e.emit(Op.ITER_INIT, 1);
      const top = e.newLabel();
      const out = e.newLabel();
      e.mark(top);
      e.emitJump(Op.ITER_NEXT, out);
      e.emit(Op.POP);
      e.emitJump(Op.JUMP, top);
      e.mark(out);
      e.emit(Op.HALT);
    });
    expect(cycles).toBe(1 + 1 + 2 * 3 + 1 + 1);
  });

  it('pops the iterator on normal exit, and break in a for loop costs JUMP + POP (chief ruling B4)', () => {
    const machine = vm((e, pool) => {
      listOf(e, pool, [1, 2, 3]);
      e.emit(Op.ITER_INIT, 0);
      const top = e.newLabel();
      const out = e.newLabel();
      const broke = e.newLabel();
      e.mark(top);
      e.emitJump(Op.ITER_NEXT, out);
      e.emit(Op.POP);
      e.emitJump(Op.JUMP, broke); // break on the first element
      e.emitJump(Op.JUMP, top);
      e.mark(broke);
      e.emit(Op.POP);
      e.mark(out);
      e.emit(Op.HALT);
    });
    const y = machine.run(1_000);
    // list 7; ITER_INIT 1; ITER_NEXT 1; POP 1; break JUMP 1 + POP 1; HALT 1
    expect(y).toEqual({ kind: 'halt', atCycle: 7 + 1 + 1 + 1 + 2 + 1 });
    expect(machine.liveCells).toBe(0);
  });

  it('runs repeat n rounds with REPEAT_NEXT charging 1 per call', () => {
    const repeat = (n: number) =>
      cyclesOf((e, pool) => {
        e.emit(Op.CONST, int(pool, n));
        e.emit(Op.REPEAT_INIT);
        const top = e.newLabel();
        const out = e.newLabel();
        e.mark(top);
        e.emitJump(Op.REPEAT_NEXT, out);
        e.emitJump(Op.JUMP, top);
        e.mark(out);
        e.emit(Op.HALT);
      });
    expect(repeat(3)).toBe(1 + 1 + 3 * 2 + 1 + 1);
    expect(repeat(0)).toBe(1 + 1 + 1 + 1);
  });
});

describe('op cost table: calls (CALL, CALL_INTRINSIC, CALL_METHOD, RETURN)', () => {
  it('charges len(x) 2 in total, str(x) 2 + len(result), min(lst) 2 + len(lst) (chief ruling Q1)', () => {
    const intrinsic = (id: number, emitArgs: (e: Emitter, pool: ConstantPool) => number, setup = 0) =>
      cyclesOf((e, pool) => {
        const argc = emitArgs(e, pool);
        e.emit(Op.CALL_INTRINSIC, id, argc);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }) -
      setup -
      2;
    expect(intrinsic(0, (e, pool) => (e.emit(Op.CONST, str(pool, 'abc')), 1), 1)).toBe(2);
    expect(intrinsic(4, (e, pool) => (e.emit(Op.CONST, int(pool, 1234)), 1), 1)).toBe(2 + 4);
    expect(intrinsic(2, (e, pool) => (listOf(e, pool, [3, 1, 2]), 1), 7)).toBe(2 + 3);
    expect(
      intrinsic(2, (e, pool) => (e.emit(Op.CONST, int(pool, 3)), e.emit(Op.CONST, int(pool, 1)), 2), 2),
    ).toBe(2);
  });

  it('charges append 2 and pop(i) 2 + elements shifted', () => {
    const method = (id: number, args: number[]) =>
      cyclesOf((e, pool) => {
        listOf(e, pool, [1, 2, 3, 4]);
        for (const a of args) e.emit(Op.CONST, int(pool, a));
        e.emit(Op.CALL_METHOD, id, args.length);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }) -
      9 -
      args.length -
      2;
    expect(method(0, [5])).toBe(2);
    expect(method(1, [])).toBe(2);
    expect(method(1, [0])).toBe(2 + 3);
    expect(method(1, [-1])).toBe(2);
  });

  it('charges CALL 1 and RETURN 1, and RETURN discards the frame, iterators included', () => {
    const machine = vm(
      (e, pool) => {
        e.emit(Op.CONST, pool.add({ kind: 'fn', index: 1 }));
        e.emit(Op.CONST, int(pool, 4));
        e.emit(Op.CALL, 1);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      },
      {
        fns: [
          {
            name: 'first',
            arity: 1,
            locals: ['n'],
            body: (e, pool) => {
              listOf(e, pool, [7, 8]);
              e.emit(Op.ITER_INIT, 0);
              const out = e.newLabel();
              e.emitJump(Op.ITER_NEXT, out);
              e.emit(Op.RETURN); // return the first element from inside the loop
              e.mark(out);
              e.emit(Op.CONST, none(pool));
              e.emit(Op.RETURN);
            },
          },
        ],
      },
    );
    const y = machine.run(1_000);
    // CONST CONST CALL; list 5; ITER_INIT 1; ITER_NEXT 1; RETURN 1; POP; HALT
    expect(y).toEqual({ kind: 'halt', atCycle: 3 + 5 + 1 + 1 + 1 + 1 + 1 });
    expect(machine.liveCells).toBe(0);
  });
});

describe('chained comparison and a[i] op= v (chief ruling B1)', () => {
  /** a < b < c as the compiler emits it, leaving the result on the stack and printing it. */
  const chain = (a: number, b: number, c: number) =>
    vm((e, pool) => {
      e.emit(Op.CONST, int(pool, a));
      e.emit(Op.CONST, int(pool, b));
      e.emit(Op.DUP);
      e.emit(Op.ROT3);
      e.emit(Op.LT);
      const fail = e.newLabel();
      const end = e.newLabel();
      e.emitJump(Op.JUMP_IF_FALSE_KEEP, fail); // pops the True itself when it does not jump
      e.emit(Op.CONST, int(pool, c));
      e.emit(Op.LT);
      e.emitJump(Op.JUMP, end);
      e.mark(fail);
      e.emit(Op.SWAP);
      e.emit(Op.POP);
      e.mark(end);
      e.emit(Op.CALL_INTRINSIC, 6, 1);
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });

  it('evaluates the middle operand once and leaves exactly the result', () => {
    for (const [a, b, c, expected] of [
      [1, 2, 3, 'True'],
      [1, 2, 2, 'False'],
      [3, 2, 9, 'False'],
    ] as const) {
      const machine = chain(a, b, c);
      expect(machine.run(1_000).kind).toBe('halt');
      expect(machine.output).toEqual([expected]);
    }
  });

  it('updates a[i] with DUP2 so a and i are evaluated once', () => {
    const machine = vm(
      (e, pool) => {
        listOf(e, pool, [10, 20]);
        e.emit(Op.STORE_GLOBAL, 0);
        e.emit(Op.LOAD_GLOBAL, 0);
        e.emit(Op.CONST, int(pool, 1));
        e.emit(Op.DUP2);
        e.emit(Op.INDEX_GET);
        e.emit(Op.CONST, int(pool, 5));
        e.emit(Op.ADD);
        e.emit(Op.INDEX_SET);
        e.emit(Op.LOAD_GLOBAL, 0);
        e.emit(Op.CALL_INTRINSIC, 6, 1);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      },
      { globals: ['a'] },
    );
    expect(machine.run(1_000).kind).toBe('halt');
    expect(machine.output).toEqual(['[10, 25]']);
  });
});

describe('clock arithmetic (simulation-engine.md §Clock arithmetic)', () => {
  /** x = sensor(1); halt */
  const hostCall = () =>
    vm((e, pool) => {
      e.emit(Op.CONST, int(pool, 1));
      e.emit(Op.CALL_HOST, 42, 1, 30, 1);
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });

  it('yields every host call with atCycle after the 1-cycle base and the baked cost alone', () => {
    const machine = hostCall();
    const y = machine.run(1_000);
    expect(y).toEqual({ kind: 'host', fn: 42, args: [valueOps.int(1)], cost: 30, atCycle: 2 });
    expect(machine.cycles).toBe(2);
  });

  it('charges the baked cost on resume when none is given, else the applied cost', () => {
    const baked = hostCall();
    baked.run(1_000);
    baked.resume(valueOps.int(7));
    expect(baked.cycles).toBe(32);
    expect(baked.run(1_000)).toEqual({ kind: 'halt', atCycle: 34 });
    const failed = hostCall();
    failed.run(1_000);
    failed.resume(valueOps.bool(false), 5);
    expect(failed.run(1_000)).toEqual({ kind: 'halt', atCycle: 9 });
  });

  it('yields a host call whenever at least 1 cycle remains, regardless of its cost', () => {
    const machine = hostCall();
    expect(machine.run(2)).toMatchObject({ kind: 'host', atCycle: 2 });
  });

  it('yields budget at remaining 0 and resumes where it stopped', () => {
    const machine = vm((e, pool) => {
      e.emit(Op.CONST, int(pool, 1));
      e.emit(Op.CONST, int(pool, 2));
      e.emit(Op.ADD);
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });
    expect(machine.run(2)).toEqual({ kind: 'budget', atCycle: 2 });
    expect(machine.run(0)).toEqual({ kind: 'budget', atCycle: 2 });
    expect(machine.run(10)).toEqual({ kind: 'halt', atCycle: 5 });
  });

  it('runs an op in full once it starts, so a run can end past maxCycles', () => {
    const machine = vm((e, pool) => {
      e.emit(Op.CONST, str(pool, 'abcdef'));
      e.emit(Op.CONST, str(pool, 'ghij'));
      e.emit(Op.ADD);
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });
    expect(machine.run(3)).toEqual({ kind: 'budget', atCycle: 13 });
  });

  it('keeps returning the final yield after halt or an error', () => {
    const machine = vm((e) => e.emit(Op.HALT));
    expect(machine.run(10)).toEqual({ kind: 'halt', atCycle: 1 });
    expect(machine.run(10)).toEqual({ kind: 'halt', atCycle: 1 });
  });

  it('refuses run() while a host call awaits resume, and resume() with nothing pending', () => {
    const machine = hostCall();
    machine.run(100);
    expect(() => machine.run(100)).toThrow(InvariantError);
    machine.resume(valueOps.none);
    expect(() => {
      machine.resume(valueOps.none);
    }).toThrow(InvariantError);
  });

  it('rejects a budget that is not a whole number >= 0, so run() can never hang (#58 review nit)', () => {
    for (const budget of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5]) {
      const machine = vm((e) => e.emit(Op.HALT));
      expect(() => machine.run(budget)).toThrow(InvariantError);
    }
    expect(vm((e) => e.emit(Op.HALT)).run(0)).toEqual({ kind: 'budget', atCycle: 0 });
  });

  it('rejects a negative or fractional applied cost', () => {
    const machine = hostCall();
    machine.run(100);
    expect(() => {
      machine.resume(valueOps.none, -1);
    }).toThrow(InvariantError);
  });
});

describe('raise (chief ruling 2026-10-11: a host call that fails inside the host)', () => {
  it('charges nothing beyond the call by default and yields the error at the call’s source range', () => {
    const machine = vm(
      (e, pool) => {
        e.emit(Op.LINE, 0);
        e.emit(Op.CONST, int(pool, 0));
        e.emit(Op.CALL_HOST, 7, 1, 1, 0);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      },
      { opSpans: new Map([[4, span(1)]]) },
    );
    machine.run(100);
    machine.raise({
      code: 'R-BAD-ARG',
      message: '`wait` needs a whole number from 1 to 5,000, but got `0`.',
    });
    expect(machine.run(100)).toEqual({
      kind: 'error',
      atCycle: 2,
      error: {
        code: 'R-BAD-ARG',
        severity: 'error',
        range: span(1),
        message: '`wait` needs a whole number from 1 to 5,000, but got `0`.',
      },
    });
  });
});

describe('raise with an applied cost', () => {
  it('charges the cost the host applied', () => {
    const machine = vm((e, pool) => {
      e.emit(Op.CONST, int(pool, 0));
      e.emit(Op.CALL_HOST, 7, 1, 1, 0);
      e.emit(Op.HALT);
    });
    machine.run(100);
    machine.raise({ code: 'R-BAD-ARG', message: 'bad' }, 5);
    expect(machine.run(100)).toMatchObject({ kind: 'error', atCycle: 7 });
  });
});

describe('stopAtLine (chief ruling V6)', () => {
  it('yields at the next statement boundary with its file, leaving the LINE to run next', () => {
    const machine = vm((e, pool) => {
      e.emit(Op.LINE, 0);
      e.emit(Op.CONST, int(pool, 1));
      e.emit(Op.POP);
      e.emit(Op.LINE, 1);
      e.emit(Op.CONST, int(pool, 2));
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });
    expect(machine.run(100, { stopAtLine: true })).toEqual({
      kind: 'line',
      file: 'helpers.sprout',
      line: 2,
      atCycle: 2,
    });
    expect(machine.run(100, { stopAtLine: true })).toEqual({ kind: 'halt', atCycle: 5 });
  });

  it('stops at a LINE that a budget yield left at ip (chunking must not skip a boundary)', () => {
    const machine = vm((e, pool) => {
      e.emit(Op.LINE, 0);
      e.emit(Op.CONST, int(pool, 1));
      e.emit(Op.POP);
      e.emit(Op.LINE, 1);
      e.emit(Op.CONST, int(pool, 2));
      e.emit(Op.POP);
      e.emit(Op.HALT);
    });
    expect(machine.run(2, { stopAtLine: true })).toEqual({ kind: 'budget', atCycle: 2 });
    expect(machine.run(100, { stopAtLine: true })).toEqual({
      kind: 'line',
      file: 'helpers.sprout',
      line: 2,
      atCycle: 2,
    });
    expect(machine.run(100, { stopAtLine: true })).toEqual({ kind: 'halt', atCycle: 5 });
  });

  it('stops at the same boundaries whatever the run budgets are', () => {
    /** Three statements of two cycles each; collects every line yield, run in chunks of `chunk`. */
    const stops = (chunk: number) => {
      const machine = vm((e, pool) => {
        for (const statement of [0, 1, 0]) {
          e.emit(Op.LINE, statement);
          e.emit(Op.CONST, int(pool, 1));
          e.emit(Op.POP);
        }
        e.emit(Op.HALT);
      });
      const seen: VMYield[] = [];
      for (
        let y = machine.run(chunk, { stopAtLine: true });
        y.kind !== 'halt';
        y = machine.run(chunk, { stopAtLine: true })
      ) {
        if (y.kind === 'line') seen.push(y);
      }
      return seen;
    };
    const expected = stops(1_000);
    expect(expected.map((y) => y.atCycle)).toEqual([2, 4]);
    for (const chunk of [1, 2, 3, 4]) expect(stops(chunk)).toEqual(expected);
  });

  it('needs a cycle of budget to start even a LINE', () => {
    const machine = vm((e) => {
      e.emit(Op.LINE, 0);
      e.emit(Op.HALT);
    });
    expect(machine.run(0, { stopAtLine: true })).toEqual({ kind: 'budget', atCycle: 0 });
  });
});

describe('runtime errors (errors-and-diagnostics.md §Runtime)', () => {
  it('charges only the base cycle of a failed op and reports the op’s source range', () => {
    const machine = vm(
      (e, pool) => {
        e.emit(Op.LINE, 0);
        e.emit(Op.CONST, int(pool, 1));
        e.emit(Op.CONST, int(pool, 0));
        e.emit(Op.FLOORDIV);
        e.emit(Op.HALT);
      },
      { opSpans: new Map([[6, span(1)]]) },
    );
    expect(machine.run(100)).toEqual({
      kind: 'error',
      atCycle: 3,
      error: {
        code: 'R-DIV-ZERO',
        severity: 'error',
        range: span(1),
        message: "Can't divide by zero (`//` or `%`).",
      },
    });
  });

  it('adds "`x` is …" only for operands the compiler recorded as plain names (chief ruling Q7)', () => {
    const data = assemble({
      constantDefs: [RADISH],
      globals: ['x', 'y'],
      functions: [
        {
          name: '<module>',
          body: (e, pool) => {
            e.emit(Op.CONST, int(pool, 5));
            e.emit(Op.STORE_GLOBAL, 0);
            e.emit(Op.CONST, pool.add({ kind: 'const', id: 10 }));
            e.emit(Op.STORE_GLOBAL, 1);
            e.emit(Op.LOAD_GLOBAL, 0);
            e.emit(Op.LOAD_GLOBAL, 1);
            e.emit(Op.ADD);
            e.emit(Op.HALT);
          },
        },
      ],
    });
    const named = new Machine(
      toBytecodeModule({ ...data, operandNames: new Map([[12, ['x', 'y']]]) }),
      DEFAULT_LIMITS,
    );
    expect(errorOf(named.run(100)).message).toBe(
      "Can't add a number and a crop. `x` is `5`, `y` is `RADISH`.",
    );
    const half = new Machine(
      toBytecodeModule({ ...data, operandNames: new Map([[12, [null, 'y']]]) }),
      DEFAULT_LIMITS,
    );
    expect(errorOf(half.run(100)).message).toBe("Can't add a number and a crop. `y` is `RADISH`.");
    const plain = new Machine(toBytecodeModule(data), DEFAULT_LIMITS);
    expect(errorOf(plain.run(100)).message).toBe("Can't add a number and a crop.");
  });

  it('raises R-UNBOUND-GLOBAL and R-UNBOUND-LOCAL with the catalogue wording', () => {
    const global = vm(
      (e) => {
        e.emit(Op.LOAD_GLOBAL, 0);
        e.emit(Op.HALT);
      },
      { globals: ['tend'] },
    );
    expect(errorOf(global.run(100))).toMatchObject({
      code: 'R-UNBOUND-GLOBAL',
      message: "`tend` isn't defined yet at this line. Move the `def` above.",
    });
    const local = vm(
      (e, pool) => {
        e.emit(Op.CONST, pool.add({ kind: 'fn', index: 1 }));
        e.emit(Op.CALL, 0);
        e.emit(Op.HALT);
      },
      {
        fns: [
          { name: 'count', locals: ['total'], body: (e) => (e.emit(Op.LOAD_LOCAL, 0), e.emit(Op.RETURN)) },
        ],
      },
    );
    expect(errorOf(local.run(100))).toMatchObject({
      code: 'R-UNBOUND-LOCAL',
      message: '`total` is used before it gets a value in this function. Did you mean `global total`?',
    });
  });

  it('raises R-NOT-CALLABLE, with the None note only for None (chief ruling V2)', () => {
    const callConst = (entry: Parameters<ConstantPool['add']>[0]) =>
      vm((e, pool) => {
        e.emit(Op.CONST, pool.add(entry));
        e.emit(Op.CALL, 0);
        e.emit(Op.HALT);
      }).run(100);
    expect(errorOf(callConst({ kind: 'int', value: 5 }))).toMatchObject({
      code: 'R-NOT-CALLABLE',
      message: "`5` isn't a function, so it can't be called with `()`.",
    });
    expect(errorOf(callConst({ kind: 'none' })).message).toBe(
      "`None` isn't a function, so it can't be called with `()`. (`None` is what a function with no `return` gives back.)",
    );
  });

  it('raises R-WRONG-ARG-COUNT naming the def, singular for one (chief ruling V3)', () => {
    const call = (arity: number, argc: number) =>
      vm(
        (e, pool) => {
          e.emit(Op.CONST, pool.add({ kind: 'fn', index: 1 }));
          for (let i = 0; i < argc; i += 1) e.emit(Op.CONST, int(pool, i));
          e.emit(Op.CALL, argc);
          e.emit(Op.HALT);
        },
        {
          fns: [
            {
              name: 'f',
              arity,
              locals: Array.from({ length: arity }, (_, i) => `p${String(i)}`),
              body: (e, pool) => (e.emit(Op.CONST, none(pool)), e.emit(Op.RETURN)),
            },
          ],
        },
      ).run(100);
    expect(errorOf(call(2, 1)).message).toBe('`f` needs 2 things in the brackets, but got 1.');
    expect(errorOf(call(1, 0)).message).toBe('`f` needs 1 thing in the brackets, but got 0.');
  });

  it('runs 64 nested calls and raises R-STACK-OVERFLOW on the 65th (chief ruling V1)', () => {
    /** def down(n): if n: down(n - 1) — called with `depth`. */
    const recurse = (depth: number) =>
      vm(
        (e, pool) => {
          e.emit(Op.CONST, pool.add({ kind: 'fn', index: 1 }));
          e.emit(Op.CONST, int(pool, depth - 1));
          e.emit(Op.CALL, 1);
          e.emit(Op.POP);
          e.emit(Op.HALT);
        },
        {
          fns: [
            {
              name: 'down',
              arity: 1,
              locals: ['n'],
              body: (e, pool) => {
                const done = e.newLabel();
                e.emit(Op.LOAD_LOCAL, 0);
                e.emitJump(Op.JUMP_IF_FALSE, done);
                e.emit(Op.CONST, pool.add({ kind: 'fn', index: 1 }));
                e.emit(Op.LOAD_LOCAL, 0);
                e.emit(Op.CONST, int(pool, 1));
                e.emit(Op.SUB);
                e.emit(Op.CALL, 1);
                e.emit(Op.RETURN);
                e.mark(done);
                e.emit(Op.CONST, none(pool));
                e.emit(Op.RETURN);
              },
            },
          ],
        },
      ).run(100_000);
    expect(recurse(64).kind).toBe('halt');
    expect(errorOf(recurse(65))).toMatchObject({
      code: 'R-STACK-OVERFLOW',
      message: 'A function called itself too many times (64 max). Check your stopping condition.',
    });
  });

  it('raises R-TYPE for a loop over a non-iterable and R-BAD-ARG for range step 0', () => {
    const loop = (emit: (e: Emitter, pool: ConstantPool) => void) =>
      vm((e, pool) => {
        emit(e, pool);
        e.emit(Op.POP);
        e.emit(Op.HALT);
      }).run(100);
    expect(
      errorOf(loop((e, pool) => (e.emit(Op.CONST, int(pool, 5)), e.emit(Op.ITER_INIT, 0)))).message,
    ).toBe("Can't loop over a number.");
    expect(
      errorOf(
        loop((e, pool) => {
          for (const v of [0, 5, 0]) e.emit(Op.CONST, int(pool, v));
          e.emit(Op.ITER_INIT, 3);
        }),
      ).message,
    ).toBe("`range` step can't be 0.");
  });
});

describe('print (standard-library.md §Pure helpers: 200 lines per run)', () => {
  it('keeps the first maxPrintLines lines and counts the rest as dropped (chief ruling V7)', () => {
    const machine = vm(
      (e, pool) => {
        e.emit(Op.CONST, int(pool, 3));
        e.emit(Op.REPEAT_INIT);
        const top = e.newLabel();
        const out = e.newLabel();
        e.mark(top);
        e.emitJump(Op.REPEAT_NEXT, out);
        e.emit(Op.CONST, str(pool, 'hi'));
        e.emit(Op.CALL_INTRINSIC, 6, 1);
        e.emit(Op.POP);
        e.emitJump(Op.JUMP, top);
        e.mark(out);
        e.emit(Op.HALT);
      },
      {},
      { ...DEFAULT_LIMITS, maxPrintLines: 2 },
    );
    const y = machine.run(1_000);
    expect(machine.output).toEqual(['hi', 'hi']);
    expect(machine.droppedLines).toBe(1);
    // CONST, REPEAT_INIT; 3 × (REPEAT_NEXT, CONST, print 2 + 2, POP, JUMP); final REPEAT_NEXT; HALT
    expect(y).toEqual({ kind: 'halt', atCycle: 2 + 3 * 8 + 1 + 1 });
  });
});

describe('heap accounting through the VM (interpreter-vm.md §VM: heap accounting)', () => {
  /** repeat rounds: xs = [0] * 100 (kept or dropped) */
  const loop = (rounds: number, keep: boolean) =>
    vm(
      (e, pool) => {
        e.emit(Op.BUILD_LIST, 0);
        e.emit(Op.STORE_GLOBAL, 0);
        e.emit(Op.CONST, int(pool, rounds));
        e.emit(Op.REPEAT_INIT);
        const top = e.newLabel();
        const out = e.newLabel();
        e.mark(top);
        e.emitJump(Op.REPEAT_NEXT, out);
        e.emit(Op.CONST, int(pool, 0));
        e.emit(Op.BUILD_LIST, 1);
        e.emit(Op.CONST, int(pool, 100));
        e.emit(Op.MUL);
        if (keep) {
          e.emit(Op.LOAD_GLOBAL, 0);
          e.emit(Op.SWAP);
          e.emit(Op.CALL_METHOD, 0, 1);
        }
        e.emit(Op.POP);
        e.emitJump(Op.JUMP, top);
        e.mark(out);
        e.emit(Op.HALT);
      },
      { globals: ['kept'] },
    );

  it('never trips on a loop that builds a list per round and drops it', () => {
    const machine = loop(1_000, false);
    expect(machine.run(10_000_000).kind).toBe('halt');
    expect(machine.liveCells).toBe(0);
  });

  it('trips R-OUT-OF-MEMORY at the same round every run when every list is kept', () => {
    const tripCycle = () => {
      const machine = loop(1_000, true);
      const y = machine.run(10_000_000);
      expect(errorOf(y).code).toBe('R-OUT-OF-MEMORY');
      return [y.atCycle, machine.liveCells];
    };
    const first = tripCycle();
    expect(tripCycle()).toEqual(first);
    // Each kept round holds 100 slots + 1 in `kept`: 162 rounds hold 16,362 cells. Round 163 builds
    // [0] (16,363) and [0] * 100 would need 16,463 > 16,384, so it fails; the failed op's [0] is then
    // released, leaving exactly the kept cells.
    expect(first[1]).toBe(162 * 101);
  });
});
