import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pickNext, tieBreakRank, type PendingCall } from './tie-break';

// simulation-engine.md §Tie-break (normative): among agents with equal pending.t, the smallest
// (agentIndex − (t mod N) + N) mod N runs first.
describe('tieBreakRank', () => {
  it('ranks the agent whose index equals t mod N first, then ascending indices, wrapping around', () => {
    const N = 8;
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((index) => tieBreakRank(index, 5, N))).toEqual([
      3, 4, 5, 6, 7, 0, 1, 2,
    ]);
    expect(tieBreakRank(5, 5, N)).toBe(0);
    expect(tieBreakRank(6, 5, N)).toBe(1);
    expect(tieBreakRank(4, 5, N)).toBe(7);
  });

  it('uses t mod N, so the rotation repeats every N cycles', () => {
    expect(tieBreakRank(3, 21, 8)).toBe(tieBreakRank(3, 5, 8));
    expect(tieBreakRank(3, 0, 8)).toBe(3);
    expect(tieBreakRank(3, 8, 8)).toBe(3);
  });

  it('gives each agent a distinct rank 0..N−1 at any cycle', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30_000 }), fc.integer({ min: 2, max: 16 }), (t, n) => {
        const ranks = Array.from({ length: n }, (_, index) => tieBreakRank(index, t, n)).sort(
          (a, b) => a - b,
        );
        expect(ranks).toEqual(Array.from({ length: n }, (_, i) => i));
      }),
    );
  });
});

describe('pickNext', () => {
  const at = (agentIndex: number, t: number): PendingCall => ({ agentIndex, t });

  it('returns undefined when nothing is pending', () => {
    expect(pickNext<PendingCall>([], 8)).toBeUndefined();
  });

  it('picks the earliest pending cycle first, whatever the indices', () => {
    expect(pickNext([at(0, 9), at(2, 7), at(4, 8)], 8)).toEqual(at(2, 7));
  });

  it('breaks a tie at t = 5 for four players (N = 8) in the order slot 3, 0, 1, 2 (the doc example)', () => {
    const remaining = [at(0, 5), at(2, 5), at(4, 5), at(6, 5)];
    const order: number[] = [];
    let pending = remaining;
    while (pending.length > 0) {
      const next = pickNext(pending, 8);
      if (next === undefined) break;
      order.push(next.agentIndex / 2);
      pending = pending.filter((p) => p !== next);
    }
    expect(order).toEqual([3, 0, 1, 2]);
  });

  it('keeps N constant for the match: a missing agent does not shift the others (simulation-engine.md §Tie-break)', () => {
    // Agents 0 and 4 pending at t = 5 with N = 8: ranks 3 and 7, so agent 0 runs first even if 2 and 6 are done.
    expect(pickNext([at(4, 5), at(0, 5)], 8)).toEqual(at(0, 5));
  });

  it('does not depend on the order of the pending list', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 15 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 40 }),
        (indices, t) => {
          const pending = indices.map((index) => at(index, t));
          const expected = pickNext(pending, 16);
          expect(pickNext([...pending].reverse(), 16)).toEqual(expected);
        },
      ),
    );
  });
});
