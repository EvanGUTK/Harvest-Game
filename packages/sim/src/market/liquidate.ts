/**
 * End-of-match liquidation of every silo at a fraction of the final market price.
 * Design: docs/03-architecture/simulation-engine.md §Market (Liquidation), docs/01-game-design/crops-and-economy.md §End of match.
 * Invariants: farms and market are values, so the farms come back as new objects and the inputs are not
 * written; the floor is taken once per crop on the total; pressure is never changed, so every farm
 * liquidates at the same prices whatever the slot order; no event is produced (the caller logs none).
 */

import { BASIS_POINTS, CROP_IDS } from '@harvest/content';
import type { CropId } from '@harvest/content';
import { floorDiv } from '@harvest/lang';
import { advanceMarket, marketPrice } from './market';
import type { MarketEnv, MarketState } from './market';
import type { FarmLedger } from './sell';

function liquidationValue(market: MarketState, farm: FarmLedger, rules: MarketEnv): number {
  let total = 0;
  for (const crop of CROP_IDS) {
    total += floorDiv(
      farm.silo[crop] * marketPrice(market, crop, rules) * rules.market.liquidationBp,
      BASIS_POINTS,
    );
  }
  return total;
}

function emptySilo(): Record<CropId, number> {
  return { radish: 0, corn: 0, melon: 0 };
}

/**
 * Every farm's silo sold to the market at `liquidationBp` of the price at cycle `t` (the budget),
 * in the order given (slot order); the returned farms have empty silos and the extra credits. The market
 * is read as it stands at `t` and is not returned: liquidation leaves it unchanged.
 */
export function liquidate<F extends FarmLedger>(
  market: MarketState,
  farms: readonly F[],
  t: number,
  rules: MarketEnv,
): F[] {
  const final = advanceMarket(market, t, rules);
  return farms.map((farm) => ({
    ...farm,
    credits: farm.credits + liquidationValue(final, farm, rules),
    silo: emptySilo(),
  }));
}
