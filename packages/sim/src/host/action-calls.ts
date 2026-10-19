/**
 * The action builtins as host calls: move, plant, harvest, till, water, refill, goto, sell, wait, spawn, halt.
 * Design: docs/02-language/standard-library.md §Actions and §Outcome matrix (normative), §Second drone (spawn),
 * docs/03-architecture/simulation-engine.md §Clock arithmetic.
 * Invariants: each handler decodes its arguments first (R-BAD-ARG on failure, nothing changes), then delegates to
 * the pure world actions or to the market; the applied cost is the one the outcome matrix gives (failed action 5,
 * `wait` n, `goto` move cost × wrapped distance, `halt` 0); farms and the market are replaced, never mutated.
 */

import { ACTION_COSTS, WAIT_BOUNDS } from '@harvest/content';
import { sell } from '../market/sell';
import { harvest, move, plant, refill, till, water } from '../world/actions';
import { decodeCrop, decodeDirection, decodeFunction, decodeInt } from './args';
import { actionContext, arg, farmOf, fail, ok, position, withFarm, type CallContext } from './call-context';
import type { HostOutcome } from './state';

const LOCKED = 'E-LOCKED-FEATURE';

type FarmAction = typeof plant | typeof harvest | typeof till | typeof water;

function farmOutcome(ctx: CallContext, outcome: ReturnType<FarmAction>): HostOutcome {
  const world = withFarm(ctx.world, ctx.agent.slot, outcome.farm);
  return ok(ctx, ctx.values.bool(outcome.ok), outcome.cost, { world, events: [outcome.event] });
}

export function callMove(ctx: CallContext): HostOutcome {
  const dir = decodeDirection(ctx.values, 'move', arg(ctx, 0));
  if (!dir.ok) return fail(ctx, dir.error);
  const moved = move(position(ctx), dir.value, actionContext(ctx));
  const agent = { ...ctx.agent, x: moved.to[0], y: moved.to[1] };
  return ok(ctx, ctx.values.none, moved.cost, { agent, events: [moved.event] });
}

export function callPlant(ctx: CallContext): HostOutcome {
  const crop = decodeCrop(ctx.values, 'plant', arg(ctx, 0));
  if (!crop.ok) return fail(ctx, crop.error);
  const farm = farmOf(ctx.world, ctx.agent.slot);
  return farmOutcome(ctx, plant(farm, position(ctx), crop.value, actionContext(ctx)));
}

export function callHarvest(ctx: CallContext): HostOutcome {
  return farmOutcome(ctx, harvest(farmOf(ctx.world, ctx.agent.slot), position(ctx), actionContext(ctx)));
}

export function callTill(ctx: CallContext): HostOutcome {
  return farmOutcome(ctx, till(farmOf(ctx.world, ctx.agent.slot), position(ctx), actionContext(ctx)));
}

export function callWater(ctx: CallContext): HostOutcome {
  return farmOutcome(ctx, water(farmOf(ctx.world, ctx.agent.slot), position(ctx), actionContext(ctx)));
}

export function callRefill(ctx: CallContext): HostOutcome {
  return farmOutcome(ctx, refill(farmOf(ctx.world, ctx.agent.slot), position(ctx)));
}

/** Wrapped distance along one axis of a gridSize-wide torus. */
function wrappedAxis(from: number, to: number, gridSize: number): number {
  const direct = Math.abs(from - to);
  return Math.min(direct, gridSize - direct);
}

export function callGoto(ctx: CallContext): HostOutcome {
  const { gridSize } = ctx.world.config;
  const range = { min: 0, max: gridSize - 1 };
  const x = decodeInt(ctx.values, 'goto', 0, arg(ctx, 0), range, `a column from 0 to ${range.max}`);
  if (!x.ok) return fail(ctx, x.error);
  const y = decodeInt(ctx.values, 'goto', 1, arg(ctx, 1), range, `a row from 0 to ${range.max}`);
  if (!y.ok) return fail(ctx, y.error);
  const distance = wrappedAxis(ctx.agent.x, x.value, gridSize) + wrappedAxis(ctx.agent.y, y.value, gridSize);
  const agent = { ...ctx.agent, x: x.value, y: y.value };
  return ok(ctx, ctx.values.none, ctx.agent.drone.moveCost * distance, {
    agent,
    events: [{ k: 'move', to: [x.value, y.value] }],
  });
}

export function callSell(ctx: CallContext): HostOutcome {
  const crop = decodeCrop(ctx.values, 'sell', arg(ctx, 0));
  if (!crop.ok) return fail(ctx, crop.error);
  const n = decodeInt(ctx.values, 'sell', 1, arg(ctx, 1));
  if (!n.ok) return fail(ctx, n.error);
  const sold = sell(ctx.world.market, farmOf(ctx.world, ctx.agent.slot), crop.value, n.value, ctx.t);
  const world = { ...withFarm(ctx.world, ctx.agent.slot, sold.farm), market: sold.market };
  const events = sold.lot === null ? [] : [{ k: 'sell' as const, ...sold.lot }];
  return ok(ctx, ctx.values.int(sold.gained), ACTION_COSTS.sell, { world, events });
}

export function callWait(ctx: CallContext): HostOutcome {
  const n = decodeInt(ctx.values, 'wait', 0, arg(ctx, 0), { min: WAIT_BOUNDS.min, max: WAIT_BOUNDS.max });
  if (!n.ok) return fail(ctx, n.error);
  return ok(ctx, ctx.values.none, n.value);
}

export function callSpawn(ctx: CallContext): HostOutcome {
  if (!ctx.world.config.spawnEnabled) {
    return fail(ctx, { code: LOCKED, message: '`spawn()` is single-player only in v1.' });
  }
  const fn = decodeFunction(ctx.values, 'spawn', arg(ctx, 0));
  if (!fn.ok) return fail(ctx, fn.error);
  const at = position(ctx);
  const already = ctx.world.secondDroneSpawned[ctx.agent.slot] === true;
  if (already) {
    return ok(ctx, ctx.values.bool(false), ACTION_COSTS.spawnFailed, {
      events: [{ k: 'spawn', at, ok: false }],
    });
  }
  const secondDroneSpawned = ctx.world.secondDroneSpawned.map(
    (flag, slot) => flag || slot === ctx.agent.slot,
  );
  return ok(ctx, ctx.values.bool(true), ACTION_COSTS.spawn, {
    world: { ...ctx.world, secondDroneSpawned },
    events: [{ k: 'spawn', at, ok: true }],
    spawned: { agent: { ...ctx.agent, droneNo: 1 }, fn: fn.value },
  });
}

export function callHalt(ctx: CallContext): HostOutcome {
  return ok(ctx, ctx.values.none, ACTION_COSTS.halt, { events: [{ k: 'halt' }], halted: true });
}
