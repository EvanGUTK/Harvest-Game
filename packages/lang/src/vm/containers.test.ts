import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type Limits } from '../types';
import { appendMethod, buildDict, buildList, getMethod, indexGet, indexSet, popMethod } from './containers';
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

const context = (limits: Limits = DEFAULT_LIMITS): OpContext =>
  createOpContext(limits, [{ name: 'CORN', id: 11, group: 'crop' }], ['tend']);

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
const valueOf = (r: OpResult): RtValue => outcome(r)[0];
const errorOf = (r: OpResult) => {
  if (r.ok) throw new Error('expected an error');
  return r.error;
};
const pairsOf = (d: RtValue) => [...(d as DictObj).entries.values()].map((e) => [e.key, e.value]);

describe('indexing x[i] (language-spec.md §Type interactions: Indexing)', () => {
  it('reads list elements by int index, negative from the end, at no surcharge', () => {
    const ctx = context();
    const xs = list(ctx, [10, 20, 30]);
    expect(outcome(indexGet(ctx, xs, 0))).toEqual([10, 0]);
    expect(valueOf(indexGet(ctx, xs, 2))).toBe(30);
    expect(valueOf(indexGet(ctx, xs, -1))).toBe(30);
    expect(valueOf(indexGet(ctx, xs, -3))).toBe(10);
    expect(valueOf(indexGet(ctx, xs, true))).toBe(20);
  });

  it('hands out an owned reference to a list element', () => {
    const ctx = context();
    const inner = list(ctx, []);
    const xs = list(ctx, [inner]);
    expect(valueOf(indexGet(ctx, xs, 0))).toBe(inner);
    expect(inner.rc).toBe(3);
  });

  it('raises R-INDEX outside the list, with the catalogue wording', () => {
    const ctx = context();
    const xs = list(ctx, new Array<RtValue>(8).fill(0));
    expect(errorOf(indexGet(ctx, xs, 9))).toEqual({
      code: 'R-INDEX',
      message: 'List index 9 is outside the list (it has 8 items, so use 0–7).',
    });
    expect(errorOf(indexGet(ctx, xs, 8)).code).toBe('R-INDEX');
    expect(errorOf(indexGet(ctx, xs, -9)).message).toBe(
      'List index -9 is outside the list (it has 8 items, so use 0–7).',
    );
    expect(errorOf(indexGet(ctx, list(ctx, []), 0)).message).toBe(
      'List index 0 is outside the list (it is empty).',
    );
    expect(errorOf(indexGet(ctx, list(ctx, [1]), 1)).message).toBe(
      'List index 1 is outside the list (it has 1 item, so use 0–0).',
    );
  });

  it('reads text by UTF-16 code unit, returning a 1-unit string that costs a heap cell', () => {
    const ctx = context();
    const r = indexGet(ctx, s('a😀'), 1);
    expect((valueOf(r) as StrObj).text).toBe('\ud83d');
    expect(outcome(r)[1]).toBe(0);
    expect(ctx.heap.liveCells).toBe(1);
    expect((valueOf(indexGet(ctx, s('abc'), -1)) as StrObj).text).toBe('c');
  });

  it('raises R-INDEX outside the text', () => {
    const ctx = context();
    expect(errorOf(indexGet(ctx, s('abc'), 3))).toEqual({
      code: 'R-INDEX',
      message: 'Text index 3 is outside the text (it has 3 characters, so use 0–2).',
    });
    expect(errorOf(indexGet(ctx, s(''), 0)).message).toBe('Text index 0 is outside the text (it is empty).');
  });

  it('raises R-TYPE for a list or text index that is not a whole number', () => {
    const ctx = context();
    expect(errorOf(indexGet(ctx, list(ctx, [1]), s('0')))).toEqual({
      code: 'R-TYPE',
      message: 'A list index must be a whole number, but got text.',
    });
    expect(errorOf(indexGet(ctx, s('ab'), null)).message).toBe(
      'A text index must be a whole number, but got None.',
    );
  });

  it('reads dict values by key, with True and 1 as the same key', () => {
    const ctx = context();
    const d = dict(ctx, [
      [1, s('one')],
      [constValue(11), 5],
    ]);
    expect((valueOf(indexGet(ctx, d, true)) as StrObj).text).toBe('one');
    expect(valueOf(indexGet(ctx, d, constValue(11)))).toBe(5);
  });

  it('raises R-KEY for a missing key, naming the dict when the VM knows its name', () => {
    const ctx = context();
    const d = dict(ctx, []);
    expect(errorOf(indexGet(ctx, d, constValue(11), 'd'))).toEqual({
      code: 'R-KEY',
      message: 'The dict has no key `CORN`. Use `d.get(CORN, 0)` if it might be missing.',
    });
    expect(errorOf(indexGet(ctx, d, s('k'))).message).toBe(
      "The dict has no key `'k'`. Use `.get('k', 0)` if it might be missing.",
    );
  });

  it('raises R-TYPE for an unusable key and for indexing anything else', () => {
    const ctx = context();
    expect(errorOf(indexGet(ctx, dict(ctx, []), list(ctx, []))).message).toBe(
      "A list can't be a dict key. Use a number, text, None or a constant.",
    );
    for (const [x, noun] of [
      [5, 'a number'],
      [null, 'None'],
      [constValue(11), 'a crop'],
      [fnValue(0), 'a function'],
    ] as const) {
      expect(errorOf(indexGet(ctx, x, 0))).toEqual({ code: 'R-TYPE', message: `Can't use [ ] on ${noun}.` });
    }
  });
});

describe('index assignment x[i] = v (language-spec.md §Type interactions: Indexing)', () => {
  it('overwrites a list slot, negative from the end, releasing the old element', () => {
    const ctx = context();
    const old = list(ctx, [0, 0]);
    const xs = list(ctx, [1, old]);
    ctx.heap.release(old);
    expect(outcome(indexSet(ctx, xs, -1, 7))).toEqual([null, 0]);
    expect(xs.items).toEqual([1, 7]);
    expect(ctx.heap.liveCells).toBe(2);
  });

  it('raises R-INDEX outside the list and R-TYPE for a non-int index', () => {
    const ctx = context();
    const xs = list(ctx, [1]);
    expect(errorOf(indexSet(ctx, xs, 1, 0)).code).toBe('R-INDEX');
    expect(errorOf(indexSet(ctx, xs, s('0'), 0)).code).toBe('R-TYPE');
  });

  it('adds or overwrites a dict entry, keeping the first-inserted key', () => {
    const ctx = context();
    const d = dict(ctx, [[true, 1]]);
    expect(outcome(indexSet(ctx, d, 1, 2))).toEqual([null, 0]);
    expect(outcome(indexSet(ctx, d, s('k'), 3))).toEqual([null, 0]);
    expect(pairsOf(d)).toEqual([
      [true, 2],
      [s('k'), 3],
    ]);
  });

  it('raises R-COLLECTION-FULL on the 1,025th key and R-TYPE on an unusable key', () => {
    const ctx = context();
    const d = dict(ctx, []);
    for (let i = 0; i < 1_024; i += 1) valueOf(indexSet(ctx, d, i, 0));
    expect(errorOf(indexSet(ctx, d, 1_024, 0)).code).toBe('R-COLLECTION-FULL');
    expect(errorOf(indexSet(ctx, d, dict(ctx, []), 0)).message).toBe(
      "A dict can't be a dict key. Use a number, text, None or a constant.",
    );
  });

  it('refuses to change text in place, and anything that is not a list or dict', () => {
    const ctx = context();
    expect(errorOf(indexSet(ctx, s('abc'), 0, s('x')))).toEqual({
      code: 'R-TYPE',
      message: "Text can't be changed in place. Build a new text with `+` instead.",
    });
    expect(errorOf(indexSet(ctx, 5, 0, 1)).message).toBe("Can't use [ ] on a number.");
  });
});

describe('BUILD_LIST and BUILD_DICT (interpreter-vm.md §Op cost table: 1 + n)', () => {
  it('builds a list of n elements with surcharge n', () => {
    const ctx = context();
    const r = buildList(ctx, [1, s('a'), null]);
    expect((valueOf(r) as ListObj).items).toEqual([1, s('a'), null]);
    expect(outcome(r)[1]).toBe(3);
    expect(outcome(buildList(ctx, []))[1]).toBe(0);
  });

  it('raises R-COLLECTION-FULL above 1,024 elements and R-OUT-OF-MEMORY when the heap is full', () => {
    expect(errorOf(buildList(context(), new Array<RtValue>(1_025).fill(0))).code).toBe('R-COLLECTION-FULL');
    const small = context({ ...DEFAULT_LIMITS, maxHeapCells: 2 });
    expect(errorOf(buildList(small, [1, 2, 3])).code).toBe('R-OUT-OF-MEMORY');
    expect(small.heap.liveCells).toBe(0);
  });

  it('builds a dict from n key/value entries with surcharge n, a later duplicate key overwriting the value', () => {
    const ctx = context();
    const r = buildDict(ctx, [true, s('a'), 2, s('b'), 1, s('c')]);
    expect(pairsOf(valueOf(r))).toEqual([
      [true, s('c')],
      [2, s('b')],
    ]);
    expect(outcome(r)[1]).toBe(3);
    expect(ctx.heap.liveCells).toBe(2);
  });

  it('raises R-TYPE for an unusable key and leaves the heap unchanged on any failure', () => {
    const ctx = context();
    const inner = list(ctx, []);
    expect(errorOf(buildDict(ctx, [1, 2, inner, 3])).code).toBe('R-TYPE');
    expect(ctx.heap.liveCells).toBe(0);
    expect(inner.rc).toBe(1);
    const small = context({ ...DEFAULT_LIMITS, maxHeapCells: 1 });
    expect(errorOf(buildDict(small, [1, 1, 2, 2])).code).toBe('R-OUT-OF-MEMORY');
    expect(small.heap.liveCells).toBe(0);
  });
});

describe('list.append, list.pop, dict.get (standard-library.md §Pure helpers; interpreter-vm.md §Op cost table)', () => {
  it('appends in place with surcharge 1 and returns None', () => {
    const ctx = context();
    const xs = list(ctx, [1]);
    expect(outcome(appendMethod(ctx, xs, [2]))).toEqual([null, 1]);
    expect(xs.items).toEqual([1, 2]);
    expect(ctx.heap.liveCells).toBe(2);
  });

  it('raises R-COLLECTION-FULL when appending to a full list', () => {
    const ctx = context();
    const xs = list(ctx, new Array<RtValue>(1_024).fill(0));
    expect(errorOf(appendMethod(ctx, xs, [0])).code).toBe('R-COLLECTION-FULL');
  });

  it('pops the last element with surcharge 1, handing it to the caller', () => {
    const ctx = context();
    const xs = list(ctx, [1, 2, 3]);
    expect(outcome(popMethod(ctx, xs, []))).toEqual([3, 1]);
    expect(xs.items).toEqual([1, 2]);
    expect(ctx.heap.liveCells).toBe(2);
  });

  it('pops index i with surcharge 1 + the number of elements shifted left', () => {
    const ctx = context();
    const xs = list(ctx, [1, 2, 3, 4, 5]);
    expect(outcome(popMethod(ctx, xs, [0]))).toEqual([1, 5]);
    expect(outcome(popMethod(ctx, xs, [-1]))).toEqual([5, 1]);
    expect(outcome(popMethod(ctx, xs, [-3]))).toEqual([2, 3]);
    expect(xs.items).toEqual([3, 4]);
  });

  it('raises R-INDEX on an empty list and past the end', () => {
    const ctx = context();
    expect(errorOf(popMethod(ctx, list(ctx, []), []))).toEqual({
      code: 'R-INDEX',
      message: 'The list is empty, so there is nothing to pop.',
    });
    expect(errorOf(popMethod(ctx, list(ctx, []), [0])).message).toBe(
      'The list is empty, so there is nothing to pop.',
    );
    expect(errorOf(popMethod(ctx, list(ctx, [1, 2]), [2])).message).toBe(
      'List index 2 is outside the list (it has 2 items, so use 0–1).',
    );
    expect(errorOf(popMethod(ctx, list(ctx, [1]), [s('0')])).code).toBe('R-TYPE');
  });

  it('gets a value or the default with surcharge 1, the default being None when omitted', () => {
    const ctx = context();
    const d = dict(ctx, [[s('a'), 1]]);
    expect(outcome(getMethod(ctx, d, [s('a'), 0]))).toEqual([1, 1]);
    expect(outcome(getMethod(ctx, d, [s('b'), 0]))).toEqual([0, 1]);
    expect(outcome(getMethod(ctx, d, [s('b')]))).toEqual([null, 1]);
    expect(errorOf(getMethod(ctx, d, [list(ctx, []), 0])).code).toBe('R-TYPE');
  });

  it('raises R-TYPE when the receiver has no such method (proposed wording, Q12)', () => {
    const ctx = context();
    expect(errorOf(appendMethod(ctx, 5, [1]))).toEqual({
      code: 'R-TYPE',
      message: 'A number has no `.append`.',
    });
    expect(errorOf(popMethod(ctx, dict(ctx, []), [])).message).toBe('A dict has no `.pop`.');
    expect(errorOf(getMethod(ctx, list(ctx, []), [0])).message).toBe('A list has no `.get`.');
    expect(errorOf(appendMethod(ctx, s('a'), [1])).message).toBe('Text has no `.append`.');
  });
});
