/**
 * What every host-call handler works from, and the helpers that build outcomes from it.
 * Design: docs/03-architecture/simulation-engine.md §Clock arithmetic (applied cost), standard-library.md.
 * Invariants: an error outcome costs 0 on top of the 1-cycle call and changes nothing; an ok outcome carries the
 * applied cost; helpers never mutate the world they are given.
 */

import type { Value, ValueOps } from '@harvest/lang';
import { InvariantError } from '../invariant';
import type { ActionContext } from '../world/actions';
import type { Farm } from '../world/farm';
import type { Coord } from '../types';
import type { BadArg } from './args';
import type { HostAgent, HostEvent, HostOutcome, HostWorld } from './state';

export type CallContext = {
  readonly values: ValueOps;
  readonly world: HostWorld;
  readonly agent: HostAgent;
  readonly args: readonly Value[];
  /** The cycle at which the call starts (`atCycle`). */
  readonly t: number;
};

export type Patch = {
  readonly world?: HostWorld;
  readonly agent?: HostAgent;
  readonly events?: readonly HostEvent[];
  readonly spawned?: HostAgent;
  readonly halted?: boolean;
};

/** Argument `index` of the call; the compiler checks arity, so a missing one is an invariant violation. */
export function arg(ctx: CallContext, index: number): Value {
  const value = ctx.args[index];
  if (value === undefined)
    throw new InvariantError('SIM-BAD-HOST-CALL', `host call is missing argument ${index}`);
  return value;
}

export function position(ctx: CallContext): Coord {
  return [ctx.agent.x, ctx.agent.y];
}

export function actionContext(ctx: CallContext): ActionContext {
  const { config } = ctx.world;
  return { gridSize: config.gridSize, t: ctx.t, rules: config.rules, drone: ctx.agent.drone };
}

export function farmOf(world: HostWorld, slot: number): Farm {
  const farm = world.farms[slot];
  if (farm === undefined) throw new InvariantError('SIM-BAD-SLOT', `no farm for slot ${slot}`);
  return farm;
}

export function withFarm(world: HostWorld, slot: number, farm: Farm): HostWorld {
  return { ...world, farms: world.farms.map((existing, i) => (i === slot ? farm : existing)) };
}

/** A successful call: the value the program sees, the applied cost, and what changed. */
export function ok(ctx: CallContext, value: Value, cost: number, patch: Patch = {}): HostOutcome {
  return {
    kind: 'ok',
    value,
    cost,
    world: patch.world ?? ctx.world,
    agent: patch.agent ?? ctx.agent,
    events: patch.events ?? [],
    ...(patch.spawned === undefined ? {} : { spawned: patch.spawned }),
    halted: patch.halted ?? false,
  };
}

/** A runtime error raised by the call; nothing changes and no extra cycles are charged. */
export function fail(ctx: CallContext, error: BadArg | { code: string; message: string }): HostOutcome {
  return { kind: 'error', error, cost: 0, world: ctx.world, agent: ctx.agent, events: [] };
}
