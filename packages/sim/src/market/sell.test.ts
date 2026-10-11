import { MARKET } from '@harvest/content';
import type { CropId } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { advanceMarket, createMarket, marketPressures } from './market';
import type { MarketState } from './market';
import { sell } from './sell';
import type { FarmLedger } from './sell';

const DECAY = MARKET.pressureDecayEvery;

function market(shared = true): MarketState {
  return createMarket({ sharedMarket: shared });
}

function marketWith(pressure: Partial<Record<CropId, number>>, shared = true): MarketState {
  const empty = market(shared);
  return { ...empty, pressure: { ...empty.pressure, ...pressure } };
}

function farm(silo: Partial<Record<CropId, number>> = {}, credits = 100): FarmLedger {
  return { credits, silo: { radish: 0, corn: 0, melon: 0, ...silo } };
}

function cloneFarm<F extends FarmLedger>(f: F): F {
  return { ...f, silo: { ...f.silo } };
}

describe('sell', () => {
  it('sells k = min(n, silo) units at the pre-sale price: 4 radish at ₵5 gain 20 (simulation-engine.md §Market, Sale)', () => {
    const outcome = sell(market(), farm({ radish: 10 }), 'radish', 4, 0);
    expect(outcome.gained).toBe(20);
    expect(outcome.farm.credits).toBe(120);
    expect(outcome.farm.silo.radish).toBe(6);
    expect(outcome.market.pressure.radish).toBe(4);
  });

  it('sells only what the silo holds when n is larger: 20 asked, 3 corn held, 3 × ₵18 = 54', () => {
    const outcome = sell(market(), farm({ corn: 3 }), 'corn', 20, 0);
    expect(outcome.gained).toBe(54);
    expect(outcome.farm.silo.corn).toBe(0);
    expect(outcome.market.pressure.corn).toBe(3);
  });

  it('reports the lot as a sell event payload with the single lot price and the balance after the sale', () => {
    const outcome = sell(market(), farm({ melon: 2 }, 40), 'melon', 2, 700);
    expect(outcome.lot).toEqual({ crop: 'melon', n: 2, price: 60, credits: 160 });
  });

  it('prices the whole lot before the sale: one sell of 12 radish at pressure 0 gains 12 × 5 = 60', () => {
    expect(sell(market(), farm({ radish: 12 }), 'radish', 12, 0).gained).toBe(60);
  });

  it('walks down the curve when the same 12 radish go one per call: 5 + 10 × 4 + 3 = 48 (crops-and-economy.md §Lot pricing)', () => {
    let m = market();
    let f = farm({ radish: 12 });
    let total = 0;
    for (let i = 0; i < 12; i += 1) {
      const outcome = sell(m, f, 'radish', 1, 0);
      m = outcome.market;
      f = outcome.farm;
      total += outcome.gained;
    }
    // pressure 0 → ₵5; pressure 1..10 → priceBp 9_800..8_000 → ₵4; pressure 11 → priceBp 7_800 → ₵3
    expect(total).toBe(48);
    expect(m.pressure.radish).toBe(12);
    expect(f.credits).toBe(148);
  });

  it('changes nothing and emits no lot when n is 0', () => {
    const m = market();
    const f = farm({ radish: 5 });
    const outcome = sell(m, f, 'radish', 0, 0);
    expect(outcome).toEqual({ market: m, farm: f, gained: 0, lot: null });
  });

  it('changes nothing and emits no lot when n is negative', () => {
    const m = market();
    const f = farm({ radish: 5 });
    expect(sell(m, f, 'radish', -3, 0)).toEqual({ market: m, farm: f, gained: 0, lot: null });
  });

  it('leaves the pressure untouched when the silo is empty (k ≤ 0)', () => {
    const outcome = sell(marketWith({ radish: 7 }), farm(), 'radish', 5, 0);
    expect(outcome.lot).toBeNull();
    expect(outcome.gained).toBe(0);
    expect(outcome.market.pressure.radish).toBe(7);
    expect(outcome.farm.credits).toBe(100);
  });

  it('sees the decayed pressure at exactly t = 500: melon at pressure 15 sells for ₵45 after decay to 12, not ₵42', () => {
    const outcome = sell(marketWith({ melon: 15 }), farm({ melon: 1 }), 'melon', 1, DECAY);
    // 15 → floorDiv(15 × 80, 100) = 12 → priceBp 7_600 → floorDiv(60 × 7_600, 10_000) = 45
    expect(outcome.gained).toBe(45);
    expect(outcome.market.pressure.melon).toBe(13);
    expect(outcome.market.lastUpdated).toBe(DECAY);
  });

  it('does not see the decay one cycle earlier: at t = 499 the same melon sells for ₵42', () => {
    expect(sell(marketWith({ melon: 15 }), farm({ melon: 1 }), 'melon', 1, DECAY - 1).gained).toBe(42);
  });

  it('sells at the floor price when pressure is 30: radish ₵2 (crops-and-economy.md §Scale)', () => {
    expect(sell(marketWith({ radish: 30 }), farm({ radish: 1 }), 'radish', 1, 0).gained).toBe(2);
  });

  it('lets one farm sell into the pressure another farm created (shared market)', () => {
    const first = sell(market(), farm({ radish: 11 }), 'radish', 11, 0);
    expect(first.gained).toBe(55);
    // pressure is now 11 → priceBp 7_800 → floorDiv(5 × 7_800, 10_000) = 3
    expect(sell(first.market, farm({ radish: 1 }), 'radish', 1, 0).gained).toBe(3);
  });

  it('moves only the pressure of the crop sold', () => {
    const outcome = sell(market(), farm({ corn: 2 }), 'corn', 2, 0);
    expect(marketPressures(outcome.market)).toEqual([0, 2, 0]);
  });

  it('adds no pressure and always pays the base price when the market is not shared (campaign, SimConfig.sharedMarket = false)', () => {
    const first = sell(market(false), farm({ melon: 40 }), 'melon', 20, 0);
    const second = sell(first.market, first.farm, 'melon', 20, 0);
    expect([first.gained, second.gained]).toEqual([1_200, 1_200]);
    expect(marketPressures(second.market)).toEqual([0, 0, 0]);
  });

  it('still reports a lot for an unshared sale and still empties the silo', () => {
    const outcome = sell(market(false), farm({ radish: 3 }, 0), 'radish', 3, 0);
    expect(outcome.lot).toEqual({ crop: 'radish', n: 3, price: 5, credits: 15 });
    expect(outcome.farm.silo.radish).toBe(0);
  });

  it('advances the market to t before selling (decay happens even when no price was read first)', () => {
    const outcome = sell(marketWith({ radish: 10 }), farm({ radish: 1 }), 'radish', 1, 3 * DECAY);
    // 10 → 8 → 6 → 4, then the sale adds 1
    expect(outcome.market.pressure.radish).toBe(5);
  });

  it('keeps the market clock at t even when nothing was sold', () => {
    const outcome = sell(advanceMarket(market(), 100), farm(), 'radish', 1, 100);
    expect(outcome.market.lastUpdated).toBe(100);
  });

  it('carries every other farm field over unchanged', () => {
    const rich = { ...farm({ corn: 2 }), water: 37, position: [3, 4] as const };
    const outcome = sell(market(), rich, 'corn', 1, 0);
    expect(outcome.farm.water).toBe(37);
    expect(outcome.farm.position).toBe(rich.position);
  });

  it('is a value: the input market and farm equal pre-call clones after a sale (no write into inputs)', () => {
    const m = marketWith({ radish: 6, corn: 2 });
    const f = farm({ radish: 9, corn: 1 }, 55);
    const marketBefore = { ...m, pressure: { ...m.pressure } };
    const farmBefore = cloneFarm(f);
    sell(m, f, 'radish', 4, 3 * DECAY);
    expect(m).toEqual(marketBefore);
    expect(f).toEqual(farmBefore);
  });

  it('returns a new silo record, so an earlier farm value never changes after a later sale', () => {
    const f = farm({ radish: 5 });
    const first = sell(market(), f, 'radish', 2, 0);
    const second = sell(first.market, first.farm, 'radish', 2, 0);
    expect(first.farm.silo.radish).toBe(3);
    expect(second.farm.silo.radish).toBe(1);
    expect(f.silo.radish).toBe(5);
    expect(second.farm.silo).not.toBe(first.farm.silo);
  });
});
