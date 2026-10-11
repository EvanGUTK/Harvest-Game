import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../types';
import { InvariantError } from '../invariant';
import {
  absBuiltin,
  intBuiltin,
  lenBuiltin,
  maxBuiltin,
  minBuiltin,
  printLine,
  strBuiltin,
  type PrintOutcome,
} from './builtins';
import { createOpContext, type OpContext } from './op-context';
import type { OpResult } from './runtime-error';
import {
  constValue,
  dictKeyOf,
  fnValue,
  literalStr,
  type DictObj,
  type ListObj,
  type RtValue,
  type StrObj,
} from './value';

const MAX = Number.MAX_SAFE_INTEGER;
const MIN = Number.MIN_SAFE_INTEGER;

const context = (): OpContext =>
  createOpContext(DEFAULT_LIMITS, [{ name: 'RADISH', id: 10, group: 'crop' }], ['tend']);
const list = (ctx: OpContext, xs: RtValue[]): ListObj => {
  const r = ctx.heap.allocList(xs);
  if (!r.ok) throw new Error('alloc failed');
  return r.value;
};
const dict = (ctx: OpContext, pairs: [RtValue, RtValue][]): DictObj => {
  const d = ctx.heap.allocDict();
  for (const [k, v] of pairs) {
    const dk = dictKeyOf(k);
    if (dk === undefined || ctx.heap.dictSet(d, dk, k, v) !== undefined) throw new Error('bad dict');
  }
  return d;
};
const s = literalStr;
const outcome = (r: OpResult): [RtValue, number] => {
  if (!r.ok) throw new Error(`unexpected ${r.error.code}: ${r.error.message}`);
  return [r.value, r.cost];
};
const textOutcome = (r: OpResult): [string, number] => {
  const [v, cost] = outcome(r);
  return [(v as StrObj).text, cost];
};
const errorOf = (r: OpResult | PrintOutcome) => {
  if (r.ok) throw new Error('expected an error');
  return r.error;
};
const lineOf = (r: PrintOutcome): [string, number] => {
  if (!r.ok) throw new Error(`unexpected ${r.error.code}`);
  return [r.line, r.cost];
};

describe('len (standard-library.md §Pure helpers; cost 1 on top of the call)', () => {
  it('counts list elements, dict entries and UTF-16 code units of text', () => {
    const ctx = context();
    expect(outcome(lenBuiltin(ctx, [list(ctx, [1, 2, 3])]))).toEqual([3, 1]);
    expect(outcome(lenBuiltin(ctx, [dict(ctx, [[1, 2]])]))).toEqual([1, 1]);
    expect(outcome(lenBuiltin(ctx, [s('a😀')]))).toEqual([3, 1]);
    expect(outcome(lenBuiltin(ctx, [s('')]))).toEqual([0, 1]);
  });

  it('raises R-BAD-ARG for anything else (chief ruling Q15)', () => {
    const ctx = context();
    expect(errorOf(lenBuiltin(ctx, [5]))).toEqual({
      code: 'R-BAD-ARG',
      message: '`len` needs a list, dict or text, but got `5`.',
    });
    expect(errorOf(lenBuiltin(ctx, [constValue(10)])).message).toBe(
      '`len` needs a list, dict or text, but got `RADISH`.',
    );
  });
});

describe('abs (standard-library.md §Pure helpers; cost 1 on top of the call)', () => {
  it('returns the magnitude of an int or bool as an int', () => {
    const ctx = context();
    expect(outcome(absBuiltin(ctx, [-5]))).toEqual([5, 1]);
    expect(outcome(absBuiltin(ctx, [7]))).toEqual([7, 1]);
    expect(outcome(absBuiltin(ctx, [true]))).toEqual([1, 1]);
    expect(outcome(absBuiltin(ctx, [MIN]))).toEqual([MAX, 1]);
    expect(Object.is(outcome(absBuiltin(ctx, [0]))[0], 0)).toBe(true);
  });

  it('raises R-BAD-ARG for anything else', () => {
    const ctx = context();
    expect(errorOf(absBuiltin(ctx, [s('a')]))).toEqual({
      code: 'R-BAD-ARG',
      message: "`abs` needs a number, but got `'a'`.",
    });
  });
});

describe('min and max (standard-library.md §Pure helpers; interpreter-vm.md §Op cost table)', () => {
  it('picks among two or more values at cost 1', () => {
    const ctx = context();
    expect(outcome(minBuiltin(ctx, [3, 1, 2]))).toEqual([1, 1]);
    expect(outcome(maxBuiltin(ctx, [3, 1, 2]))).toEqual([3, 1]);
    expect((outcome(minBuiltin(ctx, [s('b'), s('a')]))[0] as StrObj).text).toBe('a');
  });

  it('picks over a single list at cost 1 + len(lst)', () => {
    const ctx = context();
    expect(outcome(minBuiltin(ctx, [list(ctx, [4, -2, 9])]))).toEqual([-2, 4]);
    expect(outcome(maxBuiltin(ctx, [list(ctx, [4, -2, 9])]))).toEqual([9, 4]);
    expect(outcome(maxBuiltin(ctx, [list(ctx, [4])]))).toEqual([4, 2]);
  });

  it('returns the first of equal candidates, as Python does (chief ruling Q19)', () => {
    const ctx = context();
    expect(outcome(minBuiltin(ctx, [1, true]))[0]).toBe(1);
    expect(outcome(minBuiltin(ctx, [true, 1]))[0]).toBe(true);
    expect(outcome(maxBuiltin(ctx, [list(ctx, [false, 1, true])]))[0]).toBe(1);
  });

  it('hands out an owned reference to the chosen value', () => {
    const ctx = context();
    const r = ctx.heap.allocStr('zz');
    if (!r.ok) throw new Error('alloc failed');
    expect(outcome(maxBuiltin(ctx, [s('a'), r.value]))[0]).toBe(r.value);
    expect(r.value.rc).toBe(2);
  });

  it('raises R-BAD-ARG for no values, an empty list, or a single non-list', () => {
    const ctx = context();
    expect(errorOf(minBuiltin(ctx, [list(ctx, [])]))).toEqual({
      code: 'R-BAD-ARG',
      message: '`min` needs at least one value.',
    });
    expect(errorOf(maxBuiltin(ctx, [list(ctx, [])])).message).toBe('`max` needs at least one value.');
    expect(errorOf(minBuiltin(ctx, [5])).message).toBe(
      '`min` needs a list or two or more values, but got `5`.',
    );
    expect(errorOf(maxBuiltin(ctx, [s('abc')])).message).toBe(
      "`max` needs a list or two or more values, but got `'abc'`.",
    );
  });

  it('raises R-TYPE when two candidates have no ordering', () => {
    const ctx = context();
    expect(errorOf(minBuiltin(ctx, [1, s('a')]))).toEqual({
      code: 'R-TYPE',
      message: "Can't compare `'a'` and `1`.",
    });
    expect(errorOf(maxBuiltin(ctx, [list(ctx, [constValue(10), 5])])).code).toBe('R-TYPE');
  });
});

describe('str (standard-library.md §Pure helpers; cost 1 + len(result))', () => {
  it('formats values as Python does, leaving a top-level str unchanged', () => {
    const ctx = context();
    expect(textOutcome(strBuiltin(ctx, [42]))).toEqual(['42', 3]);
    expect(textOutcome(strBuiltin(ctx, [null]))).toEqual(['None', 5]);
    expect(textOutcome(strBuiltin(ctx, [constValue(10)]))).toEqual(['RADISH', 7]);
    expect(textOutcome(strBuiltin(ctx, [list(ctx, [1, s('a')])]))).toEqual(["[1, 'a']", 9]);
    expect(textOutcome(strBuiltin(ctx, [fnValue(0)]))).toEqual(['<function tend>', 16]);
    expect(textOutcome(strBuiltin(ctx, [s('')]))).toEqual(['', 1]);
  });

  it('returns the same str object for a str argument', () => {
    const ctx = context();
    const t = s('abc');
    expect(outcome(strBuiltin(ctx, [t]))).toEqual([t, 4]);
  });

  it('allocates the result on the heap', () => {
    const ctx = context();
    outcome(strBuiltin(ctx, [list(ctx, new Array<RtValue>(10).fill(0))]));
    // 10 list slots + a 30-unit string (2 cells).
    expect(ctx.heap.liveCells).toBe(12);
  });

  it('raises R-STR-TOO-LONG past 256 units and R-STACK-OVERFLOW past 64 levels', () => {
    const ctx = context();
    expect(errorOf(strBuiltin(ctx, [list(ctx, new Array<RtValue>(86).fill(0))])).code).toBe('R-STR-TOO-LONG');
    const a = list(ctx, []);
    expect(ctx.heap.listAppend(a, a)).toBeUndefined();
    expect(errorOf(strBuiltin(ctx, [a])).code).toBe('R-STACK-OVERFLOW');
  });
});

describe('int (standard-library.md §Pure helpers; chief rulings Q15-Q17)', () => {
  it('reads an optional sign and digits, costing 1 + len(s)', () => {
    const ctx = context();
    expect(outcome(intBuiltin(ctx, [s('12')]))).toEqual([12, 3]);
    expect(outcome(intBuiltin(ctx, [s('-7')]))).toEqual([-7, 3]);
    expect(outcome(intBuiltin(ctx, [s('+5')]))).toEqual([5, 3]);
    expect(outcome(intBuiltin(ctx, [s('007')]))).toEqual([7, 4]);
  });

  it('allows single underscores between digits and strips Python whitespace', () => {
    const ctx = context();
    expect(outcome(intBuiltin(ctx, [s(' -1_000 ')]))).toEqual([-1_000, 9]);
    expect(outcome(intBuiltin(ctx, [s('\t\n\r\v\f42\f\v\r\n\t ')]))[0]).toBe(42);
    expect(outcome(intBuiltin(ctx, [s('1_2_3')]))[0]).toBe(123);
  });

  it('returns +0, never -0', () => {
    const ctx = context();
    expect(Object.is(outcome(intBuiltin(ctx, [s('-0')]))[0], 0)).toBe(true);
    expect(Object.is(outcome(intBuiltin(ctx, [s(' -000 ')]))[0], 0)).toBe(true);
  });

  it('reads the safe range and raises R-OVERFLOW beyond it (chief ruling Q16)', () => {
    const ctx = context();
    expect(outcome(intBuiltin(ctx, [s('9007199254740991')]))[0]).toBe(MAX);
    expect(outcome(intBuiltin(ctx, [s('-9_007_199_254_740_991')]))[0]).toBe(MIN);
    expect(errorOf(intBuiltin(ctx, [s('9007199254740992')]))).toEqual({
      code: 'R-OVERFLOW',
      message: 'That number got too big.',
    });
    expect(errorOf(intBuiltin(ctx, [s('99999999999999999999')])).code).toBe('R-OVERFLOW');
    expect(errorOf(intBuiltin(ctx, [s('-9007199254740992')])).code).toBe('R-OVERFLOW');
  });

  it('raises R-BAD-ARG for text that is not a whole number', () => {
    const ctx = context();
    for (const bad of [
      'abc',
      '',
      '  ',
      '1_',
      '_1',
      '1__0',
      '+_1',
      '1 2',
      '0x10',
      '1.5',
      '--1',
      '+',
      '١',
      '1 ',
    ]) {
      const e = errorOf(intBuiltin(ctx, [s(bad)]));
      expect(e.code).toBe('R-BAD-ARG');
    }
    expect(errorOf(intBuiltin(ctx, [s('abc')])).message).toBe("`int` can't read 'abc' as a whole number.");
  });

  it('turns an int or bool into an int at cost 1', () => {
    const ctx = context();
    expect(outcome(intBuiltin(ctx, [true]))).toEqual([1, 1]);
    expect(outcome(intBuiltin(ctx, [5]))).toEqual([5, 1]);
  });

  it('raises R-BAD-ARG for anything else', () => {
    const ctx = context();
    expect(errorOf(intBuiltin(ctx, [null]))).toEqual({
      code: 'R-BAD-ARG',
      message: '`int` needs text or a number, but got `None`.',
    });
    expect(errorOf(intBuiltin(ctx, [list(ctx, [1])])).message).toBe(
      '`int` needs text or a number, but got `[1]`.',
    );
  });
});

describe('print (standard-library.md §Pure helpers; cost 1 + len(printed line))', () => {
  it('joins arguments with one space, top-level text unquoted', () => {
    const ctx = context();
    expect(lineOf(printLine(ctx, [s('a'), 1, list(ctx, [s('b')]), constValue(10)]))).toEqual([
      "a 1 ['b'] RADISH",
      17,
    ]);
    expect(lineOf(printLine(ctx, []))).toEqual(['', 1]);
  });

  it('allows a line longer than 256 units when each argument fits (chief ruling Q18)', () => {
    const ctx = context();
    const big = s('x'.repeat(200));
    const [line, cost] = lineOf(printLine(ctx, [big, big]));
    expect(line).toHaveLength(401);
    expect(cost).toBe(402);
  });

  it('raises the str() errors for an argument that cannot be printed', () => {
    const ctx = context();
    expect(errorOf(printLine(ctx, [list(ctx, new Array<RtValue>(86).fill(0))])).code).toBe('R-STR-TOO-LONG');
  });

  it('allocates nothing on the heap', () => {
    const ctx = context();
    lineOf(printLine(ctx, [1, 2]));
    expect(ctx.heap.liveCells).toBe(0);
  });
});

describe('intrinsic arity (checked at compile time)', () => {
  it('throws LANG-INTRINSIC-ARITY when called with a count the checker would reject', () => {
    const ctx = context();
    expect(() => lenBuiltin(ctx, [])).toThrow(InvariantError);
    expect(() => minBuiltin(ctx, [])).toThrow(InvariantError);
    expect(() => intBuiltin(ctx, [1, 2])).toThrow(InvariantError);
  });
});
