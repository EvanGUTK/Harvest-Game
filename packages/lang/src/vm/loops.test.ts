import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../types';
import { createOpContext, type OpContext } from './op-context';
import {
  countRound,
  isLoopState,
  iterate,
  iterateRange,
  nextItem,
  releaseLoopState,
  repeatCounter,
  type Iterator,
  type LoopStart,
  type LoopState,
} from './loops';
import { constValue, dictKeyOf, literalStr, type ListObj, type RtValue } from './value';

const context = (): OpContext =>
  createOpContext(DEFAULT_LIMITS, [{ name: 'RADISH', id: 10, group: 'crop' }], []);
const list = (ctx: OpContext, xs: RtValue[]): ListObj => {
  const r = ctx.heap.allocList(xs);
  if (!r.ok) throw new Error('alloc failed');
  return r.value;
};
const started = <T extends LoopState>(r: LoopStart<T>): [T, number] => {
  if (!r.ok) throw new Error(`unexpected ${r.error.code}`);
  return [r.state, r.cost];
};
const errorOf = <T extends LoopState>(r: LoopStart<T>) => {
  if (r.ok) throw new Error('expected an error');
  return r.error;
};
/** Drains an iterator, mapping str items to their text. */
const drain = (ctx: OpContext, it: Iterator): unknown[] => {
  const out: unknown[] = [];
  for (let step = nextItem(ctx, it); step.kind === 'item'; step = nextItem(ctx, it)) {
    out.push(typeof step.value === 'object' && step.value?.tag === 'str' ? step.value.text : step.value);
  }
  return out;
};

describe('for over a list (language-spec.md §Iteration: by index)', () => {
  it('visits elements appended during the loop and stops sooner when elements are popped', () => {
    const ctx = context();
    const xs = list(ctx, [1, 2]);
    const [it, cost] = started(iterate(ctx, xs));
    expect(cost).toBe(0);
    expect(nextItem(ctx, it)).toEqual({ kind: 'item', value: 1 });
    expect(ctx.heap.listAppend(xs, 3)).toBeUndefined();
    expect(drain(ctx, it)).toEqual([2, 3]);
    const ys = list(ctx, [1, 2, 3]);
    const [it2] = started(iterate(ctx, ys));
    nextItem(ctx, it2);
    ctx.heap.release(ctx.heap.listRemoveAt(ys, 2));
    expect(drain(ctx, it2)).toEqual([2]);
  });

  it('owns the stack reference it was given and gives it up on release', () => {
    const ctx = context();
    const xs = list(ctx, [0, 0]);
    const [it] = started(iterate(ctx, xs));
    expect(xs.rc).toBe(1);
    releaseLoopState(ctx, it);
    expect(ctx.heap.liveCells).toBe(0);
  });
});

describe('for over text and dicts (language-spec.md §Iteration)', () => {
  it('yields 1-unit heap strings from text', () => {
    const ctx = context();
    const [it] = started(iterate(ctx, literalStr('a😀')));
    expect(drain(ctx, it)).toEqual(['a', '\ud83d', '\ude00']);
  });

  it('iterates a snapshot of the dict keys, charging 1 + len(dict), with values read live', () => {
    const ctx = context();
    const d = ctx.heap.allocDict();
    for (const k of [1, 2]) ctx.heap.dictSet(d, k, k, 0);
    const [it, cost] = started(iterate(ctx, d));
    expect(cost).toBe(2);
    expect(ctx.heap.dictSet(d, 3, 3, 0)).toBeUndefined();
    expect(drain(ctx, it)).toEqual([1, 2]);
  });

  it('takes no heap cells for the key snapshot (chief ruling Q2)', () => {
    const ctx = context();
    const d = ctx.heap.allocDict();
    const k = literalStr('key');
    ctx.heap.dictSet(d, dictKeyOf(k) ?? '', k, 0);
    const before = ctx.heap.liveCells;
    started(iterate(ctx, d));
    expect(ctx.heap.liveCells).toBe(before);
  });

  it('raises R-TYPE for anything else (chief ruling V4)', () => {
    const ctx = context();
    expect(errorOf(iterate(ctx, 5))).toEqual({ code: 'R-TYPE', message: "Can't loop over a number." });
    expect(errorOf(iterate(ctx, constValue(10))).message).toBe("Can't loop over a crop.");
  });
});

describe('range (standard-library.md §Pure helpers: lazy, Python semantics)', () => {
  const values = (args: RtValue[]) => {
    const ctx = context();
    const [it, cost] = started(iterateRange(ctx, args));
    expect(cost).toBe(0);
    return drain(ctx, it);
  };

  it('counts like Python for one, two and three arguments, including negative steps', () => {
    expect(values([4])).toEqual([0, 1, 2, 3]);
    expect(values([2, 5])).toEqual([2, 3, 4]);
    expect(values([0, 10, 3])).toEqual([0, 3, 6, 9]);
    expect(values([5, 0, -2])).toEqual([5, 3, 1]);
    expect(values([0])).toEqual([]);
    expect(values([3, 1])).toEqual([]);
    expect(values([1, 3, -1])).toEqual([]);
    expect(values([true, 3])).toEqual([1, 2]);
  });

  it('ends without overflowing next to the safe-range limit', () => {
    expect(values([Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER, 5])).toEqual([
      Number.MAX_SAFE_INTEGER - 1,
    ]);
    expect(values([Number.MIN_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER, -3])).toEqual([
      Number.MIN_SAFE_INTEGER + 1,
    ]);
  });

  it('raises R-BAD-ARG for step 0 and for non-int arguments (chief ruling V5)', () => {
    const ctx = context();
    expect(errorOf(iterateRange(ctx, [0, 5, 0]))).toEqual({
      code: 'R-BAD-ARG',
      message: "`range` step can't be 0.",
    });
    expect(errorOf(iterateRange(ctx, [literalStr('a')]))).toEqual({
      code: 'R-BAD-ARG',
      message: "`range` needs whole numbers, but got `'a'`.",
    });
  });
});

describe('repeat (language-spec.md §repeat; chief ruling V5)', () => {
  it('runs n rounds, and zero rounds for n <= 0; bool counts as int', () => {
    const ctx = context();
    const rounds = (n: RtValue) => {
      const [counter] = started(repeatCounter(ctx, n));
      let count = 0;
      while (countRound(counter)) count += 1;
      return count;
    };
    expect(rounds(3)).toBe(3);
    expect(rounds(0)).toBe(0);
    expect(rounds(-2)).toBe(0);
    expect(rounds(true)).toBe(1);
  });

  it('raises R-TYPE for a count that is not a whole number', () => {
    const ctx = context();
    expect(errorOf(repeatCounter(ctx, literalStr('a')))).toEqual({
      code: 'R-TYPE',
      message: "`repeat` needs a whole number, but got `'a'`.",
    });
  });
});

describe('isLoopState', () => {
  it('tells loop state apart from every value kind', () => {
    const ctx = context();
    const [it] = started(iterate(ctx, list(ctx, [])));
    const [counter] = started(repeatCounter(ctx, 1));
    expect(isLoopState(it)).toBe(true);
    expect(isLoopState(counter)).toBe(true);
    for (const v of [1, true, null, literalStr('s'), list(ctx, []), constValue(10)] as RtValue[]) {
      expect(isLoopState(v)).toBe(false);
    }
  });
});
