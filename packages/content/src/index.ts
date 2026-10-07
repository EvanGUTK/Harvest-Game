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

// ---------- Builtin cycle costs (on top of the 1-cycle CALL_HOST) ----------

export const ACTION_COSTS = {
  move: 20,
  plant: 30,
  plantFailed: 5,
  harvest: 30,
  harvestEmpty: 5,
  till: 30,
  water: 25,
  refill: 60,
  sell: 10,
  spawn: 200,
  halt: 0,
} as const;

export const SENSOR_COSTS = {
  pos_x: 1,
  pos_y: 1,
  world_size: 1,
  crop: 2,
  is_ripe: 2,
  growth: 2,
  soil: 2,
  moisture: 2,
  water_left: 1,
  credits: 1,
  inventory: 1,
  price: 3,
  seed_cost: 1,
  measure: 5,
  cycles: 1,
  cycles_left: 1,
} as const;

/** Host-provided pure helpers (not language intrinsics, which cost 1 cycle inside lang). */
export const PURE_COSTS = {
  random: 2,
} as const;

/** `wait(n)` costs n cycles; n outside these bounds is a runtime error (R-BAD-ARG). */
export const WAIT_BOUNDS = { min: 1, max: 5_000 } as const;

/** Real-time pacing of the editor's 1× speed. Free Farm receipts are capped from this. */
export const CYCLES_PER_SECOND = 100;
export const FREE_FARM_MAX_SPEED = 16;

// ---------- World rules ----------

export const WORLD = {
  moistureDecayEvery: 50,
  waterAmount: 40,
  waterCapacity: 60,
  wellTile: [0, 0] as const,
} as const;

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
  codingSeconds: 600,
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
