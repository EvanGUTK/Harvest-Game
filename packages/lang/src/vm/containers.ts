/**
 * Container semantics: indexing, index assignment, list and dict literals, and the list/dict methods.
 * Spec: docs/02-language/language-spec.md §Type interactions (Indexing, dict keys);
 * docs/02-language/standard-library.md §Pure helpers (append, pop, get); surcharges from
 * docs/03-architecture/interpreter-vm.md §Op cost table (BUILD_* n; pop(i) shifts; methods cost 1);
 * wordings from errors-and-diagnostics.md §Runtime and chief rulings 2026-10-11 (Q12, Q14).
 * Invariants: operands are borrowed and results owned (an element read from a container is retained;
 * a popped element is handed over); a failed op leaves the heap as it was; method arity is checked
 * at compile time, so a wrong count here is an invariant violation.
 */

import { InvariantError } from '../invariant';
import { capitalise, kindNoun, unusableKeyError } from './describe';
import type { OpContext } from './op-context';
import { reprForMessage } from './repr';
import { fail, formatCount, succeed, typeError, type OpResult, type RuntimeError } from './runtime-error';
import {
  dictKeyOf,
  isDict,
  isIntLike,
  isList,
  isStr,
  toInt,
  type DictKey,
  type DictObj,
  type RtValue,
} from './value';

/** The fixed surcharge of append, pop() and get (standard-library.md: cost 1 on top of the call). */
const METHOD_COST = 1;

/** `x[i]` (INDEX_GET). `receiverName` is the plain variable name when the VM's debug info has one. */
export function indexGet(ctx: OpContext, x: RtValue, i: RtValue, receiverName?: string): OpResult {
  if (isList(x)) {
    const at = resolveIndex(ctx, LIST_INDEX, x.items.length, i);
    if (!at.ok) return fail(at.error);
    const element = x.items[at.index] ?? null;
    ctx.heap.retain(element);
    return succeed(element, 0);
  }
  if (isStr(x)) {
    const at = resolveIndex(ctx, TEXT_INDEX, x.text.length, i);
    if (!at.ok) return fail(at.error);
    const unit = ctx.heap.allocStr(x.text.charAt(at.index));
    return unit.ok ? succeed(unit.value, 0) : fail(unit.error);
  }
  if (isDict(x)) return dictGet(ctx, x, i, receiverName);
  return fail(notIndexable(ctx, x));
}

/** `x[i] = v` (INDEX_SET). Pushes nothing, so the result value is None. */
export function indexSet(ctx: OpContext, x: RtValue, i: RtValue, v: RtValue): OpResult {
  if (isList(x)) {
    const at = resolveIndex(ctx, LIST_INDEX, x.items.length, i);
    if (!at.ok) return fail(at.error);
    ctx.heap.listSet(x, at.index, v);
    return succeed(null, 0);
  }
  if (isDict(x)) {
    const key = dictKeyOf(i);
    if (key === undefined) return fail(unusableKeyError(i, ctx.constants));
    const error = ctx.heap.dictSet(x, key, i, v);
    return error ? fail(error) : succeed(null, 0);
  }
  if (isStr(x)) return fail(typeError("Text can't be changed in place. Build a new text with `+` instead."));
  return fail(notIndexable(ctx, x));
}

/** `[a, b, …]` (BUILD_LIST n): surcharge n. */
export function buildList(ctx: OpContext, items: readonly RtValue[]): OpResult {
  const r = ctx.heap.allocList(items);
  return r.ok ? succeed(r.value, items.length) : fail(r.error);
}

/**
 * `{k1: v1, …}` (BUILD_DICT n) from alternating keys and values: surcharge n, the number of entries
 * written, duplicates included. A later duplicate key overwrites the value and keeps the first key.
 */
export function buildDict(ctx: OpContext, keysAndValues: readonly RtValue[]): OpResult {
  const entries: { key: DictKey; keyValue: RtValue; value: RtValue }[] = [];
  for (let i = 0; i + 1 < keysAndValues.length; i += 2) {
    const keyValue = keysAndValues[i] ?? null;
    const key = dictKeyOf(keyValue);
    if (key === undefined) return fail(unusableKeyError(keyValue, ctx.constants));
    entries.push({ key, keyValue, value: keysAndValues[i + 1] ?? null });
  }
  const dict = ctx.heap.allocDict();
  for (const entry of entries) {
    const error = ctx.heap.dictSet(dict, entry.key, entry.keyValue, entry.value);
    if (error) {
      ctx.heap.release(dict);
      return fail(error);
    }
  }
  return succeed(dict, entries.length);
}

/** `lst.append(x)`: surcharge 1, returns None. */
export function appendMethod(ctx: OpContext, receiver: RtValue, args: readonly RtValue[]): OpResult {
  if (!isList(receiver)) return fail(noSuchMethod(ctx, receiver, 'append'));
  assertArity('append', args, 1, 1);
  const error = ctx.heap.listAppend(receiver, args[0] ?? null);
  return error ? fail(error) : succeed(null, METHOD_COST);
}

/** `lst.pop()` / `lst.pop(i)`: surcharge 1 + the elements after i that shift left. */
export function popMethod(ctx: OpContext, receiver: RtValue, args: readonly RtValue[]): OpResult {
  if (!isList(receiver)) return fail(noSuchMethod(ctx, receiver, 'pop'));
  assertArity('pop', args, 0, 1);
  const length = receiver.items.length;
  const requested = args[0] ?? length - 1;
  if (!isIntLike(requested)) return fail(indexTypeError(ctx, LIST_INDEX, requested));
  if (length === 0)
    return fail({ code: 'R-INDEX', message: 'The list is empty, so there is nothing to pop.' });
  const at = resolveIndex(ctx, LIST_INDEX, length, requested);
  if (!at.ok) return fail(at.error);
  const shifted = length - 1 - at.index;
  return succeed(ctx.heap.listRemoveAt(receiver, at.index), METHOD_COST + shifted);
}

/** `d.get(k)` / `d.get(k, default)`: surcharge 1; the default is None when omitted (ruling Q14). */
export function getMethod(ctx: OpContext, receiver: RtValue, args: readonly RtValue[]): OpResult {
  if (!isDict(receiver)) return fail(noSuchMethod(ctx, receiver, 'get'));
  assertArity('get', args, 1, 2);
  const keyValue = args[0] ?? null;
  const key = dictKeyOf(keyValue);
  if (key === undefined) return fail(unusableKeyError(keyValue, ctx.constants));
  const found = receiver.entries.get(key)?.value ?? args[1] ?? null;
  ctx.heap.retain(found);
  return succeed(found, METHOD_COST);
}

type IndexWords = {
  readonly title: string;
  readonly noun: string;
  readonly unit: string;
  readonly units: string;
};
const LIST_INDEX: IndexWords = { title: 'List', noun: 'list', unit: 'item', units: 'items' };
const TEXT_INDEX: IndexWords = { title: 'Text', noun: 'text', unit: 'character', units: 'characters' };

type ResolvedIndex = { ok: true; index: number } | { ok: false; error: RuntimeError };

/** An int index into `length` slots, negative from the end; R-TYPE or R-INDEX otherwise. */
function resolveIndex(ctx: OpContext, words: IndexWords, length: number, i: RtValue): ResolvedIndex {
  if (!isIntLike(i)) return { ok: false, error: indexTypeError(ctx, words, i) };
  const requested = toInt(i);
  const index = requested < 0 ? length + requested : requested;
  if (index < 0 || index >= length) return { ok: false, error: outOfRange(words, requested, length) };
  return { ok: true, index };
}

function outOfRange(words: IndexWords, requested: number, length: number): RuntimeError {
  const where = `${words.title} index ${String(requested)} is outside the ${words.noun}`;
  if (length === 0) return { code: 'R-INDEX', message: `${where} (it is empty).` };
  const count = `${formatCount(length)} ${length === 1 ? words.unit : words.units}`;
  return { code: 'R-INDEX', message: `${where} (it has ${count}, so use 0–${String(length - 1)}).` };
}

function indexTypeError(ctx: OpContext, words: IndexWords, i: RtValue): RuntimeError {
  return typeError(`A ${words.noun} index must be a whole number, but got ${kindNoun(i, ctx.constants)}.`);
}

function dictGet(ctx: OpContext, d: DictObj, keyValue: RtValue, receiverName?: string): OpResult {
  const key = dictKeyOf(keyValue);
  if (key === undefined) return fail(unusableKeyError(keyValue, ctx.constants));
  const entry = d.entries.get(key);
  if (entry === undefined) return fail(missingKey(ctx, keyValue, receiverName));
  ctx.heap.retain(entry.value);
  return succeed(entry.value, 0);
}

function missingKey(ctx: OpContext, keyValue: RtValue, receiverName?: string): RuntimeError {
  const k = reprForMessage(ctx, keyValue);
  return {
    code: 'R-KEY',
    message: `The dict has no key \`${k}\`. Use \`${receiverName ?? ''}.get(${k}, 0)\` if it might be missing.`,
  };
}

function notIndexable(ctx: OpContext, x: RtValue): RuntimeError {
  return typeError(`Can't use [ ] on ${kindNoun(x, ctx.constants)}.`);
}

function noSuchMethod(ctx: OpContext, receiver: RtValue, method: string): RuntimeError {
  return typeError(`${capitalise(kindNoun(receiver, ctx.constants))} has no \`.${method}\`.`);
}

function assertArity(method: string, args: readonly RtValue[], min: number, max: number): void {
  if (args.length < min || args.length > max) {
    throw new InvariantError('LANG-METHOD-ARITY', `.${method} got ${String(args.length)} arguments`);
  }
}
