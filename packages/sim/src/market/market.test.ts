import { BASIS_POINTS, CROPS, CROP_IDS, MARKET, SHOWDOWN_DEFAULTS } from '@harvest/content';
import type { CropId } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { InvariantError } from '../invariant';
import { advanceMarket, cloneMarket, createMarket, marketPrice, marketPressures } from './market';
import type { MarketState } from './market';

const DECAY = MARKET.pressureDecayEvery;
const BUDGET = SHOWDOWN_DEFAULTS.cycleBudget;

function newMarket(): MarketState {
  return createMarket({ sharedMarket: true });
}

/** A shared market holding the given pressures, current for `lastUpdated`. */
function marketWith(pressure: Partial<Record<CropId, number>>, lastUpdated = 0): MarketState {
  const empty = newMarket();
  return { ...empty, pressure: { ...empty.pressure, ...pressure }, lastUpdated };
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
    const next = advanceMarket(marketWith({ radish: 10 }), DECAY - 1);
    expect(next.pressure.radish).toBe(10);
    expect(next.lastUpdated).toBe(DECAY - 1);
  });

  it('decays exactly at cycle 500: floorDiv(10 × 80, 100) = 8 (simulation-engine.md §Market)', () => {
    const next = advanceMarket(marketWith({ radish: 10 }), DECAY);
    expect(next.pressure.radish).toBe(8);
    expect(next.lastUpdated).toBe(DECAY);
  });

  it('floors each step: 7 → 5 → 4 → 3 → 2 → 1 → 0 (floorDiv per step, never a rounded product)', () => {
    const seen: number[] = [];
    let market = marketWith({ radish: 7 });
    for (let k = 1; k <= 6; k += 1) {
      market = advanceMarket(market, k * DECAY);
      seen.push(market.pressure.radish);
    }
    expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('decays every crop independently', () => {
    const next = advanceMarket(marketWith({ radish: 50, corn: 10, melon: 3 }), DECAY);
    expect(marketPressures(next)).toEqual([40, 8, 2]);
  });

  it('applies one step per multiple of 500 skipped by a long advance', () => {
    const next = advanceMarket(marketWith({ radish: 100 }), 3 * DECAY);
    expect(next.pressure.radish).toBe(51); // 100 → 80 → 64 → 51
  });

  it('counts multiples in (lastUpdated, t]: a market last updated at 500 does not decay again at 500', () => {
    let market = marketWith({ radish: 10 }, DECAY);
    market = advanceMarket(market, DECAY);
    expect(market.pressure.radish).toBe(10);
    market = advanceMarket(market, 2 * DECAY - 1);
    expect(market.pressure.radish).toBe(10);
    market = advanceMarket(market, 2 * DECAY);
    expect(market.pressure.radish).toBe(8);
  });

  it('keeps the same state when t equals lastUpdated', () => {
    const market = marketWith({ radish: 10 }, 123);
    expect(advanceMarket(market, 123)).toEqual(market);
  });

  it('is compositional: advancing in pieces equals advancing at once (simulation-engine.md §Lazy world advancement)', () => {
    let pieces = marketWith({ radish: 1_000 });
    for (const t of [1, 499, 500, 501, 1_250, 1_251, 4_000, 4_000, 9_999, 10_000])
      pieces = advanceMarket(pieces, t);
    expect(pieces).toEqual(advanceMarket(marketWith({ radish: 1_000 }), 10_000));
  });

  it('applies at most budget / 500 steps over a whole showdown', () => {
    const steps = BUDGET / DECAY;
    expect(steps).toBe(60);
    // A pressure large enough to survive every step: each step multiplies by 0.8 and floors.
    const next = advanceMarket(marketWith({ radish: 1_000_000_000 }), BUDGET);
    let expected = 1_000_000_000;
    for (let i = 0; i < steps; i += 1) expected = Math.floor((expected * 80) / 100);
    expect(next.pressure.radish).toBe(expected);
    expect(next.pressure.radish).toBeGreaterThan(0);
  });

  it('keeps zero pressure at zero', () => {
    expect(marketPressures(advanceMarket(newMarket(), BUDGET))).toEqual([0, 0, 0]);
  });

  it('keeps the sharedMarket flag', () => {
    expect(advanceMarket(createMarket({ sharedMarket: false }), DECAY).shared).toBe(false);
  });

  it('is a value: the input market is deep-equal to a clone taken before the call', () => {
    const market = marketWith({ radish: 40, corn: 9 }, 100);
    const before = cloneMarket(market);
    advanceMarket(market, 3 * DECAY);
    expect(market).toEqual(before);
  });

  it('rejects going back in time with SIM-TIME-BACKWARDS (invariant violation)', () => {
    const market = marketWith({ radish: 10 }, 600);
    expect(() => advanceMarket(market, 599)).toThrow(InvariantError);
    expect(() => advanceMarket(market, 599)).toThrow(/SIM-TIME-BACKWARDS/);
  });
});

describe('marketPrice', () => {
  it('equals the base price at zero pressure', () => {
    for (const id of CROP_IDS) expect(marketPrice(newMarket(), id)).toBe(CROPS[id].basePrice);
  });

  it('falls by pressureStepBp per unit: corn at pressure 1 is floorDiv(18 × 9_800, 10_000) = 17', () => {
    expect(marketPrice(marketWith({ corn: 1 }), 'corn')).toBe(17);
  });

  it('floors the product: melon at pressure 3 is floorDiv(60 × 9_400, 10_000) = 56', () => {
    expect(marketPrice(marketWith({ melon: 3 }), 'melon')).toBe(56);
  });

  it('steps down with pressure for radish: ₵5 at 0, ₵4 from 1 to 10, ₵3 from 11', () => {
    const prices: number[] = [];
    for (let p = 0; p <= 11; p += 1) prices.push(marketPrice(marketWith({ radish: p }), 'radish'));
    expect(prices).toEqual([5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3]);
  });

  it('reaches the floor at pressure 30 at the default step: radish is ₵2 (crops-and-economy.md §Scale)', () => {
    const steps = (BASIS_POINTS - MARKET.priceFloorBp) / MARKET.pressureStepBp;
    expect(steps).toBe(30);
    expect(marketPrice(marketWith({ radish: steps }), 'radish')).toBe(2);
  });

  it('never drops below the floor, however high the pressure', () => {
    const market = marketWith({ melon: 1_000_000, corn: 31 });
    expect(marketPrice(market, 'melon')).toBe(24); // floorDiv(60 × 4_000, 10_000)
    expect(marketPrice(market, 'corn')).toBe(7); // floorDiv(18 × 4_000, 10_000)
  });

  it('sees the decayed pressure once the market is advanced to exactly t = 500 (simulation-engine.md §Market)', () => {
    const market = marketWith({ melon: 15 }); // priceBp 7_000 → ₵42
    expect(marketPrice(advanceMarket(market, DECAY - 1), 'melon')).toBe(42);
    // 15 → 12: priceBp 7_600 → ₵45
    expect(marketPrice(advanceMarket(market, DECAY), 'melon')).toBe(45);
  });
});

describe('marketPressures', () => {
  it('lists pressure in CROP_IDS order for the state hash (simulation-engine.md §State hash, item 2)', () => {
    expect(marketPressures(marketWith({ radish: 1, corn: 2, melon: 3 }))).toEqual([1, 2, 3]);
  });
});

describe('cloneMarket', () => {
  it('copies the state, including the sharedMarket flag, into separate objects', () => {
    const original = marketWith({ radish: 10 }, 500);
    const copy = cloneMarket(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.pressure).not.toBe(original.pressure);
    expect(cloneMarket(createMarket({ sharedMarket: false })).shared).toBe(false);
  });
});
