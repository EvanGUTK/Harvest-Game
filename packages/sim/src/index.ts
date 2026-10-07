/**
 * @harvest/sim: deterministic farm simulation + discrete-event scheduler.
 *
 * Status: interface only. Implementation is milestone M0 (backlog SIM-01..08).
 * Design: docs/03-architecture/simulation-engine.md, docs/01-game-design/farm-simulation.md
 *
 * Purity rule: integers only; no Date, Math.random, DOM, or Node APIs.
 */

import type { CropId } from '@harvest/content';
import type { BytecodeModule } from '@harvest/lang';

export type Soil = 'grass' | 'tilled' | 'rock';

export type Tile = {
  soil: Soil;
  moisture: number; // 0..100
  lastUpdated: number; // cycle
  crop: null | { kind: CropId; plantedAt: number; growth: number; withered: boolean };
};

export type Coord = readonly [x: number, y: number];

export type SimConfig = {
  rulesVersion: string;
  languageVersion: string;
  seed: number;
  gridSize: number;
  cycleBudget: number;
  startCredits: number;
  sharedMarket: boolean;
  randomEnabled: boolean;
};

export type PlayerInput = { slot: number; module: BytecodeModule | null /* null = idle program */ };

export type SimEvent =
  | { t: number; slot: number; k: 'move'; to: Coord }
  | { t: number; slot: number; k: 'plant'; at: Coord; crop: CropId; ok: boolean }
  | { t: number; slot: number; k: 'harvest'; at: Coord; crop: CropId | null; ok: boolean }
  | { t: number; slot: number; k: 'till' | 'water' | 'refill'; at: Coord; ok: boolean }
  | { t: number; slot: number; k: 'sell'; crop: CropId; n: number; price: number; credits: number }
  | { t: number; slot: number; k: 'halt' | 'error'; info?: string }
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

export interface Simulation {
  run(config: SimConfig, players: readonly PlayerInput[]): SimResult;
}
