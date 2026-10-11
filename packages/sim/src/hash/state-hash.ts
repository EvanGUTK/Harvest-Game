/**
 * The canonical state hash H(t): FNV-1a over the int32 words of the world at cycle t.
 * Design: docs/03-architecture/simulation-engine.md §State hash (normative).
 * Invariants: the numbered steps are sequential, so step 3 covers every slot before step 4 starts on tiles;
 * every tile and the market are force-advanced to `t` first (on copies, so hashing never changes the
 * state it reads); words are written in the normative order; VM heaps, programs, the event log, `lastUpdated` and
 * `everDryPaused` are not hashed; arrays and `Map` only, tiles row-major (y then x), crops in CROP_IDS order.
 */

import { CROP_IDS, type CropId } from '@harvest/content';
import { fnv1a32Words } from '@harvest/lang';
import { InvariantError } from '../invariant';
import { advanceMarket, marketPressures, type MarketEnv, type MarketState } from '../market/market';
import type { MatchStreams } from '../prng/streams';
import type { AdvanceRules } from '../world/advance';
import { advanceFarm, type Farm } from '../world/farm';
import type { Soil, Tile } from '../types';

/** The rules the hash needs to force-advance the world: tile moisture decay and the market numbers. */
export type HashRules = AdvanceRules & MarketEnv;

export type DroneStatus = 'running' | 'halted' | 'error' | 'not_spawned';

/** What the hash reads of a drone: position, committed clock and status. */
export type DroneHashState = {
  readonly x: number;
  readonly y: number;
  readonly clock: number;
  readonly status: DroneStatus;
};

export type HashableState = {
  readonly gridSize: number;
  /** One farm per slot, ascending. */
  readonly farms: readonly Farm[];
  /** Per slot, drone 0 then drone 1. */
  readonly drones: readonly (readonly [DroneHashState, DroneHashState])[];
  readonly market: MarketState;
  readonly streams: MatchStreams;
};

const STATUS_CODE: Readonly<Record<DroneStatus, number>> = {
  running: 0,
  halted: 1,
  error: 2,
  not_spawned: 3,
};
const SOIL_CODE: Readonly<Record<Soil, number>> = { grass: 0, tilled: 1, rock: 2 };
/** The streams every match has besides the per-slot ones: `layout` and `weather`. */
const FIXED_STREAMS = 2;
const NO_CROP = -1;
const NO_RIPE_AT = -1;

function droneWords(drone: DroneHashState): number[] {
  if (drone.status === 'not_spawned') return [0, 0, 0, STATUS_CODE.not_spawned];
  return [drone.x, drone.y, drone.clock, STATUS_CODE[drone.status]];
}

function siloWords(farm: Farm): number[] {
  return CROP_IDS.map((id: CropId) => farm.silo[id]);
}

function tileWords(tile: Tile): number[] {
  const { crop } = tile;
  if (crop === null) return [SOIL_CODE[tile.soil], tile.moisture, NO_CROP, 0, 0, NO_RIPE_AT, 0];
  return [
    SOIL_CODE[tile.soil],
    tile.moisture,
    CROP_IDS.indexOf(crop.kind),
    crop.plantedAt,
    crop.growth,
    crop.ripeAt ?? NO_RIPE_AT,
    crop.withered ? 1 : 0,
  ];
}

/** Step 3 of the word order: credits, silo, water and both drones of one slot. */
function slotHeadWords(farm: Farm, drones: readonly [DroneHashState, DroneHashState]): number[] {
  return [farm.credits, ...siloWords(farm), farm.water, ...drones.flatMap(droneWords)];
}

function assertSlotCounts(state: HashableState): void {
  const nSlots = state.farms.length;
  if (state.drones.length !== nSlots || state.streams.ordered.length !== FIXED_STREAMS + nSlots) {
    throw new InvariantError(
      'SIM-BAD-SLOT-COUNT',
      `${nSlots} farms need ${nSlots} drone rows and ${FIXED_STREAMS + nSlots} streams, got ${state.drones.length} and ${state.streams.ordered.length}`,
    );
  }
}

/** The words H(t) hashes, after force-advancing a copy of every farm and of the market to `t`. */
export function stateWords(state: HashableState, t: number, rules: HashRules): number[] {
  assertSlotCounts(state);
  const market = advanceMarket(state.market, t, rules);
  const farms = state.farms.map((farm) => advanceFarm(farm, t, rules));
  return [
    t,
    state.gridSize,
    farms.length,
    ...marketPressures(market),
    ...farms.flatMap((farm, slot) => slotHeadWords(farm, droneRow(state, slot))),
    ...farms.flatMap((farm) => farm.tiles.flatMap(tileWords)),
    ...state.streams.ordered.flatMap((stream) => stream.rng.state()),
  ];
}

function droneRow(state: HashableState, slot: number): readonly [DroneHashState, DroneHashState] {
  const row = state.drones[slot];
  if (row === undefined) throw new InvariantError('SIM-BAD-SLOT', `no drone state for slot ${slot}`);
  return row;
}

/** H(t) as a uint32. */
export function stateHash(state: HashableState, t: number, rules: HashRules): number {
  return fnv1a32Words(stateWords(state, t, rules));
}
