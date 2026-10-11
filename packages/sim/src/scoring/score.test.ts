import { describe, expect, it } from 'vitest';
import { InvariantError } from '../invariant';
import { scorePlayers } from './score';
import type { PlayerStats, ScoringRules } from './stats';

const RULES: ScoringRules = { startCredits: 100, cycleBudget: 30_000 };

function stats(slot: number, over: Partial<PlayerStats> = {}): PlayerStats {
  return {
    slot,
    idle: false,
    credits: 100,
    lastSaleAt: null,
    logicCycles: 100,
    programTokens: 20,
    cropsHarvested: 0,
    cyclesUsed: 30_000,
    unitsSold: 0,
    saleBpUnits: 0,
    cropsPlanted: 0,
    everDryPaused: false,
    output: [],
    ...over,
  };
}

describe('scorePlayers', () => {
  it('returns one result per player in slot order and the placements in place order', () => {
    const outcome = scorePlayers(RULES, [
      stats(2, { credits: 500 }),
      stats(0, { credits: 120 }),
      stats(1, { credits: 300 }),
    ]);
    expect(outcome.results.map((r) => [r.slot, r.score])).toEqual([
      [0, 120],
      [1, 300],
      [2, 500],
    ]);
    expect(outcome.placements.map((p) => [p.slot, p.place])).toEqual([
      [2, 1],
      [1, 2],
      [0, 3],
    ]);
  });

  it('ranks with the reported result fields: a never-sold player counts as cyclesLastChange = budget', () => {
    const outcome = scorePlayers(RULES, [
      stats(0, { credits: 200, lastSaleAt: null }),
      stats(1, { credits: 200, lastSaleAt: 12_000 }),
    ]);
    expect(outcome.placements.map((p) => p.slot)).toEqual([1, 0]);
  });

  it('places the idle program below a real program that ends with no credits (scoring-and-judging.md §Idle program)', () => {
    const outcome = scorePlayers(RULES, [stats(0, { idle: true, credits: 100 }), stats(1, { credits: 0 })]);
    expect(outcome.placements.map((p) => [p.slot, p.place])).toEqual([
      [1, 1],
      [0, 2],
    ]);
    expect(outcome.results[0]?.score).toBe(0);
  });

  it('puts each player\u2019s awards on their result: the richer farm earns top_earner, the idle player none', () => {
    const outcome = scorePlayers(RULES, [
      stats(0, { credits: 300, cropsPlanted: 4 }),
      stats(1, { credits: 120, cropsPlanted: 2 }),
      stats(2, { idle: true }),
    ]);
    expect(outcome.results.map((r) => r.awards.includes('top_earner'))).toEqual([true, false, false]);
    expect(outcome.results[2]?.awards).toEqual([]);
  });

  it('rejects a duplicate slot (SIM-BAD-SLOT)', () => {
    expect(() => scorePlayers(RULES, [stats(0), stats(0)])).toThrow(InvariantError);
    expect(() => scorePlayers(RULES, [stats(0), stats(0)])).toThrow(/SIM-BAD-SLOT/);
  });

  it('rejects a gap in the slots (SIM-BAD-SLOT)', () => {
    expect(() => scorePlayers(RULES, [stats(0), stats(2)])).toThrow(/SIM-BAD-SLOT/);
  });

  it('rejects slots that do not start at 0 and negative slots (SIM-BAD-SLOT)', () => {
    expect(() => scorePlayers(RULES, [stats(1), stats(2)])).toThrow(/SIM-BAD-SLOT/);
    expect(() => scorePlayers(RULES, [stats(-1)])).toThrow(/SIM-BAD-SLOT/);
  });

  it('handles an empty lobby', () => {
    expect(scorePlayers(RULES, [])).toEqual({ results: [], placements: [] });
  });
});
