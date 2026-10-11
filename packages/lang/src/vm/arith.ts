/**
 * Arithmetic semantics: `+ - * // %` and unary `-` on Sprout values.
 * Spec: docs/02-language/language-spec.md §Types, §Operators by type; surcharges from
 * docs/03-architecture/interpreter-vm.md §Op cost table (`ADD`/`MUL` on str and list: len(result)).
 * Invariants: operands are borrowed and results owned; bool counts as int; every int result is a
 * safe integer and never -0 (R-OVERFLOW otherwise, never silent); errors are checked in the order
 * R-TYPE, R-DIV-ZERO, size limits, R-OUT-OF-MEMORY, so a failed op has allocated nothing.
 */

import { floorDiv, floorMod } from '../int-math';
import { kindNoun } from './describe';
import type { OpContext } from './op-context';
import { DIV_ZERO, OVERFLOW, fail, succeed, typeError, type OpResult } from './runtime-error';
import { isIntLike, isList, isStr, toInt, type ListObj, type RtValue, type StrObj } from './value';

export function add(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  if (isIntLike(a) && isIntLike(b)) return intResult(toInt(a) + toInt(b));
  if (isStr(a) && isStr(b)) return concatStr(ctx, a.text + b.text);
  if (isList(a) && isList(b)) return concatList(ctx, [...a.items, ...b.items]);
  return mismatch(ctx, a, b, (x, y) => `Can't add ${x} and ${y}.`);
}

export function subtract(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  if (isIntLike(a) && isIntLike(b)) return intResult(toInt(a) - toInt(b));
  return mismatch(ctx, a, b, (x, y) => `Can't subtract ${y} from ${x}.`);
}

export function multiply(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  if (isIntLike(a) && isIntLike(b)) return intResult(toInt(a) * toInt(b));
  if (isStr(a) && isIntLike(b)) return repeatStr(ctx, a, toInt(b));
  if (isIntLike(a) && isStr(b)) return repeatStr(ctx, b, toInt(a));
  if (isList(a) && isIntLike(b)) return repeatList(ctx, a, toInt(b));
  if (isIntLike(a) && isList(b)) return repeatList(ctx, b, toInt(a));
  return mismatch(ctx, a, b, (x, y) => `Can't multiply ${x} by ${y}.`);
}

/** `a // b` (FLOORDIV). */
export function floorDivide(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  if (!isIntLike(a) || !isIntLike(b)) return mismatch(ctx, a, b, (x, y) => `Can't divide ${x} by ${y}.`);
  const divisor = toInt(b);
  if (divisor === 0) return fail(DIV_ZERO);
  return intResult(floorDiv(toInt(a), divisor));
}

/** `a % b` (MOD). */
export function modulo(ctx: OpContext, a: RtValue, b: RtValue): OpResult {
  if (!isIntLike(a) || !isIntLike(b)) {
    return mismatch(ctx, a, b, (x, y) => `Can't divide ${x} by ${y} to get a remainder.`);
  }
  const divisor = toInt(b);
  if (divisor === 0) return fail(DIV_ZERO);
  return intResult(floorMod(toInt(a), divisor));
}

/** `-a` (NEG). */
export function negate(ctx: OpContext, a: RtValue): OpResult {
  if (!isIntLike(a)) return fail(typeError(`Can't make ${kindNoun(a, ctx.constants)} negative.`, [a]));
  return intResult(0 - toInt(a));
}

/** Every int op result passes through here: R-OVERFLOW outside the safe range, and -0 becomes 0. */
function intResult(n: number): OpResult {
  if (!Number.isSafeInteger(n)) return fail(OVERFLOW);
  return succeed(n === 0 ? 0 : n, 0);
}

function mismatch(
  ctx: OpContext,
  a: RtValue,
  b: RtValue,
  sentence: (x: string, y: string) => string,
): OpResult {
  return fail(typeError(sentence(kindNoun(a, ctx.constants), kindNoun(b, ctx.constants)), [a, b]));
}

function concatStr(ctx: OpContext, text: string): OpResult {
  const r = ctx.heap.allocStr(text);
  return r.ok ? succeed(r.value, text.length) : fail(r.error);
}

function concatList(ctx: OpContext, items: readonly RtValue[]): OpResult {
  const r = ctx.heap.allocList(items);
  return r.ok ? succeed(r.value, items.length) : fail(r.error);
}

/**
 * `s * count`: the result length is checked before any text is built, so a huge count costs nothing.
 * The product may be inexact above 2^53, but it is then far above the limit, so the check still holds.
 */
function repeatStr(ctx: OpContext, s: StrObj, count: number): OpResult {
  // An empty text repeats 0 times, so String.prototype.repeat never sees a huge count in any engine.
  const times = s.text.length === 0 ? 0 : Math.max(count, 0);
  const tooLong = ctx.heap.checkStrLength(s.text.length * times);
  if (tooLong) return fail(tooLong);
  return concatStr(ctx, s.text.repeat(times));
}

/** `list * count`: like Python, the result holds the same element objects `count` times; same size argument. */
function repeatList(ctx: OpContext, list: ListObj, count: number): OpResult {
  const times = list.items.length === 0 ? 0 : Math.max(count, 0);
  const full = ctx.heap.checkCollectionSize(list.items.length * times);
  if (full) return fail(full);
  const items: RtValue[] = [];
  for (let i = 0; i < times; i += 1) items.push(...list.items);
  return concatList(ctx, items);
}
