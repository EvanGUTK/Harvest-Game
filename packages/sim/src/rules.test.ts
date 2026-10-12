import { CROPS, MARKET } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { InvariantError } from './invariant';
import { advanceMarket, createMarket, marketPrice } from './market/market';
import type { MarketEnv, MarketRules } from './market/market';
import { liquidate } from './market/liquidate';
import { sell } from './market/sell';
import { toInvariantError, validateConfig, validateRules } from './rules';

function withMarket(over: Partial<{ -readonly [K in keyof MarketRules]: number }>): { market: MarketRules } {
  return { market: { ...MARKET, ...over } };
}

const BAD_ENV: MarketEnv = { market: { ...MARKET, pressureDecayDenominator: 0 }, crops: CROPS };
const MARKET_STATE = createMarket({ sharedMarket: true });
const FARM = { credits: 100, silo: { radish: 3, corn: 0, melon: 0 } };

describe('validateRules (market bounds)', () => {
  it('finds nothing wrong with content’s numbers', () => {
    expect(validateRules({ market: MARKET })).toEqual([]);
  });

  it('checks every key of MARKET', () => {
    // A key added to MARKET but forgotten here would sail through validation; set each to a non-integer to prove all are read.
    for (const key of Object.keys(MARKET)) {
      const problems = validateRules(withMarket({ [key]: 0.5 }));
      expect(
        problems.map((p) => p.path),
        key,
      ).toContain(`market.${key}`);
    }
  });

  it('reports a number that is not a safe integer: a fraction, NaN and a value past 2^53', () => {
    for (const bad of [1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      const problems = validateRules(withMarket({ pressureStepBp: bad }));
      expect(
        problems.map((p) => [p.code, p.path]),
        String(bad),
      ).toEqual([['SIM-BAD-RULES', 'market.pressureStepBp']]);
      expect(problems[0]?.message).toContain('whole number');
    }
  });

  it('reports the percentages that leave 0..10_000 basis points: floor and liquidation share', () => {
    expect(validateRules(withMarket({ priceFloorBp: 10_001 })).map((p) => [p.code, p.path])).toEqual([
      ['SIM-BAD-RULES', 'market.priceFloorBp'],
    ]);
    expect(validateRules(withMarket({ liquidationBp: -1 })).map((p) => [p.code, p.path])).toEqual([
      ['SIM-BAD-RULES', 'market.liquidationBp'],
    ]);
  });

  it('accepts the ends of the basis-point ranges: 0 and 10_000', () => {
    expect(validateRules(withMarket({ priceFloorBp: 0, liquidationBp: 10_000 }))).toEqual([]);
    expect(validateRules(withMarket({ priceFloorBp: 10_000, liquidationBp: 0 }))).toEqual([]);
  });

  it('reports a decay interval or denominator below 1, since both divide or step time', () => {
    expect(validateRules(withMarket({ pressureDecayEvery: 0 })).map((p) => p.path)).toEqual([
      'market.pressureDecayEvery',
    ]);
    expect(validateRules(withMarket({ pressureDecayDenominator: 0 })).map((p) => p.path)).toContain(
      'market.pressureDecayDenominator',
    );
  });

  it('reports a negative step and a negative decay numerator', () => {
    expect(validateRules(withMarket({ pressureStepBp: -1 })).map((p) => p.path)).toEqual([
      'market.pressureStepBp',
    ]);
    expect(validateRules(withMarket({ pressureDecayNumerator: -1 })).map((p) => p.path)).toEqual([
      'market.pressureDecayNumerator',
    ]);
  });

  it('accepts the lowest value of each market number: step 0, numerator 0, interval 1, denominator 1', () => {
    expect(
      validateRules(
        withMarket({
          pressureStepBp: 0,
          pressureDecayNumerator: 0,
          pressureDecayEvery: 1,
          pressureDecayDenominator: 1,
        }),
      ),
    ).toEqual([]);
  });

  it('caps the decay denominator at 10_000, so pressure × numerator stays a safe integer', () => {
    const capped = withMarket({ pressureDecayNumerator: 10_000, pressureDecayDenominator: 10_000 });
    expect(validateRules(capped)).toEqual([]);
    const over = validateRules(
      withMarket({ pressureDecayNumerator: 10_000, pressureDecayDenominator: 10_001 }),
    );
    expect(over.map((p) => [p.code, p.path])).toEqual([['SIM-BAD-RULES', 'market.pressureDecayDenominator']]);
  });

  it('reports a decay that grows the pressure: numerator above denominator', () => {
    const grows = validateRules(withMarket({ pressureDecayNumerator: 101, pressureDecayDenominator: 100 }));
    expect(grows.map((p) => [p.code, p.path])).toEqual([['SIM-BAD-RULES', 'market.pressureDecayNumerator']]);
    expect(grows[0]?.message).toContain('101');
    expect(validateRules(withMarket({ pressureDecayNumerator: 100, pressureDecayDenominator: 100 }))).toEqual(
      [],
    );
  });

  it('reports every problem, in the order of the keys, not just the first', () => {
    const problems = validateRules(
      withMarket({ priceFloorBp: 20_000, pressureStepBp: -5, liquidationBp: 99_999 }),
    );
    expect(problems.map((p) => p.path)).toEqual([
      'market.priceFloorBp',
      'market.pressureStepBp',
      'market.liquidationBp',
    ]);
  });

  it('does not change or retain the rules it reads', () => {
    const rules = withMarket({ priceFloorBp: 20_000 });
    const before = { market: { ...rules.market } };
    validateRules(rules);
    expect(rules).toEqual(before);
  });
});

describe('the market entry points refuse invalid rules (SIM-BAD-RULES)', () => {
  const calls: [string, () => unknown][] = [
    ['advanceMarket', () => advanceMarket(MARKET_STATE, 500, BAD_ENV)],
    ['marketPrice', () => marketPrice(MARKET_STATE, 'radish', BAD_ENV)],
    ['sell', () => sell(MARKET_STATE, FARM, 'radish', 1, 0, BAD_ENV)],
    ['liquidate', () => liquidate(MARKET_STATE, [FARM], 0, BAD_ENV)],
  ];

  it.each(calls)('%s throws an InvariantError that names the offending key', (_name, call) => {
    expect(call).toThrow(InvariantError);
    expect(call).toThrow(/SIM-BAD-RULES/);
    expect(call).toThrow(/market\.pressureDecayDenominator/);
  });

  it('still works with valid rules', () => {
    expect(() => advanceMarket(MARKET_STATE, 500, { market: MARKET, crops: CROPS })).not.toThrow();
  });
});

describe('validateConfig (match settings)', () => {
  const VALID = {
    gridSize: 8,
    cycleBudget: 30_000,
    startCredits: 100,
    startWater: 60,
    startMoisture: { min: 0, max: 40 },
  };

  it('finds nothing wrong with the showdown settings', () => {
    expect(validateConfig(VALID)).toEqual([]);
  });

  it('checks only the fields that are given', () => {
    expect(validateConfig({})).toEqual([]);
    expect(validateConfig({ gridSize: 0 }).map((p) => p.path)).toEqual(['gridSize']);
  });

  it('refuses a grid that is not a whole number of at least 1, with the layout’s own code and message', () => {
    for (const gridSize of [0, -3, 1.5, Number.NaN]) {
      const problems = validateConfig({ gridSize });
      expect(
        problems.map((p) => [p.code, p.path]),
        String(gridSize),
      ).toEqual([['SIM-BAD-GRID', 'gridSize']]);
      expect(problems[0]?.message).toBe(`grid size must be an integer ≥ 1, got ${gridSize}`);
    }
  });

  it('refuses a starting moisture range that is not whole numbers with 0 ≤ min ≤ max ≤ 100, with the layout’s code and message', () => {
    const bad = [
      { min: 5, max: 3 },
      { min: -1, max: 10 },
      { min: 0, max: 101 },
      { min: 0.5, max: 10 },
      { min: 101, max: 101 },
    ];
    for (const startMoisture of bad) {
      const problems = validateConfig({ startMoisture });
      expect(
        problems.map((p) => [p.code, p.path]),
        JSON.stringify(startMoisture),
      ).toEqual([['SIM-BAD-MOISTURE-RANGE', 'startMoisture']]);
      expect(problems[0]?.message).toBe(
        `starting moisture must be integers with 0 ≤ min ≤ max ≤ 100, got ${startMoisture.min}..${startMoisture.max}`,
      );
    }
  });

  it('accepts the ends of the moisture range: 0 to 0, and the campaign’s 100 to 100', () => {
    expect(validateConfig({ startMoisture: { min: 0, max: 0 } })).toEqual([]);
    expect(validateConfig({ startMoisture: { min: 100, max: 100 } })).toEqual([]);
  });

  it('refuses a cycle budget below 1 or not whole, and negative or fractional credits and water', () => {
    expect(validateConfig({ cycleBudget: 0 }).map((p) => [p.code, p.path])).toEqual([
      ['SIM-BAD-CONFIG', 'cycleBudget'],
    ]);
    expect(validateConfig({ cycleBudget: 1.5 }).map((p) => p.path)).toEqual(['cycleBudget']);
    expect(validateConfig({ startCredits: -1 }).map((p) => p.path)).toEqual(['startCredits']);
    expect(validateConfig({ startWater: 0.5 }).map((p) => p.path)).toEqual(['startWater']);
  });

  it('accepts zero credits and zero water, a match where nothing can be bought or watered', () => {
    expect(validateConfig({ startCredits: 0, startWater: 0 })).toEqual([]);
  });

  it('reports every problem, in the order gridSize, startMoisture, cycleBudget, startCredits, startWater', () => {
    const problems = validateConfig({
      gridSize: 0,
      startMoisture: { min: 9, max: 1 },
      cycleBudget: 0,
      startCredits: -1,
      startWater: -1,
    });
    expect(problems.map((p) => p.path)).toEqual([
      'gridSize',
      'startMoisture',
      'cycleBudget',
      'startCredits',
      'startWater',
    ]);
  });
});

describe('toInvariantError', () => {
  it('keeps the layout’s invariant codes and messages: SIM-BAD-GRID and SIM-BAD-MOISTURE-RANGE', () => {
    const grid = validateConfig({ gridSize: 0 })[0];
    const moisture = validateConfig({ startMoisture: { min: 5, max: 3 } })[0];
    expect(grid && toInvariantError(grid).message).toBe(
      'SIM-BAD-GRID: grid size must be an integer ≥ 1, got 0',
    );
    expect(moisture && toInvariantError(moisture).code).toBe('SIM-BAD-MOISTURE-RANGE');
  });

  it('throws a market problem as SIM-BAD-RULES and a budget, credits or water problem as SIM-BAD-CONFIG', () => {
    const rule = validateRules(withMarket({ pressureDecayEvery: 0 }))[0];
    const budget = validateConfig({ cycleBudget: 0 })[0];
    expect(rule && toInvariantError(rule).code).toBe('SIM-BAD-RULES');
    expect(budget && toInvariantError(budget).code).toBe('SIM-BAD-CONFIG');
    expect(budget && toInvariantError(budget).message).toBe(
      'SIM-BAD-CONFIG: cycleBudget must be a whole number of 1 or more, got 0',
    );
  });

  it('gives each problem the code its error carries', () => {
    const problems = [
      ...validateRules(withMarket({ priceFloorBp: 20_000 })),
      ...validateConfig({ gridSize: 0, startMoisture: { min: 5, max: 3 }, startWater: -1 }),
    ];
    expect(problems.map((p) => toInvariantError(p).code)).toEqual(problems.map((p) => p.code));
  });

  it('returns an InvariantError', () => {
    const problem = validateConfig({ gridSize: 0 })[0];
    expect(problem && toInvariantError(problem)).toBeInstanceOf(InvariantError);
  });
});
