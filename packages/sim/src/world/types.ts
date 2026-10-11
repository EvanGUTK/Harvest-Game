/**
 * Tile data model shared by layout generation, lazy advancement and the state hash.
 * Design: docs/01-game-design/farm-simulation.md §Tile state, docs/03-architecture/simulation-engine.md.
 * Invariants: integers only; `crop.ripeAt` is the first cycle at which growth reached growCycles
 * (null until then); tiles are stored row-major (y then x) everywhere.
 */

import type { CropId } from '@harvest/content';

export type Soil = 'grass' | 'tilled' | 'rock';

export type Tile = {
  readonly soil: Soil;
  readonly moisture: number; // 0..100
  readonly lastUpdated: number; // cycle
  readonly crop: null | {
    readonly kind: CropId;
    readonly plantedAt: number;
    readonly growth: number;
    /** First cycle at which growth reached growCycles; null until ripe. Wither is measured from here. */
    readonly ripeAt: number | null;
    readonly withered: boolean;
  };
};
