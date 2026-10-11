import { describe, expect, it } from 'vitest';
import { rankPlayers } from './ranking';
import type { RankEntry } from './ranking';

function entry(slot: number, over: Partial<RankEntry> = {}): RankEntry {
  return {
    slot,
    idle: false,
    score: 100,
    cyclesLastChange: 30_000,
    logicCycles: 500,
    programTokens: 50,
    ...over,
  };
}

function placesBySlot(entries: readonly RankEntry[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of rankPlayers(entries)) out[p.slot] = p.place;
  return out;
}

describe('rankPlayers', () => {
  it('places the higher score first (scoring-and-judging.md §Official score)', () => {
    const places = placesBySlot([
      entry(0, { score: 120 }),
      entry(1, { score: 300 }),
      entry(2, { score: 80 }),
    ]);
    expect(places).toEqual({ 1: 1, 0: 2, 2: 3 });
  });

  it('breaks a score tie by the earlier cyclesLastChange (tiebreaker 1)', () => {
    const places = placesBySlot([
      entry(0, { cyclesLastChange: 9_000 }),
      entry(1, { cyclesLastChange: 4_000 }),
    ]);
    expect(places).toEqual({ 1: 1, 0: 2 });
  });

  it('breaks an equal cyclesLastChange by fewer logicCycles (tiebreaker 2)', () => {
    const places = placesBySlot([entry(0, { logicCycles: 900 }), entry(1, { logicCycles: 400 })]);
    expect(places).toEqual({ 1: 1, 0: 2 });
  });

  it('breaks equal logicCycles by fewer programTokens (tiebreaker 3)', () => {
    const places = placesBySlot([entry(0, { programTokens: 80 }), entry(1, { programTokens: 30 })]);
    expect(places).toEqual({ 1: 1, 0: 2 });
  });

  it('applies the tiebreakers in order: an earlier last sale beats fewer logic cycles', () => {
    const places = placesBySlot([
      entry(0, { cyclesLastChange: 2_000, logicCycles: 9_000, programTokens: 900 }),
      entry(1, { cyclesLastChange: 3_000, logicCycles: 10, programTokens: 1 }),
    ]);
    expect(places).toEqual({ 0: 1, 1: 2 });
  });

  it('never lets a tiebreaker override a higher score', () => {
    const places = placesBySlot([
      entry(0, { score: 101, cyclesLastChange: 30_000, logicCycles: 9_000, programTokens: 900 }),
      entry(1, { score: 100, cyclesLastChange: 1, logicCycles: 1, programTokens: 1 }),
    ]);
    expect(places).toEqual({ 0: 1, 1: 2 });
  });

  it('gives fully tied players a shared place and the next player the place after the group: 1st, =2nd, =2nd, 4th', () => {
    const entries = [
      entry(0, { score: 500 }),
      entry(1, { score: 300 }),
      entry(2, { score: 300 }),
      entry(3, { score: 200 }),
    ];
    expect(rankPlayers(entries)).toEqual([
      { slot: 0, place: 1, shared: false },
      { slot: 1, place: 2, shared: true },
      { slot: 2, place: 2, shared: true },
      { slot: 3, place: 4, shared: false },
    ]);
  });

  it('shares first place when everyone is fully tied, whatever the slot order', () => {
    expect(placesBySlot([entry(2), entry(0), entry(1)])).toEqual({ 0: 1, 1: 1, 2: 1 });
  });

  it('does not use slot order to separate tied players (it only orders the output)', () => {
    const ranked = rankPlayers([entry(3), entry(1)]);
    expect(ranked.map((p) => p.slot)).toEqual([1, 3]);
    expect(ranked.every((p) => p.place === 1 && p.shared)).toBe(true);
  });

  it('is independent of the input order', () => {
    const entries = [
      entry(0, { score: 90 }),
      entry(1, { score: 90, programTokens: 10 }),
      entry(2, { score: 400 }),
      entry(3, { score: 90 }),
    ];
    const reversed = [...entries].reverse();
    expect(rankPlayers(reversed)).toEqual(rankPlayers(entries));
  });

  it('places an idle player below every player with a program, even one that ends with ₵0 (§Idle program)', () => {
    const places = placesBySlot([
      entry(0, { idle: true, score: 0, cyclesLastChange: 30_000, logicCycles: 0, programTokens: 0 }),
      entry(1, { score: 0 }),
      entry(2, { score: 250 }),
    ]);
    expect(places).toEqual({ 2: 1, 1: 2, 0: 3 });
  });

  it('puts several idle players in a shared last place after all programs (§Idle program)', () => {
    const idle = { idle: true, score: 0, cyclesLastChange: 30_000, logicCycles: 0, programTokens: 0 };
    const ranked = rankPlayers([
      entry(0, { score: 150 }),
      entry(1, idle),
      entry(2, { score: 100 }),
      entry(3, idle),
    ]);
    expect(ranked).toEqual([
      { slot: 0, place: 1, shared: false },
      { slot: 2, place: 2, shared: false },
      { slot: 1, place: 3, shared: true },
      { slot: 3, place: 3, shared: true },
    ]);
  });

  it('ranks a lone idle player first among one (nobody to lose to)', () => {
    const ranked = rankPlayers([entry(0, { idle: true, score: 0 })]);
    expect(ranked).toEqual([{ slot: 0, place: 1, shared: false }]);
  });

  it('returns nothing for an empty match', () => {
    expect(rankPlayers([])).toEqual([]);
  });
});
