/**
 * Validation of the tunable rules a run is given: the bounds the simulation relies on, written once.
 * Design: docs/03-architecture/simulation-engine.md §Market (the numbers are `content`'s, or a run's overrides).
 * Invariants: validation reports every problem as a value (a code, the path of the number and a message), never throws;
 * the market entry points call it and throw an InvariantError when it finds any, so a bad rule cannot reach the
 * arithmetic; callers that take rules from a user (the balance harness) call it first and report the problems.
 */

import { BASIS_POINTS } from '@harvest/content';
import type { MarketRules } from './market/market';

export type RulesProblemCode = 'RULES-NOT-A-SAFE-INTEGER' | 'RULES-OUT-OF-RANGE' | 'RULES-DECAY-GROWS';

export type RulesProblem = {
  readonly code: RulesProblemCode;
  /** Where the number lives, e.g. `market.priceFloorBp`. */
  readonly path: string;
  readonly message: string;
};

/** The part of the rules that is validated; the full `Rules` object satisfies it structurally. */
export type ValidatableRules = { readonly market: MarketRules };

type Bounds = { readonly min: number; readonly max: number };

const UNBOUNDED = Number.MAX_SAFE_INTEGER;
const PERCENT: Bounds = { min: 0, max: BASIS_POINTS };
const NON_NEGATIVE: Bounds = { min: 0, max: UNBOUNDED };
const AT_LEAST_ONE: Bounds = { min: 1, max: UNBOUNDED };

/** The allowed range of every market number, in the order problems are reported. */
const MARKET_BOUNDS: readonly (readonly [keyof MarketRules, Bounds])[] = [
  ['priceFloorBp', PERCENT],
  ['pressureStepBp', NON_NEGATIVE],
  ['pressureDecayEvery', AT_LEAST_ONE],
  ['pressureDecayNumerator', NON_NEGATIVE],
  ['pressureDecayDenominator', AT_LEAST_ONE],
  ['liquidationBp', PERCENT],
];

function rangeText({ min, max }: Bounds): string {
  return max === UNBOUNDED ? `${min} or more` : `${min} to ${max}`;
}

function checkNumber(key: keyof MarketRules, value: number, bounds: Bounds): RulesProblem[] {
  const path = `market.${key}`;
  if (!Number.isSafeInteger(value)) {
    return [
      { code: 'RULES-NOT-A-SAFE-INTEGER', path, message: `${path} must be a whole number, got ${value}` },
    ];
  }
  if (value < bounds.min || value > bounds.max) {
    return [
      { code: 'RULES-OUT-OF-RANGE', path, message: `${path} must be ${rangeText(bounds)}, got ${value}` },
    ];
  }
  return [];
}

function checkDecayShrinks(market: MarketRules): RulesProblem[] {
  if (market.pressureDecayNumerator <= market.pressureDecayDenominator) return [];
  return [
    {
      code: 'RULES-DECAY-GROWS',
      path: 'market.pressureDecayNumerator',
      message: `market.pressureDecayNumerator ${market.pressureDecayNumerator} is above market.pressureDecayDenominator ${market.pressureDecayDenominator}, so pressure would grow instead of decay`,
    },
  ];
}

/** Every problem with these rules, in a fixed order; empty when they are playable. */
export function validateRules(rules: ValidatableRules): readonly RulesProblem[] {
  return [
    ...MARKET_BOUNDS.flatMap(([key, bounds]) => checkNumber(key, rules.market[key], bounds)),
    ...checkDecayShrinks(rules.market),
  ];
}
