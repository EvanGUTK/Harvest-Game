import { BASIS_POINTS, WORLD } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { seedStream } from '../prng/streams';
import { generateLayout, type LayoutConfig } from './layout';

const SHOWDOWN: LayoutConfig = { gridSize: 8, startMoisture: { min: 0, max: 40 }, rocks: true };

function layoutOf(seed: number, config: LayoutConfig) {
  const rng = seedStream(seed, 'layout');
  const tiles = generateLayout(rng, config);
  return { tiles, rng };
}

// Expected values below were computed independently (Python), not by this code.
describe('generateLayout', () => {
  it('draws moisture then the rock roll per tile, row-major (simulation-engine.md §PRNG seeding)', () => {
    const { tiles } = layoutOf(12_345, SHOWDOWN);
    expect(tiles.map((t) => t.moisture)).toEqual([
      22, 0, 15, 17, 28, 10, 24, 24, 11, 1, 24, 23, 22, 14, 10, 4, 30, 8, 29, 26, 3, 14, 34, 29, 15, 11, 38,
      13, 8, 37, 25, 10, 31, 22, 21, 40, 18, 6, 21, 21, 35, 24, 7, 20, 39, 22, 40, 27, 5, 3, 1, 10, 37, 21,
      36, 33, 35, 32, 25, 30, 0, 22, 15, 3,
    ]);
  });

  it('marks a tile rock when its roll mod 10_000 is below rockDensityBp (index = y × 8 + x) (§PRNG seeding: Layout)', () => {
    const { tiles } = layoutOf(12_345, SHOWDOWN);
    const rockIndexes = tiles.flatMap((t, i) => (t.soil === 'rock' ? [i] : []));
    expect(rockIndexes).toEqual([14, 19, 42, 47, 49, 59]);
    expect(BASIS_POINTS).toBe(10_000);
    expect(WORLD.rockDensityBp).toBe(800);
  });

  it('leaves the stream in the same state however many tiles are rock (both draws always happen) (§PRNG seeding: Layout)', () => {
    const withRocks = layoutOf(12_345, SHOWDOWN);
    const withoutRocks = layoutOf(12_345, { ...SHOWDOWN, rocks: false });
    expect(withRocks.rng.state()).toEqual([3_882_133_730, 500_981_180, 2_244_862_872, 1_822_331_915]);
    expect(withoutRocks.rng.state()).toEqual(withRocks.rng.state());
    expect(withoutRocks.tiles.map((t) => t.moisture)).toEqual(withRocks.tiles.map((t) => t.moisture));
  });

  it('has no rock at all when the rocks modifier is off (ranked has no rocks in v1) (§PRNG seeding: Layout)', () => {
    const { tiles } = layoutOf(12_345, { ...SHOWDOWN, rocks: false });
    expect(tiles.every((t) => t.soil === 'grass')).toBe(true);
  });

  it('never makes the well tile (0,0) rock even when its roll is below the density (§PRNG seeding: Layout)', () => {
    // Seed 4 rolls 530 (< 800) for tile 0 of a 1×1 layout, so tile 0 would be rock without the well rule.
    const { tiles } = layoutOf(4, { gridSize: 1, startMoisture: { min: 0, max: 40 }, rocks: true });
    expect(tiles).toHaveLength(1);
    expect(WORLD.wellTile).toEqual([0, 0]);
    expect(tiles[0]?.soil).toBe('grass');
    expect(tiles[0]?.moisture).toBe(18);
  });

  it('can still make other tiles rock when their roll is below the density (§PRNG seeding: Layout)', () => {
    const { tiles } = layoutOf(12_345, SHOWDOWN);
    expect(tiles[14]?.soil).toBe('rock');
    expect(tiles[15]?.soil).toBe('grass');
  });

  it('pins a 1×1 layout for seed 7 (§PRNG seeding: Layout)', () => {
    const { tiles } = layoutOf(7, { gridSize: 1, startMoisture: { min: 0, max: 40 }, rocks: true });
    expect(tiles[0]?.moisture).toBe(22);
  });

  it('draws moisture as min + next() % (max − min + 1) and consumes the draw even for a fixed range (§PRNG seeding: Layout)', () => {
    const fixed = layoutOf(5, { gridSize: 2, startMoisture: { min: 100, max: 100 }, rocks: false });
    expect(fixed.tiles.map((t) => t.moisture)).toEqual([100, 100, 100, 100]);
    expect(fixed.rng.state()).toEqual([25_304_378, 3_041_370_908, 748_828_332, 3_983_897_155]);
  });

  it('keeps moisture inside the configured inclusive range (§PRNG seeding: Layout)', () => {
    const { tiles } = layoutOf(99, { gridSize: 12, startMoisture: { min: 10, max: 12 }, rocks: true });
    for (const t of tiles) {
      expect(t.moisture).toBeGreaterThanOrEqual(10);
      expect(t.moisture).toBeLessThanOrEqual(12);
    }
  });

  it('starts every tile at lastUpdated 0 with no crop (farm-simulation.md §Tile state)', () => {
    const { tiles } = layoutOf(12_345, SHOWDOWN);
    expect(tiles).toHaveLength(64);
    expect(tiles.every((t) => t.lastUpdated === 0 && t.crop === null)).toBe(true);
    expect(tiles.every((t) => t.soil === 'grass' || t.soil === 'rock')).toBe(true);
  });

  it('is a pure function of the stream state: two equal streams give equal layouts (§Determinism)', () => {
    expect(layoutOf(31_337, SHOWDOWN).tiles).toEqual(layoutOf(31_337, SHOWDOWN).tiles);
    expect(layoutOf(31_337, SHOWDOWN).tiles).not.toEqual(layoutOf(31_338, SHOWDOWN).tiles);
  });

  it('puts about WORLD.rockDensityBp of tiles in rock over many seeds (farm-simulation.md §Rocks and seeds)', () => {
    let rocks = 0;
    let total = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const { tiles } = layoutOf(seed, { gridSize: 12, startMoisture: { min: 0, max: 40 }, rocks: true });
      total += tiles.length;
      rocks += tiles.filter((t) => t.soil === 'rock').length;
    }
    // 248 tiles roll below the density; two of them sit on the well tile (0,0) of their seed, which is never rock.
    expect(rocks).toBe(246);
    expect(total).toBe(2880);
  });

  it('rejects a grid size below 1 as an invariant violation (farm-simulation.md §Grid)', () => {
    expect(() => layoutOf(1, { ...SHOWDOWN, gridSize: 0 })).toThrow(/SIM-BAD-GRID/);
  });
});
