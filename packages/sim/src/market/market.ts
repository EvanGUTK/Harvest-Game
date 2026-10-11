/**
 * Shared market state: per-crop sale pressure, lazy decay and the price curve.
 * Design: docs/03-architecture/simulation-engine.md §Market, docs/01-game-design/crops-and-economy.md §Shared market.
 * Invariants: pressure is an integer ≥ 0; the market is only ever advanced forward in time; all
 * arithmetic is integer (floorDiv, basis points); crops are iterated in CROP_IDS order.
 */

import { BASIS_POINTS, CROPS, CROP_IDS, MARKET, type CropId } from '@harvest/content';
import { floorDiv } from '@harvest/lang';
import type { SimConfig } from '../index';
import { InvariantError } from '../invariant';

/** Plain, serializable market state. Mutated in place by this module only. */
export type MarketState = {
  /** Units sold into the market per crop, decayed over time. Integer ≥ 0. */
  pressure: Record<CropId, number>;
  /** Cycle the pressure is current for; decay is applied for every multiple of 500 after it. */
  lastUpdated: number;
  /**
   * `SimConfig.sharedMarket`. False is the campaign mode: no pressure dynamics, so sales add no pressure and
   * the price is always the base price. True is one market for the whole match, moved by every sale.
   */
  shared: boolean;
};

/** A market with no pressure, current for cycle 0. */
export function createMarket(config: Pick<SimConfig, 'sharedMarket'>): MarketState {
  return { pressure: { radish: 0, corn: 0, melon: 0 }, lastUpdated: 0, shared: config.sharedMarket };
}

/** An independent copy, for snapshots. */
export function cloneMarket(market: MarketState): MarketState {
  return { pressure: { ...market.pressure }, lastUpdated: market.lastUpdated, shared: market.shared };
}

/** Pressure per crop in `CROP_IDS` order, as the state hash reads it (simulation-engine.md §State hash). */
export function marketPressures(market: MarketState): readonly number[] {
  return CROP_IDS.map((id) => market.pressure[id]);
}

function decayStepsBetween(from: number, to: number): number {
  return floorDiv(to, MARKET.pressureDecayEvery) - floorDiv(from, MARKET.pressureDecayEvery);
}

function decayOnce(pressure: number): number {
  return floorDiv(pressure * MARKET.pressureDecayNumerator, MARKET.pressureDecayDenominator);
}

/**
 * Applies one decay step for every multiple of 500 in `(lastUpdated, t]`, so a sale or price read at
 * exactly `t = 500` sees the decayed pressure. Advancing in pieces equals advancing at once.
 */
export function advanceMarket(market: MarketState, t: number): void {
  if (t < market.lastUpdated) {
    throw new InvariantError(
      'SIM-MARKET-TIME-REVERSED',
      `market is current for cycle ${market.lastUpdated} and cannot be advanced to earlier cycle ${t}`,
    );
  }
  for (let step = decayStepsBetween(market.lastUpdated, t); step > 0; step -= 1) {
    for (const id of CROP_IDS) market.pressure[id] = decayOnce(market.pressure[id]);
  }
  market.lastUpdated = t;
}

/**
 * The market price of one unit, as the `price()` sensor returns it. Reads the pressure as it stands,
 * so the caller advances the market to the current cycle first.
 */
export function marketPrice(market: MarketState, crop: CropId): number {
  const discountedBp = BASIS_POINTS - MARKET.pressureStepBp * market.pressure[crop];
  const priceBp = Math.max(MARKET.priceFloorBp, discountedBp);
  return floorDiv(CROPS[crop].basePrice * priceBp, BASIS_POINTS);
}
