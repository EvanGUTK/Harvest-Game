import { MARKET, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { showdownConfig } from '@harvest/tool-run/config';
import { describe, expect, it } from 'vitest';
import { applyToConfig, DEFAULT_VARIANT, marketRulesOf, parseVariant } from './overrides';

const BASE = showdownConfig({ seed: 7, gridSize: 8, cycleBudget: 30_000 });

describe('DEFAULT_VARIANT', () => {
  it('is named default and overrides nothing', () => {
    expect(DEFAULT_VARIANT).toEqual({ name: 'default', overrides: {} });
  });
});

describe('applyToConfig', () => {
  it('leaves the config as it was for no overrides', () => {
    expect(applyToConfig(BASE, {})).toEqual(BASE);
  });

  it('shadows the grid, budget, credits, water and starting moisture for the run', () => {
    const config = applyToConfig(BASE, {
      gridSize: 6,
      cycleBudget: 9_000,
      startCredits: 50,
      startWater: 10,
      startMoisture: { min: 5, max: 9 },
    });
    expect(config).toMatchObject({
      gridSize: 6,
      cycleBudget: 9_000,
      startCredits: 50,
      startWater: 10,
      startMoisture: { min: 5, max: 9 },
    });
  });

  it('keeps the seed and every field it was not asked to change', () => {
    const config = applyToConfig(BASE, { gridSize: 10 });
    expect(config).toEqual({ ...BASE, gridSize: 10 });
  });

  it('does not change the config it was given', () => {
    const before = structuredClone(BASE);
    applyToConfig(BASE, { gridSize: 4, startMoisture: { min: 1, max: 2 } });
    expect(BASE).toEqual(before);
  });
});

describe('marketRulesOf', () => {
  it('is content’s MARKET for no overrides', () => {
    expect(marketRulesOf({})).toEqual(MARKET);
  });

  it('shadows only the numbers named: a 6_000 bp floor keeps the step and the decay', () => {
    expect(marketRulesOf({ market: { priceFloorBp: 6_000 } })).toEqual({ ...MARKET, priceFloorBp: 6_000 });
  });

  it('never changes content’s MARKET', () => {
    marketRulesOf({ market: { priceFloorBp: 1, pressureStepBp: 1, liquidationBp: 1 } });
    expect(MARKET.priceFloorBp).toBe(4_000);
    expect(MARKET.pressureStepBp).toBe(200);
    expect(MARKET.liquidationBp).toBe(5_000);
  });
});

describe('parseVariant', () => {
  it('reads a name and its overrides: tight:market.priceFloorBp=3000,gridSize=6', () => {
    expect(parseVariant('tight:market.priceFloorBp=3000,gridSize=6')).toEqual({
      ok: true,
      variant: { name: 'tight', overrides: { gridSize: 6, market: { priceFloorBp: 3_000 } } },
    });
  });

  it('reads every top-level key', () => {
    const parsed = parseVariant('x:gridSize=6,cycleBudget=9000,startCredits=50,startWater=10');
    expect(parsed).toEqual({
      ok: true,
      variant: {
        name: 'x',
        overrides: { gridSize: 6, cycleBudget: 9_000, startCredits: 50, startWater: 10 },
      },
    });
  });

  it('reads every market key', () => {
    const parsed = parseVariant(
      'm:market.priceFloorBp=1000,market.pressureStepBp=100,market.pressureDecayEvery=250,market.pressureDecayNumerator=70,market.pressureDecayDenominator=100,market.liquidationBp=4000',
    );
    expect(parsed).toEqual({
      ok: true,
      variant: {
        name: 'm',
        overrides: {
          market: {
            priceFloorBp: 1_000,
            pressureStepBp: 100,
            pressureDecayEvery: 250,
            pressureDecayNumerator: 70,
            pressureDecayDenominator: 100,
            liquidationBp: 4_000,
          },
        },
      },
    });
  });

  it('fills the missing half of the starting moisture range from the showdown default', () => {
    expect(parseVariant('a:startMoisture.max=20')).toEqual({
      ok: true,
      variant: {
        name: 'a',
        overrides: { startMoisture: { min: SHOWDOWN_DEFAULTS.startMoisture.min, max: 20 } },
      },
    });
    expect(parseVariant('b:startMoisture.min=10')).toEqual({
      ok: true,
      variant: {
        name: 'b',
        overrides: { startMoisture: { min: 10, max: SHOWDOWN_DEFAULTS.startMoisture.max } },
      },
    });
  });

  it('accepts a starting moisture of exactly the world maximum, the campaign’s 100 to 100', () => {
    expect(parseVariant('c:startMoisture.min=100,startMoisture.max=100')).toEqual({
      ok: true,
      variant: { name: 'c', overrides: { startMoisture: { min: 100, max: 100 } } },
    });
  });

  it('accepts a name alone as a variant with no overrides', () => {
    expect(parseVariant('plain:')).toEqual({ ok: true, variant: { name: 'plain', overrides: {} } });
  });

  it.each([
    ['no colon', 'tight'],
    ['an empty name', ':gridSize=6'],
    ['a pair without =', 'x:gridSize'],
    ['an unknown key', 'x:turbo=1'],
    ['an unknown market key', 'x:market.turbo=1'],
    ['a fractional value', 'x:gridSize=6.5'],
    ['a negative value', 'x:startCredits=-5'],
    ['a value that is not a number', 'x:gridSize=big'],
    ['an empty value', 'x:gridSize='],
    ['a repeated key', 'x:gridSize=6,gridSize=7'],
    ['a zero grid', 'x:gridSize=0'],
    ['a zero budget', 'x:cycleBudget=0'],
    ['a value beyond the safe integers', 'x:startCredits=9007199254740993'],
    ['a price floor above 100 %', 'x:market.priceFloorBp=10001'],
    ['a decay that grows pressure', 'x:market.pressureDecayNumerator=120'],
    ['a zero decay interval', 'x:market.pressureDecayEvery=0'],
    ['a zero decay denominator', 'x:market.pressureDecayDenominator=0'],
    ['a starting moisture range with min above max', 'x:startMoisture.min=30,startMoisture.max=10'],
    ['a starting moisture max above the world maximum of 100', 'x:startMoisture.max=120'],
    [
      'a starting moisture range wholly above the world maximum',
      'x:startMoisture.min=101,startMoisture.max=101',
    ],
  ])('rejects %s', (_label, text) => {
    const parsed = parseVariant(text);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.message).toContain(text);
  });

  it('names the offending key in the message', () => {
    const parsed = parseVariant('x:turbo=1');
    expect(parsed.ok ? '' : parsed.message).toContain('turbo');
  });
});
