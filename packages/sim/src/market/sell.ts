/**
 * The `sell` action against the shared market: one price per lot, pressure added afterwards.
 * Design: docs/03-architecture/simulation-engine.md §Market (Sale), docs/01-game-design/crops-and-economy.md §Shared market.
 * Invariants: market and farm are values, so a sale returns new ones and never writes into its inputs; the
 * lot price is read once, before the sale; a sale of k ≤ 0 units changes nothing and produces no lot; an
 * unshared (campaign) market never gains pressure, so its price is always the base price.
 */

import type { CropId } from '@harvest/content';
import type { SimEvent } from '../types';
import { advanceMarket, marketPrice } from './market';
import type { MarketEnv, MarketState } from './market';

/** The part of a farm that selling touches: its credits and its silo (units per crop). */
export type FarmLedger = {
  readonly credits: number;
  readonly silo: Readonly<Record<CropId, number>>;
};

/** What a `sell` event carries beyond its time, slot and drone. */
export type SaleLot = Pick<Extract<SimEvent, { k: 'sell' }>, 'crop' | 'n' | 'price' | 'credits'>;

export type SaleOutcome<F extends FarmLedger> = {
  /** The market advanced to the sale's cycle, with the sold units added as pressure. */
  market: MarketState;
  /** The farm after the sale; every field other than `credits` and `silo` is carried over. */
  farm: F;
  /** Credits gained; what the `sell` builtin returns. */
  gained: number;
  /** The lot to log as a `sell` event; null when nothing was sold. */
  lot: SaleLot | null;
};

function withAddedPressure(market: MarketState, crop: CropId, units: number): MarketState {
  if (!market.shared) return market;
  return { ...market, pressure: { ...market.pressure, [crop]: market.pressure[crop] + units } };
}

/**
 * Sells up to `n` units of `crop` from the farm's silo at cycle `t`. The market is advanced to `t` first,
 * so a sale at exactly t = 500 sees the decayed pressure.
 */
export function sell<F extends FarmLedger>(
  market: MarketState,
  farm: F,
  crop: CropId,
  n: number,
  t: number,
  rules: MarketEnv,
): SaleOutcome<F> {
  const current = advanceMarket(market, t, rules);
  const units = Math.min(n, farm.silo[crop]);
  if (units <= 0) return { market: current, farm, gained: 0, lot: null };
  const price = marketPrice(current, crop, rules);
  const gained = units * price;
  const credits = farm.credits + gained;
  return {
    market: withAddedPressure(current, crop, units),
    farm: { ...farm, credits, silo: { ...farm.silo, [crop]: farm.silo[crop] - units } },
    gained,
    lot: { crop, n: units, price, credits },
  };
}
