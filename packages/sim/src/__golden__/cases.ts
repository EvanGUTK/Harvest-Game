/**
 * The scripted golden scenarios: inputs only, written by hand. The goldens they produce are in `expected.ts`.
 * Design: docs/09-engineering/testing.md §Sim goldens, docs/03-architecture/simulation-engine.md §State hash.
 * Invariants: every case has a unique name; times are chosen so each slot's calls respect the costs of the call before
 * (move 20, water 25, plant 30, harvest 30, till 30, sell 10, refill 60, failed actions 5); changing a case changes its
 * golden, which needs a RULES_VERSION bump with the reason (testing.md).
 */

import type { MarketRules } from '../market/market';
import type { ScriptedCall, ScriptedScenario } from '../golden/scripted';

const SLOTS = 8;
/** Eight slots working the same plan: the slots whose index is below this sell in the first wave. */
const FIRST_WAVE = 4;
const LAST_SLOT = SLOTS - 1;

/** A single slot waters, plants, harvests and sells radishes, then replants as corn and sells that too. */
const soloRadishToSale: ScriptedScenario = {
  name: 'solo-radish-to-sale',
  seed: 11,
  gridSize: 4,
  cycleBudget: 3_000,
  nSlots: 1,
  startCredits: 100,
  startWater: 60,
  startMoisture: { min: 0, max: 40 },
  moistureDecay: true,
  sharedMarket: true,
  calls: [
    { t: 10, slot: 0, call: 'water' },
    { t: 40, slot: 0, call: 'plant', crop: 'radish' },
    { t: 80, slot: 0, call: 'move', dir: 'east' },
    { t: 110, slot: 0, call: 'water' },
    { t: 140, slot: 0, call: 'plant', crop: 'radish' },
    { t: 200, slot: 0, call: 'move', dir: 'west' },
    { t: 500, slot: 0, call: 'harvest' },
    { t: 540, slot: 0, call: 'move', dir: 'east' },
    { t: 600, slot: 0, call: 'harvest' },
    { t: 700, slot: 0, call: 'sell', crop: 'radish', n: 1 },
    { t: 800, slot: 0, call: 'move', dir: 'west' },
    { t: 830, slot: 0, call: 'refill' },
    { t: 900, slot: 0, call: 'till' },
    { t: 940, slot: 0, call: 'plant', crop: 'corn' },
    { t: 2_000, slot: 0, call: 'harvest' },
    { t: 2_100, slot: 0, call: 'sell', crop: 'corn', n: 1 },
  ],
};

/** The plan every slot of the eight-slot scenarios follows, with the slots that sell at a given cycle. */
function eightSlotCalls(): ScriptedCall[] {
  const everyone = Array.from({ length: SLOTS }, (_, slot) => slot);
  const common = everyone.flatMap((slot): ScriptedCall[] => [
    { t: 5, slot, call: 'water' },
    { t: 40, slot, call: 'till' },
    { t: 100, slot, call: 'plant', crop: 'corn' },
    { t: 1_100, slot, call: 'harvest' },
  ]);
  const firstWave = everyone.filter((slot) => slot < FIRST_WAVE);
  const secondWave = everyone.filter((slot) => slot >= FIRST_WAVE && slot < LAST_SLOT);
  return [
    ...common,
    ...firstWave.map((slot): ScriptedCall => ({ t: 2_000, slot, call: 'sell', crop: 'corn', n: 1 })),
    ...secondWave.map((slot): ScriptedCall => ({ t: 2_001, slot, call: 'sell', crop: 'corn', n: 1 })),
  ];
}

const eightSlotBase = {
  gridSize: 6,
  cycleBudget: 4_000,
  nSlots: SLOTS,
  startCredits: 100,
  startWater: 60,
  startMoisture: { min: 30, max: 60 },
  moistureDecay: true,
  sharedMarket: true,
} as const;

/** Eight slots with ties at the same cycle: the tie-break decides who sells first, and each sale lowers the price. */
const eightSlotsSharedMarket: ScriptedScenario = {
  ...eightSlotBase,
  name: 'eight-slots-shared-market',
  seed: 2_024,
  calls: eightSlotCalls(),
};

/** The same eight-slot plan under a rules variant: a firmer floor, a steeper step and a faster recovery. */
const variantMarket: Partial<MarketRules> = {
  priceFloorBp: 6_000,
  pressureStepBp: 500,
  pressureDecayEvery: 250,
};

const eightSlotsRulesVariant: ScriptedScenario = {
  ...eightSlotBase,
  name: 'eight-slots-rules-variant',
  seed: 2_024,
  market: variantMarket,
  calls: eightSlotCalls(),
};

/**
 * Two radishes planted on bone-dry tiles do not grow until they are watered (the dry pause), then ripen; one is never
 * harvested and withers, the other is harvested only after it has withered and yields nothing.
 */
const dryPauseAndWither: ScriptedScenario = {
  name: 'dry-pause-and-wither',
  seed: 7,
  gridSize: 4,
  cycleBudget: 6_000,
  nSlots: 1,
  startCredits: 100,
  startWater: 60,
  startMoisture: { min: 0, max: 0 },
  moistureDecay: true,
  sharedMarket: true,
  calls: [
    { t: 10, slot: 0, call: 'plant', crop: 'radish' },
    { t: 50, slot: 0, call: 'move', dir: 'east' },
    { t: 80, slot: 0, call: 'plant', crop: 'radish' },
    { t: 500, slot: 0, call: 'water' },
    { t: 550, slot: 0, call: 'move', dir: 'west' },
    { t: 600, slot: 0, call: 'water' },
    { t: 4_500, slot: 0, call: 'harvest' },
  ],
};

export const cases: readonly ScriptedScenario[] = [
  soloRadishToSale,
  eightSlotsSharedMarket,
  eightSlotsRulesVariant,
  dryPauseAndWither,
];
