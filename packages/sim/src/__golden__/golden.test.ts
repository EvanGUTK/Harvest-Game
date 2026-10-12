import { describe, expect, it } from 'vitest';
import { formatExpected } from '../golden/format';
import { playScript, runScripted } from '../golden/scripted';
import type { ScriptedScenario } from '../golden/scripted';
import { cases } from './cases';

function caseNamed(name: string): ScriptedScenario {
  const found = cases.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no golden case ${name}`);
  return found;
}

describe('golden scenarios (docs/09-engineering/testing.md §Sim goldens)', () => {
  it('has at least three cases with unique names', () => {
    expect(cases.length).toBeGreaterThanOrEqual(3);
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
  });

  it('regenerates every golden and matches the committed expected.ts exactly (update it only with `pnpm golden:update`)', async () => {
    const text = formatExpected(cases.map((c) => ({ name: c.name, result: runScripted(c) })));
    await expect(text).toMatchFileSnapshot('./expected.ts');
  });
});

describe('what each scenario exercises (checked independently of the hashes)', () => {
  it('solo-radish-to-sale: plants, waters, harvests two radishes, sells one, replants as corn, sells it, liquidates the last radish', () => {
    const played = playScript(caseNamed('solo-radish-to-sale'));
    // 100 − 2 − 2 (radish seeds) + 5 (one radish) − 6 (corn seed) + 18 (one corn) + 2 (the other radish, liquidated at 50 %)
    expect(played.farms[0]?.credits).toBe(115);
    expect(played.farms[0]?.silo).toEqual({ radish: 0, corn: 0, melon: 0 });
    expect(played.hashes).toHaveLength(3);
    expect(played.market.pressure).toEqual({ radish: 0, corn: 0, melon: 0 }); // both lots have decayed away by 3,000
  });

  it('eight-slots-shared-market: the tie-break orders the sales and each sale lowers the price for the next', () => {
    const played = playScript(caseNamed('eight-slots-shared-market'));
    // Seed ₵6 each. At t = 2000 (mod 16 = 0) slots 0-3 sell in order at ₵18, 17, 17, 16; at t = 2001 slots 4-6 sell at
    // ₵16, 16, 15; slot 7 keeps its corn, liquidated at 50 % of ₵17 (pressure 7 decayed to 2 by 4,000) = ₵8.
    expect(played.farms.map((f) => f.credits)).toEqual([112, 111, 111, 110, 110, 110, 109, 102]);
    expect(played.hashes).toHaveLength(4);
  });

  it('eight-slots-rules-variant: the same plan under shadowed market rules gives the same first hash and different later ones', () => {
    const base = runScripted(caseNamed('eight-slots-shared-market'));
    const variant = runScripted(caseNamed('eight-slots-rules-variant'));
    expect(variant.hashes[0]).toBe(base.hashes[0]); // before any sale the market rules cannot matter
    expect(variant.hashes[2]).not.toBe(base.hashes[2]);
    expect(variant.finalStateHash).not.toBe(base.finalStateHash);
  });

  it('dry-pause-and-wither: a dry planting sets everDryPaused, one crop withers in the ground and the other is harvested withered for nothing', () => {
    const played = playScript(caseNamed('dry-pause-and-wither'));
    const farm = played.farms[0];
    expect(farm?.everDryPaused).toBe(true);
    expect(farm?.tiles[1]?.crop?.withered).toBe(true); // (1,0): ripe at 800, withered at 3,800, never harvested
    expect(farm?.tiles[0]?.crop).toBeNull(); // (0,0): harvested at 4,500, after it withered at 3,900
    expect(farm?.silo.radish).toBe(0); // a withered crop yields nothing
    expect(farm?.credits).toBe(96); // two seeds, no income
    expect(played.hashes).toHaveLength(6);
  });
});
