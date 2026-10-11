import { describe, expect, it } from 'vitest';
import { advanceTile } from './advance';
import { advanceFarm, tileIndex, touchTile, withTile, type Farm } from './farm';
import type { Tile } from './types';

const DECAY = { moistureDecay: true } as const;

function farmOf(tiles: Tile[], everDryPaused = false): Farm {
  return { credits: 100, silo: { radish: 0, corn: 0, melon: 0 }, water: 60, tiles, everDryPaused };
}

function radish(moisture: number, lastUpdated = 0): Tile {
  return {
    soil: 'grass',
    moisture,
    lastUpdated,
    crop: { kind: 'radish', plantedAt: lastUpdated, growth: 0, ripeAt: null, withered: false },
  };
}

const EMPTY: Tile = { soil: 'grass', moisture: 0, lastUpdated: 0, crop: null };

describe('advanceFarm', () => {
  it('advances every tile exactly as advanceTile does', () => {
    const farm = farmOf([radish(40), EMPTY, radish(3)]);
    const advanced = advanceFarm(farm, 300, DECAY);
    expect(advanced.tiles).toEqual(farm.tiles.map((tile) => advanceTile(tile, 300, DECAY)));
  });

  it('keeps credits, silo and water and does not mutate its input', () => {
    const farm = farmOf([radish(40)]);
    const copy = JSON.parse(JSON.stringify(farm)) as Farm;
    const advanced = advanceFarm(farm, 300, DECAY);
    expect(farm).toEqual(copy);
    expect([advanced.credits, advanced.silo, advanced.water]).toEqual([100, farm.silo, 60]);
  });

  it('sets everDryPaused when any tile pauses dry (Never Thirsty)', () => {
    expect(advanceFarm(farmOf([radish(100), radish(1)]), 50, DECAY).everDryPaused).toBe(true);
  });

  it('leaves everDryPaused false while every crop stays moist enough', () => {
    expect(advanceFarm(farmOf([radish(100), EMPTY]), 400, DECAY).everDryPaused).toBe(false);
  });

  it('never resets everDryPaused once true', () => {
    const paused = advanceFarm(farmOf([radish(100)], true), 100, DECAY);
    expect(paused.everDryPaused).toBe(true);
  });

  it('is compositional across touches, flag included', () => {
    const farm = farmOf([radish(1), radish(100)]);
    const stepped = advanceFarm(advanceFarm(advanceFarm(farm, 20, DECAY), 49, DECAY), 50, DECAY);
    expect(stepped).toEqual(advanceFarm(farm, 50, DECAY));
    expect(stepped.everDryPaused).toBe(true);
  });
});

describe('tileIndex (farm-simulation.md §Determinism guarantees: row-major y then x)', () => {
  it('numbers tiles row-major: index = y × gridSize + x', () => {
    expect(tileIndex(3, [0, 0])).toBe(0);
    expect(tileIndex(3, [2, 0])).toBe(2);
    expect(tileIndex(3, [0, 1])).toBe(3);
    expect(tileIndex(3, [1, 2])).toBe(7);
    expect(tileIndex(8, [7, 7])).toBe(63);
  });

  it('rejects a position outside the grid or with a non-integer coordinate as SIM-BAD-COORD', () => {
    for (const bad of [
      [3, 0],
      [0, 3],
      [-1, 0],
      [0, -1],
      [1.5, 0],
      [Number.NaN, 0],
    ] as const) {
      expect(() => tileIndex(3, bad)).toThrow(/SIM-BAD-COORD/);
    }
  });
});

describe('touchTile', () => {
  it('advances only the touched tile to t and returns it with the farm that holds it', () => {
    const farm = farmOf([radish(40), radish(40)]);
    const touched = touchTile(farm, 2, [1, 0], 300, DECAY);
    expect(touched.tile).toEqual(advanceTile(radish(40), 300, DECAY));
    expect(touched.farm.tiles[1]).toEqual(touched.tile);
    expect(touched.farm.tiles[0]).toBe(farm.tiles[0]);
  });

  it('raises everDryPaused when the touched tile paused dry and leaves it alone otherwise', () => {
    expect(touchTile(farmOf([radish(0)]), 1, [0, 0], 10, DECAY).farm.everDryPaused).toBe(true);
    expect(touchTile(farmOf([radish(100)]), 1, [0, 0], 10, DECAY).farm.everDryPaused).toBe(false);
    expect(touchTile(farmOf([radish(100)], true), 1, [0, 0], 10, DECAY).farm.everDryPaused).toBe(true);
  });
});

describe('withTile', () => {
  it('replaces one tile, keeps the others and every other field, and does not mutate the farm', () => {
    const farm = farmOf([radish(1), radish(2), radish(3)]);
    const replaced = withTile(farm, 1, EMPTY);
    expect(replaced.tiles).toEqual([radish(1), EMPTY, radish(3)]);
    expect([replaced.credits, replaced.water, replaced.silo]).toEqual([100, 60, farm.silo]);
    expect(farm.tiles[1]).toEqual(radish(2));
  });
});
