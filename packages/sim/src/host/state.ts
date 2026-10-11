/**
 * The state a host call reads and the shapes it returns.
 * Design: docs/03-architecture/simulation-engine.md §Model and §Clock arithmetic, standard-library.md.
 * Invariants: farms and the market are values (a call returns new ones and never writes into its inputs); the PRNG
 * streams are the one mutable part, like the VM; time (`t`) is the cycle at which the call starts; an agent is one
 * drone and carries only what the drone owns (position and upgrade stats), not credits, silo or water.
 */

import type { CropId } from '@harvest/content';
import type { HostId, Value } from '@harvest/lang';
import type { MarketState } from '../market/market';
import type { MatchStreams } from '../prng/streams';
import type { DroneNo } from '../types';
import type { ActionEvent, DroneStats } from '../world/actions';
import type { AdvanceRules } from '../world/advance';
import type { Farm } from '../world/farm';
import type { Coord } from '../types';

export type HostConfig = {
  readonly gridSize: number;
  readonly cycleBudget: number;
  /** false in showdowns v1 (D-24): `spawn` is rejected. */
  readonly spawnEnabled: boolean;
  /** false in ranked (D-18): `random` is rejected. */
  readonly randomEnabled: boolean;
  readonly rules: AdvanceRules;
};

export type HostWorld = {
  readonly config: HostConfig;
  /** One farm per slot, ascending. */
  readonly farms: readonly Farm[];
  readonly market: MarketState;
  readonly streams: MatchStreams;
  /** Per slot: drone 1 has been started (a second `spawn` fails). */
  readonly secondDroneSpawned: readonly boolean[];
};

export type HostAgent = {
  readonly slot: number;
  readonly droneNo: DroneNo;
  readonly x: number;
  readonly y: number;
  readonly drone: DroneStats;
};

export type HostCall = { readonly fn: HostId; readonly args: readonly Value[] };

/** The event body of a host call; the scheduler adds `t`, `slot` and `drone`. */
export type HostEvent =
  | ActionEvent
  | {
      readonly k: 'sell';
      readonly crop: CropId;
      readonly n: number;
      readonly price: number;
      readonly credits: number;
    }
  | { readonly k: 'spawn'; readonly at: Coord; readonly ok: boolean }
  | { readonly k: 'halt' };

export type HostError = { readonly code: string; readonly message: string };

export type HostOutcome =
  | {
      readonly kind: 'ok';
      readonly value: Value;
      /** The applied cost: what the scheduler passes to `vm.resume(value, cost)`. */
      readonly cost: number;
      readonly world: HostWorld;
      readonly agent: HostAgent;
      readonly events: readonly HostEvent[];
      /** After a successful `spawn`: drone 1's initial state and the function it runs; the scheduler creates the agent. */
      readonly spawned?: { readonly agent: HostAgent; readonly fn: Value };
      /** `halt()` was called: the calling drone stops. */
      readonly halted: boolean;
    }
  | {
      readonly kind: 'error';
      /** What the scheduler passes to `vm.raise(error, cost)`. */
      readonly error: HostError;
      readonly cost: number;
      readonly world: HostWorld;
      readonly agent: HostAgent;
      readonly events: readonly HostEvent[];
    };
