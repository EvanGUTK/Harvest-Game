import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../types';
import { contains, equals, greaterEqual, greaterThan, lessEqual, lessThan, notEquals } from './compare';
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
} from './value';

const context = (): OpContext =>
  createOpContext(
    DEFAULT_LIMITS,
    [
      { name: 'RADISH', id: 10, group: 'crop' },
      { name: 'CORN', id: 11, group: 'crop' },
    ],
    ['tend', 'water_all'],
  );

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
const nested = (ctx: OpContext, depth: number): ListObj => {
  let v = list(ctx, []);
  for (let i = 1; i < depth; i += 1) v = list(ctx, [v]);
  return v;
};
const s = literalStr;

/** [value, surcharge] of a successful op. */
const outcome = (r: OpResult): [RtValue, number] => {
  if (!r.ok) throw new Error(`unexpected ${r.error.code}: ${r.error.message}`);
  return [r.value, r.cost];
};
const errorOf = (r: OpResult) => {
  if (r.ok) throw new Error('expected an error');
  return r.error;
};

describe('== and != on scalars (language-spec.md §Type interactions)', () => {
  it('equates bool with int and nothing else across types', () => {
    const ctx = context();
    expect(outcome(equals(ctx, 1, true))).toEqual([true, 0]);
    expect(outcome(equals(ctx, 0, false))).toEqual([true, 0]);
    expect(outcome(equals(ctx, 2, true))).toEqual([false, 0]);
    expect(outcome(equals(ctx, 1, s('1')))).toEqual([false, 0]);
    expect(outcome(equals(ctx, null, false))).toEqual([false, 0]);
    expect(outcome(equals(ctx, null, 0))).toEqual([false, 0]);
  });

  it('lets None equal only None, and constants and functions equal only themselves', () => {
    const ctx = context();
    expect(outcome(equals(ctx, null, null))).toEqual([true, 0]);
    expect(outcome(equals(ctx, constValue(10), constValue(10)))).toEqual([true, 0]);
    expect(outcome(equals(ctx, constValue(10), constValue(11)))).toEqual([false, 0]);
    expect(outcome(equals(ctx, constValue(10), 10))).toEqual([false, 0]);
    expect(outcome(equals(ctx, fnValue(0), fnValue(0)))).toEqual([true, 0]);
    expect(outcome(equals(ctx, fnValue(0), fnValue(1)))).toEqual([false, 0]);
  });

  it('compares str by content, costing 1 + min(len(a), len(b)) (interpreter-vm.md §Op cost table)', () => {
    const ctx = context();
    const heapAbc = ctx.heap.allocStr('abc');
    if (!heapAbc.ok) throw new Error('alloc failed');
    expect(outcome(equals(ctx, s('abc'), heapAbc.value))).toEqual([true, 3]);
    expect(outcome(equals(ctx, s('abc'), s('abd')))).toEqual([false, 3]);
    expect(outcome(equals(ctx, s('ab'), s('abc')))).toEqual([false, 2]);
    expect(outcome(equals(ctx, s(''), s('abc')))).toEqual([false, 0]);
    expect(outcome(equals(ctx, s('abc'), 5))).toEqual([false, 0]);
  });

  it('negates == for != at the same cost', () => {
    const ctx = context();
    expect(outcome(notEquals(ctx, s('abc'), s('abd')))).toEqual([true, 3]);
    expect(outcome(notEquals(ctx, 1, true))).toEqual([false, 0]);
    expect(outcome(notEquals(ctx, list(ctx, [1, 2]), list(ctx, [1, 3])))).toEqual([true, 2]);
  });
});

describe('structural == on lists (interpreter-vm.md §Structural == surcharge)', () => {
  it('charges 0 for different lengths', () => {
    const ctx = context();
    expect(outcome(equals(ctx, list(ctx, [1, 2]), list(ctx, [1, 2, 3])))).toEqual([false, 0]);
  });

  it('charges 0 for two empty lists', () => {
    const ctx = context();
    expect(outcome(equals(ctx, list(ctx, []), list(ctx, [])))).toEqual([true, 0]);
  });

  it('charges 1 per pair visited and stops at the first pair that differs', () => {
    const ctx = context();
    expect(outcome(equals(ctx, list(ctx, [1, 2, 3]), list(ctx, [1, 2, 3])))).toEqual([true, 3]);
    expect(outcome(equals(ctx, list(ctx, [9, 2, 3]), list(ctx, [1, 2, 3])))).toEqual([false, 1]);
    expect(outcome(equals(ctx, list(ctx, [1, 2, 9]), list(ctx, [1, 2, 3])))).toEqual([false, 3]);
    expect(outcome(equals(ctx, list(ctx, [1]), list(ctx, [true])))).toEqual([true, 1]);
  });

  it('adds min(len, len) for a str pair and recurses into nested containers', () => {
    const ctx = context();
    expect(outcome(equals(ctx, list(ctx, [s('ab')]), list(ctx, [s('abc')])))).toEqual([false, 3]);
    const a = list(ctx, [list(ctx, [1, 2]), s('xy')]);
    const b = list(ctx, [list(ctx, [1, 2]), s('xy')]);
    // pair 0: 1 + nested (1 + 1) = 3; pair 1: 1 + 2 = 3.
    expect(outcome(equals(ctx, a, b))).toEqual([true, 6]);
    const c = list(ctx, [list(ctx, [1, 2, 3]), s('xy')]);
    // pair 0 differs in length: 1 + 0, and the comparison stops there.
    expect(outcome(equals(ctx, a, c))).toEqual([false, 1]);
  });

  it('treats a list and a dict, or a container and a scalar, as a differing pair', () => {
    const ctx = context();
    expect(outcome(equals(ctx, list(ctx, []), dict(ctx, [])))).toEqual([false, 0]);
    expect(outcome(equals(ctx, list(ctx, [list(ctx, [])]), list(ctx, [dict(ctx, [])])))).toEqual([false, 1]);
    expect(outcome(equals(ctx, list(ctx, [list(ctx, [])]), list(ctx, [0])))).toEqual([false, 1]);
  });
});

describe('structural == on dicts (interpreter-vm.md §Structural == surcharge)', () => {
  it('ignores insertion order', () => {
    const ctx = context();
    const a = dict(ctx, [
      [1, 2],
      [3, 4],
    ]);
    const b = dict(ctx, [
      [3, 4],
      [1, 2],
    ]);
    expect(outcome(equals(ctx, a, b))).toEqual([true, 2]);
  });

  it("visits pairs in the left operand's insertion order and charges member surcharges", () => {
    const ctx = context();
    const a = dict(ctx, [
      [1, s('x')],
      [2, 9],
    ]);
    const b = dict(ctx, [
      [2, 8],
      [1, s('x')],
    ]);
    // key 1: 1 + min(1, 1) = 2; key 2: 1, and it differs.
    expect(outcome(equals(ctx, a, b))).toEqual([false, 3]);
    expect(outcome(equals(ctx, b, a))).toEqual([false, 1]);
  });

  it('counts a missing key as the differing pair', () => {
    const ctx = context();
    expect(outcome(equals(ctx, dict(ctx, [[1, 0]]), dict(ctx, [[2, 0]])))).toEqual([false, 1]);
  });

  it('charges 0 for different sizes and treats True and 1 as the same key', () => {
    const ctx = context();
    expect(outcome(equals(ctx, dict(ctx, [[1, 0]]), dict(ctx, [])))).toEqual([false, 0]);
    expect(outcome(equals(ctx, dict(ctx, [[true, 1]]), dict(ctx, [[1, 1]])))).toEqual([true, 1]);
  });
});

describe('== depth limit (language-spec.md §Type interactions, chief ruling Q3)', () => {
  const deepMessage =
    'A value is nested too deeply to compare or print (64 levels max), for example a list that contains itself.';

  it('compares 64 nested levels and raises R-STACK-OVERFLOW at 65', () => {
    const ctx = context();
    expect(outcome(equals(ctx, nested(ctx, 64), nested(ctx, 64)))[0]).toBe(true);
    expect(errorOf(equals(ctx, nested(ctx, 65), nested(ctx, 65)))).toEqual({
      code: 'R-STACK-OVERFLOW',
      message: deepMessage,
    });
  });

  it('raises R-STACK-OVERFLOW for a list that contains itself, with no identity shortcut', () => {
    const ctx = context();
    const a = list(ctx, []);
    expect(ctx.heap.listAppend(a, a)).toBeUndefined();
    expect(errorOf(equals(ctx, a, a)).code).toBe('R-STACK-OVERFLOW');
    expect(errorOf(notEquals(ctx, a, a)).code).toBe('R-STACK-OVERFLOW');
  });

  it('does not raise when the lengths already differ', () => {
    const ctx = context();
    const a = list(ctx, []);
    expect(ctx.heap.listAppend(a, a)).toBeUndefined();
    expect(outcome(equals(ctx, a, list(ctx, [])))).toEqual([false, 0]);
  });
});

describe('ordering < <= > >= (language-spec.md §Type interactions)', () => {
  it('orders int and bool against int and bool', () => {
    const ctx = context();
    expect(outcome(lessThan(ctx, 1, 2))).toEqual([true, 0]);
    expect(outcome(lessThan(ctx, true, 2))).toEqual([true, 0]);
    expect(outcome(lessThan(ctx, false, true))).toEqual([true, 0]);
    expect(outcome(lessEqual(ctx, 2, 2))).toEqual([true, 0]);
    expect(outcome(greaterThan(ctx, 2, 2))).toEqual([false, 0]);
    expect(outcome(greaterEqual(ctx, -1, true))).toEqual([false, 0]);
  });

  it('orders str against str by UTF-16 code unit, like JS', () => {
    const ctx = context();
    expect(outcome(lessThan(ctx, s('a'), s('b')))).toEqual([true, 0]);
    expect(outcome(lessThan(ctx, s('B'), s('a')))).toEqual([true, 0]);
    expect(outcome(lessThan(ctx, s('ab'), s('abc')))).toEqual([true, 0]);
    // U+1F600 is the surrogate pair D83D DE00, which sorts below U+FFFF by code unit.
    expect(outcome(lessThan(ctx, s('😀'), s('￿')))).toEqual([true, 0]);
    expect(outcome(greaterEqual(ctx, s(''), s('')))).toEqual([true, 0]);
  });

  it('raises R-TYPE for every other pair, quoting both values', () => {
    const ctx = context();
    expect(errorOf(lessThan(ctx, constValue(10), 5))).toEqual({
      code: 'R-TYPE',
      message: "Can't compare `RADISH` and `5`.",
    });
    expect(errorOf(lessThan(ctx, s('a'), 5)).message).toBe("Can't compare `'a'` and `5`.");
    expect(errorOf(greaterThan(ctx, null, null)).message).toBe("Can't compare `None` and `None`.");
    expect(errorOf(lessEqual(ctx, list(ctx, [1]), list(ctx, [2]))).message).toBe(
      "Can't compare `[1]` and `[2]`.",
    );
    expect(errorOf(greaterEqual(ctx, constValue(10), constValue(11))).code).toBe('R-TYPE');
    expect(errorOf(lessThan(ctx, fnValue(1), 0)).message).toBe(
      "Can't compare `<function water_all>` and `0`.",
    );
  });
});

describe('x in y (language-spec.md §Type interactions; interpreter-vm.md §Op cost table)', () => {
  it('tests substrings in text, costing 1 + len(haystack)', () => {
    const ctx = context();
    expect(outcome(contains(ctx, s('b'), s('abc')))).toEqual([true, 3]);
    expect(outcome(contains(ctx, s('x'), s('abc')))).toEqual([false, 3]);
    expect(outcome(contains(ctx, s(''), s('')))).toEqual([true, 0]);
  });

  it('needs text on the left when the right is text', () => {
    const ctx = context();
    expect(errorOf(contains(ctx, 1, s('abc')))).toMatchObject({
      code: 'R-TYPE',
      message: '`in` on text needs text on the left, but got a number.',
    });
  });

  it('scans a list in order, charging 1 + the comparison surcharge per element up to the first match', () => {
    const ctx = context();
    const xs = list(ctx, [1, 2, 3]);
    expect(outcome(contains(ctx, 1, xs))).toEqual([true, 1]);
    expect(outcome(contains(ctx, 3, xs))).toEqual([true, 3]);
    expect(outcome(contains(ctx, 9, xs))).toEqual([false, 3]);
    expect(outcome(contains(ctx, 9, list(ctx, [])))).toEqual([false, 0]);
    expect(outcome(contains(ctx, true, list(ctx, [1])))).toEqual([true, 1]);
    // 'x' vs 'ab': 1 + 1; 'ab' vs 'ab': 1 + 2.
    expect(outcome(contains(ctx, s('ab'), list(ctx, [s('x'), s('ab')])))).toEqual([true, 5]);
    // [1, 2] vs [1, 2]: 1 + (1 + 1).
    expect(outcome(contains(ctx, list(ctx, [1, 2]), list(ctx, [list(ctx, [1, 2])])))).toEqual([true, 3]);
  });

  it('passes on R-STACK-OVERFLOW from an element comparison', () => {
    const ctx = context();
    const a = list(ctx, []);
    expect(ctx.heap.listAppend(a, a)).toBeUndefined();
    expect(errorOf(contains(ctx, a, a)).code).toBe('R-STACK-OVERFLOW');
  });

  it('tests dict keys at no surcharge, with True and 1 as the same key', () => {
    const ctx = context();
    const d = dict(ctx, [
      [1, 0],
      [s('k'), 0],
    ]);
    expect(outcome(contains(ctx, true, d))).toEqual([true, 0]);
    expect(outcome(contains(ctx, s('k'), d))).toEqual([true, 0]);
    expect(outcome(contains(ctx, null, d))).toEqual([false, 0]);
  });

  it('raises R-TYPE for a list, dict or function used as a dict key', () => {
    const ctx = context();
    const d = dict(ctx, []);
    expect(errorOf(contains(ctx, list(ctx, []), d))).toMatchObject({
      code: 'R-TYPE',
      message: "A list can't be a dict key. Use a number, text, None or a constant.",
    });
    expect(errorOf(contains(ctx, fnValue(0), d)).message).toBe(
      "A function can't be a dict key. Use a number, text, None or a constant.",
    );
  });

  it('raises R-TYPE for any other right-hand side', () => {
    const ctx = context();
    for (const right of [5, true, null, constValue(10), fnValue(0)]) {
      expect(errorOf(contains(ctx, 1, right))).toMatchObject({
        code: 'R-TYPE',
        message: '`in` needs a list, dict or text on the right.',
      });
    }
  });
});
