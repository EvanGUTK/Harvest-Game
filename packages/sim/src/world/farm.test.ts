import { describe, expect, it } from 'vitest';
import { advanceTile } from './advance';
import { advanceFarm, type Farm } from './farm';
import type { Tile } from '../types';

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
