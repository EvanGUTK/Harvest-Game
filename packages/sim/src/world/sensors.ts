/**
 * Crop and tile sensors over an already advanced tile.
 * Design: docs/02-language/standard-library.md §Sensors ("What the crop sensors say").
 * Invariants: pure reads; callers advance the tile to the sensor's `atCycle` first (touchTile); a withered
 * crop stays visible by kind, is not ripe and reports growth 100.
 */

import { CROPS, type CropId } from '@harvest/content';
import { floorDiv } from '@harvest/lang';
import type { Soil, Tile } from './types';

const PERCENT = 100;

/** `crop()`: the crop's kind, or null for an empty tile. */
export function sensorCrop(tile: Tile): CropId | null {
  return tile.crop === null ? null : tile.crop.kind;
}

/** `is_ripe()`: growth reached growCycles and the crop is not withered. */
export function sensorIsRipe(tile: Tile): boolean {
  const { crop } = tile;
  if (crop === null) return false;
  return crop.ripeAt !== null && !crop.withered;
}

/** `is_withered()`. */
export function sensorIsWithered(tile: Tile): boolean {
  const { crop } = tile;
  if (crop === null) return false;
  return crop.withered;
}

/** `growth()`: 0 for an empty tile, 100 once ripe or withered, otherwise floorDiv(growth × 100, growCycles). */
export function sensorGrowth(tile: Tile): number {
  const { crop } = tile;
  if (crop === null) return 0;
  if (crop.ripeAt !== null) return PERCENT;
  return floorDiv(crop.growth * PERCENT, CROPS[crop.kind].growCycles);
}

/** `soil()`. */
export function sensorSoil(tile: Tile): Soil {
  return tile.soil;
}

/** `moisture()`. */
export function sensorMoisture(tile: Tile): number {
  return tile.moisture;
}
