/**
 * The balance metrics: score distributions, realised sale price, closed-form ideal profit and hoard-versus-steady.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness, docs/01-game-design/crops-and-economy.md
 * (every `[SIM-BAL]` tag).
 * Invariants: integers only (floorDiv, basis points); a metric with nothing to measure is null; the ideal-profit
 * arithmetic is a pure function of content numbers and prints every term it used.
 */

import { BASIS_POINTS } from '@harvest/content';
import type { ACTION_COSTS, CropDef, CropId, WORLD } from '@harvest/content';
import { floorDiv, floorMod } from '@harvest/lang';
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
  /** Moisture a growing tile loses over its growth: floorDiv(growCycles, moistureDecayEvery). */
  drift: number;
  /** Waterings one unit needs on average, in thousandths: floorDiv(drift × 1000, waterAmount). */
  wateringsPerUnitMilli: number;
  /** Drone cycles one unit costs from till to harvest, in hundredths, with batched sells and no logic overhead. */
  cyclesPerUnitCenti: number;
  basePrice: number;
  floorPrice: number;
  /** Profit per 1,000 drone cycles at base price and at the market floor price. */
  profitAtBase: number;
  profitAtFloor: number;
  /** Tiles one drone needs in rotation so that growth never leaves it idle: ceil(growCycles ÷ cycles per unit). */
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

/** Hundredths as text: 8705 is "87.05". */
export function formatHundredths(hundredths: number): string {
  const cents = floorMod(hundredths, 100);
  return `${floorDiv(hundredths, 100)}.${cents < 10 ? '0' : ''}${cents}`;
}

/**
 * Closed-form ideal-play profit of one crop per 1,000 drone cycles, from content numbers alone, amortised over a
 * steady rotation (simulation-engine.md §Balance harness has the formula): per unit, till (if the crop needs
 * tilled soil), plant, harvest and one move; the waterings that replace the moisture a growing tile loses
 * (drift ÷ waterAmount of one watering, each one `water` call); and the refill trips for that water
 * (one refill per waterCapacity waterings). Sells are batched so they cost nothing. The one-off lift of a
 * dry tile to the crop's minimum moisture is a per-tile setup cost and is not in the rate.
 * Everything is scaled by D = waterAmount × waterCapacity so each step stays an integer.
 */
export function idealProfit(crop: CropDef, inputs: IdealInputs): IdealProfit {
  const { actionCosts: cost, world } = inputs;
  const till = crop.needsTilled ? cost.till + CALL_HOST_CYCLES : 0;
  const plant = cost.plant + CALL_HOST_CYCLES;
  const harvest = cost.harvest + CALL_HOST_CYCLES;
  const move = cost.move + CALL_HOST_CYCLES;
  const waterEach = cost.water + CALL_HOST_CYCLES;
  const refillEach = cost.refill + CALL_HOST_CYCLES;
  const drift = floorDiv(crop.growCycles, world.moistureDecayEvery);
  const scale = world.waterAmount * world.waterCapacity;
  const fixed = till + plant + harvest + move;
  const scaled = scale * fixed + drift * world.waterCapacity * waterEach + drift * refillEach;
  const floorPrice = floorDiv(crop.basePrice * inputs.priceFloorBp, BASIS_POINTS);
  const profitFor = (price: number): number =>
    floorDiv((price - crop.seedCost) * PROFIT_WINDOW_CYCLES * scale, scaled);
  const profitAtBase = profitFor(crop.basePrice);
  const profitAtFloor = profitFor(floorPrice);
  const tilesToKeepBusy = ceilDiv(crop.growCycles * scale, scaled);
  const cyclesPerUnitCenti = floorDiv(scaled * 100, scale);
  const wateringsPerUnitMilli = floorDiv(drift * 1_000, world.waterAmount);
  const per1000 = `× ${PROFIT_WINDOW_CYCLES} × ${scale} ÷ ${scaled}`;
  return {
    crop: crop.id,
    drift,
    wateringsPerUnitMilli,
    cyclesPerUnitCenti,
    basePrice: crop.basePrice,
    floorPrice,
    profitAtBase,
    profitAtFloor,
    tilesToKeepBusy,
    lines: [
      `${crop.id}: ${scaled} ÷ ${scale} = ${formatHundredths(cyclesPerUnitCenti)} drone cycles per unit, where ${scaled} = ${scale} × (till ${till} + plant ${plant} + harvest ${harvest} + move ${move}) + drift ${drift} × capacity ${world.waterCapacity} × water ${waterEach} + drift ${drift} × refill ${refillEach}`,
      `  drift = growCycles ${crop.growCycles} ÷ ${world.moistureDecayEvery} = ${drift} moisture, ${drift} ÷ ${world.waterAmount} = ${wateringsPerUnitMilli} thousandths of a watering per unit; the dry-to-minimum lift is per-tile setup, not in the rate`,
      `  at base ₵${crop.basePrice}: (${crop.basePrice} − seed ${crop.seedCost}) ${per1000} = ${profitAtBase} per 1,000 drone cycles`,
      `  at floor ₵${floorPrice}: (${floorPrice} − seed ${crop.seedCost}) ${per1000} = ${profitAtFloor} per 1,000 drone cycles`,
      `  tiles to keep the drone busy: ceil(${crop.growCycles} × ${scale} ÷ ${scaled}) = ${tilesToKeepBusy}`,
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
