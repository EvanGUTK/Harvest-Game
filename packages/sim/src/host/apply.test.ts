import { ACTION_COSTS, BUILTINS, CROPS, MARKET, SENSOR_COSTS, WORLD } from '@harvest/content';
import type { Value } from '@harvest/lang';
import { describe, expect, it } from 'vitest';
import { createMarket } from '../market/market';
import { createStreams } from '../prng/streams';
import { createFakeValues } from '../testing/fake-values';
import { DEFAULT_DRONE_STATS } from '../world/actions';
import type { Farm } from '../world/farm';
import type { Tile } from '../types';
import { applyHostCall } from './apply';
import { constantIdOfCrop, constantIdOfSoil } from './constants';
import type { HostAgent, HostCall, HostOutcome, HostWorld } from './state';

const values = createFakeValues();
const GRID = 3;
const BUDGET = 30_000;
const T = 1_000;
const NORTH = 0;
const EAST = 2;
const RADISH = constantIdOfCrop('radish');
const CORN = constantIdOfCrop('corn');

const NO_DECAY = { moistureDecay: false } as const;

function tile(overrides: Partial<Tile> = {}): Tile {
  return { soil: 'grass', moisture: 50, lastUpdated: T, crop: null, ...overrides };
}

const unripe: Tile['crop'] = { kind: 'radish', plantedAt: 900, growth: 10, ripeAt: null, withered: false };
const ripe: Tile['crop'] = { kind: 'radish', plantedAt: 100, growth: 300, ripeAt: 400, withered: false };
const withered: Tile['crop'] = { kind: 'radish', plantedAt: 0, growth: 300, ripeAt: 300, withered: true };

/** One slot, 3×3 farm; the tile under the drone (1,2) is `here`. */
function worldWith(
  here: Tile,
  farm: Partial<Farm> = {},
  config: Partial<HostWorld['config']> = {},
): HostWorld {
  const tiles = Array.from({ length: GRID * GRID }, (_, i) => (i === 2 * GRID + 1 ? here : tile()));
  return {
    config: {
      gridSize: GRID,
      cycleBudget: BUDGET,
      spawnEnabled: false,
      randomEnabled: true,
      rules: NO_DECAY,
      ...config,
    },
    farms: [
      {
        credits: 100,
        silo: { radish: 0, corn: 0, melon: 0 },
        water: 60,
        tiles,
        everDryPaused: false,
        ...farm,
      },
    ],
    market: createMarket({ sharedMarket: true }),
    streams: createStreams(7, 1),
    secondDroneSpawned: [false],
  };
}

function agentAt(x = 1, y = 2, drone = DEFAULT_DRONE_STATS): HostAgent {
  return { slot: 0, droneNo: 0, x, y, drone };
}

function callOf(name: string, ...args: Value[]): HostCall {
  const fn = BUILTINS.findIndex((b) => b.name === name);
  if (fn < 0) throw new Error(`no builtin ${name}`);
  return { fn, args };
}

function run(world: HostWorld, call: HostCall, agent = agentAt(), t = T): HostOutcome {
  return applyHostCall(values, world, agent, call, t);
}

function okOf(outcome: HostOutcome) {
  if (outcome.kind !== 'ok') throw new Error(`expected ok, got ${outcome.error.message}`);
  return outcome;
}

function farmAfter(outcome: HostOutcome): Farm {
  const farm = okOf(outcome).world.farms[0];
  if (farm === undefined) throw new Error('no farm');
  return farm;
}

function hereAfter(outcome: HostOutcome): Tile {
  const found = farmAfter(outcome).tiles[2 * GRID + 1];
  if (found === undefined) throw new Error('no tile');
  return found;
}

const int = (v: Value) => values.asInt(v);
const bool = (v: Value) => values.asBool(v);

// standard-library.md §Outcome matrix (normative): the applied cost and result of every action row.
describe('applyHostCall: plant', () => {
  it('plants on empty grass: True, 30 cycles, seed cost deducted, a plant event', () => {
    const out = okOf(run(worldWith(tile()), callOf('plant', values.constant(RADISH))));
    expect([bool(out.value), out.cost]).toEqual([true, ACTION_COSTS.plant]);
    expect(farmAfter(out).credits).toBe(100 - CROPS.radish.seedCost);
    expect(hereAfter(out).crop?.kind).toBe('radish');
    expect(out.events).toEqual([{ k: 'plant', at: [1, 2], crop: 'radish', ok: true }]);
  });

  it('fails with False and cost 5 on a growing crop, on rock, on grass for corn and when broke', () => {
    const cases: [HostWorld, number][] = [
      [worldWith(tile({ crop: unripe })), RADISH],
      [worldWith(tile({ soil: 'rock' })), RADISH],
      [worldWith(tile()), CORN],
      [worldWith(tile(), { credits: 1 }), RADISH],
    ];
    for (const [world, crop] of cases) {
      const out = okOf(run(world, callOf('plant', values.constant(crop))));
      expect([bool(out.value), out.cost]).toEqual([false, ACTION_COSTS.plantFailed]);
    }
  });

  it('replaces a withered crop', () => {
    const out = okOf(run(worldWith(tile({ crop: withered })), callOf('plant', values.constant(RADISH))));
    expect([bool(out.value), out.cost]).toEqual([true, ACTION_COSTS.plant]);
  });

  it('raises R-BAD-ARG with the catalogue wording and no cost for a non-crop argument', () => {
    const out = run(worldWith(tile()), callOf('plant', values.int(5)));
    expect(out).toMatchObject({
      kind: 'error',
      cost: 0,
      error: { code: 'R-BAD-ARG', message: '`plant` needs a crop like `RADISH`, but got `5`' },
    });
  });
});

describe('applyHostCall: harvest', () => {
  it('on an empty tile: False, cost 5', () => {
    const out = okOf(run(worldWith(tile()), callOf('harvest')));
    expect([bool(out.value), out.cost]).toEqual([false, ACTION_COSTS.harvestEmpty]);
  });

  it('on an unripe crop: False, cost 30, the crop is destroyed and the soil keeps its tilled state', () => {
    const out = okOf(run(worldWith(tile({ soil: 'tilled', crop: unripe })), callOf('harvest')));
    expect([bool(out.value), out.cost]).toEqual([false, ACTION_COSTS.harvest]);
    expect(hereAfter(out)).toMatchObject({ crop: null, soil: 'tilled' });
  });

  it('on a withered crop: False, cost 30, cleared with no yield, tilled soil reverts to grass', () => {
    const out = okOf(run(worldWith(tile({ soil: 'tilled', crop: withered })), callOf('harvest')));
    expect([bool(out.value), out.cost]).toEqual([false, ACTION_COSTS.harvest]);
    expect(hereAfter(out)).toMatchObject({ crop: null, soil: 'grass' });
    expect(farmAfter(out).silo.radish).toBe(0);
  });

  it('on a ripe crop: True, cost 30, +1 to the silo, a harvest event', () => {
    const out = okOf(run(worldWith(tile({ crop: ripe })), callOf('harvest')));
    expect([bool(out.value), out.cost]).toEqual([true, ACTION_COSTS.harvest]);
    expect(farmAfter(out).silo.radish).toBe(1);
    expect(out.events).toEqual([{ k: 'harvest', at: [1, 2], crop: 'radish', ok: true }]);
  });
});

describe('applyHostCall: till, water, refill', () => {
  it('till turns grass into tilled soil (True, 30) and fails on rock (False, 5)', () => {
    const done = okOf(run(worldWith(tile()), callOf('till')));
    expect([bool(done.value), done.cost, hereAfter(done).soil]).toEqual([true, ACTION_COSTS.till, 'tilled']);
    const failed = okOf(run(worldWith(tile({ soil: 'rock' })), callOf('till')));
    expect([bool(failed.value), failed.cost]).toEqual([false, ACTION_COSTS.tillFailed]);
  });

  it('water adds 40 moisture capped at 100 and uses one unit (True, 25)', () => {
    const out = okOf(run(worldWith(tile({ moisture: 80 })), callOf('water')));
    expect([bool(out.value), out.cost]).toEqual([true, ACTION_COSTS.water]);
    expect(hereAfter(out).moisture).toBe(100);
    expect(farmAfter(out).water).toBe(59);
  });

  it('water uses the drone Sprayer amount and fails with cost 5 on an empty tank', () => {
    const sprayer = { ...DEFAULT_DRONE_STATS, waterAmount: 60 };
    expect(
      hereAfter(okOf(run(worldWith(tile({ moisture: 10 })), callOf('water'), agentAt(1, 2, sprayer))))
        .moisture,
    ).toBe(70);
    const dry = okOf(run(worldWith(tile(), { water: 0 }), callOf('water')));
    expect([bool(dry.value), dry.cost]).toEqual([false, ACTION_COSTS.waterFailed]);
  });

  it('refill on the well tile restores the tank (True, 60) and fails elsewhere (False, 5)', () => {
    const [wx, wy] = WORLD.wellTile;
    const onWell = okOf(run(worldWith(tile(), { water: 5 }), callOf('refill'), agentAt(wx, wy)));
    expect([bool(onWell.value), onWell.cost, farmAfter(onWell).water]).toEqual([
      true,
      ACTION_COSTS.refill,
      WORLD.waterCapacity,
    ]);
    const away = okOf(run(worldWith(tile(), { water: 5 }), callOf('refill')));
    expect([bool(away.value), away.cost, farmAfter(away).water]).toEqual([
      false,
      ACTION_COSTS.refillFailed,
      5,
    ]);
  });
});

describe('applyHostCall: move and goto', () => {
  it('move steps one tile at the drone move cost, wraps at the edge, and returns None', () => {
    const out = okOf(run(worldWith(tile()), callOf('move', values.constant(NORTH)), agentAt(1, 2)));
    expect([out.agent.x, out.agent.y, out.cost, values.kindOf(out.value)]).toEqual([
      1,
      0,
      ACTION_COSTS.move,
      'none',
    ]);
    expect(out.events).toEqual([{ k: 'move', to: [1, 0] }]);
    const rotor = { ...DEFAULT_DRONE_STATS, moveCost: 9 };
    expect(
      okOf(run(worldWith(tile()), callOf('move', values.constant(EAST)), agentAt(1, 2, rotor))).cost,
    ).toBe(9);
  });

  it('move rejects a non-direction with R-BAD-ARG', () => {
    const out = run(worldWith(tile()), callOf('move', values.constant(RADISH)));
    expect(out).toMatchObject({
      kind: 'error',
      error: { message: '`move` needs a direction like `NORTH`, but got `RADISH`' },
    });
  });

  it('goto costs the move cost times the wrapped Manhattan distance and emits one move event', () => {
    // From (1,2) to (0,0) on a 3×3 grid: dx 1, dy min(2, 1) = 1, so distance 2.
    const out = okOf(run(worldWith(tile()), callOf('goto', values.int(0), values.int(0))));
    expect([out.agent.x, out.agent.y, out.cost]).toEqual([0, 0, 2 * ACTION_COSTS.move]);
    expect(out.events).toEqual([{ k: 'move', to: [0, 0] }]);
    const rotor = { ...DEFAULT_DRONE_STATS, moveCost: 12 };
    expect(
      okOf(run(worldWith(tile()), callOf('goto', values.int(0), values.int(0)), agentAt(1, 2, rotor))).cost,
    ).toBe(24);
  });

  it('goto to the current tile costs 0 and still emits its move event', () => {
    const out = okOf(run(worldWith(tile()), callOf('goto', values.int(1), values.int(2))));
    expect([out.cost, out.events]).toEqual([0, [{ k: 'move', to: [1, 2] }]]);
  });

  it('goto rejects coordinates outside the grid with R-BAD-ARG', () => {
    const out = run(worldWith(tile()), callOf('goto', values.int(3), values.int(0)));
    expect(out).toMatchObject({
      kind: 'error',
      cost: 0,
      error: { message: '`goto` needs a column from 0 to 2, but got `3`' },
    });
    const row = run(worldWith(tile()), callOf('goto', values.int(0), values.int(-1)));
    expect(row).toMatchObject({
      kind: 'error',
      error: { message: '`goto` needs a row from 0 to 2, but got `-1`' },
    });
  });
});

describe('applyHostCall: sell, wait, halt', () => {
  it('sell sells up to n at the lot price, returns the credits gained and logs one lot (cost 10)', () => {
    const world = worldWith(tile(), { silo: { radish: 4, corn: 0, melon: 0 } });
    const out = okOf(run(world, callOf('sell', values.constant(RADISH), values.int(3))));
    expect(out.cost).toBe(ACTION_COSTS.sell);
    expect(int(out.value)).toBe(3 * CROPS.radish.basePrice);
    expect(farmAfter(out)).toMatchObject({ credits: 100 + 3 * CROPS.radish.basePrice, silo: { radish: 1 } });
    expect(out.world.market.pressure.radish).toBe(3);
    expect(out.events).toEqual([
      {
        k: 'sell',
        crop: 'radish',
        n: 3,
        price: CROPS.radish.basePrice,
        credits: 100 + 3 * CROPS.radish.basePrice,
      },
    ]);
  });

  it('sell with nothing in the silo returns 0, logs no event and still costs 10', () => {
    const out = okOf(run(worldWith(tile()), callOf('sell', values.constant(RADISH), values.int(5))));
    expect([int(out.value), out.cost, out.events]).toEqual([0, ACTION_COSTS.sell, []]);
  });

  it('wait costs n and returns None; n outside 1..5000 is R-BAD-ARG', () => {
    expect(okOf(run(worldWith(tile()), callOf('wait', values.int(37)))).cost).toBe(37);
    expect(okOf(run(worldWith(tile()), callOf('wait', values.int(5_000)))).cost).toBe(5_000);
    expect(run(worldWith(tile()), callOf('wait', values.int(0)))).toMatchObject({
      kind: 'error',
      error: {
        code: 'R-BAD-ARG',
        message: '`wait` needs a whole number of cycles from 1 to 5,000, but got `0`',
      },
    });
    expect(run(worldWith(tile()), callOf('wait', values.int(5_001))).kind).toBe('error');
  });

  it('halt costs 0, emits a halt event and reports halted', () => {
    const out = okOf(run(worldWith(tile()), callOf('halt')));
    expect([out.cost, out.halted, out.events]).toEqual([0, true, [{ k: 'halt' }]]);
  });
});

describe('applyHostCall: spawn (standard-library.md §Second drone)', () => {
  const FN = values.fn();

  it('is rejected as a locked feature while spawn is disabled (D-24)', () => {
    expect(run(worldWith(tile()), callOf('spawn', FN))).toMatchObject({
      kind: 'error',
      cost: 0,
      error: { code: 'E-LOCKED-FEATURE', message: '`spawn()` is single-player only in v1.' },
    });
  });

  it('rejects a non-function argument with R-BAD-ARG instead of spawning', () => {
    const world = worldWith(tile(), {}, { spawnEnabled: true });
    const out = run(world, callOf('spawn', values.int(5)));
    expect(out).toMatchObject({
      kind: 'error',
      cost: 0,
      error: { code: 'R-BAD-ARG', message: '`spawn` needs a function that takes no arguments, but got `5`' },
    });
  });

  it('hands the function to run to the scheduler with the new agent', () => {
    const world = worldWith(tile(), {}, { spawnEnabled: true });
    const out = okOf(run(world, callOf('spawn', FN)));
    expect(out.spawned?.fn).toBe(FN);
    expect(out.spawned?.agent).toMatchObject({ slot: 0, droneNo: 1, x: 1, y: 2 });
  });

  it('allows one extra drone per slot: a second spawn from slot 1 still works after slot 0 spawned', () => {
    const base = worldWith(tile(), {}, { spawnEnabled: true });
    const world: HostWorld = {
      ...base,
      farms: [...base.farms, ...base.farms],
      streams: createStreams(7, 2),
      secondDroneSpawned: [true, false],
    };
    const slot1 = { ...agentAt(), slot: 1 };
    const out = okOf(run(world, callOf('spawn', FN), slot1));
    expect([bool(out.value), out.cost]).toEqual([true, ACTION_COSTS.spawn]);
    expect(out.world.secondDroneSpawned).toEqual([true, true]);
    const slot0 = okOf(run(world, callOf('spawn', FN)));
    expect([bool(slot0.value), slot0.cost]).toEqual([false, ACTION_COSTS.spawnFailed]);
  });

  it('starts drone 1 at the caller position for 200, then a second spawn is False and costs 5', () => {
    const world = worldWith(tile(), {}, { spawnEnabled: true });
    const first = okOf(run(world, callOf('spawn', FN)));
    expect([bool(first.value), first.cost]).toEqual([true, ACTION_COSTS.spawn]);
    expect(first.spawned?.agent).toMatchObject({ slot: 0, droneNo: 1, x: 1, y: 2 });
    expect(first.events).toEqual([{ k: 'spawn', at: [1, 2], ok: true }]);
    const second = okOf(run(first.world, callOf('spawn', FN)));
    expect([bool(second.value), second.cost, second.spawned]).toEqual([
      false,
      ACTION_COSTS.spawnFailed,
      undefined,
    ]);
    expect(second.events).toEqual([{ k: 'spawn', at: [1, 2], ok: false }]);
  });
});

// standard-library.md §Sensors and the "What the crop sensors say" table.
describe('applyHostCall: sensors', () => {
  const read = (name: string, here: Tile, ...args: Value[]) =>
    okOf(run(worldWith(here), callOf(name, ...args)));

  it('position and world sensors cost 1 and read the agent and the config', () => {
    for (const [name, expected] of [
      ['pos_x', 1],
      ['pos_y', 2],
      ['world_size', GRID],
    ] as const) {
      const out = read(name, tile());
      expect([int(out.value), out.cost]).toEqual([expected, SENSOR_COSTS[name]]);
    }
  });

  it('crop reads None on an empty tile and the crop constant otherwise (cost 2)', () => {
    const empty = read('crop', tile());
    expect([values.kindOf(empty.value), empty.cost]).toEqual(['none', SENSOR_COSTS.crop]);
    for (const crop of [unripe, ripe, withered]) {
      const out = read('crop', tile({ crop }));
      expect(values.asConstantId(out.value)).toBe(RADISH);
    }
  });

  it('is_ripe, is_withered and growth follow the table: empty, growing, ripe, withered', () => {
    const rows: [Tile['crop'], boolean, boolean, number][] = [
      [null, false, false, 0],
      [{ ...unripe, growth: 150 }, false, false, 50],
      [ripe, true, false, 100],
      [withered, false, true, 100],
    ];
    for (const [crop, isRipe, isWithered, growth] of rows) {
      const here = tile({ crop });
      expect(bool(read('is_ripe', here).value)).toBe(isRipe);
      expect(bool(read('is_withered', here).value)).toBe(isWithered);
      expect(int(read('growth', here).value)).toBe(growth);
    }
    expect(read('growth', tile()).cost).toBe(SENSOR_COSTS.growth);
  });

  it('reads are taken at t: a crop stored unripe has ripened by the time the sensor is called', () => {
    const stale = tile({
      crop: { kind: 'radish', plantedAt: 100, growth: 0, ripeAt: null, withered: false },
      moisture: 100,
      lastUpdated: 100,
    });
    expect(bool(read('is_ripe', stale).value)).toBe(true);
    expect(int(read('growth', stale).value)).toBe(100);
  });

  it('soil reads the soil constant and moisture the advanced moisture', () => {
    expect(values.asConstantId(read('soil', tile({ soil: 'tilled' })).value)).toBe(
      constantIdOfSoil('tilled'),
    );
    const decaying = okOf(
      run(
        worldWith(tile({ moisture: 10, lastUpdated: 0 }), {}, { rules: { moistureDecay: true } }),
        callOf('moisture'),
      ),
    );
    expect(int(decaying.value)).toBe(0);
    expect(decaying.cost).toBe(SENSOR_COSTS.moisture);
  });

  it('farm sensors read water, credits and the silo; seed_cost reads content', () => {
    const world = worldWith(tile(), { water: 17, credits: 345, silo: { radish: 0, corn: 6, melon: 0 } });
    expect(int(okOf(run(world, callOf('water_left'))).value)).toBe(17);
    expect(int(okOf(run(world, callOf('credits'))).value)).toBe(345);
    expect(int(okOf(run(world, callOf('inventory', values.constant(CORN)))).value)).toBe(6);
    const seed = okOf(run(world, callOf('seed_cost', values.constant(CORN))));
    expect([int(seed.value), seed.cost]).toEqual([CROPS.corn.seedCost, SENSOR_COSTS.seed_cost]);
    expect(run(world, callOf('inventory', values.int(1))).kind).toBe('error');
  });

  it('price reads the market advanced to t (pressure decays once at 500) at cost 3', () => {
    const world = {
      ...worldWith(tile()),
      market: { ...createMarket({ sharedMarket: true }), pressure: { radish: 100, corn: 0, melon: 0 } },
    };
    const out = okOf(run(world, callOf('price', values.constant(RADISH)), agentAt(), 600));
    const decayed = Math.floor((100 * MARKET.pressureDecayNumerator) / MARKET.pressureDecayDenominator);
    const priceBp = Math.max(MARKET.priceFloorBp, 10_000 - MARKET.pressureStepBp * decayed);
    expect(int(out.value)).toBe(Math.floor((CROPS.radish.basePrice * priceBp) / 10_000));
    expect(out.cost).toBe(SENSOR_COSTS.price);
    expect(out.world.market.pressure.radish).toBe(decayed);
  });

  it('cycles returns the call cycle and cycles_left the budget remainder, never below 0', () => {
    const at = (name: string, t: number) =>
      int(okOf(run(worldWith(tile()), callOf(name), agentAt(), t)).value);
    expect(at('cycles', 777)).toBe(777);
    expect(at('cycles_left', 777)).toBe(BUDGET - 777);
    expect(at('cycles_left', BUDGET + 5)).toBe(0);
  });

  it('measure reads 0 for the crops that have no measurement', () => {
    expect(int(read('measure', tile({ crop: ripe })).value)).toBe(0);
  });
});

describe('applyHostCall: random (host pure helper)', () => {
  it('draws next() % n from the slot stream, costing 2 and not touching the farm', () => {
    const world = worldWith(tile());
    const reference = createStreams(7, 1).player(0);
    const out = okOf(run(world, callOf('random', values.int(6))));
    expect(int(out.value)).toBe(reference.next() % 6);
    expect(out.cost).toBe(2);
    expect(out.world.farms).toBe(world.farms);
  });

  it('rejects n below 1 with the catalogue wording, and is locked when randomEnabled is false', () => {
    expect(run(worldWith(tile()), callOf('random', values.int(0)))).toMatchObject({
      kind: 'error',
      error: { code: 'R-BAD-ARG', message: '`random` needs a whole number of 1 or more, but got `0`' },
    });
    expect(
      run(worldWith(tile(), {}, { randomEnabled: false }), callOf('random', values.int(6))),
    ).toMatchObject({
      kind: 'error',
      error: { code: 'E-LOCKED-FEATURE' },
    });
  });
});

describe('applyHostCall: table coverage and purity', () => {
  it('has a handler for every builtin in the content table', () => {
    const argFor = (name: string, kind: string): Value => {
      if (kind === 'const') return values.constant(name === 'move' ? NORTH : RADISH);
      if (kind === 'function') return values.fn();
      return values.int(1);
    };
    for (const [fn, meta] of BUILTINS.entries()) {
      const args = meta.params.map((kind) => argFor(meta.name, kind));
      const world = worldWith(tile(), {}, { spawnEnabled: true });
      expect(() => applyHostCall(values, world, agentAt(), { fn, args }, T)).not.toThrow();
    }
  });

  it('throws an invariant error for a host id outside the table', () => {
    expect(() => run(worldWith(tile()), { fn: BUILTINS.length, args: [] })).toThrow(/SIM-UNKNOWN-BUILTIN/);
  });

  it('never mutates the world it is given', () => {
    const world = worldWith(tile({ crop: ripe }), { silo: { radish: 3, corn: 0, melon: 0 } });
    const before = JSON.stringify([world.farms, world.market, world.secondDroneSpawned]);
    for (const call of [
      callOf('harvest'),
      callOf('sell', values.constant(RADISH), values.int(2)),
      callOf('water'),
      callOf('price', values.constant(CORN)),
    ]) {
      run(world, call);
    }
    expect(JSON.stringify([world.farms, world.market, world.secondDroneSpawned])).toBe(before);
  });
});
