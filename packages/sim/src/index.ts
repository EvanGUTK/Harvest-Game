/**
 * @harvest/sim: deterministic farm simulation + discrete-event scheduler.
 *
 * Status: interface only. Implementation is milestone M0 (backlog SIM-01..08).
 * Design: docs/03-architecture/simulation-engine.md, docs/01-game-design/farm-simulation.md
 *
 * Purity rule: integers only; no Date, Math.random, DOM, or Node APIs.
 *
 * Two entry points share one engine: `run()` is the server path (official results, receipts);
 * `create()` is the client path (editor run/pause/step/timeline), advancing in bounded slices and
 * taking serializable snapshots every 1,000 cycles for the timeline scrubber.
 */

import type { CropId } from '@harvest/content';
import type { BytecodeModule } from '@harvest/lang';

// ---------- Market (SIM-04) ----------

export {
  advanceMarket,
  cloneMarket,
  createMarket,
  marketPressures,
  marketPrice,
  type MarketState,
} from './market/market';

/** Drones per farm. agentIndex = slot × MAX_DRONES + droneNo; N = nSlots × MAX_DRONES is constant per match. */
export const MAX_DRONES = 2;

export type DroneNo = 0 | 1;

export type AwardId =
  'top_earner' | 'most_efficient' | 'bumper_crop' | 'market_timer' | 'clean_code' | 'never_thirsty';

export type { Soil, Tile } from './world/types';

export type Coord = readonly [x: number, y: number];

export type SimConfig = {
  rulesVersion: string;
  languageVersion: string;
  /** Unsigned 32-bit integer (0..4294967295). */
  seed: number;
  gridSize: number;
  cycleBudget: number;
  startCredits: number;
  startWater: number;
  /** Inclusive range for seeded starting moisture per tile (showdown: 0–40; campaign before the Water node: 100–100). */
  startMoisture: { min: number; max: number };
  /** false until the campaign Water node is owned; always true in showdowns. */
  moistureDecay: boolean;
  sharedMarket: boolean;
  randomEnabled: boolean;
  /** false in showdowns v1 (D-24): the host table rejects spawn(). */
  spawnEnabled: boolean;
  modifiers: { rocks: boolean; weather: boolean };
};

/** Campaign drone upgrades. Showdowns use the defaults for every player. */
export type DroneUpgrades = {
  moveCost: 20 | 16 | 12 | 9; // Rotor none / I / II / III
  waterAmount: 40 | 60; // Sprayer
  maxDrones: 1 | 2; // Twin drone
};

export type PlayerInput = {
  slot: number;
  /** null = idle program (no valid submission). */
  module: BytecodeModule | null;
  /** First compile diagnostic when the idle program is due to a compile error (surfaces in PlayerResult.error). */
  compileError?: { code: string; line: number };
  upgrades?: DroneUpgrades;
};

/** Agents are drones: agentIndex = slot × MAX_DRONES + droneNo (see simulation-engine.md §Tie-break). */
export type SimEvent =
  | { t: number; slot: number; drone: DroneNo; k: 'move'; to: Coord }
  | { t: number; slot: number; drone: DroneNo; k: 'plant'; at: Coord; crop: CropId; ok: boolean }
  | { t: number; slot: number; drone: DroneNo; k: 'harvest'; at: Coord; crop: CropId | null; ok: boolean }
  | { t: number; slot: number; drone: DroneNo; k: 'till' | 'water' | 'refill'; at: Coord; ok: boolean }
  | {
      t: number;
      slot: number;
      drone: DroneNo;
      k: 'sell';
      crop: CropId;
      n: number;
      price: number;
      credits: number;
    }
  | { t: number; slot: number; drone: DroneNo; k: 'spawn'; at: Coord; ok: boolean }
  | { t: number; slot: number; drone: DroneNo; k: 'halt' | 'error'; info?: string }
  | { t: number; k: 'weather'; kind: string; data: unknown }
  /** uint32 FNV-1a over the canonical state, see simulation-engine.md §State hash. */
  | { t: number; k: 'hash'; h: number };

export type PlayerResult = {
  slot: number;
  score: number;
  cyclesLastChange: number;
  logicCycles: number;
  programTokens: number;
  cropsHarvested: number;
  awards: AwardId[];
  /** First 200 print() lines (never shown to rivals). */
  output: string[];
  error?: { code: string; line: number };
};

export type SimResult = {
  players: PlayerResult[];
  /** uint32 FNV-1a, equal to the last hash event (t = cycleBudget, after liquidation). */
  finalStateHash: number;
  events: SimEvent[];
};

/** Serializable: world, market, PRNG streams and every agent's VMSnapshot. Opaque outside sim. */
export type SimSnapshot = { readonly __brand: 'SimSnapshot'; readonly clock: number };

export type StepResult = { t: number; events: SimEvent[]; done: boolean; result?: SimResult };

export interface SimRun {
  readonly clock: number;
  /**
   * Advance world time by up to maxCycles. With `stepLineOf`, stop as soon as that slot's primary
   * drone reaches its next statement boundary (debugger Step / breakpoints).
   */
  step(maxCycles: number, opts?: { stepLineOf?: number }): StepResult;
  snapshot(): SimSnapshot;
}

export interface Simulation {
  /** Server path: run to completion. Equivalent to create() + step(cycleBudget). */
  run(config: SimConfig, players: readonly PlayerInput[]): SimResult;
  /** Client path: incremental runner for the editor and the finale/replay player. */
  create(config: SimConfig, players: readonly PlayerInput[]): SimRun;
  restore(snapshot: SimSnapshot): SimRun;
}

// ---------- PRNG (SIM-05) ----------

export { splitmix32, type Splitmix32 } from './prng/splitmix32';
export { createSfc32, type Sfc32, type Sfc32State } from './prng/sfc32';
export { assertNever, InvariantError, type InvariantCode } from './invariant';
export {
  createStreams,
  randomBelow,
  seedStream,
  streamName,
  type MatchStreams,
  type NamedStream,
  type StreamId,
} from './prng/streams';
export { generateLayout, type LayoutConfig } from './world/layout';

// ---------- World (SIM-01) ----------

export { advanceTile, advanceTileDetailed, type AdvanceRules, type TileAdvance } from './world/advance';
export { advanceFarm, type Farm } from './world/farm';

// ---------- Scoring (SIM-07) ----------

export { assignAwards } from './scoring/awards';
export { buildPlayerResult } from './scoring/result';
export { rankPlayers, type Placement, type RankEntry } from './scoring/ranking';
export { scorePlayers, type MatchScore } from './scoring/score';
export type { PlayerStats, ScoringRules } from './scoring/stats';
