/**
 * The `sell` action against the shared market: one price per lot, pressure added afterwards.
 * Design: docs/03-architecture/simulation-engine.md §Market (Sale), docs/01-game-design/crops-and-economy.md §Shared market.
 * Invariants: the lot price is read once, before the sale; a sale of k ≤ 0 units changes nothing and
 * produces no lot; an unshared (campaign) market never gains pressure, so its price is always the base price.
 */

import type { CropId } from '@harvest/content';
import type { SimEvent } from '../index';
import { advanceMarket, marketPrice } from './market';
import type { MarketState } from './market';

/** The part of a farm that selling touches: its credits and its silo (units per crop). */
export type FarmLedger = {
  credits: number;
  silo: Record<CropId, number>;
};

/** What a `sell` event carries beyond its time, slot and drone. */
export type SaleLot = Pick<Extract<SimEvent, { k: 'sell' }>, 'crop' | 'n' | 'price' | 'credits'>;

export type SaleOutcome = {
  /** Credits gained; what the `sell` builtin returns. */
  gained: number;
  /** The lot to log as a `sell` event; null when nothing was sold. */
  lot: SaleLot | null;
};

const NOTHING_SOLD: SaleOutcome = { gained: 0, lot: null };

/**
 * Sells up to `n` units of `crop` from the farm's silo at cycle `t`. The market is advanced to `t` first,
 * so a sale at exactly t = 500 sees the decayed pressure.
 */
export function sell(market: MarketState, farm: FarmLedger, crop: CropId, n: number, t: number): SaleOutcome {
  advanceMarket(market, t);
  const units = Math.min(n, farm.silo[crop]);
  if (units <= 0) return NOTHING_SOLD;
  const price = marketPrice(market, crop);
  const gained = units * price;
  farm.silo[crop] -= units;
  farm.credits += gained;
  if (market.shared) market.pressure[crop] += units;
  return { gained, lot: { crop, n: units, price, credits: farm.credits } };
}
