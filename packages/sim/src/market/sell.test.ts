import { MARKET } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { advanceMarket, createMarket, marketPressures } from './market';
import type { MarketState } from './market';
import { sell } from './sell';
import type { FarmLedger } from './sell';

const DECAY = MARKET.pressureDecayEvery;

function market(shared = true): MarketState {
  return createMarket({ sharedMarket: shared });
}

function farm(over: Partial<FarmLedger['silo']> = {}, credits = 100): FarmLedger {
  return { credits, silo: { radish: 0, corn: 0, melon: 0, ...over } };
}

describe('sell', () => {
  it('sells k = min(n, silo) units at the pre-sale price: 4 radish at ₵5 gain 20 (simulation-engine.md §Market, Sale)', () => {
    const m = market();
    const f = farm({ radish: 10 });
    const outcome = sell(m, f, 'radish', 4, 0);
    expect(outcome.gained).toBe(20);
    expect(f.credits).toBe(120);
    expect(f.silo.radish).toBe(6);
    expect(m.pressure.radish).toBe(4);
  });

  it('sells only what the silo holds when n is larger: 20 asked, 3 corn held, 3 × ₵18 = 54', () => {
    const m = market();
    const f = farm({ corn: 3 });
    const outcome = sell(m, f, 'corn', 20, 0);
    expect(outcome.gained).toBe(54);
    expect(f.silo.corn).toBe(0);
    expect(m.pressure.corn).toBe(3);
  });

  it('reports the lot as a sell event payload with the single lot price and the balance after the sale', () => {
    const f = farm({ melon: 2 }, 40);
    const outcome = sell(market(), f, 'melon', 2, 700);
    expect(outcome.lot).toEqual({ crop: 'melon', n: 2, price: 60, credits: 160 });
  });

  it('prices the whole lot before the sale: one sell of 12 radish at pressure 0 gains 12 × 5 = 60', () => {
    const f = farm({ radish: 12 });
    expect(sell(market(), f, 'radish', 12, 0).gained).toBe(60);
  });

  it('walks down the curve when the same 12 radish go one per call: 5 + 10 × 4 + 3 = 48 (crops-and-economy.md §Lot pricing)', () => {
    const m = market();
    const f = farm({ radish: 12 });
    let total = 0;
    for (let i = 0; i < 12; i += 1) total += sell(m, f, 'radish', 1, 0).gained;
    // pressure 0 → ₵5; pressure 1..10 → priceBp 9_800..8_000 → ₵4; pressure 11 → priceBp 7_800 → ₵3
    expect(total).toBe(48);
    expect(m.pressure.radish).toBe(12);
  });

  it('leaves everything untouched and emits no lot when n is 0', () => {
    const m = market();
    const f = farm({ radish: 5 });
    const outcome = sell(m, f, 'radish', 0, 0);
    expect(outcome).toEqual({ gained: 0, lot: null });
    expect(f).toEqual(farm({ radish: 5 }));
    expect(m.pressure.radish).toBe(0);
  });

  it('leaves everything untouched and emits no lot when n is negative', () => {
    const m = market();
    const f = farm({ radish: 5 });
    expect(sell(m, f, 'radish', -3, 0)).toEqual({ gained: 0, lot: null });
    expect(f).toEqual(farm({ radish: 5 }));
    expect(m.pressure.radish).toBe(0);
  });

  it('leaves the pressure untouched when the silo is empty (k ≤ 0)', () => {
    const m = market();
    m.pressure.radish = 7;
    const f = farm();
    expect(sell(m, f, 'radish', 5, 0)).toEqual({ gained: 0, lot: null });
    expect(m.pressure.radish).toBe(7);
    expect(f.credits).toBe(100);
  });

  it('sees the decayed pressure at exactly t = 500: melon at pressure 15 sells for ₵45 after decay to 12, not ₵42', () => {
    const m = market();
    m.pressure.melon = 15;
    const f = farm({ melon: 1 });
    const outcome = sell(m, f, 'melon', 1, DECAY);
    // 15 → floorDiv(15 × 80, 100) = 12 → priceBp 7_600 → floorDiv(60 × 7_600, 10_000) = 45
    expect(outcome.gained).toBe(45);
    expect(m.pressure.melon).toBe(13);
    expect(m.lastUpdated).toBe(DECAY);
  });

  it('does not see the decay one cycle earlier: at t = 499 the same melon sells for ₵42', () => {
    const m = market();
    m.pressure.melon = 15;
    expect(sell(m, farm({ melon: 1 }), 'melon', 1, DECAY - 1).gained).toBe(42);
  });

  it('sells at the floor price when pressure is 30: radish ₵2 (crops-and-economy.md §Scale)', () => {
    const m = market();
    m.pressure.radish = 30;
    expect(sell(m, farm({ radish: 1 }), 'radish', 1, 0).gained).toBe(2);
  });

  it('lets one farm sell into the pressure another farm created (shared market)', () => {
    const m = market();
    const first = farm({ radish: 11 });
    const second = farm({ radish: 1 });
    expect(sell(m, first, 'radish', 11, 0).gained).toBe(55);
    // pressure is now 11 → priceBp 7_800 → floorDiv(5 × 7_800, 10_000) = 3
    expect(sell(m, second, 'radish', 1, 0).gained).toBe(3);
  });

  it('moves only the pressure of the crop sold', () => {
    const m = market();
    sell(m, farm({ corn: 2 }), 'corn', 2, 0);
    expect(marketPressures(m)).toEqual([0, 2, 0]);
  });

  it('adds no pressure and always pays the base price when the market is not shared (campaign, SimConfig.sharedMarket = false)', () => {
    const m = market(false);
    const f = farm({ melon: 40 });
    expect(sell(m, f, 'melon', 20, 0).gained).toBe(1_200);
    expect(sell(m, f, 'melon', 20, 0).gained).toBe(1_200);
    expect(marketPressures(m)).toEqual([0, 0, 0]);
  });

  it('still reports a lot for an unshared sale and still empties the silo', () => {
    const f = farm({ radish: 3 }, 0);
    const outcome = sell(market(false), f, 'radish', 3, 0);
    expect(outcome.lot).toEqual({ crop: 'radish', n: 3, price: 5, credits: 15 });
    expect(f.silo.radish).toBe(0);
  });

  it('advances the market to t before selling (decay happens even when no price was read first)', () => {
    const m = market();
    m.pressure.radish = 10;
    sell(m, farm({ radish: 1 }), 'radish', 1, 3 * DECAY);
    // 10 → 8 → 6 → 4, then the sale adds 1
    expect(m.pressure.radish).toBe(5);
  });

  it('does not change the market clock when nothing was sold at an earlier t', () => {
    const m = market();
    advanceMarket(m, 100);
    sell(m, farm(), 'radish', 1, 100);
    expect(m.lastUpdated).toBe(100);
  });
});
