/**
 * Standard-library metadata: one row per builtin and per constant the player can use.
 * Design: docs/02-language/standard-library.md (the tables are the source), docs/02-language/curriculum.md (gating).
 * Invariants: data only; every cost comes from ACTION_COSTS, SENSOR_COSTS, PURE_COSTS or WAIT_CYCLES_PER_UNIT, never a
 * literal; the order of BUILTINS is the order of the doc and append-only (the sim host table uses the index as the
 * host id); constant ids are stable, and the crop ids are 10 + the index in CROP_IDS (pinned by a test).
 */

import { ACTION_COSTS, PURE_COSTS, SENSOR_COSTS, WAIT_CYCLES_PER_UNIT } from './costs';
import { CROP_IDS, CROPS } from './crops';

/** The groups of game constants (`NORTH`, `RADISH`, `GRASS`, ...). */
export type ConstantGroup = 'direction' | 'crop' | 'soil';

/**
 * What kind of value a builtin takes or returns. A constant names the group it accepts (`const:direction`,
 * `const:crop` or `const:soil`) so the host signature, the editor hints and the host's argument check know which
 * constants are valid. The compiler only knows a constant when it sees one: `move(RADISH)` compiles and the
 * host raises the runtime `R-BAD-ARG` (standard-library.md §Bad arguments).
 */
export type ParamKind = 'int' | 'bool' | 'str' | 'function' | `const:${ConstantGroup}`;

/** Campaign gating (the Unlock column). Everything is unlocked in multiplayer. */
export type Unlock =
  /** A chapter teaches it; `node` is also required when the skill tree sells it ("Ch 8 · Skill: Sell"). */
  | { chapter: number; node?: string }
  /** Sold by a skill-tree node only ("Skill: Till"). */
  | { node: string };

export type BuiltinMeta = {
  name: string;
  kind: 'action' | 'sensor' | 'pure';
  params: readonly ParamKind[];
  optionalParams?: number;
  returns: ParamKind | 'none' | 'any';
  /** Cycles on top of the 1-cycle CALL_HOST. For `argumentCost` builtins this is the per-unit default. */
  cost: number;
  /** True when the real cost depends on the arguments (`wait(n)` costs n, `goto` costs move × distance). */
  argumentCost?: true;
  touchesWorld: boolean;
  unlock: Unlock;
  /** One phrase per parameter, as the error messages and autocomplete say it: "a direction like `NORTH`". */
  paramHints: readonly string[];
  /** One sentence for the editor's hover text. */
  doc: string;
  example: string;
};

export type ConstantMeta = {
  name: string;
  /** Stable across versions; the VM stores constants by id. */
  id: number;
  group: ConstantGroup;
  unlock: Unlock;
};

const DIRECTION_HINT = 'a direction like `NORTH`';
const CROP_HINT = 'a crop like `RADISH`';
const COUNT_HINT = 'a whole number of units';

// Skill-node ids used in the Unlock fields below (till, water, moisture-sensor, is-ripe-sensor, sell,
// price-sensor, measure): provisional, CNT-05 owns the final ids.
const chapter = (n: number, node?: string): Unlock =>
  node === undefined ? { chapter: n } : { chapter: n, node };

export const BUILTINS: readonly BuiltinMeta[] = [
  // ---------- Actions ----------
  {
    name: 'move',
    kind: 'action',
    params: ['const:direction'],
    returns: 'none',
    cost: ACTION_COSTS.move,
    touchesWorld: true,
    unlock: chapter(1),
    paramHints: [DIRECTION_HINT],
    doc: 'Moves the drone one tile, wrapping at the edges.',
    example: 'move(EAST)',
  },
  {
    name: 'plant',
    kind: 'action',
    params: ['const:crop'],
    returns: 'bool',
    cost: ACTION_COSTS.plant,
    touchesWorld: true,
    unlock: chapter(1),
    paramHints: [CROP_HINT],
    doc: 'Buys a seed and plants it on this tile, returning False if it cannot.',
    example: 'plant(RADISH)',
  },
  {
    name: 'harvest',
    kind: 'action',
    params: [],
    returns: 'bool',
    cost: ACTION_COSTS.harvest,
    touchesWorld: true,
    unlock: chapter(1),
    paramHints: [],
    doc: 'Harvests the ripe crop on this tile into the silo.',
    example: 'harvest()',
  },
  {
    name: 'till',
    kind: 'action',
    params: [],
    returns: 'bool',
    cost: ACTION_COSTS.till,
    touchesWorld: true,
    unlock: { node: 'till' },
    paramHints: [],
    doc: 'Turns grass into tilled soil, returning False if the tile cannot be tilled.',
    example: 'till()',
  },
  {
    name: 'water',
    kind: 'action',
    params: [],
    returns: 'bool',
    cost: ACTION_COSTS.water,
    touchesWorld: true,
    unlock: { node: 'water' },
    paramHints: [],
    doc: 'Adds moisture to this tile and uses one unit of water, returning False when the tank is empty.',
    example: 'water()',
  },
  {
    name: 'refill',
    kind: 'action',
    params: [],
    returns: 'bool',
    cost: ACTION_COSTS.refill,
    touchesWorld: true,
    unlock: { node: 'water' },
    paramHints: [],
    doc: 'Refills the water tank, only on the well tile at (0, 0).',
    example: 'refill()',
  },
  {
    name: 'goto',
    kind: 'action',
    params: ['int', 'int'],
    returns: 'none',
    cost: ACTION_COSTS.move,
    argumentCost: true,
    touchesWorld: true,
    unlock: chapter(5),
    paramHints: ['a column from 0 to the farm size minus 1', 'a row from 0 to the farm size minus 1'],
    doc: 'Flies to the tile (x, y) by the shortest wrapped path, costing the move cost for each step of distance.',
    example: 'goto(3, 2)',
  },
  {
    name: 'sell',
    kind: 'action',
    params: ['const:crop', 'int'],
    returns: 'int',
    cost: ACTION_COSTS.sell,
    touchesWorld: true,
    unlock: chapter(8, 'sell'),
    paramHints: [CROP_HINT, COUNT_HINT],
    doc: 'Sells up to n units of a crop from the silo at the current price and returns the credits gained.',
    example: 'sell(RADISH, inventory(RADISH))',
  },
  {
    name: 'wait',
    kind: 'action',
    params: ['int'],
    returns: 'none',
    cost: WAIT_CYCLES_PER_UNIT,
    argumentCost: true,
    touchesWorld: true,
    unlock: chapter(4),
    paramHints: ['a whole number of cycles from 1 to 5,000'],
    doc: 'Does nothing for n cycles, which is cheaper than a busy loop.',
    example: 'wait(50)',
  },
  {
    name: 'spawn',
    kind: 'action',
    params: ['function'],
    returns: 'bool',
    cost: ACTION_COSTS.spawn,
    touchesWorld: true,
    unlock: chapter(10),
    paramHints: ['a function that takes no arguments'],
    doc: 'Starts a second drone at your position running the given function.',
    example: 'spawn(sweep)',
  },
  {
    name: 'halt',
    kind: 'action',
    params: [],
    returns: 'none',
    cost: ACTION_COSTS.halt,
    touchesWorld: true,
    unlock: chapter(1),
    paramHints: [],
    doc: 'Stops this drone.',
    example: 'halt()',
  },
  // ---------- Sensors ----------
  {
    name: 'pos_x',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.pos_x,
    touchesWorld: true,
    unlock: chapter(5),
    paramHints: [],
    doc: 'Returns the drone’s column.',
    example: 'x = pos_x()',
  },
  {
    name: 'pos_y',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.pos_y,
    touchesWorld: true,
    unlock: chapter(5),
    paramHints: [],
    doc: 'Returns the drone’s row.',
    example: 'y = pos_y()',
  },
  {
    name: 'world_size',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.world_size,
    touchesWorld: true,
    unlock: chapter(2),
    paramHints: [],
    doc: 'Returns the side length of the square farm.',
    example: 'n = world_size()',
  },
  {
    name: 'crop',
    kind: 'sensor',
    params: [],
    returns: 'any',
    cost: SENSOR_COSTS.crop,
    touchesWorld: true,
    unlock: chapter(3),
    paramHints: [],
    doc: 'Returns the crop on this tile, or None when the tile is empty.',
    example: 'if crop() == None:',
  },
  {
    name: 'is_ripe',
    kind: 'sensor',
    params: [],
    returns: 'bool',
    cost: SENSOR_COSTS.is_ripe,
    touchesWorld: true,
    unlock: chapter(3, 'is-ripe-sensor'),
    paramHints: [],
    doc: 'Returns True when the crop on this tile is ripe and not withered.',
    example: 'if is_ripe():',
  },
  {
    name: 'is_withered',
    kind: 'sensor',
    params: [],
    returns: 'bool',
    cost: SENSOR_COSTS.is_withered,
    touchesWorld: true,
    unlock: chapter(3),
    paramHints: [],
    doc: 'Returns True when the crop on this tile has withered.',
    example: 'if is_withered():',
  },
  {
    name: 'growth',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.growth,
    touchesWorld: true,
    unlock: chapter(4),
    paramHints: [],
    doc: 'Returns how grown the crop on this tile is, from 0 to 100 percent.',
    example: 'p = growth()',
  },
  {
    name: 'soil',
    kind: 'sensor',
    params: [],
    returns: 'const:soil',
    cost: SENSOR_COSTS.soil,
    touchesWorld: true,
    unlock: { node: 'till' },
    paramHints: [],
    doc: 'Returns the soil of this tile: GRASS, TILLED or ROCK.',
    example: 'if soil() == GRASS:',
  },
  {
    name: 'moisture',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.moisture,
    touchesWorld: true,
    unlock: { node: 'moisture-sensor' },
    paramHints: [],
    doc: 'Returns the moisture of this tile, from 0 to 100.',
    example: 'if moisture() < 10:',
  },
  {
    name: 'water_left',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.water_left,
    touchesWorld: true,
    unlock: { node: 'water' },
    paramHints: [],
    doc: 'Returns how many units of water the tank holds.',
    example: 'w = water_left()',
  },
  {
    name: 'credits',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.credits,
    touchesWorld: true,
    unlock: chapter(5),
    paramHints: [],
    doc: 'Returns your credits.',
    example: 'c = credits()',
  },
  {
    name: 'inventory',
    kind: 'sensor',
    params: ['const:crop'],
    returns: 'int',
    cost: SENSOR_COSTS.inventory,
    touchesWorld: true,
    unlock: chapter(5),
    paramHints: [CROP_HINT],
    doc: 'Returns how many units of a crop the silo holds.',
    example: 'n = inventory(RADISH)',
  },
  {
    name: 'price',
    kind: 'sensor',
    params: ['const:crop'],
    returns: 'int',
    cost: SENSOR_COSTS.price,
    touchesWorld: true,
    unlock: chapter(8, 'price-sensor'),
    paramHints: [CROP_HINT],
    doc: 'Returns the current market price of one unit of a crop.',
    example: 'p = price(CORN)',
  },
  {
    name: 'seed_cost',
    kind: 'sensor',
    params: ['const:crop'],
    returns: 'int',
    cost: SENSOR_COSTS.seed_cost,
    touchesWorld: true,
    unlock: chapter(8, 'price-sensor'),
    paramHints: [CROP_HINT],
    doc: 'Returns what one seed of a crop costs.',
    example: 'c = seed_cost(MELON)',
  },
  {
    name: 'measure',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.measure,
    touchesWorld: true,
    unlock: chapter(9, 'measure'),
    paramHints: [],
    doc: 'Returns a crop-specific measurement of the crop on this tile, such as a Sunroot yield or a Gourd size.',
    example: 'size = measure()',
  },
  {
    name: 'cycles',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.cycles,
    touchesWorld: true,
    unlock: chapter(4),
    paramHints: [],
    doc: 'Returns the cycle at which this call starts.',
    example: 't = cycles()',
  },
  {
    name: 'cycles_left',
    kind: 'sensor',
    params: [],
    returns: 'int',
    cost: SENSOR_COSTS.cycles_left,
    touchesWorld: true,
    unlock: chapter(4),
    paramHints: [],
    doc: 'Returns how many cycles are left in the budget.',
    example: 'if cycles_left() < 200:',
  },
  // ---------- Host pure helpers (no world access) ----------
  {
    name: 'random',
    kind: 'pure',
    params: ['int'],
    returns: 'int',
    cost: PURE_COSTS.random,
    touchesWorld: false,
    unlock: chapter(8),
    paramHints: ['a whole number of 1 or more'],
    doc: 'Returns a seeded random whole number from 0 to n − 1.',
    example: 'r = random(4)',
  },
];

const FIRST_CROP_ID = 10;
const FIRST_SOIL_ID = 20;

/** Directions, then crops in `CROP_IDS` order, then soils. */
export const CONSTANTS: readonly ConstantMeta[] = [
  { name: 'NORTH', id: 0, group: 'direction', unlock: chapter(1) },
  { name: 'SOUTH', id: 1, group: 'direction', unlock: chapter(1) },
  { name: 'EAST', id: 2, group: 'direction', unlock: chapter(1) },
  { name: 'WEST', id: 3, group: 'direction', unlock: chapter(1) },
  ...CROP_IDS.map((id, index): ConstantMeta => ({
    name: CROPS[id].constant,
    id: FIRST_CROP_ID + index,
    group: 'crop',
    unlock: chapter(1),
  })),
  { name: 'GRASS', id: FIRST_SOIL_ID, group: 'soil', unlock: { node: 'till' } },
  { name: 'TILLED', id: FIRST_SOIL_ID + 1, group: 'soil', unlock: { node: 'till' } },
  { name: 'ROCK', id: FIRST_SOIL_ID + 2, group: 'soil', unlock: { node: 'till' } },
];
