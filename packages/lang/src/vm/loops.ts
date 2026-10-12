/**
 * Loop state on the VM stack: iterators for `for … in` and the counter for `repeat`.
 * Spec: docs/02-language/language-spec.md §Iteration; docs/03-architecture/interpreter-vm.md §Bytecode
 * (ITER_INIT k, ITER_NEXT, REPEAT_*, the op cost table and the Loop exits note).
 * Invariants: a list is iterated by index and its length re-read on every step; text yields 1-unit
 * heap strings; a dict iterates a snapshot of its keys taken at ITER_INIT (the snapshot costs
 * 1 + len(dict) cycles but no heap cells, chief ruling Q2); range is lazy and follows Python; an
 * iterator owns one reference to the container it walks and gives it up when released.
 */

import { assertNever } from '../invariant';
import { kindNoun } from './describe';
import type { OpContext } from './op-context';
import { reprForMessage } from './repr';
import { typeError, type RuntimeError } from './runtime-error';
import {
  isDict,
  isIntLike,
  isList,
  isStr,
  toInt,
  type DictObj,
  type ListObj,
  type RtValue,
  type StrObj,
} from './value';

export type ListIter = { readonly tag: 'iter-list'; readonly list: ListObj; index: number };
export type StrIter = { readonly tag: 'iter-str'; readonly str: StrObj; index: number };
export type DictIter = {
  readonly tag: 'iter-dict';
  readonly dict: DictObj;
  readonly keys: readonly RtValue[];
  index: number;
};
export type RangeIter = {
  readonly tag: 'iter-range';
  next: number;
  readonly stop: number;
  readonly step: number;
};
export type RepeatCounter = { readonly tag: 'repeat'; remaining: number };

export type LoopState = ListIter | StrIter | DictIter | RangeIter | RepeatCounter;
export type Iterator = Exclude<LoopState, RepeatCounter>;

/** A VM stack slot: a value, or the state of an enclosing loop. */
export type StackItem = RtValue | LoopState;

export type LoopStart<T extends LoopState> =
  { ok: true; state: T; cost: number } | { ok: false; error: RuntimeError };
export type LoopStep =
  | { readonly kind: 'item'; readonly value: RtValue }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly error: RuntimeError };

export function isLoopState(item: StackItem): item is LoopState {
  return (
    typeof item === 'object' &&
    item !== null &&
    (item.tag === 'iter-list' ||
      item.tag === 'iter-str' ||
      item.tag === 'iter-dict' ||
      item.tag === 'iter-range' ||
      item.tag === 'repeat')
  );
}

/**
 * ITER_INIT 0: an iterator over `iterable`, which it takes over (the stack's reference moves into
 * it). A dict costs a surcharge of len(dict) for its key snapshot; the others cost none.
 */
export function iterate(ctx: OpContext, iterable: RtValue): LoopStart<Iterator> {
  if (isList(iterable)) return { ok: true, state: { tag: 'iter-list', list: iterable, index: 0 }, cost: 0 };
  if (isStr(iterable)) return { ok: true, state: { tag: 'iter-str', str: iterable, index: 0 }, cost: 0 };
  if (isDict(iterable)) {
    const keys = [...iterable.entries.values()].map((entry) => entry.key);
    return { ok: true, state: { tag: 'iter-dict', dict: iterable, keys, index: 0 }, cost: keys.length };
  }
  return { ok: false, error: typeError(`Can't loop over ${kindNoun(iterable, ctx.constants)}.`) };
}

/** ITER_INIT 1..3: `range(stop)`, `range(start, stop)` or `range(start, stop, step)`, as in Python. */
export function iterateRange(ctx: OpContext, args: readonly RtValue[]): LoopStart<RangeIter> {
  const bad = args.find((arg) => !isIntLike(arg));
  if (bad !== undefined) {
    return {
      ok: false,
      error: {
        code: 'R-BAD-ARG',
        message: `\`range\` needs whole numbers, but got \`${reprForMessage(ctx, bad)}\`.`,
      },
    };
  }
  const ints = args.map((arg) => toInt(arg as number | boolean));
  const [start, stop, step] =
    ints.length === 1 ? [0, ints[0] ?? 0, 1] : [ints[0] ?? 0, ints[1] ?? 0, ints[2] ?? 1];
  if (step === 0) return { ok: false, error: { code: 'R-BAD-ARG', message: "`range` step can't be 0." } };
  return { ok: true, state: { tag: 'iter-range', next: start, stop, step }, cost: 0 };
}

/** REPEAT_INIT: a counter of max(n, 0) rounds; bool counts as int. */
export function repeatCounter(ctx: OpContext, n: RtValue): LoopStart<RepeatCounter> {
  if (!isIntLike(n)) {
    return {
      ok: false,
      error: typeError(`\`repeat\` needs a whole number, but got \`${reprForMessage(ctx, n)}\`.`),
    };
  }
  return { ok: true, state: { tag: 'repeat', remaining: Math.max(toInt(n), 0) }, cost: 0 };
}

/** REPEAT_NEXT: true while rounds remain (and counts one off), false when the loop is over. */
export function countRound(counter: RepeatCounter): boolean {
  if (counter.remaining === 0) return false;
  counter.remaining -= 1;
  return true;
}

/** ITER_NEXT: the next item as an owned value, or done. */
export function nextItem(ctx: OpContext, it: Iterator): LoopStep {
  switch (it.tag) {
    case 'iter-list':
      return nextListItem(ctx, it);
    case 'iter-str':
      return nextStrItem(ctx, it);
    case 'iter-dict':
      return nextDictKey(ctx, it);
    case 'iter-range':
      return nextRangeItem(it);
    default:
      return assertNever(it);
  }
}

/** Gives up the iterator's reference to what it walks (normal exit, break, return, error unwinding). */
export function releaseLoopState(ctx: OpContext, state: LoopState): void {
  if (state.tag === 'iter-list') ctx.heap.release(state.list);
  else if (state.tag === 'iter-str') ctx.heap.release(state.str);
  else if (state.tag === 'iter-dict') ctx.heap.release(state.dict);
}

/** The length is re-read every step, so appended elements are visited and popped ones end the loop sooner. */
function nextListItem(ctx: OpContext, it: ListIter): LoopStep {
  if (it.index >= it.list.items.length) return DONE;
  const value = it.list.items[it.index] ?? null;
  it.index += 1;
  ctx.heap.retain(value);
  return { kind: 'item', value };
}

function nextStrItem(ctx: OpContext, it: StrIter): LoopStep {
  if (it.index >= it.str.text.length) return DONE;
  const unit = ctx.heap.allocStr(it.str.text.charAt(it.index));
  if (!unit.ok) return { kind: 'error', error: unit.error };
  it.index += 1;
  return { kind: 'item', value: unit.value };
}

function nextDictKey(ctx: OpContext, it: DictIter): LoopStep {
  if (it.index >= it.keys.length) return DONE;
  const key = it.keys[it.index] ?? null;
  it.index += 1;
  ctx.heap.retain(key);
  return { kind: 'item', value: key };
}

/** Python range: counts towards `stop` by `step`; a next value past the safe range ends the loop. */
function nextRangeItem(it: RangeIter): LoopStep {
  const more = it.step > 0 ? it.next < it.stop : it.next > it.stop;
  if (!more) return DONE;
  const value = it.next;
  const following = value + it.step;
  it.next = Number.isSafeInteger(following) ? following : it.stop;
  return { kind: 'item', value };
}

const DONE: LoopStep = { kind: 'done' };
