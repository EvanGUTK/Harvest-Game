/**
 * End-of-match liquidation of every silo at a fraction of the final market price.
 * Design: docs/03-architecture/simulation-engine.md §Market (Liquidation), docs/01-game-design/crops-and-economy.md §End of match.
 * Invariants: the floor is taken once per crop on the total; pressure is never changed, so every farm
 * liquidates at the same prices whatever the slot order; no event is produced (the caller logs none).
 */

import { BASIS_POINTS, CROP_IDS, MARKET } from '@harvest/content';
import { floorDiv } from '@harvest/lang';
import { advanceMarket, marketPrice } from './market';
import type { MarketState } from './market';
import type { FarmLedger } from './sell';

/**
 * Sells every farm's silo to the market at `MARKET.liquidationBp` of the price at cycle `t` (the budget),
 * farms in slot order, crops in `CROP_IDS` order. The silos end empty.
 */
export function liquidate(market: MarketState, farms: readonly FarmLedger[], t: number): void {
  advanceMarket(market, t);
  for (const farm of farms) {
    for (const crop of CROP_IDS) {
      const price = marketPrice(market, crop);
      farm.credits += floorDiv(farm.silo[crop] * price * MARKET.liquidationBp, BASIS_POINTS);
      farm.silo[crop] = 0;
    }
  }
}
