/**
 * Procedural farm layout: the one starting soil and moisture map every slot's farm copies.
 * Design: docs/03-architecture/simulation-engine.md §PRNG seeding (Layout bullet), farm-simulation.md §Rocks and seeds.
 * Invariants: consumed once per match from the `layout` stream; tiles are visited row-major (y then x)
 * and each draws moisture then the rock roll, both always, so the stream state and every hash are
 * independent of the rocks modifier; the well tile is never rock; rock density lives in `content`;
 * an invalid grid size or moisture range is an invariant violation, never a NaN in the hash.
 */

import { BASIS_POINTS, WORLD } from '@harvest/content';
import { InvariantError } from '../invariant';
import type { Sfc32 } from '../prng/sfc32';
import type { Tile } from './types';

export type LayoutConfig = {
  readonly gridSize: number;
  /** Inclusive starting moisture range (showdown 0–40; campaign before the Water node 100–100). */
  readonly startMoisture: { readonly min: number; readonly max: number };
  /** The `rocks` modifier: ranked has none in v1. */
  readonly rocks: boolean;
};

function isWell(x: number, y: number): boolean {
  return x === WORLD.wellTile[0] && y === WORLD.wellTile[1];
}

function assertValidConfig({ gridSize, startMoisture }: LayoutConfig): void {
  if (!Number.isInteger(gridSize) || gridSize < 1) {
    throw new InvariantError('SIM-BAD-GRID', `grid size must be an integer ≥ 1, got ${gridSize}`);
  }
  const { min, max } = startMoisture;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || min > max || max > WORLD.moistureMax) {
    throw new InvariantError(
      'SIM-BAD-MOISTURE-RANGE',
      `starting moisture must be integers with 0 ≤ min ≤ max ≤ ${WORLD.moistureMax}, got ${min}..${max}`,
    );
  }
}

/** The starting tiles of a farm, row-major (y then x), drawn from the match's `layout` stream. */
export function generateLayout(layout: Sfc32, config: LayoutConfig): Tile[] {
  assertValidConfig(config);
  const { gridSize, startMoisture, rocks } = config;
  const moistureSpan = startMoisture.max - startMoisture.min + 1;
  const tiles: Tile[] = [];
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const moisture = startMoisture.min + (layout.next() % moistureSpan);
      const rockRoll = layout.next() % BASIS_POINTS;
      const isRock = rocks && rockRoll < WORLD.rockDensityBp && !isWell(x, y);
      tiles.push({ soil: isRock ? 'rock' : 'grass', moisture, lastUpdated: 0, crop: null });
    }
  }
  return tiles;
}
