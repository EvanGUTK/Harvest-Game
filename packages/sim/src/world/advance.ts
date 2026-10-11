/**
 * Lazy O(1) tile advancement: bring one tile from its `lastUpdated` to cycle `t`.
 * Design: docs/03-architecture/simulation-engine.md §Lazy world advancement (normative),
 * docs/01-game-design/farm-simulation.md §Growth rules.
 * Invariants: pure and integer-only; moisture only falls between touches, so the growing cycles are one
 * contiguous run starting at last + 1; the decrement at a multiple of 50 applies before that cycle's
 * growth; advancing is compositional (advancing in steps equals advancing at once); time never goes backwards.
 */

import { CROPS, WORLD } from '@harvest/content';
import { floorDiv } from '@harvest/lang';
import { InvariantError } from '../invariant';
import type { Tile } from '../types';

export type AdvanceRules = {
  /** false until the campaign Water node is owned: moisture never decrements (SimConfig.moistureDecay). */
  readonly moistureDecay: boolean;
};

export type TileAdvance = {
  tile: Tile;
  /**
   * A growing crop stood on a tile below its minMoisture for at least one cycle of this advance while it was
   * still unripe. Feeds Farm.everDryPaused (Never Thirsty). Not part of the state hash.
   */
  dryPaused: boolean;
};

type Crop = NonNullable<Tile['crop']>;

type CropAdvance = { crop: Crop; dryPaused: boolean };

/** Decrements of moisture applied in (last, t]: one per multiple of the decay interval. */
function moistureLoss(last: number, t: number): number {
  return floorDiv(t, WORLD.moistureDecayEvery) - floorDiv(last, WORLD.moistureDecayEvery);
}

/** The last cycle of the contiguous growing run that starts at last + 1, given moisture m0 ≥ minMoisture at `last`. */
function lastGrowingCycle(
  last: number,
  t: number,
  m0: number,
  minMoisture: number,
  rules: AdvanceRules,
): number {
  if (!rules.moistureDecay) return t;
  const firstDryCycle =
    WORLD.moistureDecayEvery * (floorDiv(last, WORLD.moistureDecayEvery) + m0 - minMoisture + 1);
  return Math.min(t, firstDryCycle - 1);
}

function advanceUnripeCrop(
  crop: Crop,
  m0: number,
  last: number,
  t: number,
  rules: AdvanceRules,
): CropAdvance {
  const def = CROPS[crop.kind];
  const wasDry = m0 < def.minMoisture;
  const growUntil = wasDry ? last : lastGrowingCycle(last, t, m0, def.minMoisture, rules);
  const reachedGrowth = crop.growth + Math.max(0, growUntil - last);
  const ripened = reachedGrowth >= def.growCycles;
  const ripeAt = ripened ? last + (def.growCycles - crop.growth) : null;
  const dryGap = wasDry || (rules.moistureDecay && growUntil < t);
  return {
    crop: {
      ...crop,
      growth: Math.min(def.growCycles, reachedGrowth),
      ripeAt,
      withered: ripeAt !== null && t >= ripeAt + def.witherCycles,
    },
    dryPaused: !ripened && dryGap,
  };
}

function advanceCrop(crop: Crop, m0: number, last: number, t: number, rules: AdvanceRules): CropAdvance {
  if (crop.ripeAt === null) return advanceUnripeCrop(crop, m0, last, t, rules);
  const withered = crop.withered || t >= crop.ripeAt + CROPS[crop.kind].witherCycles;
  return { crop: { ...crop, withered }, dryPaused: false };
}

/** Advance `tile` to cycle `t` and report whether a dry gap paused an unripe crop. A non-integer `t`, or `t < lastUpdated`, is an invariant violation. */
export function advanceTileDetailed(tile: Tile, t: number, rules: AdvanceRules): TileAdvance {
  const last = tile.lastUpdated;
  if (!Number.isSafeInteger(t)) {
    throw new InvariantError('SIM-BAD-CYCLE', `a cycle must be a safe integer, got ${t}`);
  }
  if (t < last) {
    throw new InvariantError('SIM-TIME-BACKWARDS', `cannot advance a tile from cycle ${last} back to ${t}`);
  }
  if (t === last) return { tile, dryPaused: false };
  const moisture = rules.moistureDecay ? Math.max(0, tile.moisture - moistureLoss(last, t)) : tile.moisture;
  if (tile.crop === null) return { tile: { ...tile, moisture, lastUpdated: t }, dryPaused: false };
  const { crop, dryPaused } = advanceCrop(tile.crop, tile.moisture, last, t, rules);
  return { tile: { ...tile, moisture, lastUpdated: t, crop }, dryPaused };
}

/** Advance `tile` to cycle `t` (compositional: advancing in steps equals advancing at once). */
export function advanceTile(tile: Tile, t: number, rules: AdvanceRules): Tile {
  return advanceTileDetailed(tile, t, rules).tile;
}
