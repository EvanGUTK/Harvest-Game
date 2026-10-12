import { ACTION_COSTS, CROPS, MARKET, WORLD } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { HOARD_LOBBY } from './scenario';
import type { RunRecord, SellLot } from './scenario';
import { hoardVersusSteady, idealProfit, lobbyScores, realisedPriceBp } from './metrics';

const IDEAL_INPUTS = { actionCosts: ACTION_COSTS, world: WORLD, priceFloorBp: MARKET.priceFloorBp };

function record(lobbyId: string, seed: number, scores: number[], lots: SellLot[] = []): RunRecord {
  return { lobbyId, seed, variant: 'default', scores, lots, failedCompiles: [], runtimeErrors: [] };
}

function dataOf(records: RunRecord[]) {
  const grouped = new Map<string, RunRecord[]>();
  for (const r of records) grouped.set(r.lobbyId, [...(grouped.get(r.lobbyId) ?? []), r]);
  return { variant: 'default', seeds: records.map((r) => r.seed), records: grouped };
}

describe('lobbyScores', () => {
  const data = dataOf([
    record('eight:x', 0, [1, 2, 3, 4, 5, 6, 7, 8]),
    record('eight:x', 1, [10, 20, 30, 40, 50, 60, 70, 80]),
  ]);

  it('pools every slot of every seed for a lobby', () => {
    expect(lobbyScores(data, 'eight:x')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it('keeps only the slots a filter accepts', () => {
    expect(lobbyScores(data, 'eight:x', (slot) => slot < 2)).toEqual([1, 2, 10, 20]);
  });

  it('is empty for a lobby that was not run', () => {
    expect(lobbyScores(data, 'nope')).toEqual([]);
  });
});

describe('realisedPriceBp (unit-weighted, basis points of base price)', () => {
  const base = (crop: string) => (crop === 'radish' ? 5 : 18);

  it('is 10_000 when every unit sold at the base price', () => {
    expect(realisedPriceBp([{ slot: 0, crop: 'radish', n: 3, price: 5 }], base)).toBe(10_000);
  });

  it('weights by units: 2 units at ₵5 and 2 at ₵4 average 9_000', () => {
    const lots: SellLot[] = [
      { slot: 0, crop: 'radish', n: 2, price: 5 },
      { slot: 1, crop: 'radish', n: 2, price: 4 },
    ];
    expect(realisedPriceBp(lots, base)).toBe(9_000); // (2 × 10_000 + 2 × 8_000) ÷ 4
  });

  it('floors each lot’s percentage first, then the average: ₵3 of ₵5 is 6_000, ₵17 of ₵18 is 9_444', () => {
    expect(realisedPriceBp([{ slot: 0, crop: 'corn', n: 1, price: 17 }], base)).toBe(9_444);
    expect(realisedPriceBp([{ slot: 0, crop: 'radish', n: 1, price: 3 }], base)).toBe(6_000);
  });

  it('floors the final average', () => {
    const lots: SellLot[] = [
      { slot: 0, crop: 'radish', n: 1, price: 5 },
      { slot: 0, crop: 'radish', n: 2, price: 4 },
    ];
    expect(realisedPriceBp(lots, base)).toBe(8_666); // (10_000 + 2 × 8_000) ÷ 3 = 8_666.67
  });

  it('is null when nothing was sold', () => {
    expect(realisedPriceBp([], base)).toBeNull();
  });
});

describe('idealProfit (closed form, per 1,000 drone cycles)', () => {
  it('radish: 111 drone cycles per unit; ₵27 per 1,000 cycles at base, ₵0 at the ₵2 floor', () => {
    const row = idealProfit(CROPS.radish, IDEAL_INPUTS);
    // till 0 + plant 31 + harvest 31 + move 21 + 1 watering × 26 + refill ceil(61 ÷ 60) = 2
    expect(row.cyclesPerUnit).toBe(111);
    expect([row.waterings, row.basePrice, row.floorPrice]).toEqual([1, 5, 2]);
    expect([row.profitAtBase, row.profitAtFloor]).toEqual([27, 0]); // floorDiv(3 × 1000, 111), floorDiv(0, 111)
    expect(row.tilesToKeepBusy).toBe(3); // ceil(300 ÷ 111)
  });

  it('corn: tills, 142 cycles per unit; ₵84 at base, ₵7 at the ₵7 floor', () => {
    const row = idealProfit(CROPS.corn, IDEAL_INPUTS);
    // till 31 + plant 31 + harvest 31 + move 21 + 1 watering × 26 + refill 2
    expect(row.cyclesPerUnit).toBe(142);
    expect([row.waterings, row.basePrice, row.floorPrice]).toEqual([1, 18, 7]);
    expect([row.profitAtBase, row.profitAtFloor]).toEqual([84, 7]); // floorDiv(12 × 1000, 142), floorDiv(1 × 1000, 142)
    expect(row.tilesToKeepBusy).toBe(7); // ceil(900 ÷ 142)
  });

  it('melon: needs 2 waterings to stay at 30 or more, 169 cycles per unit; ₵266 at base, ₵53 at the ₵24 floor', () => {
    const row = idealProfit(CROPS.melon, IDEAL_INPUTS);
    // waterings ceil((30 + floorDiv(2400, 50)) ÷ 40) = ceil(78 ÷ 40) = 2; refill ceil(2 × 61 ÷ 60) = 3
    expect(row.cyclesPerUnit).toBe(169);
    expect([row.waterings, row.basePrice, row.floorPrice]).toEqual([2, 60, 24]);
    expect([row.profitAtBase, row.profitAtFloor]).toEqual([266, 53]); // floorDiv(45 × 1000, 169), floorDiv(9 × 1000, 169)
    expect(row.tilesToKeepBusy).toBe(15); // ceil(2400 ÷ 169)
  });

  it('shows every term of the arithmetic as printable lines', () => {
    const row = idealProfit(CROPS.melon, IDEAL_INPUTS);
    expect(row.lines).toEqual([
      'melon: till 31 + plant 31 + harvest 31 + move 21 + water 2 × 26 + refill 3 = 169 drone cycles per unit',
      '  waterings = ceil((minMoisture 30 + growCycles 2400 ÷ 50 = 48) ÷ 40 per watering) = 2',
      '  at base ₵60: (60 − seed 15) × 1000 ÷ 169 = 266 per 1,000 drone cycles',
      '  at floor ₵24: (24 − seed 15) × 1000 ÷ 169 = 53 per 1,000 drone cycles',
      '  tiles to keep the drone busy: ceil(2400 ÷ 169) = 15',
    ]);
  });

  it('follows a shadowed floor: a 6_000 bp floor makes the radish floor price ₵3 and its profit 9', () => {
    const row = idealProfit(CROPS.radish, { ...IDEAL_INPUTS, priceFloorBp: 6_000 });
    expect(row.floorPrice).toBe(3);
    expect(row.profitAtFloor).toBe(9); // floorDiv(1 × 1000, 111)
  });

  it('is negative when the price is below the seed cost', () => {
    const row = idealProfit(CROPS.radish, { ...IDEAL_INPUTS, priceFloorBp: 2_000 });
    expect(row.floorPrice).toBe(1); // floorDiv(5 × 2000, 10_000)
    expect(row.profitAtFloor).toBe(-10); // floorDiv(-1 × 1000, 111) = floor(-9.01)
  });
});

describe('hoardVersusSteady', () => {
  it('averages slots 0 to 3 (steady) and 4 to 7 (dump) of the hoard lobby per seed and over the seeds', () => {
    const data = dataOf([
      record(HOARD_LOBBY.id, 0, [100, 110, 120, 130, 90, 90, 90, 90]),
      record(HOARD_LOBBY.id, 1, [200, 200, 200, 200, 150, 160, 170, 180]),
    ]);
    expect(hoardVersusSteady(data)).toEqual({
      steadyMean: 157, // floorDiv(115 + 200, 2): the mean over seeds of the per-seed means
      dumpMean: 127, // floorDiv(90 + 165, 2)
      perSeed: [
        { seed: 0, steady: 115, dump: 90 },
        { seed: 1, steady: 200, dump: 165 },
      ],
    });
  });

  it('is null when the hoard lobby was not run', () => {
    expect(hoardVersusSteady(dataOf([]))).toBeNull();
  });
});
