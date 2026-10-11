import { BASIS_POINTS, CROPS, CROP_IDS, MARKET, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { InvariantError } from '../invariant';
import { advanceMarket, cloneMarket, createMarket, marketPrice, marketPressures } from './market';
import type { MarketState } from './market';

const DECAY = MARKET.pressureDecayEvery;
const BUDGET = SHOWDOWN_DEFAULTS.cycleBudget;

function marketWith(radish: number, lastUpdated = 0): MarketState {
  const market = newMarket();
  market.pressure.radish = radish;
  market.lastUpdated = lastUpdated;
  return market;
}

function newMarket(): MarketState {
  return createMarket({ sharedMarket: true });
}

describe('createMarket', () => {
  it('records the sharedMarket flag of the config (campaign runs have no pressure dynamics)', () => {
    expect(createMarket({ sharedMarket: true }).shared).toBe(true);
    expect(createMarket({ sharedMarket: false }).shared).toBe(false);
  });

  it('starts with zero pressure on every crop at cycle 0 (simulation-engine.md §Market)', () => {
    const market = newMarket();
    expect(market.lastUpdated).toBe(0);
    expect(marketPressures(market)).toEqual(CROP_IDS.map(() => 0));
  });
});

describe('advanceMarket', () => {
  it('does not decay at cycle 499 (simulation-engine.md §Market: once per multiple of 500)', () => {
    const market = marketWith(10);
    advanceMarket(market, DECAY - 1);
    expect(market.pressure.radish).toBe(10);
    expect(market.lastUpdated).toBe(DECAY - 1);
  });

  it('decays exactly at cycle 500: floorDiv(10 × 80, 100) = 8 (simulation-engine.md §Market)', () => {
    const market = marketWith(10);
    advanceMarket(market, DECAY);
    expect(market.pressure.radish).toBe(8);
    expect(market.lastUpdated).toBe(DECAY);
  });

  it('floors each step: 7 → 5 → 4 → 3 → 2 → 1 → 0 (floorDiv per step, never a rounded product)', () => {
    const seen: number[] = [];
    const market = marketWith(7);
    for (let k = 1; k <= 6; k += 1) {
      advanceMarket(market, k * DECAY);
      seen.push(market.pressure.radish);
    }
    expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('decays every crop independently', () => {
    const market = newMarket();
    market.pressure.radish = 50;
    market.pressure.corn = 10;
    market.pressure.melon = 3;
    advanceMarket(market, DECAY);
    expect(marketPressures(market)).toEqual([40, 8, 2]);
  });

  it('applies one step per multiple of 500 skipped by a long advance', () => {
    const market = marketWith(100);
    advanceMarket(market, 3 * DECAY);
    expect(market.pressure.radish).toBe(51); // 100 → 80 → 64 → 51
  });

  it('counts multiples in (lastUpdated, t]: a market last updated at 500 does not decay again at 500', () => {
    const market = marketWith(10, DECAY);
    advanceMarket(market, DECAY);
    expect(market.pressure.radish).toBe(10);
    advanceMarket(market, 2 * DECAY - 1);
    expect(market.pressure.radish).toBe(10);
    advanceMarket(market, 2 * DECAY);
    expect(market.pressure.radish).toBe(8);
  });

  it('is a no-op when t equals lastUpdated', () => {
    const market = marketWith(10, 123);
    advanceMarket(market, 123);
    expect(market).toEqual(marketWith(10, 123));
  });

  it('is compositional: advancing in pieces equals advancing at once (simulation-engine.md §Lazy world advancement)', () => {
    const pieces = marketWith(1_000);
    for (const t of [1, 499, 500, 501, 1_250, 1_251, 4_000, 4_000, 9_999, 10_000]) advanceMarket(pieces, t);
    const once = marketWith(1_000);
    advanceMarket(once, 10_000);
    expect(pieces).toEqual(once);
  });

  it('applies at most budget / 500 steps over a whole showdown', () => {
    const steps = BUDGET / DECAY;
    expect(steps).toBe(60);
    // A pressure large enough to survive every step: each step multiplies by 0.8 and floors.
    const market = marketWith(1_000_000_000);
    advanceMarket(market, BUDGET);
    let expected = 1_000_000_000;
    for (let i = 0; i < steps; i += 1) expected = Math.floor((expected * 80) / 100);
    expect(market.pressure.radish).toBe(expected);
    expect(market.pressure.radish).toBeGreaterThan(0);
  });

  it('keeps zero pressure at zero', () => {
    const market = newMarket();
    advanceMarket(market, BUDGET);
    expect(marketPressures(market)).toEqual([0, 0, 0]);
  });

  it('rejects going back in time (invariant violation)', () => {
    const market = marketWith(10, 600);
    expect(() => {
      advanceMarket(market, 599);
    }).toThrow(InvariantError);
    expect(() => {
      advanceMarket(market, 599);
    }).toThrow(/SIM-MARKET-TIME-REVERSED/);
  });
});

describe('marketPrice', () => {
  it('equals the base price at zero pressure', () => {
    const market = newMarket();
    for (const id of CROP_IDS) expect(marketPrice(market, id)).toBe(CROPS[id].basePrice);
  });

  it('falls by pressureStepBp per unit: corn at pressure 1 is floorDiv(18 × 9_800, 10_000) = 17', () => {
    const market = newMarket();
    market.pressure.corn = 1;
    expect(marketPrice(market, 'corn')).toBe(17);
  });

  it('floors the product: melon at pressure 3 is floorDiv(60 × 9_400, 10_000) = 56', () => {
    const market = newMarket();
    market.pressure.melon = 3;
    expect(marketPrice(market, 'melon')).toBe(56);
  });

  it('steps down with pressure for radish: ₵5 at 0, ₵4 from 1 to 10, ₵3 from 11', () => {
    const market = newMarket();
    const prices: number[] = [];
    for (let p = 0; p <= 11; p += 1) {
      market.pressure.radish = p;
      prices.push(marketPrice(market, 'radish'));
    }
    expect(prices).toEqual([5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3]);
  });

  it('reaches the floor at pressure 30 at the default step: radish is ₵2 (crops-and-economy.md §Scale)', () => {
    const steps = (BASIS_POINTS - MARKET.priceFloorBp) / MARKET.pressureStepBp;
    expect(steps).toBe(30);
    const market = marketWith(steps);
    expect(marketPrice(market, 'radish')).toBe(2);
  });

  it('never drops below the floor, however high the pressure', () => {
    const market = newMarket();
    market.pressure.melon = 1_000_000;
    expect(marketPrice(market, 'melon')).toBe(24); // floorDiv(60 × 4_000, 10_000)
    market.pressure.corn = 31;
    expect(marketPrice(market, 'corn')).toBe(7); // floorDiv(18 × 4_000, 10_000)
  });

  it('sees the decayed pressure once the market is advanced to exactly t = 500 (simulation-engine.md §Market)', () => {
    const market = newMarket();
    market.pressure.melon = 15; // priceBp 7_000 → ₵42
    advanceMarket(market, DECAY - 1);
    expect(marketPrice(market, 'melon')).toBe(42);
    advanceMarket(market, DECAY); // 15 → 12: priceBp 7_600 → ₵45
    expect(marketPrice(market, 'melon')).toBe(45);
  });
});

describe('marketPressures', () => {
  it('lists pressure in CROP_IDS order for the state hash (simulation-engine.md §State hash, item 2)', () => {
    const market = newMarket();
    market.pressure.radish = 1;
    market.pressure.corn = 2;
    market.pressure.melon = 3;
    expect(marketPressures(market)).toEqual([1, 2, 3]);
  });
});

describe('cloneMarket', () => {
  it('keeps the sharedMarket flag', () => {
    expect(cloneMarket(createMarket({ sharedMarket: false })).shared).toBe(false);
  });

  it('copies the state so later mutation of either side does not leak into the other', () => {
    const original = marketWith(10, 500);
    const copy = cloneMarket(original);
    expect(copy).toEqual(original);
    advanceMarket(original, 1_000);
    expect(copy).toEqual(marketWith(10, 500));
  });
});
