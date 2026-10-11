/**
 * Tile data model shared by layout generation, lazy advancement and the state hash.
 * Design: docs/01-game-design/farm-simulation.md §Tile state, docs/03-architecture/simulation-engine.md.
 * Invariants: integers only; `crop.ripeAt` is the first cycle at which growth reached growCycles
 * (null until then); tiles are stored row-major (y then x) everywhere.
 */

import type { CropId } from '@harvest/content';

export type Soil = 'grass' | 'tilled' | 'rock';

export type Tile = {
  soil: Soil;
  moisture: number; // 0..100
  lastUpdated: number; // cycle
  crop: null | {
    kind: CropId;
    plantedAt: number;
    growth: number;
    /** First cycle at which growth reached growCycles; null until ripe. Wither is measured from here. */
    ripeAt: number | null;
    withered: boolean;
  };
};
