/**
 * Shared market state: per-crop sale pressure, lazy decay and the price curve.
 * Design: docs/03-architecture/simulation-engine.md §Market, docs/01-game-design/crops-and-economy.md §Shared market.
 * Invariants: pressure is an integer ≥ 0; the market is only ever advanced forward in time; all
 * arithmetic is integer (floorDiv, basis points); crops are iterated in CROP_IDS order.
 */

import { BASIS_POINTS, CROP_IDS } from '@harvest/content';
import type { CropId, MARKET } from '@harvest/content';
import { floorDiv } from '@harvest/lang';
import type { SimConfig } from '../types';
import { InvariantError } from '../invariant';

/** The tunable market numbers: every key of content's MARKET, as plain numbers so a run can shadow them. */
export type MarketRules = { readonly [K in keyof typeof MARKET]: number };

/**
 * The part of the match `Rules` the market reads: its own numbers and the crops' base prices. The full `Rules`
 * object satisfies it structurally, so callers pass `rules` straight through.
 */
export type MarketEnv = {
  readonly market: MarketRules;
  readonly crops: Readonly<Record<CropId, { readonly basePrice: number }>>;
};

/** Plain, serializable market state. A value: every operation returns a new state and never writes into its input. */
export type MarketState = {
  /** Units sold into the market per crop, decayed over time. Integer ≥ 0. */
  readonly pressure: Readonly<Record<CropId, number>>;
  /** Cycle the pressure is current for; decay is applied for every multiple of `pressureDecayEvery` after it. */
  readonly lastUpdated: number;
  /**
   * `SimConfig.sharedMarket`. False is the campaign mode: no pressure dynamics, so sales add no pressure and
   * the price is always the base price. True is one market for the whole match, moved by every sale.
   */
  readonly shared: boolean;
};

/** A market with no pressure, current for cycle 0. */
export function createMarket(config: Pick<SimConfig, 'sharedMarket'>): MarketState {
  return { pressure: { radish: 0, corn: 0, melon: 0 }, lastUpdated: 0, shared: config.sharedMarket };
}

/** An independent copy, for snapshots. */
export function cloneMarket(market: MarketState): MarketState {
  return { ...market, pressure: { ...market.pressure } };
}

/** Pressure per crop in `CROP_IDS` order, as the state hash reads it (simulation-engine.md §State hash). */
export function marketPressures(market: MarketState): readonly number[] {
  return CROP_IDS.map((id) => market.pressure[id]);
}

function decayStepsBetween(from: number, to: number, rules: MarketRules): number {
  return floorDiv(to, rules.pressureDecayEvery) - floorDiv(from, rules.pressureDecayEvery);
}

function decayOnce(pressure: number, rules: MarketRules): number {
  return floorDiv(pressure * rules.pressureDecayNumerator, rules.pressureDecayDenominator);
}

function decayAll(pressure: Readonly<Record<CropId, number>>, rules: MarketRules): Record<CropId, number> {
  return {
    radish: decayOnce(pressure.radish, rules),
    corn: decayOnce(pressure.corn, rules),
    melon: decayOnce(pressure.melon, rules),
  };
}

/**
 * The market with one decay step applied for every multiple of `pressureDecayEvery` in `(lastUpdated, t]`, so a
 * sale or price read at exactly t = 500 (with the default rules) sees the decayed pressure. Advancing in pieces
 * equals advancing at once.
 */
export function advanceMarket(market: MarketState, t: number, rules: MarketEnv): MarketState {
  if (t < market.lastUpdated) {
    throw new InvariantError(
      'SIM-TIME-BACKWARDS',
      `market is current for cycle ${market.lastUpdated} and cannot be advanced to earlier cycle ${t}`,
    );
  }
  let pressure = market.pressure;
  for (let step = decayStepsBetween(market.lastUpdated, t, rules.market); step > 0; step -= 1)
    pressure = decayAll(pressure, rules.market);
  return { pressure, lastUpdated: t, shared: market.shared };
}

/**
 * The market price of one unit, as the `price()` sensor returns it. Reads the pressure as it stands,
 * so the caller advances the market to the current cycle first.
 */
export function marketPrice(market: MarketState, crop: CropId, rules: MarketEnv): number {
  const discountedBp = BASIS_POINTS - rules.market.pressureStepBp * market.pressure[crop];
  const priceBp = Math.max(rules.market.priceFloorBp, discountedBp);
  return floorDiv(rules.crops[crop].basePrice * priceBp, BASIS_POINTS);
}
