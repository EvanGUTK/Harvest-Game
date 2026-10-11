/**
 * One player's farm: credits, silo, the shared water tank and the tiles (row-major, y then x).
 * Design: docs/03-architecture/simulation-engine.md §Lazy world advancement and §Clock arithmetic (one farm, two
 * drones share credits, silo and water), docs/01-game-design/farm-simulation.md §Tile state.
 * Invariants: values are never mutated; `everDryPaused` is sticky and feeds the Never Thirsty award but is not
 * part of the state hash; drone position and clock belong to drones, not to the farm.
 */

import type { CropId } from '@harvest/content';
import { advanceTileDetailed, type AdvanceRules } from './advance';
import type { Tile } from '../types';

export type Farm = {
  readonly credits: number;
  /** Harvested units per crop. */
  readonly silo: Readonly<Record<CropId, number>>;
  /** Units left in the one tank both drones draw from. */
  readonly water: number;
  /** Row-major (y then x). */
  readonly tiles: readonly Tile[];
  /** True once an advance found a dry gap on an unripe, unwithered crop; never reset. */
  readonly everDryPaused: boolean;
};

/** The farm with every tile advanced to cycle `t`; `everDryPaused` becomes true if any tile paused dry. */
export function advanceFarm(farm: Farm, t: number, rules: AdvanceRules): Farm {
  let everDryPaused = farm.everDryPaused;
  const tiles = farm.tiles.map((tile) => {
    const advanced = advanceTileDetailed(tile, t, rules);
    everDryPaused ||= advanced.dryPaused;
    return advanced.tile;
  });
  return { ...farm, tiles, everDryPaused };
}
