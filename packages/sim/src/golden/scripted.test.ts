import { describe, expect, it } from 'vitest';
import { InvariantError } from '../invariant';
import { playScript, runScripted, tieBreakRank } from './scripted';
import type { ScriptedCall, ScriptedScenario } from './scripted';

/** One slot, moisture 100 and no decay so a radish ripens at 310 whatever the layout; budget 3,000. */
function scenario(over: Partial<ScriptedScenario> = {}, calls: ScriptedCall[] = []): ScriptedScenario {
  return {
    name: 'test',
    seed: 1,
    gridSize: 4,
    cycleBudget: 3_000,
    nSlots: 1,
    startCredits: 100,
    startWater: 60,
    startMoisture: { min: 100, max: 100 },
    moistureDecay: false,
    sharedMarket: true,
    calls,
    ...over,
  };
}

const till = (t: number, slot = 0): ScriptedCall => ({ t, slot, call: 'till' });

describe('tieBreakRank (simulation-engine.md §Tie-break)', () => {
  it('orders 4 players pending at t = 5 as slot 3, 0, 1, 2 (the doc’s example)', () => {
    const n = 4 * 2; // N = nSlots × MAX_DRONES
    const ranks = [0, 1, 2, 3].map((slot) => ({ slot, rank: tieBreakRank(slot * 2, 5, n) }));
    expect(ranks.map((r) => r.rank)).toEqual([3, 5, 7, 1]);
    expect([...ranks].sort((a, b) => a.rank - b.rank).map((r) => r.slot)).toEqual([3, 0, 1, 2]);
  });

  it('puts the agent whose index equals t mod N first', () => {
    expect(tieBreakRank(4, 12, 8)).toBe(0); // 12 mod 8 = 4
  });
});

describe('runScripted: hash emission (simulation-engine.md §State hash, Emission)', () => {
  it('emits one hash per multiple of 1,000 below the budget, then the final hash apart: budget 2,500 gives 2 hashes', () => {
    const result = runScripted(scenario({ cycleBudget: 2_500 }));
    expect(result.hashes).toHaveLength(2);
    expect(result.finalStateHash).not.toBe(result.hashes[1]);
  });

  it('ends the hash list with the final hash when the budget is a multiple of 1,000: budget 3,000 gives 3, the last equal to finalStateHash', () => {
    const result = runScripted(scenario());
    expect(result.hashes).toHaveLength(3);
    expect(result.hashes[2]).toBe(result.finalStateHash);
  });

  it('emits the hash at 1,000 before a call at exactly t = 1,000, so that call is not in it', () => {
    const without = runScripted(scenario());
    const withCall = runScripted(scenario({}, [till(1_000)]));
    expect(withCall.hashes[0]).toBe(without.hashes[0]);
    expect(withCall.hashes[1]).not.toBe(without.hashes[1]);
  });

  it('includes a call at t = 999 in the hash at 1,000', () => {
    const without = runScripted(scenario());
    const withCall = runScripted(scenario({}, [till(999)]));
    expect(withCall.hashes[0]).not.toBe(without.hashes[0]);
  });

  it('emits every hash a long gap between two calls skips', () => {
    const result = runScripted(scenario({}, [till(10), { t: 2_600, slot: 0, call: 'water' }]));
    expect(result.hashes).toHaveLength(3);
  });

  it('is deterministic: the same scenario gives the same hashes twice', () => {
    expect(runScripted(scenario({}, [till(10)]))).toEqual(runScripted(scenario({}, [till(10)])));
  });

  it('depends on the seed through the layout and the PRNG streams', () => {
    const a = runScripted(scenario({ seed: 1, startMoisture: { min: 0, max: 40 } }));
    const b = runScripted(scenario({ seed: 2, startMoisture: { min: 0, max: 40 } }));
    expect(a.finalStateHash).not.toBe(b.finalStateHash);
  });
});

describe('runScripted: applying calls', () => {
  const plantAndHarvest: ScriptedCall[] = [
    { t: 10, slot: 0, call: 'plant', crop: 'radish' },
    { t: 400, slot: 0, call: 'harvest' },
  ];

  it('plants (paying the seed), harvests a ripe radish into the silo and moves the drone clock past each call', () => {
    const played = playScript(scenario({ cycleBudget: 500 }, plantAndHarvest));
    expect(played.farms[0]?.credits).toBe(100 - 2 + 2); // seed ₵2, then liquidation of 1 radish at 50 % of ₵5 = ₵2
    expect(played.farms[0]?.silo.radish).toBe(0); // liquidated
    expect(played.drones[0]?.clock).toBe(430); // 400 + harvest cost 30
  });

  it('liquidates the silo after the last call, at the final price, and empties it', () => {
    const played = playScript(scenario({ cycleBudget: 500 }, plantAndHarvest));
    expect(played.farms[0]?.silo).toEqual({ radish: 0, corn: 0, melon: 0 });
  });

  it('sells at the market price, pays the credits and adds the units to the shared pressure', () => {
    const calls: ScriptedCall[] = [
      ...plantAndHarvest,
      { t: 600, slot: 0, call: 'sell', crop: 'radish', n: 1 },
    ];
    const played = playScript(scenario({ cycleBudget: 700 }, calls));
    expect(played.farms[0]?.credits).toBe(100 - 2 + 5);
    expect(played.market.pressure.radish).toBe(1);
  });

  it('moves the drone with wrap-around and applies tile calls where it stands', () => {
    const calls: ScriptedCall[] = [
      { t: 10, slot: 0, call: 'move', dir: 'west' },
      { t: 100, slot: 0, call: 'till' },
    ];
    const played = playScript(scenario({ cycleBudget: 500 }, calls));
    expect(played.drones[0]).toMatchObject({ x: 3, y: 0 }); // west of (0,0) wraps to the last column of a 4×4 grid
    expect(played.farms[0]?.tiles[3]?.soil).toBe('tilled');
    expect(played.farms[0]?.tiles[0]?.soil).toBe('grass');
  });

  it('refills the tank on the well tile', () => {
    const calls: ScriptedCall[] = [
      { t: 10, slot: 0, call: 'water' },
      { t: 100, slot: 0, call: 'refill' },
    ];
    const played = playScript(scenario({ cycleBudget: 500, startWater: 5 }, calls));
    expect(played.farms[0]?.water).toBe(60); // spent 1, refilled to capacity
  });

  it('lets a failed action cost 5 and change nothing: planting a corn seed on grass', () => {
    const played = playScript(
      scenario({ cycleBudget: 500 }, [{ t: 10, slot: 0, call: 'plant', crop: 'corn' }]),
    );
    expect(played.farms[0]?.credits).toBe(100);
    expect(played.drones[0]?.clock).toBe(15);
  });
});

describe('runScripted: several slots and the shared market', () => {
  const twoSlots = (sellAt: number): ScriptedScenario =>
    scenario({ nSlots: 2, cycleBudget: 800 }, [
      { t: 10, slot: 0, call: 'plant', crop: 'radish' },
      { t: 10, slot: 1, call: 'plant', crop: 'radish' },
      { t: 400, slot: 0, call: 'harvest' },
      { t: 400, slot: 1, call: 'harvest' },
      { t: sellAt, slot: 0, call: 'sell', crop: 'radish', n: 1 },
      { t: sellAt, slot: 1, call: 'sell', crop: 'radish', n: 1 },
    ]);

  it('gives the first seller of a tie the pre-sale price: at t = 600 (mod 4 = 0) slot 0 sells at ₵5 and slot 1 at ₵4', () => {
    const played = playScript(twoSlots(600));
    expect([played.farms[0]?.credits, played.farms[1]?.credits]).toEqual([103, 102]);
  });

  it('reverses the tie when t mod N changes: at t = 601 slot 1 sells first', () => {
    const played = playScript(twoSlots(601));
    expect([played.farms[0]?.credits, played.farms[1]?.credits]).toEqual([102, 103]);
  });

  it('applies the calls in time order whatever order they are listed in', () => {
    const forward = twoSlots(600);
    const shuffled: ScriptedScenario = { ...forward, calls: [...forward.calls].reverse() };
    expect(runScripted(shuffled)).toEqual(runScripted(forward));
  });
});

describe('runScripted: rules variants', () => {
  it('pays the scenario’s liquidation share: an unsold radish gives ₵4 at 8_000 bp, not ₵2', () => {
    const calls: ScriptedCall[] = [
      { t: 10, slot: 0, call: 'plant', crop: 'radish' },
      { t: 400, slot: 0, call: 'harvest' },
    ];
    const base = scenario({ cycleBudget: 500 }, calls);
    const generous = { ...base, market: { liquidationBp: 8_000 } };
    expect(playScript(base).farms[0]?.credits).toBe(100); // 100 − 2 + floorDiv(5 × 5_000, 10_000)
    expect(playScript(generous).farms[0]?.credits).toBe(102); // 100 − 2 + floorDiv(5 × 8_000, 10_000)
    expect(runScripted(generous).finalStateHash).not.toBe(runScripted(base).finalStateHash);
  });

  it('keeps campaign pressure out of an unshared market', () => {
    const calls: ScriptedCall[] = [
      { t: 10, slot: 0, call: 'plant', crop: 'radish' },
      { t: 400, slot: 0, call: 'harvest' },
      { t: 600, slot: 0, call: 'sell', crop: 'radish', n: 1 },
    ];
    const played = playScript(scenario({ cycleBudget: 700, sharedMarket: false }, calls));
    expect(played.market.pressure.radish).toBe(0);
  });

  it('drops moisture when decay is on: a tile starting at 100 holds less after 1,000 cycles', () => {
    const calls = [till(10)];
    const dry = playScript(scenario({ cycleBudget: 1_000, moistureDecay: true }, calls));
    const wet = playScript(scenario({ cycleBudget: 1_000, moistureDecay: false }, calls));
    expect(dry.farms[0]?.tiles[0]?.moisture).toBeLessThan(wet.farms[0]?.tiles[0]?.moisture ?? 0);
  });
});

describe('runScripted: a script that cannot be played is an invariant violation', () => {
  it('rejects a slot outside 0..nSlots−1', () => {
    expect(() => runScripted(scenario({}, [till(10, 3)]))).toThrow(InvariantError);
    expect(() => runScripted(scenario({}, [till(10, 3)]))).toThrow(/SIM-BAD-SCRIPT/);
  });

  it('rejects a call before time 0 or after the budget', () => {
    expect(() => runScripted(scenario({}, [till(-1)]))).toThrow(/SIM-BAD-SCRIPT/);
    expect(() => runScripted(scenario({}, [till(3_001)]))).toThrow(/SIM-BAD-SCRIPT/);
  });

  it('rejects a call that starts before its slot’s previous call has finished (till costs 30)', () => {
    expect(() => runScripted(scenario({}, [till(10), { t: 20, slot: 0, call: 'water' }]))).toThrow(
      /SIM-BAD-SCRIPT/,
    );
  });

  it('accepts a call that starts exactly when the previous one ends', () => {
    expect(() => runScripted(scenario({}, [till(10), { t: 40, slot: 0, call: 'water' }]))).not.toThrow();
  });

  it('rejects a seed outside the uint32 range through the PRNG invariant', () => {
    expect(() => runScripted(scenario({ seed: -1 }))).toThrow(InvariantError);
  });
});
