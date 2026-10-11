import { CROPS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { advanceMarket, createMarket, marketPressures, type MarketState } from '../market/market';
import { createStreams } from '../prng/streams';
import { advanceFarm, type Farm } from '../world/farm';
import type { Tile } from '../world/types';
import { stateHash, stateWords, type DroneHashState, type HashableState } from './state-hash';

function marketWith(pressure: Partial<MarketState['pressure']>): MarketState {
  const base = createMarket({ sharedMarket: true });
  return { ...base, pressure: { ...base.pressure, ...pressure } };
}

const RULES = { moistureDecay: false } as const;
const T = 700;

const RUNNING: DroneHashState = { x: 0, y: 0, clock: 500, status: 'running' };
const NOT_SPAWNED: DroneHashState = { x: 0, y: 0, clock: 0, status: 'not_spawned' };

const RIPE_RADISH_TILE: Tile = {
  soil: 'tilled',
  moisture: 40,
  lastUpdated: T,
  crop: { kind: 'radish', plantedAt: 100, growth: CROPS.radish.growCycles, ripeAt: 400, withered: false },
};

function farmOf(tiles: Tile[], overrides: Partial<Farm> = {}): Farm {
  return {
    credits: 100,
    silo: { radish: 2, corn: 3, melon: 4 },
    water: 60,
    tiles,
    everDryPaused: false,
    ...overrides,
  };
}

function oneByOne(overrides: Partial<HashableState> = {}): HashableState {
  return {
    gridSize: 1,
    farms: [farmOf([RIPE_RADISH_TILE])],
    drones: [[RUNNING, NOT_SPAWNED]],
    market: createMarket({ sharedMarket: true }),
    streams: createStreams(12_345, 1),
    ...overrides,
  };
}

// Expected values below were computed independently (Python), not by this code.
describe('stateWords (simulation-engine.md §State hash)', () => {
  it('writes t, gridSize, nSlots, market, farm, drones, tiles and PRNG words in the normative order', () => {
    expect(stateWords(oneByOne(), T, RULES)).toEqual([
      // 1. t, gridSize, nSlots
      700, 1, 1,
      // 2. market pressure per crop
      0, 0, 0,
      // 3. credits, silo per crop, water, then per drone x, y, clock, status
      100, 2, 3, 4, 60, 0, 0, 500, 0, 0, 0, 0, 3,
      // 4. tile: soil, moisture, cropCode, plantedAt, growth, ripeAt, withered
      1, 40, 0, 100, 300, 400, 0,
      // 5. sfc32 words of layout, weather, player:0
      2_690_456_710, 195_881_859, 3_944_623_570, 1_822_331_787, 1_544_931_915, 850_340_637, 2_202_805_336,
      2_611_900_137, 235_433_536, 2_394_084_199, 2_537_141_557, 3_359_519_354,
    ]);
  });

  it('writes a tile without a crop as cropCode −1, plantedAt 0, growth 0, ripeAt −1, withered 0', () => {
    const bare: Tile = { soil: 'rock', moisture: 12, lastUpdated: T, crop: null };
    const words = stateWords(oneByOne({ farms: [farmOf([bare])] }), T, RULES);
    expect(words.slice(19, 26)).toEqual([2, 12, -1, 0, 0, -1, 0]);
  });

  it('writes an unripe crop with its growth and ripeAt −1, and a withered one with withered 1', () => {
    const unripe: Tile = {
      soil: 'grass',
      moisture: 60,
      lastUpdated: T,
      crop: { kind: 'corn', plantedAt: 650, growth: 50, ripeAt: null, withered: false },
    };
    const unripeWords = stateWords(oneByOne({ farms: [farmOf([unripe])] }), T, { moistureDecay: false });
    expect(unripeWords.slice(19, 26)).toEqual([0, 60, 1, 650, 50, -1, 0]);
    const dead: Tile = {
      soil: 'tilled',
      moisture: 0,
      lastUpdated: T,
      crop: { kind: 'melon', plantedAt: 0, growth: CROPS.melon.growCycles, ripeAt: 100, withered: true },
    };
    const deadWords = stateWords(oneByOne({ farms: [farmOf([dead])] }), T, { moistureDecay: false });
    expect(deadWords.slice(19, 26)).toEqual([1, 0, 2, 0, CROPS.melon.growCycles, 100, 1]);
  });

  it('writes a not-spawned drone as zeros for x, y and clock even if the fields hold values', () => {
    const odd: DroneHashState = { x: 3, y: 4, clock: 99, status: 'not_spawned' };
    const words = stateWords(oneByOne({ drones: [[RUNNING, odd]] }), T, RULES);
    expect(words.slice(15, 19)).toEqual([0, 0, 0, 3]);
  });

  it('encodes drone status as 0 running, 1 halted, 2 error, 3 not spawned', () => {
    const statuses = (['running', 'halted', 'error', 'not_spawned'] as const).map((status) =>
      stateWords(oneByOne({ drones: [[{ ...RUNNING, status }, NOT_SPAWNED]] }), T, RULES).at(14),
    );
    expect(statuses).toEqual([0, 1, 2, 3]);
  });

  it('writes step 3 for every slot, then step 4 for every slot, tiles row-major, then streams layout, weather, player:0 … (§State hash)', () => {
    const tiles = (moisture: number): Tile[] =>
      Array.from({ length: 4 }, (_, i) => ({
        soil: 'grass',
        moisture: moisture + i,
        lastUpdated: T,
        crop: null,
      }));
    const state: HashableState = {
      gridSize: 2,
      farms: [farmOf(tiles(10)), farmOf(tiles(20), { credits: 7 })],
      drones: [
        [RUNNING, NOT_SPAWNED],
        [{ ...RUNNING, x: 1 }, NOT_SPAWNED],
      ],
      market: createMarket({ sharedMarket: true }),
      streams: createStreams(5, 2),
    };
    const words = stateWords(state, T, RULES);
    const headSize = 5 + 8;
    const heads = 3 + 3;
    const slot1Head = heads + headSize;
    const tileStart = heads + 2 * headSize;
    expect(words.slice(0, 3)).toEqual([T, 2, 2]);
    expect(words[heads]).toBe(100);
    expect(words[slot1Head]).toBe(7);
    expect(words[slot1Head + 5]).toBe(1);
    const moistures = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => words[tileStart + i * 7 + 1]);
    expect(moistures).toEqual([10, 11, 12, 13, 20, 21, 22, 23]);
    const streamWords = words.slice(tileStart + 2 * 4 * 7);
    expect(streamWords).toHaveLength(4 * 4);
    expect(streamWords.slice(0, 4)).toEqual(state.streams.layout.state());
    expect(streamWords.slice(4, 8)).toEqual(state.streams.weather.state());
    expect(streamWords.slice(8, 12)).toEqual(state.streams.player(0).state());
    expect(streamWords.slice(12, 16)).toEqual(state.streams.player(1).state());
  });

  it('rejects drone rows or streams that do not match the number of farms (SIM-BAD-SLOT-COUNT)', () => {
    expect(() => stateWords(oneByOne({ drones: [] }), T, RULES)).toThrow(/SIM-BAD-SLOT-COUNT/);
    expect(() =>
      stateWords(
        oneByOne({
          drones: [
            [RUNNING, NOT_SPAWNED],
            [RUNNING, NOT_SPAWNED],
          ],
        }),
        T,
        RULES,
      ),
    ).toThrow(/SIM-BAD-SLOT-COUNT/);
    expect(() => stateWords(oneByOne({ streams: createStreams(12_345, 2) }), T, RULES)).toThrow(
      /SIM-BAD-SLOT-COUNT/,
    );
  });

  it('force-advances every tile to t before writing it (a stale tile hashes as its advanced self)', () => {
    const stale: Tile = {
      soil: 'tilled',
      moisture: 40,
      lastUpdated: 100,
      crop: { kind: 'radish', plantedAt: 100, growth: 0, ripeAt: null, withered: false },
    };
    const words = stateWords(oneByOne({ farms: [farmOf([stale])] }), T, RULES);
    expect(words.slice(19, 26)).toEqual([1, 40, 0, 100, 300, 400, 0]);
  });

  it('force-advances the market to t before writing its pressures', () => {
    const market = marketWith({ radish: 100 });
    const words = stateWords(oneByOne({ market }), 1_000, RULES);
    expect(words.slice(3, 6)).toEqual([64, 0, 0]);
  });
});

describe('stateHash', () => {
  it('equals the hand-computed FNV-1a of the words for a 1×1 world with one slot', () => {
    expect(stateHash(oneByOne(), T, RULES)).toBe(2_050_875_291);
  });

  it('equals the hand-computed FNV-1a for a 1×1 world with two slots, pinning step 3 for all slots before step 4', () => {
    const rock: Tile = { soil: 'rock', moisture: 12, lastUpdated: T, crop: null };
    const state: HashableState = {
      gridSize: 1,
      farms: [
        farmOf([RIPE_RADISH_TILE]),
        farmOf([rock], { credits: 55, silo: { radish: 0, corn: 1, melon: 0 }, water: 20 }),
      ],
      drones: [
        [RUNNING, NOT_SPAWNED],
        [{ x: 0, y: 0, clock: 640, status: 'halted' }, NOT_SPAWNED],
      ],
      market: createMarket({ sharedMarket: true }),
      streams: createStreams(99, 2),
    };
    expect(stateHash(state, T, RULES)).toBe(3_832_079_383);
  });

  it('differs for each differing part of the state', () => {
    const base = stateHash(oneByOne(), T, RULES);
    const variants: HashableState[] = [
      oneByOne({ farms: [farmOf([RIPE_RADISH_TILE], { credits: 101 })] }),
      oneByOne({ farms: [farmOf([RIPE_RADISH_TILE], { silo: { radish: 2, corn: 3, melon: 5 } })] }),
      oneByOne({ farms: [farmOf([RIPE_RADISH_TILE], { water: 59 })] }),
      oneByOne({ farms: [farmOf([{ ...RIPE_RADISH_TILE, moisture: 41 }])] }),
      oneByOne({ drones: [[{ ...RUNNING, clock: 501 }, NOT_SPAWNED]] }),
      oneByOne({ streams: createStreams(12_346, 1) }),
    ];
    const hashes = variants.map((state) => stateHash(state, T, RULES));
    for (const h of hashes) expect(h).not.toBe(base);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('differs when the market pressure differs', () => {
    const market = marketWith({ corn: 100 });
    expect(stateHash(oneByOne({ market }), T, RULES)).not.toBe(stateHash(oneByOne(), T, RULES));
  });

  it('differs when a stream has been drawn from', () => {
    const streams = createStreams(12_345, 1);
    streams.player(0).next();
    expect(stateHash(oneByOne({ streams }), T, RULES)).not.toBe(stateHash(oneByOne(), T, RULES));
  });

  it('is unchanged by advancing the world before hashing (force-advance is idempotent on outcomes)', () => {
    const stale: Tile = {
      soil: 'grass',
      moisture: 90,
      lastUpdated: 0,
      crop: { kind: 'corn', plantedAt: 0, growth: 0, ripeAt: null, withered: false },
    };
    const rules = { moistureDecay: true };
    const market = marketWith({ radish: 100 });
    const state = oneByOne({ farms: [farmOf([stale])], market });
    const direct = stateHash(state, 2_000, rules);
    const advancedEarly: HashableState = {
      ...state,
      farms: state.farms.map((farm) => advanceFarm(farm, 800, rules)),
      market: advanceMarket(market, 800),
    };
    expect(stateHash(advancedEarly, 2_000, rules)).toBe(direct);
    expect(stateHash(state, 800, rules)).not.toBe(direct);
  });

  it('does not change the state it hashes: tiles, market and streams are left as they were', () => {
    const state = oneByOne({ farms: [farmOf([{ ...RIPE_RADISH_TILE, lastUpdated: 0 }])] });
    const market = JSON.stringify(state.market);
    const tiles = JSON.stringify(state.farms);
    const streams = state.streams.ordered.map((s) => s.rng.state());
    stateHash(state, T, RULES);
    expect(JSON.stringify(state.market)).toBe(market);
    expect(JSON.stringify(state.farms)).toBe(tiles);
    expect(state.streams.ordered.map((s) => s.rng.state())).toEqual(streams);
  });

  it('ignores everDryPaused and lastUpdated, which are not hashed', () => {
    const base = stateHash(oneByOne(), T, RULES);
    const flagged = oneByOne({ farms: [farmOf([RIPE_RADISH_TILE], { everDryPaused: true })] });
    expect(stateHash(flagged, T, RULES)).toBe(base);
  });

  it('reads the advanced market the way marketPressures does (CROP_IDS order, decayed once at 500)', () => {
    const market = marketWith({ melon: 100 });
    const advanced = advanceMarket(market, T);
    expect(marketPressures(advanced)).toEqual([0, 0, 80]);
    expect(stateWords(oneByOne({ market }), T, RULES).slice(3, 6)).toEqual([0, 0, 80]);
  });
});
