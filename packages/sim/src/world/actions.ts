/**
 * Tile actions as pure functions: plant, harvest, till, water, refill and move.
 * Design: docs/02-language/standard-library.md §Actions and §Outcome matrix (normative),
 * docs/03-architecture/simulation-engine.md §Clock arithmetic (an action does nothing → cost 5).
 * Invariants: an action takes effect at its start time `t`, so the touched tile is first advanced to `t`;
 * costs come from `content` (ACTION_COSTS) and exclude the 1-cycle CALL_HOST base; inputs are never mutated;
 * a failed action changes nothing but the tile's catch-up to `t`.
 */

import { ACTION_COSTS, CROPS, WORLD, type CropId } from '@harvest/content';
import { assertNever } from '../invariant';
import type { AdvanceRules } from './advance';
import { tileIndex, touchTile, withTile, type Farm } from './farm';
import type { Coord, Tile } from './types';

export type Direction = 'north' | 'south' | 'east' | 'west';

/** Per-drone stats that campaign upgrades change (Rotor, Sprayer); showdowns use the defaults. */
export type DroneStats = { moveCost: number; waterAmount: number };

export const DEFAULT_DRONE_STATS: DroneStats = {
  moveCost: ACTION_COSTS.move,
  waterAmount: WORLD.waterAmount,
};

export type ActionContext = {
  gridSize: number;
  /** Start cycle of the action. */
  t: number;
  rules: AdvanceRules;
  drone: DroneStats;
};

/** The event body of an action; the scheduler adds `t`, `slot` and `drone` (simulation-engine.md §Event log). */
export type ActionEvent =
  | { k: 'move'; to: Coord }
  | { k: 'plant'; at: Coord; crop: CropId; ok: boolean }
  | { k: 'harvest'; at: Coord; crop: CropId | null; ok: boolean }
  | { k: 'till' | 'water' | 'refill'; at: Coord; ok: boolean };

export type ActionOutcome = { ok: boolean; cost: number; farm: Farm; event: ActionEvent };

export type MoveOutcome = { cost: number; to: Coord; event: ActionEvent };

type Crop = NonNullable<Tile['crop']>;

function isRipe(crop: Crop): boolean {
  return crop.ripeAt !== null && !crop.withered;
}

function plantBlockReason(farm: Farm, tile: Tile, crop: CropId): boolean {
  if (tile.crop !== null && !tile.crop.withered) return true;
  if (tile.soil === 'rock') return true;
  if (CROPS[crop].needsTilled && tile.soil === 'grass') return true;
  return farm.credits < CROPS[crop].seedCost;
}

/** `plant(crop)`: buys a seed and plants it, replacing a withered crop. */
export function plant(farm: Farm, pos: Coord, crop: CropId, ctx: ActionContext): ActionOutcome {
  const touched = touchTile(farm, ctx.gridSize, pos, ctx.t, ctx.rules);
  const event = (ok: boolean): ActionEvent => ({ k: 'plant', at: pos, crop, ok });
  if (plantBlockReason(touched.farm, touched.tile, crop)) {
    return { ok: false, cost: ACTION_COSTS.plantFailed, farm: touched.farm, event: event(false) };
  }
  const planted: Tile = {
    ...touched.tile,
    crop: { kind: crop, plantedAt: ctx.t, growth: 0, ripeAt: null, withered: false },
  };
  const next = withTile(
    { ...touched.farm, credits: touched.farm.credits - CROPS[crop].seedCost },
    tileIndex(ctx.gridSize, pos),
    planted,
  );
  return { ok: true, cost: ACTION_COSTS.plant, farm: next, event: event(true) };
}

/** `harvest()`: a ripe crop goes to the silo; an unripe or withered one is destroyed or cleared with no yield. */
export function harvest(farm: Farm, pos: Coord, ctx: ActionContext): ActionOutcome {
  const touched = touchTile(farm, ctx.gridSize, pos, ctx.t, ctx.rules);
  const { crop, soil } = touched.tile;
  if (crop === null) {
    const event: ActionEvent = { k: 'harvest', at: pos, crop: null, ok: false };
    return { ok: false, cost: ACTION_COSTS.harvestEmpty, farm: touched.farm, event };
  }
  const yielded = isRipe(crop);
  // Tilled soil reverts to grass after a ripe or withered crop is cleared; an unripe crop keeps it tilled.
  const clearedSoil = soil === 'tilled' && crop.ripeAt !== null ? 'grass' : soil;
  const cleared: Tile = { ...touched.tile, soil: clearedSoil, crop: null };
  const silo = yielded
    ? { ...touched.farm.silo, [crop.kind]: touched.farm.silo[crop.kind] + 1 }
    : touched.farm.silo;
  const next = withTile({ ...touched.farm, silo }, tileIndex(ctx.gridSize, pos), cleared);
  const event: ActionEvent = { k: 'harvest', at: pos, crop: crop.kind, ok: yielded };
  return { ok: yielded, cost: ACTION_COSTS.harvest, farm: next, event };
}

/** `till()`: bare grass becomes tilled soil. */
export function till(farm: Farm, pos: Coord, ctx: ActionContext): ActionOutcome {
  const touched = touchTile(farm, ctx.gridSize, pos, ctx.t, ctx.rules);
  const event = (ok: boolean): ActionEvent => ({ k: 'till', at: pos, ok });
  if (touched.tile.soil !== 'grass' || touched.tile.crop !== null) {
    return { ok: false, cost: ACTION_COSTS.tillFailed, farm: touched.farm, event: event(false) };
  }
  const next = withTile(touched.farm, tileIndex(ctx.gridSize, pos), { ...touched.tile, soil: 'tilled' });
  return { ok: true, cost: ACTION_COSTS.till, farm: next, event: event(true) };
}

/** `water()`: adds the Sprayer amount to the advanced moisture (capped at 100) and uses one water unit. */
export function water(farm: Farm, pos: Coord, ctx: ActionContext): ActionOutcome {
  const touched = touchTile(farm, ctx.gridSize, pos, ctx.t, ctx.rules);
  const event = (ok: boolean): ActionEvent => ({ k: 'water', at: pos, ok });
  if (touched.farm.water === 0) {
    return { ok: false, cost: ACTION_COSTS.waterFailed, farm: touched.farm, event: event(false) };
  }
  const moisture = Math.min(WORLD.moistureMax, touched.tile.moisture + ctx.drone.waterAmount);
  const next = withTile({ ...touched.farm, water: touched.farm.water - 1 }, tileIndex(ctx.gridSize, pos), {
    ...touched.tile,
    moisture,
  });
  return { ok: true, cost: ACTION_COSTS.water, farm: next, event: event(true) };
}

/** `refill()`: only on the well tile; restores the tank to capacity. */
export function refill(farm: Farm, pos: Coord): ActionOutcome {
  const onWell = pos[0] === WORLD.wellTile[0] && pos[1] === WORLD.wellTile[1];
  const event = (ok: boolean): ActionEvent => ({ k: 'refill', at: pos, ok });
  if (!onWell) return { ok: false, cost: ACTION_COSTS.refillFailed, farm, event: event(false) };
  return {
    ok: true,
    cost: ACTION_COSTS.refill,
    farm: { ...farm, water: WORLD.waterCapacity },
    event: event(true),
  };
}

function stepOf(dir: Direction): Coord {
  switch (dir) {
    case 'north':
      return [0, 1];
    case 'south':
      return [0, -1];
    case 'east':
      return [1, 0];
    case 'west':
      return [-1, 0];
    default:
      return assertNever(dir);
  }
}

/** Wrap one coordinate step on a gridSize-wide axis without a negative modulo. */
function wrap(value: number, step: number, gridSize: number): number {
  return (value + step + gridSize) % gridSize;
}

/** `move(dir)`: one tile, wrapping at the edges. Always succeeds, even onto rock. */
export function move(pos: Coord, dir: Direction, ctx: ActionContext): MoveOutcome {
  const [dx, dy] = stepOf(dir);
  const to: Coord = [wrap(pos[0], dx, ctx.gridSize), wrap(pos[1], dy, ctx.gridSize)];
  return { cost: ctx.drone.moveCost, to, event: { k: 'move', to } };
}
