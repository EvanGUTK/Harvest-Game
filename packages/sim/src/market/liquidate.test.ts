import { MARKET, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { liquidate } from './liquidate';
import { createMarket, marketPressures } from './market';
import type { MarketState } from './market';
import type { FarmLedger } from './sell';

const BUDGET = SHOWDOWN_DEFAULTS.cycleBudget;

function market(shared = true): MarketState {
  return createMarket({ sharedMarket: shared });
}

function farm(over: Partial<FarmLedger['silo']> = {}, credits = 100): FarmLedger {
  return { credits, silo: { radish: 0, corn: 0, melon: 0, ...over } };
}

describe('liquidate', () => {
  it('pays 10 radishes at ₵5 a total of 25, not 20: the floor is taken once on the total (crops-and-economy.md §End of match)', () => {
    const f = farm({ radish: 10 }, 0);
    liquidate(market(), [f], 0);
    // floorDiv(10 × 5 × 5_000, 10_000) = floorDiv(250_000, 10_000) = 25; per unit it would be 10 × floorDiv(25_000, 10_000) = 20
    expect(f.credits).toBe(25);
  });

  it('floors once per crop on the total: 3 corn at ₵17 give 25, not 3 × 8 = 24', () => {
    const m = market();
    m.pressure.corn = 1; // priceBp 9_800 → floorDiv(18 × 9_800, 10_000) = 17
    const f = farm({ corn: 3 }, 0);
    liquidate(m, [f], 0);
    expect(f.credits).toBe(25); // floorDiv(3 × 17 × 5_000, 10_000) = floorDiv(255_000, 10_000)
  });

  it('floors each crop separately, not the sum of crops: radish ₵2 + corn ₵8, not ₵11', () => {
    const m = market();
    m.pressure.corn = 1; // corn ₵17
    const f = farm({ radish: 1, corn: 1 }, 0);
    liquidate(m, [f], 0);
    // radish floorDiv(1 × 5 × 5_000, 10_000) = 2 (2.5), corn floorDiv(1 × 17 × 5_000, 10_000) = 8 (8.5); the sum of the exact values is 11
    expect(f.credits).toBe(10);
  });

  it('pays every crop at half its price: 2 radish, 3 corn, 1 melon at base = 5 + 27 + 30', () => {
    const f = farm({ radish: 2, corn: 3, melon: 1 }, 0);
    liquidate(market(), [f], 0);
    expect(f.credits).toBe(62);
  });

  it('empties the silo', () => {
    const f = farm({ radish: 4, corn: 2, melon: 1 });
    liquidate(market(), [f], 0);
    expect(f.silo).toEqual({ radish: 0, corn: 0, melon: 0 });
  });

  it('never changes pressure', () => {
    const m = market();
    m.pressure.radish = 12;
    m.pressure.corn = 3;
    liquidate(m, [farm({ radish: 50, corn: 50, melon: 50 })], 0);
    expect(marketPressures(m)).toEqual([12, 3, 0]);
  });

  it('gives every farm the same prices whatever the slot order, because liquidation leaves pressure alone', () => {
    const inventories = [{ radish: 10 }, { corn: 3 }, { radish: 7, melon: 1 }];
    const ascending = inventories.map((silo) => farm(silo, 0));
    const descending = inventories.map((silo) => farm(silo, 0)).reverse();
    liquidate(market(), ascending, 0);
    liquidate(market(), descending, 0);
    expect(descending.reverse().map((f) => f.credits)).toEqual(ascending.map((f) => f.credits));
    expect(ascending.map((f) => f.credits)).toEqual([25, 27, 47]); // 25; floorDiv(3×18×5_000, 10_000) = 27; 17 + 30
  });

  it('keeps credits as they are for an empty silo', () => {
    const f = farm({}, 77);
    liquidate(market(), [f], 0);
    expect(f.credits).toBe(77);
  });

  it('adds to existing credits', () => {
    const f = farm({ melon: 2 }, 90);
    liquidate(market(), [f], 0);
    expect(f.credits).toBe(150); // 90 + floorDiv(2 × 60 × 5_000, 10_000) = 90 + 60
  });

  it('uses the price as it stands at the budget, after the final decay', () => {
    const m = market();
    m.pressure.melon = 20;
    m.lastUpdated = BUDGET - MARKET.pressureDecayEvery;
    const f = farm({ melon: 10 }, 0);
    liquidate(m, [f], BUDGET);
    // 20 → floorDiv(20 × 80, 100) = 16 → priceBp 6_800 → floorDiv(60 × 6_800, 10_000) = 40 → floorDiv(10 × 40 × 5_000, 10_000) = 200
    // without the decay it would be price 36 → 180
    expect(f.credits).toBe(200);
    expect(m.pressure.melon).toBe(16);
  });

  it('pays at base price in an unshared (campaign) market', () => {
    const f = farm({ corn: 4 }, 0);
    liquidate(market(false), [f], 0);
    expect(f.credits).toBe(36); // floorDiv(4 × 18 × 5_000, 10_000)
  });

  it('handles no farms', () => {
    expect(() => {
      liquidate(market(), [], 0);
    }).not.toThrow();
  });
});
