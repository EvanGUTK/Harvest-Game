/**
 * Scripted scenarios for the golden tests: a seed, rules and timed host calls per slot, played through the public
 * world, market and state-hash primitives, with the hash events the scheduler will emit.
 * Design: docs/03-architecture/simulation-engine.md §State hash (Emission), §Tie-break; docs/09-engineering/testing.md
 * (Golden). There is no scheduler yet, so this is the one place a match is assembled outside it; slice 2 plays real
 * programs through the engine and keeps the same golden shape.
 * Invariants: calls run in time order with the normative tie-break; a call may not start before its slot's previous
 * call ended; a hash for cycle k·1000 is emitted before any call at or after it; the final hash follows liquidation;
 * every drone is `running` during the script and `halted` in the final hash; there is one drone per slot.
 */

import { ACTION_COSTS, CROPS, MARKET, type CropId } from '@harvest/content';
import { floorMod } from '@harvest/lang';
import { stateHash } from '../hash/state-hash';
import type { DroneHashState, HashableState, HashRules } from '../hash/state-hash';
import { assertNever, InvariantError } from '../invariant';
import { liquidate } from '../market/liquidate';
import { advanceMarket, createMarket } from '../market/market';
import type { MarketRules, MarketState } from '../market/market';
import { sell } from '../market/sell';
import { createStreams } from '../prng/streams';
import type { MatchStreams } from '../prng/streams';
import { MAX_DRONES } from '../types';
import type { Coord } from '../types';
import { DEFAULT_DRONE_STATS, harvest, move, plant, refill, till, water } from '../world/actions';
import type { ActionContext, Direction } from '../world/actions';
import { advanceFarm } from '../world/farm';
import type { Farm } from '../world/farm';
import { generateLayout } from '../world/layout';

/** A hash event is emitted at every multiple of this many cycles (simulation-engine.md §State hash, Emission). */
export const HASH_INTERVAL = 1_000;

/** One host call at its start cycle `t`, for one slot's drone. Tile calls apply where the drone stands. */
export type ScriptedCall = { readonly t: number; readonly slot: number } & (
  | { readonly call: 'move'; readonly dir: Direction }
  | { readonly call: 'plant'; readonly crop: CropId }
  | { readonly call: 'harvest' | 'till' | 'water' | 'refill' }
  | { readonly call: 'sell'; readonly crop: CropId; readonly n: number }
);

type TileCall = Exclude<ScriptedCall, { call: 'sell' }>;

export type ScriptedScenario = {
  readonly name: string;
  readonly seed: number;
  readonly gridSize: number;
  readonly cycleBudget: number;
  readonly nSlots: number;
  readonly startCredits: number;
  readonly startWater: number;
  readonly startMoisture: { readonly min: number; readonly max: number };
  readonly moistureDecay: boolean;
  readonly sharedMarket: boolean;
  /** Market numbers that shadow content's for this scenario (the rules variant). */
  readonly market?: Partial<MarketRules>;
  readonly calls: readonly ScriptedCall[];
};

/** What a golden records for a scripted scenario. */
export type GoldenResult = {
  /** The `hash` events in order: every multiple of 1,000 up to the budget (the budget's own is the final hash). */
  readonly hashes: readonly number[];
  readonly finalStateHash: number;
};

/** The state after the script and liquidation, for tests and debugging. */
export type ScriptRun = GoldenResult & {
  readonly farms: readonly Farm[];
  readonly drones: readonly DroneHashState[];
  readonly market: MarketState;
};

const WELL: Coord = [0, 0];
const NOT_SPAWNED: DroneHashState = { x: 0, y: 0, clock: 0, status: 'not_spawned' };

/** Rank for the equal-time tie-break: the agent whose index equals t mod N goes first (simulation-engine.md §Tie-break). */
export function tieBreakRank(agentIndex: number, t: number, agentCount: number): number {
  return floorMod(agentIndex - floorMod(t, agentCount) + agentCount, agentCount);
}

function badScript(message: string): InvariantError {
  return new InvariantError('SIM-BAD-SCRIPT', message);
}

/** Calls in application order: by time, then the tie-break rank of the slot's drone, then listed order. */
function inApplicationOrder(scenario: ScriptedScenario): ScriptedCall[] {
  const agentCount = scenario.nSlots * MAX_DRONES;
  return scenario.calls
    .map((call, listed) => ({ call, listed, rank: tieBreakRank(call.slot * MAX_DRONES, call.t, agentCount) }))
    .sort((a, b) => a.call.t - b.call.t || a.rank - b.rank || a.listed - b.listed)
    .map((entry) => entry.call);
}

function assertPlayable(scenario: ScriptedScenario): void {
  for (const { t, slot } of scenario.calls) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= scenario.nSlots) {
      throw badScript(`${scenario.name}: slot ${slot} is outside 0..${scenario.nSlots - 1}`);
    }
    if (!Number.isInteger(t) || t < 0 || t > scenario.cycleBudget) {
      throw badScript(`${scenario.name}: a call at cycle ${t} is outside 0..${scenario.cycleBudget}`);
    }
  }
}

/** The mutable bookkeeping of one script; the values inside (farms, drones, market) are never mutated. */
type World = { farms: Farm[]; drones: DroneHashState[]; market: MarketState };

function initialWorld(scenario: ScriptedScenario, streams: MatchStreams): World {
  const tiles = generateLayout(streams.layout, {
    gridSize: scenario.gridSize,
    startMoisture: scenario.startMoisture,
    rocks: false,
  });
  const farm: Farm = {
    credits: scenario.startCredits,
    silo: { radish: 0, corn: 0, melon: 0 },
    water: scenario.startWater,
    tiles,
    everDryPaused: false,
  };
  return {
    farms: Array.from({ length: scenario.nSlots }, () => farm),
    drones: Array.from({ length: scenario.nSlots }, () => ({
      x: WELL[0],
      y: WELL[1],
      clock: 0,
      status: 'running',
    })),
    market: createMarket({ sharedMarket: scenario.sharedMarket }),
  };
}

function hashableOf(scenario: ScriptedScenario, streams: MatchStreams, world: World): HashableState {
  return {
    gridSize: scenario.gridSize,
    farms: world.farms,
    drones: world.drones.map((drone) => [drone, NOT_SPAWNED] as const),
    market: world.market,
    streams,
  };
}

/** Applies a tile or movement call to a slot's farm and returns the farm, the drone's position and what it cost. */
function applyTileCall(
  call: TileCall,
  farm: Farm,
  pos: Coord,
  ctx: ActionContext,
): { farm: Farm; pos: Coord; cost: number } {
  switch (call.call) {
    case 'move': {
      const moved = move(pos, call.dir, ctx);
      return { farm, pos: moved.to, cost: moved.cost };
    }
    case 'plant': {
      const outcome = plant(farm, pos, call.crop, ctx);
      return { farm: outcome.farm, pos, cost: outcome.cost };
    }
    case 'harvest': {
      const outcome = harvest(farm, pos, ctx);
      return { farm: outcome.farm, pos, cost: outcome.cost };
    }
    case 'till': {
      const outcome = till(farm, pos, ctx);
      return { farm: outcome.farm, pos, cost: outcome.cost };
    }
    case 'water': {
      const outcome = water(farm, pos, ctx);
      return { farm: outcome.farm, pos, cost: outcome.cost };
    }
    case 'refill': {
      const outcome = refill(farm, pos);
      return { farm: outcome.farm, pos, cost: outcome.cost };
    }
    default:
      return assertNever(call);
  }
}

function applyCall(scenario: ScriptedScenario, world: World, call: ScriptedCall, rules: HashRules): void {
  const drone = world.drones[call.slot];
  const farm = world.farms[call.slot];
  if (drone === undefined || farm === undefined) throw badScript(`${scenario.name}: no slot ${call.slot}`);
  if (call.t < drone.clock) {
    throw badScript(
      `${scenario.name}: slot ${call.slot} starts a call at ${call.t} before its drone is free at ${drone.clock}`,
    );
  }
  if (call.call === 'sell') {
    const sale = sell(world.market, farm, call.crop, call.n, call.t, rules);
    world.market = sale.market;
    world.farms[call.slot] = sale.farm;
    world.drones[call.slot] = { ...drone, clock: call.t + ACTION_COSTS.sell };
    return;
  }
  const ctx: ActionContext = { gridSize: scenario.gridSize, t: call.t, rules, drone: DEFAULT_DRONE_STATS };
  const step = applyTileCall(call, farm, [drone.x, drone.y], ctx);
  world.farms[call.slot] = step.farm;
  world.drones[call.slot] = { ...drone, x: step.pos[0], y: step.pos[1], clock: call.t + step.cost };
}

/** Advances to the budget, liquidates every silo and hashes the result with the drones halted. */
function finish(
  scenario: ScriptedScenario,
  streams: MatchStreams,
  world: World,
  rules: HashRules,
  hashes: number[],
): ScriptRun {
  const budget = scenario.cycleBudget;
  const market = advanceMarket(world.market, budget, rules);
  const advanced = world.farms.map((farm) => advanceFarm(farm, budget, rules));
  const farms = liquidate(market, advanced, budget, rules);
  const drones = world.drones.map((drone): DroneHashState => ({ ...drone, status: 'halted' }));
  const finalStateHash = stateHash(hashableOf(scenario, streams, { farms, drones, market }), budget, rules);
  const budgetIsHashEvent = floorMod(budget, HASH_INTERVAL) === 0 && budget > 0;
  return {
    hashes: budgetIsHashEvent ? [...hashes, finalStateHash] : hashes,
    finalStateHash,
    farms,
    drones,
    market,
  };
}

/** Plays the whole script: hash events, calls in order, final advance, liquidation and the final hash. */
export function playScript(scenario: ScriptedScenario): ScriptRun {
  assertPlayable(scenario);
  const streams = createStreams(scenario.seed, scenario.nSlots);
  const rules: HashRules = {
    moistureDecay: scenario.moistureDecay,
    market: { ...MARKET, ...scenario.market },
    crops: CROPS,
  };
  const world = initialWorld(scenario, streams);
  const hashes: number[] = [];
  let lastHashAt = 0;
  const emitBefore = (limit: number, includeLimit: boolean): void => {
    for (let at = lastHashAt + HASH_INTERVAL; includeLimit ? at <= limit : at < limit; at += HASH_INTERVAL) {
      hashes.push(stateHash(hashableOf(scenario, streams, world), at, rules));
      lastHashAt = at;
    }
  };
  for (const call of inApplicationOrder(scenario)) {
    emitBefore(call.t, true);
    applyCall(scenario, world, call, rules);
  }
  emitBefore(scenario.cycleBudget, false);
  return finish(scenario, streams, world, rules, hashes);
}

/** The golden of a scripted scenario: the hash events and the final hash. */
export function runScripted(scenario: ScriptedScenario): GoldenResult {
  const { hashes, finalStateHash } = playScript(scenario);
  return { hashes, finalStateHash };
}
