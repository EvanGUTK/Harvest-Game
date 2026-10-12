/**
 * The balance metrics: score distributions, realised sale price, closed-form ideal profit and hoard-versus-steady.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness, docs/01-game-design/crops-and-economy.md
 * (every `[SIM-BAL]` tag).
 * Invariants: integers only (floorDiv, basis points); a metric with nothing to measure is null; the ideal-profit
 * arithmetic is a pure function of content numbers and prints every term it used.
 */

import { BASIS_POINTS } from '@harvest/content';
import type { ACTION_COSTS, CropDef, CropId, WORLD } from '@harvest/content';
import { floorDiv } from '@harvest/lang';
import { HOARD_LOBBY } from './scenario';
import type { RunRecord, SellLot, VariantData } from './scenario';
import { ceilDiv, mean } from './stats';

/** Every action also pays the 1-cycle CALL_HOST (simulation-engine.md §Clock arithmetic). */
const CALL_HOST_CYCLES = 1;
/** The profit figure is quoted per this many drone cycles. */
const PROFIT_WINDOW_CYCLES = 1_000;
/** The hoard lobby is four steady farmers in slots 0 to 3, then four dump farmers in slots 4 to 7. */
const STEADY_SLOT_COUNT = HOARD_LOBBY.programs.length / 2;

/** The numbers the ideal-profit arithmetic reads: action costs, the water rules and the price floor. */
export type IdealInputs = {
  actionCosts: Pick<typeof ACTION_COSTS, 'till' | 'plant' | 'harvest' | 'move' | 'water' | 'refill'>;
  world: Pick<typeof WORLD, 'moistureDecayEvery' | 'waterAmount' | 'waterCapacity'>;
  priceFloorBp: number;
};

export type IdealProfit = {
  crop: CropId;
  waterings: number;
  /** Drone cycles one unit costs from till to harvest, with batched sells and no logic overhead. */
  cyclesPerUnit: number;
  basePrice: number;
  floorPrice: number;
  /** Profit per 1,000 drone cycles at base price and at the market floor price. */
  profitAtBase: number;
  profitAtFloor: number;
  /** Tiles one drone needs in rotation so that growth never leaves it idle: ceil(growCycles ÷ cyclesPerUnit). */
  tilesToKeepBusy: number;
  /** The arithmetic, one line per step, for the report. */
  lines: string[];
};

export type HoardVersusSteady = {
  /** Mean over seeds of the per-seed mean score of the steady farmers. */
  steadyMean: number;
  dumpMean: number;
  perSeed: { seed: number; steady: number; dump: number }[];
};

/** Every score of a lobby over all seeds, optionally only for the slots a filter accepts. */
export function lobbyScores(
  data: VariantData,
  lobbyId: string,
  keepSlot: (slot: number) => boolean = () => true,
): number[] {
  return (data.records.get(lobbyId) ?? []).flatMap((r) => r.scores.filter((_, slot) => keepSlot(slot)));
}

/**
 * Unit-weighted mean sale price as basis points of base: floorDiv(Σ n × floorDiv(price × 10_000, base), Σ n),
 * the same formula as the Market Timer award. Null when nothing was sold.
 */
export function realisedPriceBp(
  lots: readonly SellLot[],
  basePrice: (crop: CropId) => number,
): number | null {
  const units = lots.reduce((sum, lot) => sum + lot.n, 0);
  if (units === 0) return null;
  const weighted = lots.reduce(
    (sum, lot) => sum + lot.n * floorDiv(lot.price * BASIS_POINTS, basePrice(lot.crop)),
    0,
  );
  return floorDiv(weighted, units);
}

function profitPer1000(price: number, seedCost: number, cyclesPerUnit: number): number {
  return floorDiv((price - seedCost) * PROFIT_WINDOW_CYCLES, cyclesPerUnit);
}

/**
 * Closed-form ideal-play profit of one crop per 1,000 drone cycles, from content numbers alone: till (if the crop
 * needs tilled soil), plant, harvest, one move, the waterings that keep moisture at or above the crop's minimum for
 * its whole growth from a dry tile, and the refill trips those waterings cost; sells are batched so they cost nothing.
 */
export function idealProfit(crop: CropDef, inputs: IdealInputs): IdealProfit {
  const { actionCosts: cost, world } = inputs;
  const till = crop.needsTilled ? cost.till + CALL_HOST_CYCLES : 0;
  const plant = cost.plant + CALL_HOST_CYCLES;
  const harvest = cost.harvest + CALL_HOST_CYCLES;
  const move = cost.move + CALL_HOST_CYCLES;
  const drift = floorDiv(crop.growCycles, world.moistureDecayEvery);
  const waterings = ceilDiv(crop.minMoisture + drift, world.waterAmount);
  const waterEach = cost.water + CALL_HOST_CYCLES;
  const refill = ceilDiv(waterings * (cost.refill + CALL_HOST_CYCLES), world.waterCapacity);
  const cyclesPerUnit = till + plant + harvest + move + waterings * waterEach + refill;
  const floorPrice = floorDiv(crop.basePrice * inputs.priceFloorBp, BASIS_POINTS);
  const profitAtBase = profitPer1000(crop.basePrice, crop.seedCost, cyclesPerUnit);
  const profitAtFloor = profitPer1000(floorPrice, crop.seedCost, cyclesPerUnit);
  const tilesToKeepBusy = ceilDiv(crop.growCycles, cyclesPerUnit);
  const per1000 = `× ${PROFIT_WINDOW_CYCLES} ÷ ${cyclesPerUnit}`;
  return {
    crop: crop.id,
    waterings,
    cyclesPerUnit,
    basePrice: crop.basePrice,
    floorPrice,
    profitAtBase,
    profitAtFloor,
    tilesToKeepBusy,
    lines: [
      `${crop.id}: till ${till} + plant ${plant} + harvest ${harvest} + move ${move} + water ${waterings} × ${waterEach} + refill ${refill} = ${cyclesPerUnit} drone cycles per unit`,
      `  waterings = ceil((minMoisture ${crop.minMoisture} + growCycles ${crop.growCycles} ÷ ${world.moistureDecayEvery} = ${drift}) ÷ ${world.waterAmount} per watering) = ${waterings}`,
      `  at base ₵${crop.basePrice}: (${crop.basePrice} − seed ${crop.seedCost}) ${per1000} = ${profitAtBase} per 1,000 drone cycles`,
      `  at floor ₵${floorPrice}: (${floorPrice} − seed ${crop.seedCost}) ${per1000} = ${profitAtFloor} per 1,000 drone cycles`,
      `  tiles to keep the drone busy: ceil(${crop.growCycles} ÷ ${cyclesPerUnit}) = ${tilesToKeepBusy}`,
    ],
  };
}

function groupMean(record: RunRecord, from: number, to: number): number {
  return mean(record.scores.slice(from, to)) ?? 0;
}

/** Mean score of the steady and the dump farmers of the hoard lobby, per seed and over the seeds. */
export function hoardVersusSteady(data: VariantData): HoardVersusSteady | null {
  const records = data.records.get(HOARD_LOBBY.id) ?? [];
  const perSeed = records.map((r) => ({
    seed: r.seed,
    steady: groupMean(r, 0, STEADY_SLOT_COUNT),
    dump: groupMean(r, STEADY_SLOT_COUNT, r.scores.length),
  }));
  const steadyMean = mean(perSeed.map((p) => p.steady));
  const dumpMean = mean(perSeed.map((p) => p.dump));
  if (steadyMean === null || dumpMean === null) return null;
  return { steadyMean, dumpMean, perSeed };
}
