import { BOTS, CROP_IDS, STARTER_PROGRAM } from '@harvest/content';
import { DEFAULT_LIMITS, parse, utf8Length } from '@harvest/lang';
import { describe, expect, it } from 'vitest';
import { cropFarmer, DUMP_WINDOW_CYCLES, PASS_PROGRAM, referencePrograms } from './strategies';
import type { Program } from './strategies';

function diagnosticsOf(program: Program): number {
  return parse([{ name: 'main.sprout', text: program.source }], DEFAULT_LIMITS).diagnostics.length;
}

describe('PASS_PROGRAM', () => {
  it('is a program that does nothing and parses cleanly', () => {
    expect(PASS_PROGRAM).toEqual({ id: 'pass', title: 'Pass', source: 'pass\n' });
    expect(diagnosticsOf(PASS_PROGRAM)).toBe(0);
  });
});

describe('referencePrograms', () => {
  it('lists the starter and the three bots with their content sources, in difficulty order', () => {
    const programs = referencePrograms();
    expect(programs.map((p) => p.id)).toEqual(['starter', 'seedling', 'grower', 'agronomist']);
    expect(programs[0]?.source).toBe(STARTER_PROGRAM);
    expect(programs.slice(1).map((p) => p.source)).toEqual(BOTS.map((b) => b.source));
  });
});

describe('cropFarmer', () => {
  for (const crop of CROP_IDS) {
    for (const policy of [{ kind: 'steady' }, { kind: 'dump', windowCycles: DUMP_WINDOW_CYCLES }] as const) {
      const program = cropFarmer(crop, policy);

      describe(program.id, () => {
        it('parses without diagnostics', () => {
          expect(diagnosticsOf(program)).toBe(0);
        });

        it('fits one showdown file and uses neither spawn nor random', () => {
          expect(utf8Length(program.source)).toBeLessThanOrEqual(DEFAULT_LIMITS.maxSourceBytes);
          expect(program.source).not.toMatch(/\bspawn\s*\(/);
          expect(program.source).not.toMatch(/\brandom\s*\(/);
        });

        it('plants and sells only its own crop', () => {
          const constant = crop.toUpperCase();
          expect(program.source).toContain(`plant(${constant})`);
          expect(program.source).toContain(`sell(${constant}, inventory(${constant}))`);
          for (const other of CROP_IDS.filter((c) => c !== crop)) {
            expect(program.source).not.toContain(other.toUpperCase());
          }
        });
      });
    }
  }

  it('names a farmer after its crop and policy: radish-steady, corn-dump-5000', () => {
    expect(cropFarmer('radish', { kind: 'steady' }).id).toBe('radish-steady');
    expect(cropFarmer('corn', { kind: 'dump', windowCycles: 5_000 }).id).toBe('corn-dump-5000');
  });

  it('tills only the crops that need tilled soil: radish never, corn and melon first', () => {
    expect(cropFarmer('radish', { kind: 'steady' }).source).not.toContain('till()');
    expect(cropFarmer('corn', { kind: 'steady' }).source).toContain('if soil() == GRASS:');
    expect(cropFarmer('melon', { kind: 'steady' }).source).toContain('till()');
  });

  it('waters melon sooner than the others, because it grows only above moisture 30', () => {
    expect(cropFarmer('melon', { kind: 'steady' }).source).toContain('moisture() < 35');
    expect(cropFarmer('radish', { kind: 'steady' }).source).toContain('moisture() < 10');
    expect(cropFarmer('corn', { kind: 'steady' }).source).toContain('moisture() < 10');
  });

  it('sells the silo after every lap when steady, with no clock check', () => {
    const source = cropFarmer('radish', { kind: 'steady' }).source;
    expect(source).not.toContain('cycles()');
    expect(source).toContain('    sell(RADISH, inventory(RADISH))');
  });

  it('sells once per window when dumping: the first at the window, then every window after', () => {
    const source = cropFarmer('radish', { kind: 'dump', windowCycles: 5_000 }).source;
    expect(source).toContain('next_dump = 5000');
    expect(source).toContain('cycles() >= next_dump');
    expect(source).toContain('next_dump = next_dump + 5000');
  });

  it('also sells on its last lap, so the final window’s crop is not liquidated at 50 %: it times each lap and sells when no more than one lap is left', () => {
    const source = cropFarmer('radish', { kind: 'dump', windowCycles: 5_000 }).source;
    expect(source).toContain('    lap_start = cycles()');
    expect(source).toContain('    lap = cycles() - lap_start');
    expect(source).toContain('    if cycles() >= next_dump or cycles_left() <= lap:');
  });

  it('keeps the lap timing out of the steady farmer, which sells every lap anyway', () => {
    const source = cropFarmer('radish', { kind: 'steady' }).source;
    expect(source).not.toContain('lap_start');
    expect(source).not.toContain('cycles_left()');
  });

  it('refills the tank at the well after every lap', () => {
    expect(cropFarmer('radish', { kind: 'steady' }).source).toContain('    refill()');
  });
});
