/**
 * Lookups between game constants (the ids programs hold) and the sim's own enums.
 * Design: docs/02-language/standard-library.md §Constants; ids and names come from `content` (CONSTANTS, CROPS).
 * Invariants: crops map through CROPS[crop].constant so a renamed constant cannot desynchronise; directions map by
 * constant name; an id of the wrong group maps to undefined, never to a neighbour.
 */

import { CONSTANTS, CROP_IDS, CROPS, type CropId } from '@harvest/content';
import type { Direction } from '../world/actions';
import type { Soil } from '../types';

const DIRECTION_BY_CONSTANT: ReadonlyMap<string, Direction> = new Map<string, Direction>([
  ['NORTH', 'north'],
  ['SOUTH', 'south'],
  ['EAST', 'east'],
  ['WEST', 'west'],
]);

const SOIL_CONSTANT: Readonly<Record<Soil, string>> = { grass: 'GRASS', tilled: 'TILLED', rock: 'ROCK' };

function idOfName(name: string): number {
  const found = CONSTANTS.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no game constant named ${name}`);
  return found.id;
}

/** The constant's name (`RADISH`), or undefined for an id no constant has. */
export function constantName(id: number): string | undefined {
  return CONSTANTS.find((c) => c.id === id)?.name;
}

/** The crop a crop constant id stands for; undefined for any other id. */
export function cropOfConstantId(id: number): CropId | undefined {
  const entry = CONSTANTS.find((c) => c.id === id && c.group === 'crop');
  return CROP_IDS.find((crop) => CROPS[crop].constant === entry?.name);
}

/** The direction a direction constant id stands for; undefined for any other id. */
export function directionOfConstantId(id: number): Direction | undefined {
  const entry = CONSTANTS.find((c) => c.id === id && c.group === 'direction');
  return entry === undefined ? undefined : DIRECTION_BY_CONSTANT.get(entry.name);
}

export function constantIdOfCrop(crop: CropId): number {
  return idOfName(CROPS[crop].constant);
}

export function constantIdOfSoil(soil: Soil): number {
  return idOfName(SOIL_CONSTANT[soil]);
}
