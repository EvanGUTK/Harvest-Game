import { describe, expect, it } from 'vitest';
import { buildPlayerResult } from './result';
import type { PlayerStats, ScoringRules } from './stats';

const RULES: ScoringRules = { startCredits: 100, cycleBudget: 30_000 };

function stats(over: Partial<PlayerStats> = {}): PlayerStats {
  return {
    slot: 0,
    idle: false,
    credits: 340,
    lastSaleAt: 27_400,
    logicCycles: 2_050,
    programTokens: 120,
    cropsHarvested: 31,
    cyclesUsed: 29_990,
    unitsSold: 0,
    saleBpUnits: 0,
    cropsPlanted: 31,
    everDryPaused: false,
    output: ['hello'],
    ...over,
  };
}

describe('buildPlayerResult', () => {
  it('reports the final credits after liquidation as the score (scoring-and-judging.md §Official score)', () => {
    expect(buildPlayerResult(RULES, stats({ credits: 340 })).score).toBe(340);
  });

  it('keeps the starting credits for a program that does nothing (§Official score)', () => {
    const result = buildPlayerResult(RULES, stats({ credits: 100, lastSaleAt: null, cropsHarvested: 0 }));
    expect(result.score).toBe(100);
  });

  it('uses the start cycle of the last sale as cyclesLastChange (tiebreaker 1)', () => {
    expect(buildPlayerResult(RULES, stats({ lastSaleAt: 27_400 })).cyclesLastChange).toBe(27_400);
  });

  it('uses the cycle budget as cyclesLastChange when the player never sold (tiebreaker 1)', () => {
    expect(buildPlayerResult(RULES, stats({ lastSaleAt: null })).cyclesLastChange).toBe(30_000);
  });

  it('copies logicCycles, programTokens, cropsHarvested and output through unchanged', () => {
    const result = buildPlayerResult(RULES, stats());
    expect(result).toMatchObject({
      slot: 0,
      logicCycles: 2_050,
      programTokens: 120,
      cropsHarvested: 31,
      output: ['hello'],
    });
  });

  it('starts every result with no awards (awards are assigned across the whole lobby)', () => {
    expect(buildPlayerResult(RULES, stats()).awards).toEqual([]);
  });

  it('carries a runtime error of a real program in PlayerResult.error', () => {
    const result = buildPlayerResult(RULES, stats({ error: { code: 'R-INDEX', line: 7 } }));
    expect(result.error).toEqual({ code: 'R-INDEX', line: 7 });
  });

  it('leaves error out entirely when there is none (exactOptionalPropertyTypes)', () => {
    expect('error' in buildPlayerResult(RULES, stats())).toBe(false);
  });

  describe('idle program (scoring-and-judging.md §Idle program)', () => {
    const idle = stats({
      idle: true,
      credits: 100,
      lastSaleAt: null,
      logicCycles: 0,
      programTokens: 0,
      cropsHarvested: 0,
      cyclesUsed: 0,
      output: [],
    });

    it('scores 0, not startCredits, and reports cyclesLastChange = budget and zero stats', () => {
      expect(buildPlayerResult(RULES, idle)).toEqual({
        slot: 0,
        score: 0,
        cyclesLastChange: 30_000,
        logicCycles: 0,
        programTokens: 0,
        cropsHarvested: 0,
        awards: [],
        output: [],
      });
    });

    it('carries the compile diagnostic of a draft that did not compile', () => {
      const result = buildPlayerResult(RULES, { ...idle, error: { code: 'E-MISSING-COLON', line: 3 } });
      expect(result.error).toEqual({ code: 'E-MISSING-COLON', line: 3 });
    });

    it('ignores any stray stats on an idle entry: score stays 0 and nothing leaks into the result', () => {
      const result = buildPlayerResult(RULES, {
        ...idle,
        credits: 500,
        lastSaleAt: 100,
        cropsHarvested: 4,
        logicCycles: 9,
        programTokens: 33,
        output: ['x'],
      });
      expect(result).toEqual({
        slot: 0,
        score: 0,
        cyclesLastChange: 30_000,
        logicCycles: 0,
        programTokens: 0,
        cropsHarvested: 0,
        awards: [],
        output: [],
      });
    });
  });
});
