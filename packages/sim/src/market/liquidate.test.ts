import { CROPS, MARKET, SHOWDOWN_DEFAULTS } from '@harvest/content';
import type { CropId } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { liquidate } from './liquidate';
import { createMarket } from './market';
import type { MarketEnv, MarketState } from './market';
import type { FarmLedger } from './sell';

/** The default rules: content's numbers. */
const RULES: MarketEnv = { market: MARKET, crops: CROPS };

const BUDGET = SHOWDOWN_DEFAULTS.cycleBudget;

function market(shared = true): MarketState {
  return createMarket({ sharedMarket: shared });
}

function marketWith(pressure: Partial<Record<CropId, number>>, lastUpdated = 0): MarketState {
  const empty = market();
  return { ...empty, pressure: { ...empty.pressure, ...pressure }, lastUpdated };
}

function farm(silo: Partial<Record<CropId, number>> = {}, credits = 100): FarmLedger {
  return { credits, silo: { radish: 0, corn: 0, melon: 0, ...silo } };
}

function credits(farms: readonly FarmLedger[]): number[] {
  return farms.map((f) => f.credits);
}

describe('liquidate', () => {
  it('pays 10 radishes at ₵5 a total of 25, not 20: the floor is taken once on the total (crops-and-economy.md §End of match)', () => {
    // floorDiv(10 × 5 × 5_000, 10_000) = floorDiv(250_000, 10_000) = 25; per unit it would be 10 × floorDiv(25_000, 10_000) = 20
    expect(credits(liquidate(market(), [farm({ radish: 10 }, 0)], 0, RULES))).toEqual([25]);
  });

  it('floors once per crop on the total: 3 corn at ₵17 give 25, not 3 × 8 = 24', () => {
    // pressure 1: priceBp 9_800 → floorDiv(18 × 9_800, 10_000) = 17; floorDiv(3 × 17 × 5_000, 10_000) = floorDiv(255_000, 10_000)
    expect(credits(liquidate(marketWith({ corn: 1 }), [farm({ corn: 3 }, 0)], 0, RULES))).toEqual([25]);
  });

  it('floors each crop separately, not the sum of crops: radish ₵2 + corn ₵8, not ₵11', () => {
    // radish floorDiv(1 × 5 × 5_000, 10_000) = 2 (2.5), corn floorDiv(1 × 17 × 5_000, 10_000) = 8 (8.5); the sum of the exact values is 11
    expect(credits(liquidate(marketWith({ corn: 1 }), [farm({ radish: 1, corn: 1 }, 0)], 0, RULES))).toEqual([
      10,
    ]);
  });

  it('pays every crop at half its price: 2 radish, 3 corn, 1 melon at base = 5 + 27 + 30', () => {
    expect(credits(liquidate(market(), [farm({ radish: 2, corn: 3, melon: 1 }, 0)], 0, RULES))).toEqual([62]);
  });

  it('empties the silo', () => {
    const [result] = liquidate(market(), [farm({ radish: 4, corn: 2, melon: 1 })], 0, RULES);
    expect(result?.silo).toEqual({ radish: 0, corn: 0, melon: 0 });
  });

  it('gives every farm the same prices whatever the slot order, because liquidation leaves pressure alone', () => {
    const silos = [{ radish: 10 }, { corn: 3 }, { radish: 7, melon: 1 }];
    const ascending = liquidate(
      market(),
      silos.map((s) => farm(s, 0)),
      0,
      RULES,
    );
    const descending = liquidate(market(), silos.map((s) => farm(s, 0)).reverse(), 0, RULES).reverse();
    expect(credits(descending)).toEqual(credits(ascending));
    expect(credits(ascending)).toEqual([25, 27, 47]); // 25; floorDiv(3×18×5_000, 10_000) = 27; 17 + 30
  });

  it('keeps credits as they are for an empty silo', () => {
    expect(credits(liquidate(market(), [farm({}, 77)], 0, RULES))).toEqual([77]);
  });

  it('adds to existing credits', () => {
    expect(credits(liquidate(market(), [farm({ melon: 2 }, 90)], 0, RULES))).toEqual([150]); // 90 + floorDiv(2 × 60 × 5_000, 10_000)
  });

  it('uses the price as it stands at the budget, after the final decay', () => {
    const m = marketWith({ melon: 20 }, BUDGET - MARKET.pressureDecayEvery);
    // 20 → floorDiv(20 × 80, 100) = 16 → priceBp 6_800 → floorDiv(60 × 6_800, 10_000) = 40 → floorDiv(10 × 40 × 5_000, 10_000) = 200
    // without the decay it would be price 36 → 180
    expect(credits(liquidate(m, [farm({ melon: 10 }, 0)], BUDGET, RULES))).toEqual([200]);
  });

  it('pays at base price in an unshared (campaign) market', () => {
    expect(credits(liquidate(market(false), [farm({ corn: 4 }, 0)], 0, RULES))).toEqual([36]); // floorDiv(4 × 18 × 5_000, 10_000)
  });

  it('returns no farms for no farms', () => {
    expect(liquidate(market(), [], 0, RULES)).toEqual([]);
  });

  it('carries every other farm field over unchanged', () => {
    const rich = { ...farm({ radish: 2 }), water: 12 };
    const [result] = liquidate(market(), [rich], 0, RULES);
    expect(result?.water).toBe(12);
  });

  it('is a value: the input farms and market equal pre-call clones, and the market keeps its pressure', () => {
    const m = marketWith({ radish: 12, corn: 3 }, BUDGET - MARKET.pressureDecayEvery);
    const marketBefore = { ...m, pressure: { ...m.pressure } };
    const farms = [farm({ radish: 50, corn: 50, melon: 50 }), farm({ corn: 4 }, 7)];
    const farmsBefore = farms.map((f) => ({ ...f, silo: { ...f.silo } }));
    liquidate(m, farms, BUDGET, RULES);
    expect(m).toEqual(marketBefore);
    expect(farms).toEqual(farmsBefore);
  });

  it('pays the injected liquidation share: 10 radishes at ₵5 give 40 at 8_000 bp, not 25', () => {
    const rules: MarketEnv = { market: { ...MARKET, liquidationBp: 8_000 }, crops: CROPS };
    // floorDiv(10 × 5 × 8_000, 10_000) = 40
    expect(credits(liquidate(market(), [farm({ radish: 10 }, 0)], 0, rules))).toEqual([40]);
    expect(credits(liquidate(market(), [farm({ radish: 10 }, 0)], 0, RULES))).toEqual([25]);
  });
});
