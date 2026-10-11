import { CROPS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import {
  sensorCrop,
  sensorGrowth,
  sensorIsRipe,
  sensorIsWithered,
  sensorMoisture,
  sensorSoil,
} from './sensors';
import type { Tile } from './types';

function tile(crop: Tile['crop'], soil: Tile['soil'] = 'grass', moisture = 42): Tile {
  return { soil, moisture, lastUpdated: 0, crop };
}

const EMPTY = tile(null);
const growing = tile({ kind: 'corn', plantedAt: 0, growth: 450, ripeAt: null, withered: false });
const ripe = tile({
  kind: 'corn',
  plantedAt: 0,
  growth: CROPS.corn.growCycles,
  ripeAt: 900,
  withered: false,
});
const dead = tile({ kind: 'corn', plantedAt: 0, growth: CROPS.corn.growCycles, ripeAt: 900, withered: true });

// Sensor table: standard-library.md §Sensors ("What the crop sensors say").
describe('crop sensors', () => {
  it('report an empty tile as None, not ripe, not withered, growth 0', () => {
    expect([sensorCrop(EMPTY), sensorIsRipe(EMPTY), sensorIsWithered(EMPTY), sensorGrowth(EMPTY)]).toEqual([
      null,
      false,
      false,
      0,
    ]);
  });

  it('report a growing crop with growth as floorDiv(growth × 100, growCycles)', () => {
    expect([
      sensorCrop(growing),
      sensorIsRipe(growing),
      sensorIsWithered(growing),
      sensorGrowth(growing),
    ]).toEqual(['corn', false, false, 50]);
  });

  it('rounds growth down and stays below 100 until ripe', () => {
    const almost = tile({ kind: 'radish', plantedAt: 0, growth: 299, ripeAt: null, withered: false });
    expect(sensorGrowth(almost)).toBe(99);
    const one = tile({ kind: 'radish', plantedAt: 0, growth: 2, ripeAt: null, withered: false });
    expect(sensorGrowth(one)).toBe(0);
    const three = tile({ kind: 'radish', plantedAt: 0, growth: 3, ripeAt: null, withered: false });
    expect(sensorGrowth(three)).toBe(1);
  });

  it('report a ripe crop as ripe with growth 100', () => {
    expect([sensorCrop(ripe), sensorIsRipe(ripe), sensorIsWithered(ripe), sensorGrowth(ripe)]).toEqual([
      'corn',
      true,
      false,
      100,
    ]);
  });

  it('report a withered crop by kind, not ripe, withered, growth 100', () => {
    expect([sensorCrop(dead), sensorIsRipe(dead), sensorIsWithered(dead), sensorGrowth(dead)]).toEqual([
      'corn',
      false,
      true,
      100,
    ]);
  });
});

describe('soil and moisture sensors', () => {
  it('read the soil regardless of any crop', () => {
    expect(sensorSoil(tile(null, 'rock'))).toBe('rock');
    expect(sensorSoil(tile(growing.crop, 'tilled'))).toBe('tilled');
  });

  it('read the moisture of the advanced tile', () => {
    expect(sensorMoisture(tile(null, 'grass', 77))).toBe(77);
  });
});
