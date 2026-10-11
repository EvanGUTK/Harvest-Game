import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_LIMITS } from '../types';
import { Heap } from './heap';
import type { ListObj, RtValue, StrObj } from './value';

/**
 * Model check of reference counting (interpreter-vm.md §VM: heap accounting). Random programs build
 * strings and lists that may contain older objects (a DAG, so no cycles), then append and drop
 * references. After every step the heap's live count must equal the cells of exactly the objects
 * reachable from the references still held; dropping everything must bring it back to 0.
 */

type Command =
  | { readonly op: 'str'; readonly length: number }
  | { readonly op: 'list'; readonly picks: readonly number[] }
  | { readonly op: 'append'; readonly into: number; readonly pick: number }
  | { readonly op: 'drop'; readonly pick: number };

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ op: fc.constant('str' as const), length: fc.integer({ min: 0, max: 40 }) }),
  fc.record({ op: fc.constant('list' as const), picks: fc.array(fc.nat(), { maxLength: 6 }) }),
  fc.record({ op: fc.constant('append' as const), into: fc.nat(), pick: fc.nat() }),
  fc.record({ op: fc.constant('drop' as const), pick: fc.nat() }),
);

type Obj = StrObj | ListObj;

/** Cells of every object reachable from `roots`, each counted once (language-spec.md §Limits). */
const reachableCells = (roots: readonly Obj[]): number => {
  const seen = new Set<Obj>();
  const pending: RtValue[] = [...roots];
  let cells = 0;
  for (let v = pending.pop(); v !== undefined; v = pending.pop()) {
    if (typeof v !== 'object' || v === null || (v.tag !== 'str' && v.tag !== 'list') || seen.has(v)) continue;
    seen.add(v);
    if (v.tag === 'str') cells += v.cells;
    else {
      cells += v.items.length;
      pending.push(...v.items);
    }
  }
  return cells;
};

describe('Heap reference counting against a reachability model', () => {
  it('keeps liveCells equal to the cells reachable from held references, and 0 once all are dropped', () => {
    fc.assert(
      fc.property(fc.array(command, { maxLength: 60 }), (commands) => {
        const heap = new Heap(DEFAULT_LIMITS);
        /** Every object ever created, in creation order; a list may only contain older ones. */
        const created: Obj[] = [];
        /** References the program still holds (one per entry; duplicates allowed). */
        const held: Obj[] = [];
        for (const c of commands) {
          if (c.op === 'str') {
            const r = heap.allocStr('x'.repeat(c.length));
            if (r.ok) {
              created.push(r.value);
              held.push(r.value);
            }
          } else if (c.op === 'list') {
            const members = held.length === 0 ? [] : c.picks.map((p) => held[p % held.length]!);
            const r = heap.allocList(members);
            if (r.ok) {
              created.push(r.value);
              held.push(r.value);
            }
          } else if (c.op === 'append' && held.length > 0) {
            const into = held[c.into % held.length]!;
            const value = held[c.pick % held.length]!;
            // Appending a newer object into an older list could close a cycle; the model is a DAG.
            if (into.tag === 'list' && created.indexOf(value) < created.indexOf(into))
              heap.listAppend(into, value);
          } else if (c.op === 'drop' && held.length > 0) {
            const [dropped] = held.splice(c.pick % held.length, 1);
            if (dropped) heap.release(dropped);
          }
          expect(heap.liveCells).toBe(reachableCells(held));
        }
        for (const v of held.splice(0)) heap.release(v);
        expect(heap.liveCells).toBe(0);
      }),
      { numRuns: 300 },
    );
  });
});
