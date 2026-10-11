/**
 * Sprout runtime values: the internal tagged union behind the opaque public `Value`, and `ValueOps`.
 * Spec: docs/02-language/language-spec.md §Types, §Truthiness, §Type interactions (dict keys);
 * docs/03-architecture/interpreter-vm.md §VM (value representation).
 * Invariants: ints, bools and None are immediate JS values (no allocation on the hot path) and ints
 * are always safe integers, never -0. Strings, lists and dicts are heap objects with a reference
 * count owned by `Heap`; pinned strings (constant-pool literals, host-built strings) cost no cells
 * and ignore reference counting. Constants and functions compare by id, never by object identity.
 *
 * Host-built strings (`valueOps.str`) are pinned because ValueOps has no VM or heap to count them
 * against. That is safe today: no v1 builtin returns a str, and any host string is bounded by the
 * 256-unit limit. Revisit this if a builtin ever returns text. Strings a program derives from one
 * (`+`, `*`, `str()`) are ordinary heap strings.
 */

import type { Value, ValueKind, ValueOps } from '../index';
import { floorDiv } from '../int-math';
import { InvariantError, assertNever } from '../invariant';

export type StrObj = {
  readonly tag: 'str';
  readonly text: string;
  /** Heap cells this string costs: ceil(len / 16) for runtime strings, 0 when pinned. */
  readonly cells: number;
  /** Pinned strings are never counted or freed: constant-pool literals and host-built strings. */
  readonly pinned: boolean;
  rc: number;
  /** Per-heap allocation number (0 for pinned strings), stable across snapshot and restore. */
  readonly id: number;
};

export type ListObj = { readonly tag: 'list'; readonly items: RtValue[]; rc: number; readonly id: number };

/** A dict entry keeps the first-inserted key value, as Python does (`{True: 1}` then `d[1] = 2`). */
export type DictEntry = { readonly key: RtValue; value: RtValue };

/** Canonical key: number for int/bool (True ≡ 1), 's' + text for str, 'c' + id for a constant, 'n' for None. */
export type DictKey = number | string;

export type DictObj = {
  readonly tag: 'dict';
  /** Map preserves insertion order, which is the iteration order of `for k in d`. */
  readonly entries: Map<DictKey, DictEntry>;
  rc: number;
  readonly id: number;
};

/** A user-defined function: an index into the module's function table. Builtins are not values. */
export type FnObj = { readonly tag: 'fn'; readonly index: number };

/** A game constant such as RADISH; its name for `str()` comes from the module's ConstantDef table. */
export type ConstObj = { readonly tag: 'const'; readonly id: number };

export type HeapObj = StrObj | ListObj | DictObj;

export type RtValue = number | boolean | null | HeapObj | FnObj | ConstObj;

/** language-spec.md §Limits: a str costs ceil(len / 16) heap cells. */
export const STR_UNITS_PER_CELL = 16;

export function strCells(length: number): number {
  return floorDiv(length + STR_UNITS_PER_CELL - 1, STR_UNITS_PER_CELL);
}

/** A constant-pool string literal: free (language-spec.md §Limits) and never freed. */
export function literalStr(text: string): StrObj {
  return { tag: 'str', text, cells: 0, pinned: true, rc: 0, id: 0 };
}

export function fnValue(index: number): FnObj {
  return { tag: 'fn', index };
}

export function constValue(id: number): ConstObj {
  return { tag: 'const', id };
}

export function isHeapObj(v: RtValue): v is HeapObj {
  return typeof v === 'object' && v !== null && (v.tag === 'str' || v.tag === 'list' || v.tag === 'dict');
}

export function kindOf(v: RtValue): ValueKind {
  if (typeof v === 'number') return 'int';
  if (typeof v === 'boolean') return 'bool';
  if (v === null) return 'none';
  switch (v.tag) {
    case 'str':
      return 'str';
    case 'list':
      return 'list';
    case 'dict':
      return 'dict';
    case 'fn':
      return 'function';
    case 'const':
      return 'const';
    default:
      return assertNever(v);
  }
}

/** 0, None, "", [], {} and False are falsy; every other value is truthy. */
export function isTruthy(v: RtValue): boolean {
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  switch (v.tag) {
    case 'str':
      return v.text.length > 0;
    case 'list':
      return v.items.length > 0;
    case 'dict':
      return v.entries.size > 0;
    case 'fn':
    case 'const':
      return true;
    default:
      return assertNever(v);
  }
}

const STR_KEY_PREFIX = 's';
const CONST_KEY_PREFIX = 'c';
const NONE_KEY = 'n';

/** The canonical dict key of `v`, or undefined if `v` cannot be a key (list, dict, function: R-TYPE). */
export function dictKeyOf(v: RtValue): DictKey | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return NONE_KEY;
  switch (v.tag) {
    case 'str':
      return STR_KEY_PREFIX + v.text;
    case 'const':
      return CONST_KEY_PREFIX + String(v.id);
    case 'list':
    case 'dict':
    case 'fn':
      return undefined;
    default:
      return assertNever(v);
  }
}

/** The single place an internal value becomes the opaque public brand. */
export function toPublic(v: RtValue): Value {
  return v as unknown as Value;
}

/** The single place a public Value is read back; every Value was made by `toPublic`. */
export function fromPublic(v: Value): RtValue {
  return v as unknown as RtValue;
}

function kindError(expected: string, v: RtValue): InvariantError {
  return new InvariantError('LANG-VALUE-KIND', `expected ${expected}, got ${kindOf(v)}`);
}

/** Host-facing constructors and readers (interpreter-vm.md §Public API). */
export const valueOps: ValueOps = {
  int(n) {
    if (!Number.isSafeInteger(n))
      throw new InvariantError('LANG-VALUE-RANGE', `not a safe integer: ${String(n)}`);
    return toPublic(n === 0 ? 0 : n);
  },
  bool(b) {
    return toPublic(b);
  },
  str(s) {
    return toPublic(literalStr(s));
  },
  constant(id) {
    return toPublic(constValue(id));
  },
  none: toPublic(null),
  kindOf(v) {
    return kindOf(fromPublic(v));
  },
  asInt(v) {
    const r = fromPublic(v);
    if (typeof r === 'number') return r;
    if (typeof r === 'boolean') return r ? 1 : 0;
    throw kindError('int', r);
  },
  asBool(v) {
    const r = fromPublic(v);
    if (typeof r === 'boolean') return r;
    throw kindError('bool', r);
  },
  asStr(v) {
    const r = fromPublic(v);
    if (typeof r === 'object' && r !== null && r.tag === 'str') return r.text;
    throw kindError('str', r);
  },
  asConstantId(v) {
    const r = fromPublic(v);
    if (typeof r === 'object' && r !== null && r.tag === 'const') return r.id;
    throw kindError('const', r);
  },
};
