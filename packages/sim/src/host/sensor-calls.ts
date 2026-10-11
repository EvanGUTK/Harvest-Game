/**
 * The sensor builtins and the pure helper as host calls.
 * Design: docs/02-language/standard-library.md §Sensors (cost and "What the crop sensors say"),
 * docs/03-architecture/simulation-engine.md §Lazy world advancement.
 * Invariants: a tile sensor first advances its tile to the call's cycle (touchTile), so reads see growth, moisture
 * and wither as of `t`; `price` advances the market to `t` first; costs are the SENSOR_COSTS / PURE_COSTS values in
 * the metadata; sensors change nothing but that catch-up (and the PRNG stream for `random`).
 */

import { BUILTINS, CROPS } from '@harvest/content';
import { randomBelow } from '../prng/streams';
import { advanceMarket, marketPrice } from '../market/market';
import {
  sensorCrop,
  sensorGrowth,
  sensorIsRipe,
  sensorIsWithered,
  sensorMoisture,
  sensorSoil,
} from '../world/sensors';
import { touchTile } from '../world/farm';
import type { Tile } from '../types';
import { decodeCrop, decodeInt } from './args';
import { arg, farmOf, fail, ok, position, withFarm, type CallContext } from './call-context';
import { constantIdOfCrop, constantIdOfSoil } from './constants';
import type { HostOutcome } from './state';
import type { Value } from '@harvest/lang';

function metaCost(name: string): number {
  const meta = BUILTINS.find((b) => b.name === name);
  if (meta === undefined) throw new Error(`no builtin named ${name}`);
  return meta.cost;
}

/** A sensor that reads the tile under the drone, advanced to `t`. */
function tileSensor(name: string, read: (ctx: CallContext, tile: Tile) => Value) {
  return (ctx: CallContext): HostOutcome => {
    const { config } = ctx.world;
    const touched = touchTile(
      farmOf(ctx.world, ctx.agent.slot),
      config.gridSize,
      position(ctx),
      ctx.t,
      config.rules,
    );
    const world = withFarm(ctx.world, ctx.agent.slot, touched.farm);
    return ok(ctx, read(ctx, touched.tile), metaCost(name), { world });
  };
}

function farmSensor(name: string, read: (ctx: CallContext) => Value) {
  return (ctx: CallContext): HostOutcome => ok(ctx, read(ctx), metaCost(name));
}

export const callPosX = farmSensor('pos_x', (ctx) => ctx.values.int(ctx.agent.x));
export const callPosY = farmSensor('pos_y', (ctx) => ctx.values.int(ctx.agent.y));
export const callWorldSize = farmSensor('world_size', (ctx) => ctx.values.int(ctx.world.config.gridSize));
export const callWaterLeft = farmSensor('water_left', (ctx) =>
  ctx.values.int(farmOf(ctx.world, ctx.agent.slot).water),
);
export const callCredits = farmSensor('credits', (ctx) =>
  ctx.values.int(farmOf(ctx.world, ctx.agent.slot).credits),
);
export const callCycles = farmSensor('cycles', (ctx) => ctx.values.int(ctx.t));
export const callCyclesLeft = farmSensor('cycles_left', (ctx) =>
  ctx.values.int(Math.max(0, ctx.world.config.cycleBudget - ctx.t)),
);

export const callCrop = tileSensor('crop', (ctx, tile) => {
  const kind = sensorCrop(tile);
  return kind === null ? ctx.values.none : ctx.values.constant(constantIdOfCrop(kind));
});
export const callIsRipe = tileSensor('is_ripe', (ctx, tile) => ctx.values.bool(sensorIsRipe(tile)));
export const callIsWithered = tileSensor('is_withered', (ctx, tile) =>
  ctx.values.bool(sensorIsWithered(tile)),
);
export const callGrowth = tileSensor('growth', (ctx, tile) => ctx.values.int(sensorGrowth(tile)));
export const callSoil = tileSensor('soil', (ctx, tile) =>
  ctx.values.constant(constantIdOfSoil(sensorSoil(tile))),
);
export const callMoisture = tileSensor('moisture', (ctx, tile) => ctx.values.int(sensorMoisture(tile)));

/** `measure()` reads a crop-specific quantity that radish, corn and melon do not have; it reads 0 (Ch 9 crops add more). */
export const callMeasure = tileSensor('measure', (ctx) => ctx.values.int(0));

export function callInventory(ctx: CallContext): HostOutcome {
  const crop = decodeCrop(ctx.values, 'inventory', arg(ctx, 0));
  if (!crop.ok) return fail(ctx, crop.error);
  return ok(ctx, ctx.values.int(farmOf(ctx.world, ctx.agent.slot).silo[crop.value]), metaCost('inventory'));
}

export function callSeedCost(ctx: CallContext): HostOutcome {
  const crop = decodeCrop(ctx.values, 'seed_cost', arg(ctx, 0));
  if (!crop.ok) return fail(ctx, crop.error);
  return ok(ctx, ctx.values.int(CROPS[crop.value].seedCost), metaCost('seed_cost'));
}

export function callPrice(ctx: CallContext): HostOutcome {
  const crop = decodeCrop(ctx.values, 'price', arg(ctx, 0));
  if (!crop.ok) return fail(ctx, crop.error);
  const market = advanceMarket(ctx.world.market, ctx.t);
  return ok(ctx, ctx.values.int(marketPrice(market, crop.value)), metaCost('price'), {
    world: { ...ctx.world, market },
  });
}

export function callRandom(ctx: CallContext): HostOutcome {
  if (!ctx.world.config.randomEnabled) {
    return fail(ctx, {
      code: 'E-LOCKED-FEATURE',
      message: '`random()` is turned off in ranked matches so replays stay clean.',
    });
  }
  const n = decodeInt(ctx.values, 'random', 0, arg(ctx, 0), { min: 1 });
  if (!n.ok) return fail(ctx, n.error);
  return ok(
    ctx,
    ctx.values.int(randomBelow(ctx.world.streams.player(ctx.agent.slot), n.value)),
    metaCost('random'),
  );
}
