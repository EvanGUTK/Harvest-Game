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

// ---------- Market (SIM-04) ----------

export {
  advanceMarket,
  cloneMarket,
  createMarket,
  marketPressures,
  marketPrice,
  type MarketEnv,
  type MarketRules,
  type MarketState,
} from './market/market';
export { liquidate } from './market/liquidate';
export { sell, type FarmLedger, type SaleLot, type SaleOutcome } from './market/sell';

// ---------- Shared types ----------

export {
  MAX_DRONES,
  type AwardId,
  type Coord,
  type DroneNo,
  type DroneUpgrades,
  type PlayerInput,
  type PlayerResult,
  type SimConfig,
  type SimEvent,
  type SimResult,
  type SimRun,
  type Simulation,
  type SimSnapshot,
  type Soil,
  type StepResult,
  type Tile,
} from './types';

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
export { DEFAULT_DRONE_STATS, harvest, move, plant, refill, till, water } from './world/actions';
export type {
  ActionContext,
  ActionEvent,
  ActionOutcome,
  Direction,
  DroneStats,
  MoveOutcome,
} from './world/actions';
export { tileIndex, touchTile, withTile } from './world/farm';
export {
  sensorCrop,
  sensorGrowth,
  sensorIsRipe,
  sensorIsWithered,
  sensorMoisture,
  sensorSoil,
} from './world/sensors';

// ---------- Scoring (SIM-07) ----------

export { assignAwards } from './scoring/awards';
export { buildPlayerResult } from './scoring/result';
export { rankPlayers, type Placement, type RankEntry } from './scoring/ranking';
export { scorePlayers, type MatchScore } from './scoring/score';
export type { PlayerStats, ScoringRules } from './scoring/stats';

// ---------- State hash (SIM-06) ----------

export {
  stateHash,
  stateWords,
  type DroneHashState,
  type DroneStatus,
  type HashableState,
} from './hash/state-hash';
