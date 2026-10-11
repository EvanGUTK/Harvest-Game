/**
 * Comparison semantics: `==`, `!=`, `< <= > >=` and `in` on Sprout values.
 * Spec: docs/02-language/language-spec.md §Type interactions; surcharges from
 * docs/03-architecture/interpreter-vm.md §Op cost table and §Structural == surcharge.
 * Invariants: `==` never raises except R-STACK-OVERFLOW past the depth limit (entering a container
 * pair is one level, the outermost is level 1, independent of call depth: chief ruling Q3); there is
 * no identity shortcut, so a list that contains itself raises; the structural walk is iterative and
 * stops at the first differing pair; operands are borrowed and nothing here allocates on the heap.
 */

import { assertNever } from '../invariant';
import { kindNoun, unusableKeyError } from './describe';
import type { OpContext } from './op-context';
import { reprForMessage } from './repr';
import { deepNesting, fail, succeed, typeError, type OpResult, type RuntimeError } from './runtime-error';
import {
  dictKeyOf,
  isDict,
  isIntLike,
  isList,
  isStr,
  toInt,
  type Container,
  type DictEntry,
  type DictKey,
  type ListObj,
  type RtValue,
} from './value';

/** The outcome of `a == b`: whether they are equal and the structural surcharge it cost. */
export type Equality = { ok: true; equal: boolean; surcharge: number } | { ok: false; error: RuntimeError };

export function equals(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  const r = compareValues(ctx, a, b);
  return r.ok ? succeed(r.equal, r.surcharge) : fail(r.error);
}

export function notEquals(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  const r = compareValues(ctx, a, b);
  return r.ok ? succeed(!r.equal, r.surcharge) : fail(r.error);
}

export function lessThan(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  return order(ctx, a, b, (c) => c < 0);
}

export function lessEqual(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  return order(ctx, a, b, (c) => c <= 0);
}

export function greaterThan(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  return order(ctx, a, b, (c) => c > 0);
}

export function greaterEqual(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  return order(ctx, a, b, (c) => c >= 0);
}

/** `needle in haystack` (IN). */
export function contains(ctx: OpContext, needle: RtValue, haystack: RtValue): OpResult {
  if (isStr(haystack)) {
    if (!isStr(needle)) {
      return fail(
        typeError(`\`in\` on text needs text on the left, but got ${kindNoun(needle, ctx.constants)}.`),
      );
    }
    return succeed(haystack.text.includes(needle.text), haystack.text.length);
  }
  if (isList(haystack)) return listContains(ctx, needle, haystack);
  if (isDict(haystack)) {
    const key = dictKeyOf(needle);
    if (key === undefined) return fail(unusableKeyError(needle, ctx.constants));
    return succeed(haystack.entries.has(key), 0);
  }
  return fail(typeError('`in` needs a list, dict or text on the right.'));
}

/** `a == b` with its surcharge: the one comparer behind EQ, NE and IN on lists. */
export function compareValues(ctx: OpContext, a: RtValue, b: RtValue): Equality {
  const pair = comparePair(a, b);
  if (pair.kind === 'nested') return structural(ctx, pair.a, pair.b);
  return { ok: true, equal: pair.equal, surcharge: pair.surcharge };
}

/** Each element costs 1 plus its element-vs-needle comparison surcharge, up to the first match. */
function listContains(ctx: OpContext, needle: RtValue, haystack: ListObj): OpResult {
  let surcharge = 0;
  for (const element of haystack.items) {
    const r = compareValues(ctx, element, needle);
    if (!r.ok) return fail(r.error);
    surcharge += 1 + r.surcharge;
    if (r.equal) return succeed(true, surcharge);
  }
  return succeed(false, surcharge);
}

function order(ctx: OpContext, a: RtValue, b: RtValue, holds: (sign: number) => boolean): OpResult {
  if (isIntLike(a) && isIntLike(b)) return succeed(holds(sign(toInt(a), toInt(b))), 0);
  if (isStr(a) && isStr(b)) return succeed(holds(sign(a.text, b.text)), 0);
  return fail(typeError(`Can't compare \`${reprForMessage(ctx, a)}\` and \`${reprForMessage(ctx, b)}\`.`));
}

/** -1, 0 or 1; strings compare by UTF-16 code unit, as JS `<` does. */
function sign<T extends number | string>(x: T, y: T): number {
  if (x < y) return -1;
  return x > y ? 1 : 0;
}

type PairOutcome =
  | { readonly kind: 'leaf'; readonly equal: boolean; readonly surcharge: number }
  | { readonly kind: 'nested'; readonly a: Container; readonly b: Container };

/** Compares two members that need no descent, or hands back two lists or two dicts to descend into. */
function comparePair(x: RtValue, y: RtValue): PairOutcome {
  if (isStr(x) && isStr(y)) {
    return { kind: 'leaf', equal: x.text === y.text, surcharge: Math.min(x.text.length, y.text.length) };
  }
  if ((isList(x) && isList(y)) || (isDict(x) && isDict(y))) return { kind: 'nested', a: x, b: y };
  return { kind: 'leaf', equal: scalarEquals(x, y), surcharge: 0 };
}

/** Equality of anything but two containers of the same kind; mixed kinds are unequal. */
function scalarEquals(x: RtValue, y: RtValue): boolean {
  if (isIntLike(x) || isIntLike(y)) return isIntLike(x) && isIntLike(y) && toInt(x) === toInt(y);
  if (x === null || y === null) return x === y;
  switch (x.tag) {
    case 'const':
      return y.tag === 'const' && y.id === x.id;
    case 'fn':
      return y.tag === 'fn' && y.index === x.index;
    case 'str':
      return y.tag === 'str' && y.text === x.text;
    case 'list':
    case 'dict':
      return false;
    default:
      return assertNever(x);
  }
}

type EqFrame =
  | { readonly kind: 'list'; readonly a: readonly RtValue[]; readonly b: readonly RtValue[]; next: number }
  | {
      readonly kind: 'dict';
      readonly a: readonly (readonly [DictKey, DictEntry])[];
      readonly b: ReadonlyMap<DictKey, DictEntry>;
      next: number;
    };

const DONE = 'done';
const MISSING = 'missing';
type NextPair = readonly [RtValue, RtValue] | typeof DONE | typeof MISSING;

/** The structural walk (interpreter-vm.md §Structural == surcharge), on an explicit frame stack. */
function structural(ctx: OpContext, a: Container, b: Container): Equality {
  const frames: EqFrame[] = [];
  const unequal = (surcharge: number): Equality => ({ ok: true, equal: false, surcharge });
  let surcharge = 0;
  const first = openFrame(a, b);
  if (first === undefined) return unequal(0);
  if (frames.length + 1 > ctx.limits.maxCallDepth) return { ok: false, error: deepNesting(ctx.limits) };
  frames.push(first);
  for (let frame = frames.at(-1); frame !== undefined; frame = frames.at(-1)) {
    const pair = nextPair(frame);
    if (pair === DONE) {
      frames.pop();
      continue;
    }
    surcharge += 1;
    if (pair === MISSING) return unequal(surcharge);
    const outcome = comparePair(pair[0], pair[1]);
    if (outcome.kind === 'leaf') {
      surcharge += outcome.surcharge;
      if (!outcome.equal) return unequal(surcharge);
      continue;
    }
    const nested = openFrame(outcome.a, outcome.b);
    if (nested === undefined) return unequal(surcharge);
    if (frames.length + 1 > ctx.limits.maxCallDepth) return { ok: false, error: deepNesting(ctx.limits) };
    frames.push(nested);
  }
  return { ok: true, equal: true, surcharge };
}

/** A frame for two containers of the same kind, or undefined when their sizes differ (surcharge 0). */
function openFrame(a: Container, b: Container): EqFrame | undefined {
  if (a.tag === 'list' && b.tag === 'list') {
    return a.items.length === b.items.length ? { kind: 'list', a: a.items, b: b.items, next: 0 } : undefined;
  }
  if (a.tag === 'dict' && b.tag === 'dict') {
    return a.entries.size === b.entries.size
      ? { kind: 'dict', a: [...a.entries], b: b.entries, next: 0 }
      : undefined;
  }
  return undefined;
}

/** The next pair in visiting order: list index order, or the left dict's insertion order. */
function nextPair(frame: EqFrame): NextPair {
  if (frame.next === frame.a.length) return DONE;
  const i = frame.next;
  frame.next += 1;
  if (frame.kind === 'list') return [frame.a[i] ?? null, frame.b[i] ?? null];
  const [key, left] = frame.a[i] ?? [];
  const right = key === undefined ? undefined : frame.b.get(key);
  if (left === undefined || right === undefined) return MISSING;
  return [left.value, right.value];
}
