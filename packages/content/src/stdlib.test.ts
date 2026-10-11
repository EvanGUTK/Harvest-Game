import { describe, expect, it } from 'vitest';
import {
  ACTION_COSTS,
  CROP_IDS,
  CROPS,
  PURE_COSTS,
  SENSOR_COSTS,
  WAIT_BOUNDS,
  WAIT_CYCLES_PER_UNIT,
} from './index';
import { BUILTINS, CONSTANTS } from './stdlib';
import type { BuiltinMeta, Unlock } from './stdlib';

/**
 * The builtins of docs/02-language/standard-library.md, hand-pinned from its three tables
 * (Actions, Sensors, Pure helpers; only `random` is a host helper, the rest are lang intrinsics),
 * in document order. Unlock is the doc's Unlock column.
 */
const chapter = (n: number, node?: string): Unlock =>
  node === undefined ? { chapter: n } : { chapter: n, node };

const PINNED: readonly (readonly [name: string, kind: BuiltinMeta['kind'], unlock: Unlock])[] = [
  ['move', 'action', chapter(1)],
  ['plant', 'action', chapter(1)],
  ['harvest', 'action', chapter(1)],
  ['till', 'action', { node: 'till' }],
  ['water', 'action', { node: 'water' }],
  ['refill', 'action', { node: 'water' }],
  ['goto', 'action', chapter(5)],
  ['sell', 'action', chapter(8, 'sell')],
  ['wait', 'action', chapter(4)],
  ['spawn', 'action', chapter(10)],
  ['halt', 'action', chapter(1)],
  ['pos_x', 'sensor', chapter(5)],
  ['pos_y', 'sensor', chapter(5)],
  ['world_size', 'sensor', chapter(2)],
  ['crop', 'sensor', chapter(3)],
  ['is_ripe', 'sensor', chapter(3, 'is-ripe-sensor')],
  ['is_withered', 'sensor', chapter(3)],
  ['growth', 'sensor', chapter(4)],
  ['soil', 'sensor', { node: 'till' }],
  ['moisture', 'sensor', { node: 'moisture-sensor' }],
  ['water_left', 'sensor', { node: 'water' }],
  ['credits', 'sensor', chapter(5)],
  ['inventory', 'sensor', chapter(5)],
  ['price', 'sensor', chapter(8, 'price-sensor')],
  ['seed_cost', 'sensor', chapter(8, 'price-sensor')],
  ['measure', 'sensor', chapter(9, 'measure')],
  ['cycles', 'sensor', chapter(4)],
  ['cycles_left', 'sensor', chapter(4)],
  ['random', 'pure', chapter(8)],
];

function find(name: string): BuiltinMeta {
  const meta = BUILTINS.find((b) => b.name === name);
  if (meta === undefined) throw new Error(`missing builtin ${name}`);
  return meta;
}

describe('BUILTINS', () => {
  it('covers every builtin of the standard-library tables exactly once, in document order', () => {
    expect(BUILTINS.map((b) => b.name)).toEqual(PINNED.map(([name]) => name));
  });

  it('classifies each builtin as in its table: actions, sensors, and the one host pure helper', () => {
    expect(BUILTINS.map((b) => b.kind)).toEqual(PINNED.map(([, kind]) => kind));
  });

  it('matches the standard-library Unlock column for every builtin', () => {
    expect(BUILTINS.map((b) => b.unlock)).toEqual(PINNED.map(([, , unlock]) => unlock));
  });

  it('takes every cost from ACTION_COSTS, SENSOR_COSTS or PURE_COSTS', () => {
    const expected: Record<string, number> = {
      move: ACTION_COSTS.move,
      plant: ACTION_COSTS.plant,
      harvest: ACTION_COSTS.harvest,
      till: ACTION_COSTS.till,
      water: ACTION_COSTS.water,
      refill: ACTION_COSTS.refill,
      goto: ACTION_COSTS.move,
      sell: ACTION_COSTS.sell,
      wait: WAIT_CYCLES_PER_UNIT,
      spawn: ACTION_COSTS.spawn,
      halt: ACTION_COSTS.halt,
      pos_x: SENSOR_COSTS.pos_x,
      pos_y: SENSOR_COSTS.pos_y,
      world_size: SENSOR_COSTS.world_size,
      crop: SENSOR_COSTS.crop,
      is_ripe: SENSOR_COSTS.is_ripe,
      is_withered: SENSOR_COSTS.is_withered,
      growth: SENSOR_COSTS.growth,
      soil: SENSOR_COSTS.soil,
      moisture: SENSOR_COSTS.moisture,
      water_left: SENSOR_COSTS.water_left,
      credits: SENSOR_COSTS.credits,
      inventory: SENSOR_COSTS.inventory,
      price: SENSOR_COSTS.price,
      seed_cost: SENSOR_COSTS.seed_cost,
      measure: SENSOR_COSTS.measure,
      cycles: SENSOR_COSTS.cycles,
      cycles_left: SENSOR_COSTS.cycles_left,
      random: PURE_COSTS.random,
    };
    for (const b of BUILTINS) expect(b.cost, b.name).toBe(expected[b.name]);
  });

  it('pins the costs of the standard-library tables by value (move 20, plant 30, sell 10, spawn 200, price 3)', () => {
    expect([
      find('move').cost,
      find('plant').cost,
      find('sell').cost,
      find('spawn').cost,
      find('price').cost,
    ]).toEqual([20, 30, 10, 200, 3]);
  });

  it('flags exactly wait and goto as argument-dependent costs', () => {
    expect(BUILTINS.filter((b) => b.argumentCost === true).map((b) => b.name)).toEqual(['goto', 'wait']);
  });

  it('marks everything as touching the world except the pure helper random', () => {
    expect(BUILTINS.filter((b) => !b.touchesWorld).map((b) => b.name)).toEqual(['random']);
  });

  it('states the wait bounds in the catalogue phrasing: from 1 to 5,000 (standard-library.md)', () => {
    expect([WAIT_BOUNDS.min, WAIT_BOUNDS.max]).toEqual([1, 5_000]);
    expect(find('wait').paramHints).toEqual(['a whole number of cycles from 1 to 5,000']);
  });

  it('charges wait one cycle per unit of n', () => {
    expect(WAIT_CYCLES_PER_UNIT).toBe(1);
    expect(find('wait').cost).toBe(WAIT_CYCLES_PER_UNIT);
  });

  it('gives each builtin one hint per parameter', () => {
    for (const b of BUILTINS) expect(b.paramHints.length, b.name).toBe(b.params.length);
  });

  it('declares the parameters of the standard-library signatures', () => {
    expect(find('move').params).toEqual(['const']);
    expect(find('plant').params).toEqual(['const']);
    expect(find('goto').params).toEqual(['int', 'int']);
    expect(find('sell').params).toEqual(['const', 'int']);
    expect(find('wait').params).toEqual(['int']);
    expect(find('spawn').params).toEqual(['function']);
    expect(find('inventory').params).toEqual(['const']);
    expect(find('price').params).toEqual(['const']);
    expect(find('seed_cost').params).toEqual(['const']);
    expect(find('random').params).toEqual(['int']);
    expect(find('harvest').params).toEqual([]);
    expect(find('credits').params).toEqual([]);
  });

  it('declares the return kinds of the standard-library tables', () => {
    expect(find('move').returns).toBe('none');
    expect(find('plant').returns).toBe('bool');
    expect(find('sell').returns).toBe('int');
    expect(find('goto').returns).toBe('none');
    expect(find('halt').returns).toBe('none');
    expect(find('crop').returns).toBe('any');
    expect(find('soil').returns).toBe('const');
    expect(find('is_ripe').returns).toBe('bool');
    expect(find('price').returns).toBe('int');
  });

  it('uses the catalogue phrasing for the direction and crop hints (errors-and-diagnostics.md E-WRONG-ARG-COUNT)', () => {
    expect(find('move').paramHints).toEqual(['a direction like `NORTH`']);
    expect(find('plant').paramHints).toEqual(['a crop like `RADISH`']);
  });

  it('gives every builtin a one-sentence doc and an example that calls it', () => {
    for (const b of BUILTINS) {
      expect(b.doc.length, b.name).toBeGreaterThan(0);
      expect(b.doc.endsWith('.'), b.name).toBe(true);
      expect(b.example.startsWith(`${b.name}(`) || b.example.includes(`${b.name}(`), b.name).toBe(true);
    }
  });
});

describe('CONSTANTS', () => {
  it('lists the directions, then the crops in CROP_IDS order, then the soils (standard-library.md §Constants)', () => {
    expect(CONSTANTS.map((c) => c.name)).toEqual([
      'NORTH',
      'SOUTH',
      'EAST',
      'WEST',
      'RADISH',
      'CORN',
      'MELON',
      'GRASS',
      'TILLED',
      'ROCK',
    ]);
  });

  it('has unique stable ids: directions 0..3, crops 10 + CROP_IDS index, soils 20..22', () => {
    expect(CONSTANTS.map((c) => c.id)).toEqual([0, 1, 2, 3, 10, 11, 12, 20, 21, 22]);
    expect(new Set(CONSTANTS.map((c) => c.id)).size).toBe(CONSTANTS.length);
  });

  it('lines the crop constants up with CROP_IDS', () => {
    const crops = CONSTANTS.filter((c) => c.group === 'crop');
    expect(crops.map((c) => c.name.toLowerCase())).toEqual([...CROP_IDS]);
    expect(crops.map((c) => c.id)).toEqual(CROP_IDS.map((_, i) => 10 + i));
  });

  it('names each crop constant as CROPS says: RADISH, CORN, MELON', () => {
    const crops = CONSTANTS.filter((c) => c.group === 'crop');
    expect(crops.map((c) => c.name)).toEqual(CROP_IDS.map((id) => CROPS[id].constant));
  });

  it('groups constants as direction, crop and soil', () => {
    expect(CONSTANTS.map((c) => c.group)).toEqual([
      'direction',
      'direction',
      'direction',
      'direction',
      'crop',
      'crop',
      'crop',
      'soil',
      'soil',
      'soil',
    ]);
  });

  it('unlocks directions and crops with Chapter 1 and the soils with the Till node', () => {
    for (const c of CONSTANTS.filter((k) => k.group !== 'soil'))
      expect(c.unlock, c.name).toEqual({ chapter: 1 });
    for (const c of CONSTANTS.filter((k) => k.group === 'soil'))
      expect(c.unlock, c.name).toEqual({ node: 'till' });
  });
});
