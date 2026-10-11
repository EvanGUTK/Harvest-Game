/**
 * @harvest/content: game data (crops, costs, ranks). Pure data + types, no logic.
 *
 * ALL NUMBERS ARE PROVISIONAL. They are tuned with the balance harness (SIM-BAL).
 * Design rationale: docs/01-game-design/crops-and-economy.md,
 * docs/02-language/standard-library.md, docs/01-game-design/ranked-ladder.md
 *
 * Changing any value here changes simulation results, so bump RULES_VERSION.
 */

export const RULES_VERSION = '0.1.0';

// ---------- Crops ----------

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

// ---------- Builtin cycle costs (on top of the 1-cycle CALL_HOST) ----------

export { ACTION_COSTS, PURE_COSTS, SENSOR_COSTS, WAIT_BOUNDS } from './costs';

/** Real-time pacing of the editor's 1× speed. Free Farm receipts are capped from this. */
export const CYCLES_PER_SECOND = 100;
export const FREE_FARM_MAX_SPEED = 16;

/** Denominator for every basis-point value in this file and in `sim` (1 % = 100). */
export const BASIS_POINTS = 10_000;

// ---------- World rules ----------

export const WORLD = {
  moistureDecayEvery: 50,
  /** Moisture is an integer in 0..moistureMax; `water` caps at it and starting ranges stay inside it. */
  moistureMax: 100,
  waterAmount: 40,
  waterCapacity: 60,
  wellTile: [0, 0] as const,
  /** Chance per tile of being rock when the `rocks` modifier is on (basis points). */
  rockDensityBp: 800,
} as const;

/** Campaign drone upgrade tiers (sim's DroneUpgrades picks from these). */
export const ROTOR_MOVE_COST = [20, 16, 12, 9] as const;
export const SPRAYER_WATER_AMOUNT = 60;

export const MARKET = {
  /** basis points (1% = 100) */
  priceFloorBp: 4_000,
  pressureStepBp: 200,
  pressureDecayEvery: 500,
  pressureDecayNumerator: 80,
  pressureDecayDenominator: 100,
  liquidationBp: 5_000,
} as const;

export const SHOWDOWN_DEFAULTS = {
  gridSize: 8,
  cycleBudget: 30_000,
  startCredits: 100,
  startWater: 60,
  startMoisture: { min: 0, max: 40 },
  codingSeconds: 600,
  randomEnabled: false, // ranked; casual/custom may enable (D-18)
  spawnEnabled: false, // D-24: campaign only in v1
} as const;

// ---------- Ranked ----------

export const DIVISIONS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Diamond'] as const;
export const TIERS = ['III', 'II', 'I'] as const;
export type Division = (typeof DIVISIONS)[number];
export type Tier = (typeof TIERS)[number];
export type Rank = { rankIndex: number; division: Division; tier: Tier; name: `${Division} ${Tier}` };

/** All 15 ranks in order. rankIndex 0 = Iron III … 14 = Diamond I. */
export const RANKS: readonly Rank[] = DIVISIONS.flatMap((division, d) =>
  TIERS.map((tier, t) => ({
    rankIndex: d * TIERS.length + t,
    division,
    tier,
    name: `${division} ${tier}` as const,
  })),
);

export const RP_PER_TIER = 100;
