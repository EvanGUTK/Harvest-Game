import { ACTION_COSTS, CROPS, MARKET, WORLD } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { HOARD_LOBBY } from './scenario';
import type { RunRecord, SellLot } from './scenario';
import { formatHundredths, hoardVersusSteady, idealProfit, lobbyScores, realisedPriceBp } from './metrics';

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

describe('idealProfit (amortised, per 1,000 drone cycles)', () => {
  // S = waterAmount 40 × moistureDecayEvery 50 × waterCapacity 60 = 120_000;
  // scaled = S × (till + plant + harvest + move) + growCycles × 60 × 26 + growCycles × 61
  it('radish: 87.05 drone cycles per unit; ₵34 per 1,000 cycles at base, ₵0 at the ₵2 floor', () => {
    const row = idealProfit(CROPS.radish, IDEAL_INPUTS);
    // 120_000 × (0 + 31 + 31 + 21) + 300 × 60 × 26 + 300 × 61 = 9_960_000 + 468_000 + 18_300 = 10_446_300
    expect([row.wateringsPerUnitMilli, row.cyclesPerUnitCenti]).toEqual([150, 8_705]);
    expect([row.basePrice, row.floorPrice]).toEqual([5, 2]);
    expect([row.profitAtBase, row.profitAtFloor]).toEqual([34, 0]); // floorDiv(3 × 1000 × 120_000, 10_446_300), floorDiv(0, …)
    expect(row.tilesToKeepBusy).toBe(4); // ceil(300 × 120_000 ÷ 10_446_300) = ceil(3.45)
  });

  it('corn: tills, 126.15 cycles per unit; ₵95 at base, ₵7 at the ₵7 floor', () => {
    const row = idealProfit(CROPS.corn, IDEAL_INPUTS);
    // 120_000 × 114 + 900 × 60 × 26 + 900 × 61 = 13_680_000 + 1_404_000 + 54_900 = 15_138_900
    expect([row.wateringsPerUnitMilli, row.cyclesPerUnitCenti]).toEqual([450, 12_615]);
    expect([row.basePrice, row.floorPrice]).toEqual([18, 7]);
    expect([row.profitAtBase, row.profitAtFloor]).toEqual([95, 7]); // floorDiv(12 × 1000 × 120_000, 15_138_900), floorDiv(1 × …)
    expect(row.tilesToKeepBusy).toBe(8); // ceil(900 × 120_000 ÷ 15_138_900) = ceil(7.13)
  });

  it('melon: 146.42 cycles per unit; ₵307 at base, ₵61 at the ₵24 floor', () => {
    const row = idealProfit(CROPS.melon, IDEAL_INPUTS);
    // 120_000 × 114 + 2_400 × 60 × 26 + 2_400 × 61 = 13_680_000 + 3_744_000 + 146_400 = 17_570_400
    expect([row.wateringsPerUnitMilli, row.cyclesPerUnitCenti]).toEqual([1_200, 14_642]);
    expect([row.basePrice, row.floorPrice]).toEqual([60, 24]);
    expect([row.profitAtBase, row.profitAtFloor]).toEqual([307, 61]); // floorDiv(45 × 1000 × 120_000, 17_570_400), floorDiv(9 × …)
    expect(row.tilesToKeepBusy).toBe(17); // ceil(2_400 × 120_000 ÷ 17_570_400) = ceil(16.39)
  });

  it('does not floor the moisture drift: a growth of 325 cycles loses 6.5 moisture, not 6', () => {
    const odd = { ...CROPS.radish, growCycles: 325 };
    const row = idealProfit(odd, IDEAL_INPUTS);
    // 120_000 × 83 + 325 × 60 × 26 + 325 × 61 = 9_960_000 + 507_000 + 19_825 = 10_486_825; flooring the drift to 6 would give 10_446_300
    expect([row.wateringsPerUnitMilli, row.cyclesPerUnitCenti]).toEqual([162, 8_739]); // 325 ÷ 2_000 = 0.1625 waterings; floorDiv(1_048_682_500, 120_000) = 8_739
    expect(row.tilesToKeepBusy).toBe(4); // ceil(325 × 120_000 ÷ 10_486_825) = ceil(3.72)
  });

  it('leaves the dry-to-minimum lift out of the rate: a melon’s minimum moisture does not change it', () => {
    const picky = { ...CROPS.melon, minMoisture: 90 };
    expect(idealProfit(picky, IDEAL_INPUTS)).toEqual(idealProfit(CROPS.melon, IDEAL_INPUTS));
  });

  it('shows every term of the arithmetic as printable lines', () => {
    const row = idealProfit(CROPS.melon, IDEAL_INPUTS);
    expect(row.lines).toEqual([
      'melon: 17570400 ÷ 120000 = 146.42 drone cycles per unit, where 17570400 = 120000 × (till 31 + plant 31 + harvest 31 + move 21) + growCycles 2400 × capacity 60 × water 26 + growCycles 2400 × refill 61',
      '  waterings per unit = growCycles 2400 ÷ (decay every 50 × 40 per watering) = 1200 thousandths; the dry-to-minimum lift is per-tile setup, not in the rate',
      '  at base ₵60: (60 − seed 15) × 1000 × 120000 ÷ 17570400 = 307 per 1,000 drone cycles',
      '  at floor ₵24: (24 − seed 15) × 1000 × 120000 ÷ 17570400 = 61 per 1,000 drone cycles',
      '  tiles to keep the drone busy: ceil(2400 × 120000 ÷ 17570400) = 17',
    ]);
  });

  it('follows a shadowed floor: a 6_000 bp floor makes the radish floor price ₵3 and its profit 11', () => {
    const row = idealProfit(CROPS.radish, { ...IDEAL_INPUTS, priceFloorBp: 6_000 });
    expect(row.floorPrice).toBe(3);
    expect(row.profitAtFloor).toBe(11); // floorDiv(1 × 1000 × 120_000, 10_446_300) = floorDiv(120_000_000, 10_446_300) = 11
  });

  it('is negative when the price is below the seed cost', () => {
    const row = idealProfit(CROPS.radish, { ...IDEAL_INPUTS, priceFloorBp: 2_000 });
    expect(row.floorPrice).toBe(1); // floorDiv(5 × 2000, 10_000)
    expect(row.profitAtFloor).toBe(-12); // floorDiv(-120_000_000, 10_446_300) = floor(-11.49)
  });
});

describe('formatHundredths', () => {
  it('writes hundredths as a decimal with two digits: 8_705 is 87.05, 8_700 is 87.00, 5 is 0.05', () => {
    expect([8_705, 8_700, 5].map(formatHundredths)).toEqual(['87.05', '87.00', '0.05']);
  });
});

describe('hoardVersusSteady', () => {
  it('averages slots 0 to 3 (steady) and 4 to 7 (dump) of the hoard lobby per seed and over the seeds', () => {
    const data = dataOf([
      record(HOARD_LOBBY.id, 0, [100, 110, 120, 130, 90, 90, 90, 90]),
      record(HOARD_LOBBY.id, 1, [200, 200, 200, 200, 150, 160, 170, 180]),
    ]);
    expect(hoardVersusSteady(data)).toEqual({
      steadyTotal: 1_260, // 460 + 800
      steadyPlayers: 8,
      dumpTotal: 1_020, // 360 + 660
      dumpPlayers: 8,
      steadyMean: 157, // floorDiv(1_260, 8) = 157.5
      dumpMean: 127, // floorDiv(1_020, 8) = 127.5
      perSeed: [
        { seed: 0, steady: 115, dump: 90 },
        { seed: 1, steady: 200, dump: 165 },
      ],
    });
  });

  it('keeps the sums apart when the floored means tie: 400 against 401 over 4 players each', () => {
    const data = dataOf([record(HOARD_LOBBY.id, 0, [100, 100, 100, 100, 100, 100, 100, 101])]);
    const result = hoardVersusSteady(data);
    expect([result?.steadyMean, result?.dumpMean]).toEqual([100, 100]);
    expect([result?.steadyTotal, result?.dumpTotal]).toEqual([400, 401]);
  });

  it('is null when the hoard lobby was not run', () => {
    expect(hoardVersusSteady(dataOf([]))).toBeNull();
  });
});
