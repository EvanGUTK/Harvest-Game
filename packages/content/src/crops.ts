/**
 * The crop roster: ids, definitions and their canonical order.
 * Design: docs/01-game-design/crops-and-economy.md. Lives in its own module so the stdlib metadata can read it
 * without importing the package index; `index.ts` re-exports everything here.
 * ALL NUMBERS ARE PROVISIONAL (tuned with SIM-BAL); changing any value changes simulation results (bump RULES_VERSION).
 */

export type CropId = 'radish' | 'corn' | 'melon';

export type CropDef = {
  id: CropId;
  /** Constant name exposed in Sprout, e.g. RADISH */
  constant: string;
  seedCost: number;
  basePrice: number;
  growCycles: number;
  witherCycles: number;
  needsTilled: boolean;
  /** Growth only advances while moisture >= this (default rule is > 0). */
  minMoisture: number;
};

export const CROPS: Readonly<Record<CropId, CropDef>> = {
  radish: {
    id: 'radish',
    constant: 'RADISH',
    seedCost: 2,
    basePrice: 5,
    growCycles: 300,
    witherCycles: 3_000,
    needsTilled: false,
    minMoisture: 1,
  },
  corn: {
    id: 'corn',
    constant: 'CORN',
    seedCost: 6,
    basePrice: 18,
    growCycles: 900,
    witherCycles: 1_500,
    needsTilled: true,
    minMoisture: 1,
  },
  melon: {
    id: 'melon',
    constant: 'MELON',
    seedCost: 15,
    basePrice: 60,
    growCycles: 2_400,
    witherCycles: 2_400,
    needsTilled: true,
    minMoisture: 30,
  },
};

/** Crop ids in `CROPS` order. Every per-crop iteration uses this array, never Object.keys. */
export const CROP_IDS: readonly CropId[] = ['radish', 'corn', 'melon'];
