import { CROP_IDS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VARIANT } from './overrides';
import { buildReport, buildVariantReport, formatReport } from './report';
import type { Report, VariantReport } from './report';
import { eightId, HOARD_LOBBY, soloId } from './scenario';
import type { RunRecord, VariantData } from './scenario';

function record(lobbyId: string, seed: number, scores: number[], over: Partial<RunRecord> = {}): RunRecord {
  return {
    lobbyId,
    seed,
    variant: 'default',
    scores,
    lots: [],
    failedCompiles: [],
    runtimeErrors: [],
    ...over,
  };
}

/** A VariantData whose records a test may still edit. */
type EditableData = Omit<VariantData, 'records'> & { records: Map<string, RunRecord[]> };

function data(): EditableData {
  const records = new Map<string, RunRecord[]>();
  records.set(soloId('pass'), [record(soloId('pass'), 0, [100]), record(soloId('pass'), 1, [100])]);
  records.set(soloId('grower'), [record(soloId('grower'), 0, [200]), record(soloId('grower'), 1, [300])]);
  records.set(eightId('grower'), [
    record(eightId('grower'), 0, [100, 110, 120, 130, 140, 150, 160, 170], {
      lots: [
        { slot: 0, crop: 'radish', n: 2, price: 5 },
        { slot: 1, crop: 'radish', n: 2, price: 4 },
      ],
    }),
    record(eightId('grower'), 1, [200, 200, 200, 200, 200, 200, 200, 200]),
  ]);
  records.set(HOARD_LOBBY.id, [record(HOARD_LOBBY.id, 0, [100, 100, 100, 100, 90, 90, 90, 90])]);
  return { variant: 'default', seeds: [0, 1], records };
}

describe('buildVariantReport', () => {
  const report = buildVariantReport(data(), DEFAULT_VARIANT);

  it('names the variant and counts its seeds', () => {
    expect(report.variant).toBe('default');
    expect(report.seeds).toBe(2);
  });

  it('lists a score distribution per program, solo and as eight copies, in the order the programs ran', () => {
    expect(report.programs.map((p) => p.id)).toEqual(['pass', 'grower']);
    const grower = report.programs.find((p) => p.id === 'grower');
    expect(grower?.solo).toEqual({ n: 2, min: 200, p25: 200, median: 200, p75: 300, max: 300, mean: 250 });
    expect(grower?.eight?.n).toBe(16);
    expect(report.programs.find((p) => p.id === 'pass')?.eight).toBeNull();
  });

  it('measures the realised sale price over the all-radish lobby, 8 copies of the Grower', () => {
    expect(report.allRadishPriceBp).toBe(9_000); // (2 × 10_000 + 2 × 8_000) ÷ 4
  });

  it('has one ideal-profit row per crop, in CROP_IDS order', () => {
    expect(report.ideal.map((row) => row.crop)).toEqual([...CROP_IDS]);
    expect(report.ideal.map((row) => row.cyclesPerUnitCenti)).toEqual([8_705, 12_615, 14_642]);
  });

  it('shadows the market floor in the ideal rows when the variant does: a 6_000 bp floor gives radish ₵3', () => {
    const shadowed = buildVariantReport(data(), {
      name: 'firm',
      overrides: { market: { priceFloorBp: 6_000 } },
    });
    expect(shadowed.ideal.find((row) => row.crop === 'radish')?.floorPrice).toBe(3);
  });

  it('carries the hoard comparison and the criteria', () => {
    expect(report.hoard?.steadyMean).toBe(100);
    expect(report.hoard?.dumpMean).toBe(90);
    expect(report.criteria.map((c) => c.id)).toContain('dump-not-better');
  });

  it('has a null realised price when nothing was sold', () => {
    const quiet = data();
    quiet.records.set(eightId('grower'), [
      record(eightId('grower'), 0, [100, 100, 100, 100, 100, 100, 100, 100]),
    ]);
    expect(buildVariantReport(quiet, DEFAULT_VARIANT).allRadishPriceBp).toBeNull();
  });
});

describe('buildReport', () => {
  const passing: VariantReport = {
    ...buildVariantReport(data(), DEFAULT_VARIANT),
    criteria: [{ id: 'clean-runs', title: 't', passed: true, detail: 'd' }],
  };
  const failing: VariantReport = {
    ...passing,
    variant: 'tough',
    criteria: [{ id: 'starter-solo', title: 't', passed: false, detail: 'd' }],
  };

  it('passes only when every criterion of every variant passes', () => {
    expect(buildReport([passing, passing]).passed).toBe(true);
    expect(buildReport([passing, failing]).passed).toBe(false);
  });

  it('keeps the variants in the order given', () => {
    expect(buildReport([failing, passing]).variants.map((v) => v.variant)).toEqual(['tough', 'default']);
  });

  it('does not pass an empty report: no variant means nothing was measured', () => {
    expect(buildReport([]).passed).toBe(false);
  });
});

describe('formatReport', () => {
  const variant = buildVariantReport(data(), DEFAULT_VARIANT);
  const report: Report = buildReport([
    {
      ...variant,
      criteria: [
        {
          id: 'starter-solo',
          title: 'starter program finishes with at least ₵250 solo, on every seed',
          passed: true,
          detail: 'worst of 2 seeds ₵300',
        },
        {
          id: 'bots-beat-pass',
          title: 'every bot beats a pass program, on every seed',
          passed: false,
          detail: 'seedling ₵90 against pass ₵100 on seed 1',
        },
      ],
    },
  ]);
  const text = formatReport(report);
  const lines = text.split('\n');

  it('opens with the variant and its seed count', () => {
    expect(lines).toContain('== variant default (2 seeds) ==');
  });

  it('prints the solo score table, one row per program, columns right-aligned', () => {
    const at = lines.indexOf('Scores, solo (₵ over the seeds)');
    expect(at).toBeGreaterThan(-1);
    expect(lines.slice(at + 1, at + 4)).toEqual([
      'program  n  min  p25  median  p75  max  mean',
      'pass     2  100  100     100  100  100   100',
      'grower   2  200  200     200  300  300   250',
    ]);
  });

  it('prints the eight-copy table only for programs that ran as eight copies', () => {
    const at = lines.indexOf('Scores, 8 copies in one lobby (₵ over the seeds and slots)');
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 2]).toMatch(/^grower +16 /);
    expect(text).not.toMatch(/^pass +16/m);
  });

  it('prints the realised sale price in basis points and as a percentage of base', () => {
    expect(lines).toContain(
      'Mean realised sale price, 8-player all-radish lobby (8 × Grower): 9000 bp of base (90 %)',
    );
  });

  it('says so when nothing was sold', () => {
    const quiet = data();
    quiet.records.set(eightId('grower'), [record(eightId('grower'), 0, [1, 1, 1, 1, 1, 1, 1, 1])]);
    const out = formatReport(buildReport([buildVariantReport(quiet, DEFAULT_VARIANT)]));
    expect(out).toContain('Mean realised sale price, 8-player all-radish lobby (8 × Grower): no sales');
  });

  it('prints the ideal-profit summary and then the arithmetic of every crop', () => {
    expect(lines).toContain('Ideal-play profit per 1,000 drone cycles');
    expect(text).toContain(
      'radish: 208926 ÷ 2400 = 87.05 drone cycles per unit, where 208926 = 2400 × (till 0 + plant 31 + harvest 31 + move 21)',
    );
    expect(text).toContain(
      '  at floor ₵24: (24 − seed 15) × 1000 × 2400 ÷ 351408 = 61 per 1,000 drone cycles',
    );
  });

  it('prints the hoard comparison', () => {
    expect(lines).toContain('Hoard and dump versus steady selling (radish): steady ₵100, dump ₵90');
  });

  it('marks each criterion PASS or FAIL with its detail', () => {
    expect(lines).toContain(
      'PASS  starter-solo: starter program finishes with at least ₵250 solo, on every seed (worst of 2 seeds ₵300)',
    );
    expect(lines).toContain(
      'FAIL  bots-beat-pass: every bot beats a pass program, on every seed (seedling ₵90 against pass ₵100 on seed 1)',
    );
  });

  it('ends with the verdict and how many criteria failed', () => {
    expect(lines[lines.length - 1]).toBe('RESULT: FAIL (1 of 2 criteria failing)');
  });

  it('ends with RESULT: PASS when everything passes', () => {
    const ok = buildReport([
      { ...variant, criteria: [{ id: 'clean-runs', title: 't', passed: true, detail: 'd' }] },
    ]);
    expect(formatReport(ok).split('\n').pop()).toBe('RESULT: PASS (0 of 1 criteria failing)');
  });
});
