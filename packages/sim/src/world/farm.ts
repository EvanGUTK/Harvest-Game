/**
 * One player's farm: credits, silo, the shared water tank and the tiles (row-major, y then x).
 * Design: docs/03-architecture/simulation-engine.md §Lazy world advancement and §Clock arithmetic (one farm, two
 * drones share credits, silo and water), docs/01-game-design/farm-simulation.md §Tile state.
 * Invariants: values are never mutated; `everDryPaused` is sticky and feeds the Never Thirsty award but is not
 * part of the state hash; drone position and clock belong to drones, not to the farm.
 */

import type { CropId } from '@harvest/content';
import { advanceTileDetailed, type AdvanceRules } from './advance';
import { InvariantError } from '../invariant';
import type { Coord, Tile } from '../types';

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

/** Row-major index (y then x) of a tile; a position outside the grid is an invariant violation. */
export function tileIndex(gridSize: number, [x, y]: Coord): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= gridSize || y >= gridSize) {
    throw new InvariantError('SIM-BAD-COORD', `(${x},${y}) is outside a ${gridSize}×${gridSize} grid`);
  }
  return y * gridSize + x;
}

/** Advance the one tile at `pos` to cycle `t` and return it with the farm that now holds it. */
export function touchTile(
  farm: Farm,
  gridSize: number,
  pos: Coord,
  t: number,
  rules: AdvanceRules,
): { farm: Farm; tile: Tile } {
  const index = tileIndex(gridSize, pos);
  const current = farm.tiles[index];
  if (current === undefined) throw new InvariantError('SIM-BAD-COORD', `farm has no tile at index ${index}`);
  const advanced = advanceTileDetailed(current, t, rules);
  return {
    farm: withTile(farm, index, advanced.tile, farm.everDryPaused || advanced.dryPaused),
    tile: advanced.tile,
  };
}

/** The farm with the tile at `index` replaced; other fields are kept. */
export function withTile(farm: Farm, index: number, tile: Tile, everDryPaused = farm.everDryPaused): Farm {
  return { ...farm, tiles: farm.tiles.map((existing, i) => (i === index ? tile : existing)), everDryPaused };
}
