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

export type Coord = readonly [x: number, y: number];

export type SimConfig = {
  rulesVersion: string;
  languageVersion: string;
  seed: number;
  gridSize: number;
  cycleBudget: number;
  startCredits: number;
  startWater: number;
  sharedMarket: boolean;
  randomEnabled: boolean;
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
  upgrades?: DroneUpgrades;
};

/** Agents are drones: agentIndex = slot × MAX_DRONES + droneNo (see simulation-engine.md §Tie-break). */
export type SimEvent =
  | { t: number; slot: number; drone: number; k: 'move'; to: Coord }
  | { t: number; slot: number; drone: number; k: 'plant'; at: Coord; crop: CropId; ok: boolean }
  | { t: number; slot: number; drone: number; k: 'harvest'; at: Coord; crop: CropId | null; ok: boolean }
  | { t: number; slot: number; drone: number; k: 'till' | 'water' | 'refill'; at: Coord; ok: boolean }
  | {
      t: number;
      slot: number;
      drone: number;
      k: 'sell';
      crop: CropId;
      n: number;
      price: number;
      credits: number;
    }
  | { t: number; slot: number; drone: number; k: 'spawn'; at: Coord; ok: boolean }
  | { t: number; slot: number; drone: number; k: 'halt' | 'error'; info?: string }
  | { t: number; k: 'weather'; kind: string; data: unknown }
  | { t: number; k: 'hash'; h: number };

export type PlayerResult = {
  slot: number;
  score: number;
  cyclesLastChange: number;
  logicCycles: number;
  programTokens: number;
  cropsHarvested: number;
  awards: string[];
  error?: { code: string; line: number };
};

export type SimResult = {
  players: PlayerResult[];
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
