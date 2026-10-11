import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../types';
import { InvariantError } from '../invariant';
import { Heap } from './heap';
import {
  constValue,
  dictKeyOf,
  fnValue,
  fromPublic,
  isTruthy,
  kindOf,
  literalStr,
  strCells,
  valueOps,
  type RtValue,
} from './value';

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

describe('kindOf (language-spec.md §Types)', () => {
  it('maps every representation to its ValueKind', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const cases: [RtValue, string][] = [
      [5, 'int'],
      [-0, 'int'],
      [true, 'bool'],
      [null, 'none'],
      [literalStr('a'), 'str'],
      [owned(heap.allocStr('runtime')), 'str'],
      [owned(heap.allocList([])), 'list'],
      [heap.allocDict(), 'dict'],
      [fnValue(0), 'function'],
      [constValue(10), 'const'],
    ];
    for (const [v, kind] of cases) expect(kindOf(v)).toBe(kind);
  });
});

describe('isTruthy (language-spec.md §Truthiness and and / or)', () => {
  it('treats 0, None, "", [], {} and False as falsy', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const falsy: RtValue[] = [
      0,
      null,
      literalStr(''),
      owned(heap.allocStr('')),
      owned(heap.allocList([])),
      heap.allocDict(),
      false,
    ];
    for (const v of falsy) expect(isTruthy(v)).toBe(false);
  });

  it('treats every other value as truthy, including every constant and every function', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    const dict = heap.allocDict();
    expect(heap.dictSet(dict, 0, 0, 0)).toBeUndefined();
    const truthy: RtValue[] = [
      1,
      -1,
      Number.MAX_SAFE_INTEGER,
      true,
      literalStr(' '),
      owned(heap.allocList([0])),
      dict,
      constValue(0),
      fnValue(0),
    ];
    for (const v of truthy) expect(isTruthy(v)).toBe(true);
  });
});

describe('dictKeyOf (language-spec.md §Type interactions: dict keys)', () => {
  it('makes True and 1 the same key, and False and 0 the same key', () => {
    expect(dictKeyOf(true)).toBe(dictKeyOf(1));
    expect(dictKeyOf(false)).toBe(dictKeyOf(0));
    expect(dictKeyOf(true)).not.toBe(dictKeyOf(false));
  });

  it('keeps int, str, None and constant keys distinct from one another', () => {
    const keys = [
      dictKeyOf(1),
      dictKeyOf(literalStr('1')),
      dictKeyOf(literalStr('')),
      dictKeyOf(literalStr('n')),
      dictKeyOf(literalStr('c1')),
      dictKeyOf(null),
      dictKeyOf(constValue(1)),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('compares str keys by content and constant keys by id', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    expect(dictKeyOf(owned(heap.allocStr('ab')))).toBe(dictKeyOf(literalStr('ab')));
    expect(dictKeyOf(constValue(7))).toBe(dictKeyOf(constValue(7)));
  });

  it('rejects lists, dicts and functions as keys (R-TYPE is raised by the caller)', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    expect(dictKeyOf(owned(heap.allocList([])))).toBeUndefined();
    expect(dictKeyOf(heap.allocDict())).toBeUndefined();
    expect(dictKeyOf(fnValue(0))).toBeUndefined();
  });
});

describe('strCells (language-spec.md §Limits: heap cells)', () => {
  it('costs ceil(len / 16) cells: 0, 1 at 1 and 16, 2 at 17, 16 at 256', () => {
    expect(strCells(0)).toBe(0);
    expect(strCells(1)).toBe(1);
    expect(strCells(16)).toBe(1);
    expect(strCells(17)).toBe(2);
    expect(strCells(32)).toBe(2);
    expect(strCells(33)).toBe(3);
    expect(strCells(256)).toBe(16);
  });
});

describe('valueOps (interpreter-vm.md §Public API: the only way hosts build and inspect Values)', () => {
  it('round-trips ints, bools, None, strs and constants', () => {
    const ops = valueOps;
    expect(ops.asInt(ops.int(42))).toBe(42);
    expect(ops.asInt(ops.int(Number.MIN_SAFE_INTEGER))).toBe(Number.MIN_SAFE_INTEGER);
    expect(ops.asBool(ops.bool(true))).toBe(true);
    expect(ops.asBool(ops.bool(false))).toBe(false);
    expect(ops.kindOf(ops.none)).toBe('none');
    expect(ops.asStr(ops.str('héllo'))).toBe('héllo');
    expect(ops.asConstantId(ops.constant(10))).toBe(10);
  });

  it('reports the kind of every host-built value', () => {
    const ops = valueOps;
    expect(ops.kindOf(ops.int(0))).toBe('int');
    expect(ops.kindOf(ops.bool(false))).toBe('bool');
    expect(ops.kindOf(ops.str(''))).toBe('str');
    expect(ops.kindOf(ops.constant(3))).toBe('const');
  });

  it('reads a bool as an int, because bool is a subtype of int (language-spec.md §Type interactions)', () => {
    expect(valueOps.asInt(valueOps.bool(true))).toBe(1);
    expect(valueOps.asInt(valueOps.bool(false))).toBe(0);
  });

  it('builds host strings outside the heap: they cost no cells, like constant-pool literals', () => {
    const v = fromPublic(valueOps.str('abc'));
    expect(v).toMatchObject({ tag: 'str', text: 'abc', pinned: true, cells: 0 });
  });

  it('normalises -0 to 0 when a host builds an int', () => {
    expect(Object.is(valueOps.asInt(valueOps.int(-0)), 0)).toBe(true);
  });

  it('throws LANG-VALUE-RANGE for an int outside ±9,007,199,254,740,991 or a fraction', () => {
    expect(invariantCode(() => valueOps.int(2 ** 53))).toBe('LANG-VALUE-RANGE');
    expect(invariantCode(() => valueOps.int(0.5))).toBe('LANG-VALUE-RANGE');
    expect(invariantCode(() => valueOps.int(Number.NaN))).toBe('LANG-VALUE-RANGE');
  });

  it('throws LANG-VALUE-KIND when a host reads a value as the wrong kind', () => {
    const ops = valueOps;
    expect(invariantCode(() => ops.asInt(ops.none))).toBe('LANG-VALUE-KIND');
    expect(invariantCode(() => ops.asInt(ops.str('1')))).toBe('LANG-VALUE-KIND');
    expect(invariantCode(() => ops.asBool(ops.int(1)))).toBe('LANG-VALUE-KIND');
    expect(invariantCode(() => ops.asStr(ops.constant(1)))).toBe('LANG-VALUE-KIND');
    expect(invariantCode(() => ops.asConstantId(ops.int(1)))).toBe('LANG-VALUE-KIND');
  });
});
