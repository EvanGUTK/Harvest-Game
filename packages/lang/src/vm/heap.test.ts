import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type Limits } from '../types';
import { InvariantError } from '../invariant';
import { Heap } from './heap';
import { dictKeyOf, literalStr, type ListObj, type RtValue } from './value';

const invariantCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof InvariantError ? e.code : 'not an InvariantError';
  }
  return undefined;
};

const owned = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('allocation unexpectedly failed');
  return r.value;
};

const zeros = (n: number): RtValue[] => new Array<RtValue>(n).fill(0);
const text = (n: number): string => 'x'.repeat(n);
const key = (v: RtValue) => {
  const k = dictKeyOf(v);
  if (k === undefined) throw new Error('not a valid key');
  return k;
};

describe('Heap: cell accounting (language-spec.md §Limits: heap cells)', () => {
  it('counts one cell per list slot', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    owned(heap.allocList(zeros(5)));
    expect(heap.liveCells).toBe(5);
  });

  it('counts one cell per dict entry', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const d = heap.allocDict();
    expect(heap.liveCells).toBe(0);
    expect(heap.dictSet(d, key(1), 1, 0)).toBeUndefined();
    expect(heap.dictSet(d, key(2), 2, 0)).toBeUndefined();
    expect(heap.liveCells).toBe(2);
  });

  it('counts a runtime str as ceil(len / 16) cells, and an empty one as 0', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    owned(heap.allocStr(''));
    expect(heap.liveCells).toBe(0);
    owned(heap.allocStr(text(17)));
    expect(heap.liveCells).toBe(2);
    owned(heap.allocStr(text(256)));
    expect(heap.liveCells).toBe(18);
  });

  it('counts str length in UTF-16 code units', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    // 9 astral characters are 18 UTF-16 code units: 2 cells.
    owned(heap.allocStr('😀'.repeat(9)));
    expect(heap.liveCells).toBe(2);
  });

  it('never counts constant-pool literals, however they are stored', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const lit = literalStr(text(256));
    const list = owned(heap.allocList([lit, lit]));
    expect(heap.liveCells).toBe(2);
    heap.release(list);
    expect(heap.liveCells).toBe(0);
  });

  it('counts a shared object once, however many references hold it', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const s = owned(heap.allocStr(text(17)));
    const list = owned(heap.allocList([s, s, s]));
    expect(heap.liveCells).toBe(5);
    heap.release(s);
    expect(heap.liveCells).toBe(5);
    heap.release(list);
    expect(heap.liveCells).toBe(0);
  });

  it('counts str keys of dict entries on top of the entry cell', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const d = heap.allocDict();
    const k = owned(heap.allocStr(text(20)));
    expect(heap.dictSet(d, key(k), k, 0)).toBeUndefined();
    heap.release(k);
    expect(heap.liveCells).toBe(3);
    heap.release(d);
    expect(heap.liveCells).toBe(0);
  });
});

describe('Heap: reference counts (interpreter-vm.md §VM heap accounting)', () => {
  it('releases cells the moment the last reference goes away', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const list = owned(heap.allocList(zeros(3)));
    heap.retain(list);
    heap.release(list);
    expect(heap.liveCells).toBe(3);
    heap.release(list);
    expect(heap.liveCells).toBe(0);
  });

  it('releases the elements of a released container', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const inner = owned(heap.allocList(zeros(4)));
    const outer = owned(heap.allocList([inner]));
    heap.release(inner);
    expect(heap.liveCells).toBe(5);
    heap.release(outer);
    expect(heap.liveCells).toBe(0);
  });

  it('releases a 10,000-deep chain of nested lists without JS recursion', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    let chain = owned(heap.allocList([]));
    for (let i = 0; i < 10_000; i += 1) {
      const next = owned(heap.allocList([chain]));
      heap.release(chain);
      chain = next;
    }
    expect(heap.liveCells).toBe(10_000);
    heap.release(chain);
    expect(heap.liveCells).toBe(0);
  });

  it('never reclaims a reference cycle: a.append(a) stays counted (documented behaviour)', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const a = owned(heap.allocList([]));
    expect(heap.listAppend(a, a)).toBeUndefined();
    expect(heap.liveCells).toBe(1);
    heap.release(a);
    expect(heap.liveCells).toBe(1);
  });

  it('releases the old element when a list slot is overwritten', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const s = owned(heap.allocStr(text(16)));
    const list = owned(heap.allocList([s]));
    heap.release(s);
    expect(heap.liveCells).toBe(2);
    heap.listSet(list, 0, 7);
    expect(heap.liveCells).toBe(1);
    expect(list.items).toEqual([7]);
  });

  it('hands the removed element to the caller when a slot is removed', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const s = owned(heap.allocStr(text(16)));
    const list = owned(heap.allocList([1, s, 3]));
    heap.release(s);
    const removed = heap.listRemoveAt(list, 1);
    expect(removed).toBe(s);
    expect(list.items).toEqual([1, 3]);
    expect(heap.liveCells).toBe(3);
    heap.release(removed);
    expect(heap.liveCells).toBe(2);
  });

  it('keeps the first-inserted key and releases the old value when a dict key is overwritten', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const d = heap.allocDict();
    const old = owned(heap.allocStr(text(16)));
    expect(heap.dictSet(d, key(true), true, old)).toBeUndefined();
    heap.release(old);
    expect(heap.liveCells).toBe(2);
    expect(heap.dictSet(d, key(1), 1, 2)).toBeUndefined();
    expect(heap.liveCells).toBe(1);
    expect([...d.entries.values()]).toEqual([{ key: true, value: 2 }]);
  });

  it('ignores retain and release on immediates, functions, constants and pinned literals', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const lit = literalStr('abc');
    for (const v of [1, true, null, lit]) {
      heap.retain(v);
      heap.release(v);
      heap.release(v);
    }
    expect(heap.liveCells).toBe(0);
    expect(lit.rc).toBe(0);
  });

  it('throws LANG-HEAP-REFCOUNT when an object is released more often than it was referenced', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const list = owned(heap.allocList([]));
    heap.release(list);
    expect(
      invariantCode(() => {
        heap.release(list);
      }),
    ).toBe('LANG-HEAP-REFCOUNT');
  });

  it('throws LANG-HEAP-INDEX on a slot outside the list, because callers check R-INDEX first', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const list = owned(heap.allocList([0]));
    expect(
      invariantCode(() => {
        heap.listSet(list, 1, 0);
      }),
    ).toBe('LANG-HEAP-INDEX');
    expect(invariantCode(() => heap.listRemoveAt(list, -1))).toBe('LANG-HEAP-INDEX');
  });

  it('numbers objects per heap, deterministically, for snapshots', () => {
    const ids = (heap: Heap) => [
      owned(heap.allocList([])).id,
      owned(heap.allocStr('a')).id,
      heap.allocDict().id,
    ];
    const first = ids(new Heap(DEFAULT_LIMITS));
    expect(first).toEqual(ids(new Heap(DEFAULT_LIMITS)));
    expect(new Set(first).size).toBe(3);
  });
});

describe('Heap: limits (language-spec.md §Limits)', () => {
  it('raises R-OUT-OF-MEMORY before allocating, leaving the live count unchanged', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    for (let i = 0; i < 16; i += 1) owned(heap.allocList(zeros(1_024)));
    expect(heap.liveCells).toBe(16_384);
    const r = heap.allocList(zeros(1));
    expect(r.ok ? undefined : r.error.code).toBe('R-OUT-OF-MEMORY');
    expect(heap.liveCells).toBe(16_384);
    const s = heap.allocStr('a');
    expect(s.ok ? undefined : s.error.code).toBe('R-OUT-OF-MEMORY');
    expect(heap.liveCells).toBe(16_384);
  });

  it('allows an allocation that lands exactly on 16,384 cells and zero-cell allocations at the limit', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    for (let i = 0; i < 15; i += 1) owned(heap.allocList(zeros(1_024)));
    owned(heap.allocList(zeros(1_023)));
    expect(heap.allocStr(text(16)).ok).toBe(true);
    expect(heap.liveCells).toBe(16_384);
    expect(heap.allocList([]).ok).toBe(true);
    expect(heap.allocStr('').ok).toBe(true);
  });

  it('raises R-OUT-OF-MEMORY on append and on a new dict key at the limit', () => {
    const heap = new Heap({ ...DEFAULT_LIMITS, maxHeapCells: 2 });
    const list = owned(heap.allocList(zeros(2)));
    expect(heap.listAppend(list, 0)?.code).toBe('R-OUT-OF-MEMORY');
    expect(list.items.length).toBe(2);
    heap.release(list);
    const d = heap.allocDict();
    expect(heap.dictSet(d, key(1), 1, 0)).toBeUndefined();
    expect(heap.dictSet(d, key(2), 2, 0)).toBeUndefined();
    expect(heap.dictSet(d, key(3), 3, 0)?.code).toBe('R-OUT-OF-MEMORY');
    expect(heap.dictSet(d, key(2), 2, 9)).toBeUndefined();
    expect(heap.liveCells).toBe(2);
  });

  it('never trips on a loop that builds a list per iteration and drops it', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    for (let i = 0; i < 20_000; i += 1) {
      const list = owned(heap.allocList(zeros(1_000)));
      heap.release(list);
    }
    expect(heap.liveCells).toBe(0);
  });

  it('trips at the same iteration every run on a loop that keeps every list', () => {
    const tripIteration = (): number => {
      const heap = new Heap(DEFAULT_LIMITS);
      const kept = owned(heap.allocList([]));
      for (let i = 1; ; i += 1) {
        const r = heap.allocList(zeros(20));
        if (!r.ok) {
          expect(r.error.code).toBe('R-OUT-OF-MEMORY');
          expect(heap.liveCells).toBe(16_380);
          return i;
        }
        expect(heap.listAppend(kept, r.value)).toBeUndefined();
        heap.release(r.value);
      }
    };
    // Each kept iteration holds 20 slots + 1 slot in `kept`: 21 × 780 = 16,380, so iteration 781 trips.
    expect(tripIteration()).toBe(781);
    expect(tripIteration()).toBe(781);
  });

  it('raises R-COLLECTION-FULL above 1,024 items, before R-OUT-OF-MEMORY', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const r = heap.allocList(zeros(1_025));
    expect(r.ok ? undefined : r.error.code).toBe('R-COLLECTION-FULL');
    expect(heap.liveCells).toBe(0);
    const full: ListObj = owned(heap.allocList(zeros(1_024)));
    expect(heap.listAppend(full, 0)?.code).toBe('R-COLLECTION-FULL');
    const tight = new Heap({ ...DEFAULT_LIMITS, maxHeapCells: 1_024 });
    const both = owned(tight.allocList(zeros(1_024)));
    expect(tight.listAppend(both, 0)?.code).toBe('R-COLLECTION-FULL');
  });

  it('raises R-COLLECTION-FULL on the 1,025th dict key but allows overwriting an existing one', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const d = heap.allocDict();
    for (let i = 0; i < 1_024; i += 1) expect(heap.dictSet(d, key(i), i, 0)).toBeUndefined();
    expect(heap.dictSet(d, key(1_024), 1_024, 0)?.code).toBe('R-COLLECTION-FULL');
    expect(heap.dictSet(d, key(5), 5, 1)).toBeUndefined();
    expect(d.entries.size).toBe(1_024);
  });

  it('raises R-STR-TOO-LONG above 256 UTF-16 code units, before allocating', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    expect(heap.allocStr(text(256)).ok).toBe(true);
    const r = heap.allocStr(text(257));
    expect(r.ok ? undefined : r.error.code).toBe('R-STR-TOO-LONG');
    expect(heap.liveCells).toBe(16);
    const astral = heap.allocStr('😀'.repeat(129));
    expect(astral.ok ? undefined : astral.error.code).toBe('R-STR-TOO-LONG');
  });

  it('exposes the size checks so callers can test a result length before building it', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    expect(heap.checkStrLength(256)).toBeUndefined();
    expect(heap.checkStrLength(257)?.code).toBe('R-STR-TOO-LONG');
    expect(heap.checkCollectionSize(1_024)).toBeUndefined();
    expect(heap.checkCollectionSize(1_025)?.code).toBe('R-COLLECTION-FULL');
  });

  it('words limit errors as the catalogue does, with the configured numbers', () => {
    const limits: Limits = DEFAULT_LIMITS;
    const heap = new Heap(limits);
    expect(heap.checkStrLength(257)?.message).toBe('Text can be at most 256 characters long.');
    expect(heap.checkCollectionSize(1_025)?.message).toBe('Lists and dicts can hold at most 1,024 items.');
    const real = new Heap(limits);
    for (let i = 0; i < 16; i += 1) owned(real.allocList(zeros(1_024)));
    const oom = real.allocList([0]);
    expect(oom.ok ? undefined : oom.error.message).toBe(
      'Your program is holding too much data at once (16,384 cells). Let go of lists you no longer need.',
    );
  });
});
