/**
 * The VM heap: live-cell accounting with reference counts for strings, lists and dicts.
 * Spec: docs/02-language/language-spec.md §Limits (heap cells, collection and string limits);
 * docs/03-architecture/interpreter-vm.md §VM (heap accounting is normative).
 * Invariants: `liveCells` equals the cells of every object whose reference count is above 0; every
 * limit is checked before anything is counted or copied (size limits first, then R-OUT-OF-MEMORY), so
 * a failed allocation leaves the heap unchanged; release walks an explicit worklist, never JS
 * recursion; reference cycles are never reclaimed (documented behaviour, there is no tracing collector).
 *
 * Ownership: every allocation returns an owned reference (rc = 1) for the caller to store or release.
 * Containers retain what they hold. `Heap` is a class because it has identity and lifecycle: one per VM.
 */

import type { Limits } from '../types';
import { InvariantError } from '../invariant';
import { collectionFull, outOfMemory, strTooLong, type RuntimeError } from './runtime-error';
import {
  isHeapObj,
  strCells,
  type DictKey,
  type DictObj,
  type HeapObj,
  type ListObj,
  type RtValue,
  type StrObj,
} from './value';

export type Alloc<T> = { ok: true; value: T } | { ok: false; error: RuntimeError };

export class Heap {
  private readonly limits: Limits;
  private live = 0;
  private nextId = 1;

  constructor(limits: Limits) {
    this.limits = limits;
  }

  /** Cells held by every object that is still referenced (language-spec.md §Limits). */
  get liveCells(): number {
    return this.live;
  }

  /** R-STR-TOO-LONG if a string of `length` UTF-16 code units would exceed the limit. */
  checkStrLength(length: number): RuntimeError | undefined {
    return length > this.limits.maxStringLength ? strTooLong(this.limits) : undefined;
  }

  /** R-COLLECTION-FULL if a list or dict of `size` items would exceed the limit. */
  checkCollectionSize(size: number): RuntimeError | undefined {
    return size > this.limits.maxCollectionSize ? collectionFull(this.limits) : undefined;
  }

  allocStr(text: string): Alloc<StrObj> {
    const cells = strCells(text.length);
    const error = this.checkStrLength(text.length) ?? this.reserve(cells);
    if (error) return { ok: false, error };
    return { ok: true, value: { tag: 'str', text, cells, pinned: false, rc: 1, id: this.takeId() } };
  }

  /** A new list holding `items` (each retained); `items` is copied, so the caller keeps its array. */
  allocList(items: readonly RtValue[]): Alloc<ListObj> {
    const error = this.checkCollectionSize(items.length) ?? this.reserve(items.length);
    if (error) return { ok: false, error };
    for (const item of items) this.retain(item);
    return { ok: true, value: { tag: 'list', items: [...items], rc: 1, id: this.takeId() } };
  }

  /** A new empty dict. It costs no cells until it has entries, so it cannot fail. */
  allocDict(): DictObj {
    return { tag: 'dict', entries: new Map(), rc: 1, id: this.takeId() };
  }

  listAppend(list: ListObj, value: RtValue): RuntimeError | undefined {
    const error = this.checkCollectionSize(list.items.length + 1) ?? this.reserve(1);
    if (error) return error;
    this.retain(value);
    list.items.push(value);
    return undefined;
  }

  /** Overwrites slot `index`; the caller has already checked R-INDEX. */
  listSet(list: ListObj, index: number, value: RtValue): void {
    this.assertSlot(list, index);
    const old = list.items[index] ?? null;
    // Retain before release: overwriting a slot with the value it already holds must not free it.
    this.retain(value);
    list.items[index] = value;
    this.release(old);
  }

  /** Removes slot `index` and hands the container's reference to the caller (an owned value). */
  listRemoveAt(list: ListObj, index: number): RtValue {
    this.assertSlot(list, index);
    const [removed] = list.items.splice(index, 1);
    this.live -= 1;
    return removed ?? null;
  }

  /**
   * Sets `dict[key] = value`. A new key costs one cell and retains `keyValue`; an existing key keeps
   * its first-inserted key value and releases the old value.
   */
  dictSet(dict: DictObj, key: DictKey, keyValue: RtValue, value: RtValue): RuntimeError | undefined {
    const existing = dict.entries.get(key);
    if (existing) {
      const old = existing.value;
      this.retain(value);
      existing.value = value;
      this.release(old);
      return undefined;
    }
    const error = this.checkCollectionSize(dict.entries.size + 1) ?? this.reserve(1);
    if (error) return error;
    this.retain(keyValue);
    this.retain(value);
    dict.entries.set(key, { key: keyValue, value });
    return undefined;
  }

  /** Adds a reference. Immediates, functions, constants and pinned strings are not counted. */
  retain(value: RtValue): void {
    if (isCounted(value)) value.rc += 1;
  }

  /** Drops a reference; at zero the object's cells are released and so are its members, iteratively. */
  release(value: RtValue): void {
    const pending: RtValue[] = [value];
    let next = pending.pop();
    while (next !== undefined) {
      if (isCounted(next)) this.dropReference(next, pending);
      next = pending.pop();
    }
  }

  private dropReference(obj: HeapObj, pending: RtValue[]): void {
    if (obj.rc <= 0) {
      throw new InvariantError(
        'HEAP_REFCOUNT',
        `${obj.tag} #${String(obj.id)} released more often than referenced`,
      );
    }
    obj.rc -= 1;
    if (obj.rc === 0) this.free(obj, pending);
  }

  /** Releases an unreferenced object's cells and queues its members, then empties it. */
  private free(obj: HeapObj, pending: RtValue[]): void {
    switch (obj.tag) {
      case 'str':
        this.live -= obj.cells;
        return;
      case 'list':
        this.live -= obj.items.length;
        pending.push(...obj.items);
        obj.items.length = 0;
        return;
      case 'dict':
        this.live -= obj.entries.size;
        for (const entry of obj.entries.values()) pending.push(entry.key, entry.value);
        obj.entries.clear();
        return;
    }
  }

  /** R-OUT-OF-MEMORY if `cells` more would exceed the limit; otherwise counts them. */
  private reserve(cells: number): RuntimeError | undefined {
    if (this.live + cells > this.limits.maxHeapCells) return outOfMemory(this.limits);
    this.live += cells;
    return undefined;
  }

  private takeId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  private assertSlot(list: ListObj, index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= list.items.length) {
      throw new InvariantError(
        'HEAP_INDEX',
        `slot ${String(index)} outside a list of ${String(list.items.length)}`,
      );
    }
  }
}

function isCounted(value: RtValue): value is HeapObj {
  return isHeapObj(value) && !(value.tag === 'str' && value.pinned);
}
