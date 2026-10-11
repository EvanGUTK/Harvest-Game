import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type Limits } from '../types';
import { add, floorDivide, modulo, multiply, negate, subtract } from './arith';
import { createOpContext, type OpContext } from './op-context';
import type { OpResult } from './runtime-error';
import { constValue, fnValue, literalStr, type ListObj, type RtValue, type StrObj } from './value';

const MAX = Number.MAX_SAFE_INTEGER;
const MIN = Number.MIN_SAFE_INTEGER;

const context = (limits: Limits = DEFAULT_LIMITS): OpContext =>
  createOpContext(
    limits,
    [
      { name: 'RADISH', id: 10, group: 'crop' },
      { name: 'NORTH', id: 1, group: 'direction' },
    ],
    ['tend'],
  );

const value = (r: OpResult): RtValue => {
  if (!r.ok) throw new Error(`unexpected ${r.error.code}: ${r.error.message}`);
  return r.value;
};
const cost = (r: OpResult): number => {
  if (!r.ok) throw new Error(`unexpected ${r.error.code}`);
  return r.cost;
};
const errorOf = (r: OpResult) => {
  if (r.ok) throw new Error('expected an error');
  return r.error;
};
const text = (r: OpResult): string => (value(r) as StrObj).text;
const items = (r: OpResult): RtValue[] => (value(r) as ListObj).items;
const list = (ctx: OpContext, xs: RtValue[]): ListObj => {
  const r = ctx.heap.allocList(xs);
  if (!r.ok) throw new Error('alloc failed');
  return r.value;
};
const heapStr = (ctx: OpContext, s: string): StrObj => {
  const r = ctx.heap.allocStr(s);
  if (!r.ok) throw new Error('alloc failed');
  return r.value;
};

describe('int arithmetic (language-spec.md §Operators by type)', () => {
  it('adds, subtracts and multiplies ints with no surcharge', () => {
    const ctx = context();
    expect(value(add(ctx, 2, 3))).toBe(5);
    expect(value(subtract(ctx, 2, 3))).toBe(-1);
    expect(value(multiply(ctx, -4, 3))).toBe(-12);
    expect(cost(add(ctx, 2, 3))).toBe(0);
    expect(cost(multiply(ctx, 2, 3))).toBe(0);
  });

  it('counts bool operands as int and returns an int (True + True == 2)', () => {
    const ctx = context();
    expect(value(add(ctx, true, true))).toBe(2);
    expect(value(add(ctx, true, 1))).toBe(2);
    expect(value(subtract(ctx, false, true))).toBe(-1);
    expect(value(multiply(ctx, true, 7))).toBe(7);
    expect(value(floorDivide(ctx, 7, true))).toBe(7);
    expect(value(modulo(ctx, true, 2))).toBe(1);
    expect(typeof value(add(ctx, true, false))).toBe('number');
  });

  it('uses Python floor semantics for // and %', () => {
    const ctx = context();
    expect(value(floorDivide(ctx, -7, 2))).toBe(-4);
    expect(value(modulo(ctx, -7, 2))).toBe(1);
    expect(value(floorDivide(ctx, 7, -2))).toBe(-4);
    expect(value(modulo(ctx, 7, -2))).toBe(-1);
    expect(cost(floorDivide(ctx, 7, 2))).toBe(0);
    expect(cost(modulo(ctx, 7, 2))).toBe(0);
  });

  it('raises R-DIV-ZERO on a zero divisor for // and %, including False', () => {
    const ctx = context();
    for (const r of [
      floorDivide(ctx, 1, 0),
      modulo(ctx, 1, 0),
      floorDivide(ctx, 1, false),
      modulo(ctx, 0, 0),
    ]) {
      expect(errorOf(r)).toEqual({ code: 'R-DIV-ZERO', message: "Can't divide by zero (`//` or `%`)." });
    }
  });

  it('raises R-OVERFLOW beyond ±9,007,199,254,740,991 and never wraps silently', () => {
    const ctx = context();
    const overflow = { code: 'R-OVERFLOW', message: 'That number got too big.' };
    expect(errorOf(add(ctx, MAX, 1))).toEqual(overflow);
    expect(errorOf(add(ctx, MAX, true))).toEqual(overflow);
    expect(errorOf(subtract(ctx, MIN, 1))).toEqual(overflow);
    expect(errorOf(multiply(ctx, MAX, 2))).toEqual(overflow);
    expect(errorOf(multiply(ctx, 94_906_267, 94_906_267))).toEqual(overflow);
    expect(value(add(ctx, MAX - 1, 1))).toBe(MAX);
    expect(value(subtract(ctx, MIN + 1, 1))).toBe(MIN);
    expect(value(multiply(ctx, 94_906_265, 94_906_265))).toBe(9_007_199_136_250_225);
    expect(value(floorDivide(ctx, MIN, -1))).toBe(MAX);
  });

  it('never produces -0', () => {
    const ctx = context();
    expect(Object.is(value(multiply(ctx, 0, -5)), 0)).toBe(true);
    expect(Object.is(value(multiply(ctx, -5, 0)), 0)).toBe(true);
    expect(Object.is(value(negate(ctx, 0)), 0)).toBe(true);
    expect(Object.is(value(negate(ctx, false)), 0)).toBe(true);
    expect(Object.is(value(subtract(ctx, 0, 0)), 0)).toBe(true);
  });
});

describe('negation (language-spec.md §Operators by type: -x)', () => {
  it('negates int and bool, giving an int', () => {
    const ctx = context();
    expect(value(negate(ctx, 5))).toBe(-5);
    expect(value(negate(ctx, true))).toBe(-1);
    expect(value(negate(ctx, MIN))).toBe(MAX);
    expect(cost(negate(ctx, 5))).toBe(0);
  });

  it('raises R-TYPE for anything else', () => {
    const ctx = context();
    expect(errorOf(negate(ctx, literalStr('a')))).toMatchObject({
      code: 'R-TYPE',
      message: "Can't make text negative.",
    });
    expect(errorOf(negate(ctx, null)).message).toBe("Can't make None negative.");
    expect(errorOf(negate(ctx, constValue(10))).message).toBe("Can't make a crop negative.");
  });
});

describe('str + str and str repetition (language-spec.md §Operators by type)', () => {
  it('concatenates into a new heap string costing 1 + len(result) (interpreter-vm.md §Op cost table)', () => {
    const ctx = context();
    const r = add(ctx, literalStr('ab'), heapStr(ctx, 'cde'));
    expect(text(r)).toBe('abcde');
    expect(cost(r)).toBe(5);
    expect(ctx.heap.liveCells).toBe(2);
  });

  it('charges 0 surcharge for an empty concatenation', () => {
    const ctx = context();
    const r = add(ctx, literalStr(''), literalStr(''));
    expect(text(r)).toBe('');
    expect(cost(r)).toBe(0);
  });

  it('raises R-STR-TOO-LONG above 256 units, before allocating', () => {
    const ctx = context();
    expect(text(add(ctx, literalStr('x'.repeat(128)), literalStr('y'.repeat(128)))).length).toBe(256);
    const live = ctx.heap.liveCells;
    expect(errorOf(add(ctx, literalStr('x'.repeat(129)), literalStr('y'.repeat(128)))).code).toBe(
      'R-STR-TOO-LONG',
    );
    expect(ctx.heap.liveCells).toBe(live);
  });

  it('repeats a str by an int in either order, costing 1 + len(result)', () => {
    const ctx = context();
    expect(text(multiply(ctx, literalStr('ab'), 3))).toBe('ababab');
    expect(text(multiply(ctx, 3, literalStr('ab')))).toBe('ababab');
    expect(cost(multiply(ctx, literalStr('ab'), 3))).toBe(6);
    expect(text(multiply(ctx, literalStr('ab'), true))).toBe('ab');
  });

  it('gives "" for a count below 1, costing only the base cycle', () => {
    const ctx = context();
    for (const n of [0, -1, MIN, false]) {
      const r = multiply(ctx, literalStr('ab'), n);
      expect(text(r)).toBe('');
      expect(cost(r)).toBe(0);
    }
  });

  it('checks the length before building, even for a huge count', () => {
    const ctx = context();
    expect(errorOf(multiply(ctx, literalStr('ab'), 129)).code).toBe('R-STR-TOO-LONG');
    expect(errorOf(multiply(ctx, literalStr('a'), MAX)).code).toBe('R-STR-TOO-LONG');
    expect(text(multiply(ctx, literalStr(''), MAX))).toBe('');
    expect(text(multiply(ctx, literalStr('ab'), 128))).toHaveLength(256);
  });
});

describe('list + list and list repetition (language-spec.md §Operators by type)', () => {
  it('builds a new list costing 1 + len(result), leaving both operands unchanged', () => {
    const ctx = context();
    const a = list(ctx, [1, 2]);
    const b = list(ctx, [3]);
    const r = add(ctx, a, b);
    expect(items(r)).toEqual([1, 2, 3]);
    expect(value(r)).not.toBe(a);
    expect(a.items).toEqual([1, 2]);
    expect(cost(r)).toBe(3);
    expect(ctx.heap.liveCells).toBe(6);
  });

  it('shares element objects with the operands (references, not copies)', () => {
    const ctx = context();
    const inner = list(ctx, [0]);
    const r = add(ctx, list(ctx, [inner]), list(ctx, []));
    expect(items(r)[0]).toBe(inner);
    expect(inner.rc).toBe(3);
  });

  it('repeats a list by an int in either order, sharing the elements ([0] * 8)', () => {
    const ctx = context();
    expect(items(multiply(ctx, list(ctx, [0]), 8))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(cost(multiply(ctx, list(ctx, [0]), 8))).toBe(8);
    const inner = list(ctx, []);
    const r = multiply(ctx, 3, list(ctx, [inner]));
    expect(items(r)).toEqual([inner, inner, inner]);
    expect(inner.rc).toBe(5);
  });

  it('gives [] for a count below 1, costing only the base cycle', () => {
    const ctx = context();
    const r = multiply(ctx, list(ctx, [1, 2]), -3);
    expect(items(r)).toEqual([]);
    expect(cost(r)).toBe(0);
  });

  it('raises R-COLLECTION-FULL above 1,024 elements, before allocating', () => {
    const ctx = context();
    expect(items(multiply(ctx, list(ctx, [0]), 1_024))).toHaveLength(1_024);
    const live = ctx.heap.liveCells;
    expect(errorOf(multiply(ctx, list(ctx, [0, 0]), 513)).code).toBe('R-COLLECTION-FULL');
    expect(errorOf(multiply(ctx, list(ctx, [0]), MAX)).code).toBe('R-COLLECTION-FULL');
    expect(
      errorOf(
        add(ctx, list(ctx, new Array<RtValue>(1_000).fill(0)), list(ctx, new Array<RtValue>(25).fill(0))),
      ).code,
    ).toBe('R-COLLECTION-FULL');
    expect(ctx.heap.liveCells).toBe(live + 2 + 1 + 1_000 + 25);
  });

  it('raises R-OUT-OF-MEMORY when the result does not fit the heap', () => {
    const ctx = context({ ...DEFAULT_LIMITS, maxHeapCells: 10 });
    const a = list(ctx, [1, 2, 3, 4]);
    expect(errorOf(add(ctx, a, a)).code).toBe('R-OUT-OF-MEMORY');
    expect(ctx.heap.liveCells).toBe(4);
  });
});

describe('R-TYPE wording for arithmetic (errors-and-diagnostics.md §Runtime, chief ruling 2026-10-11)', () => {
  it('uses kind nouns and carries the operands for the VM second sentence', () => {
    const ctx = context();
    const crop = constValue(10);
    const e = errorOf(add(ctx, 5, crop));
    expect(e).toEqual({ code: 'R-TYPE', message: "Can't add a number and a crop.", operands: [5, crop] });
  });

  it('words every operator', () => {
    const ctx = context();
    const s = literalStr('a');
    expect(errorOf(add(ctx, s, 1)).message).toBe("Can't add text and a number.");
    expect(errorOf(add(ctx, 1, s)).message).toBe("Can't add a number and text.");
    expect(errorOf(subtract(ctx, 5, s)).message).toBe("Can't subtract text from a number.");
    expect(errorOf(subtract(ctx, s, s)).message).toBe("Can't subtract text from text.");
    expect(errorOf(multiply(ctx, s, s)).message).toBe("Can't multiply text by text.");
    expect(errorOf(multiply(ctx, list(ctx, []), list(ctx, []))).message).toBe(
      "Can't multiply a list by a list.",
    );
    expect(errorOf(multiply(ctx, s, list(ctx, []))).message).toBe("Can't multiply text by a list.");
    expect(errorOf(floorDivide(ctx, 1, null)).message).toBe("Can't divide a number by None.");
    expect(errorOf(modulo(ctx, constValue(1), 2)).message).toBe(
      "Can't divide a direction by a number to get a remainder.",
    );
    expect(errorOf(add(ctx, ctx.heap.allocDict(), ctx.heap.allocDict())).message).toBe(
      "Can't add a dict and a dict.",
    );
    expect(errorOf(add(ctx, fnValue(0), 1)).message).toBe("Can't add a function and a number.");
    expect(errorOf(add(ctx, s, list(ctx, []))).message).toBe("Can't add text and a list.");
  });

  it('reports R-TYPE before R-DIV-ZERO when both apply', () => {
    const ctx = context();
    expect(errorOf(floorDivide(ctx, literalStr('a'), 0)).code).toBe('R-TYPE');
  });
});
