import { CROPS, MARKET } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { InvariantError } from './invariant';
import { advanceMarket, createMarket, marketPrice } from './market/market';
import type { MarketEnv, MarketRules } from './market/market';
import { liquidate } from './market/liquidate';
import { sell } from './market/sell';
import { validateRules } from './rules';

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
      ).toEqual([['RULES-NOT-A-SAFE-INTEGER', 'market.pressureStepBp']]);
      expect(problems[0]?.message).toContain('whole number');
    }
  });

  it('reports the percentages that leave 0..10_000 basis points: floor and liquidation share', () => {
    expect(validateRules(withMarket({ priceFloorBp: 10_001 })).map((p) => [p.code, p.path])).toEqual([
      ['RULES-OUT-OF-RANGE', 'market.priceFloorBp'],
    ]);
    expect(validateRules(withMarket({ liquidationBp: -1 })).map((p) => [p.code, p.path])).toEqual([
      ['RULES-OUT-OF-RANGE', 'market.liquidationBp'],
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

  it('reports a decay that grows the pressure: numerator above denominator', () => {
    const grows = validateRules(withMarket({ pressureDecayNumerator: 101, pressureDecayDenominator: 100 }));
    expect(grows.map((p) => [p.code, p.path])).toEqual([
      ['RULES-DECAY-GROWS', 'market.pressureDecayNumerator'],
    ]);
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
