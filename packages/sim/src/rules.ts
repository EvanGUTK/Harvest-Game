/**
 * Validation of the tunable rules a run is given: the bounds the simulation relies on, written once.
 * Design: docs/03-architecture/simulation-engine.md §Market (the numbers are `content`'s, or a run's overrides).
 * Invariants: validation reports every problem as a value (a code, the path of the number and a message), never throws;
 * the market entry points call it and throw an InvariantError when it finds any, so a bad rule cannot reach the
 * arithmetic; callers that take rules from a user (the balance harness) call it first and report the problems.
 */

import { BASIS_POINTS, WORLD } from '@harvest/content';
import { InvariantError } from './invariant';
import type { InvariantCode } from './invariant';
import type { MarketRules } from './market/market';

/**
 * A problem's code is the invariant code the same violation throws: SIM-BAD-RULES for every market number (the path
 * and message say which), SIM-BAD-GRID and SIM-BAD-MOISTURE-RANGE as the layout has always thrown them, and
 * SIM-BAD-CONFIG for the budget, the starting credits and the starting water.
 */
export type RulesProblemCode = Extract<
  InvariantCode,
  'SIM-BAD-RULES' | 'SIM-BAD-CONFIG' | 'SIM-BAD-GRID' | 'SIM-BAD-MOISTURE-RANGE'
>;

/** A problem with the market rules or the match settings: one shape for both validators. */
export type RulesProblem = {
  readonly code: RulesProblemCode;
  /** Where the number lives, e.g. `market.priceFloorBp` or `gridSize`. */
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
  ['pressureDecayDenominator', { min: 1, max: BASIS_POINTS }],
  ['liquidationBp', PERCENT],
];

function rangeText({ min, max }: Bounds): string {
  return max === UNBOUNDED ? `${min} or more` : `${min} to ${max}`;
}

function checkNumber(key: keyof MarketRules, value: number, bounds: Bounds): RulesProblem[] {
  const path = `market.${key}`;
  if (!Number.isSafeInteger(value)) {
    return [{ code: 'SIM-BAD-RULES', path, message: `${path} must be a whole number, got ${value}` }];
  }
  if (value < bounds.min || value > bounds.max) {
    return [{ code: 'SIM-BAD-RULES', path, message: `${path} must be ${rangeText(bounds)}, got ${value}` }];
  }
  return [];
}

function checkDecayShrinks(market: MarketRules): RulesProblem[] {
  if (market.pressureDecayNumerator <= market.pressureDecayDenominator) return [];
  return [
    {
      code: 'SIM-BAD-RULES',
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

/** The match settings a harness can override; each is checked only when given. */
export type ConfigFields = {
  readonly gridSize?: number;
  readonly cycleBudget?: number;
  readonly startCredits?: number;
  readonly startWater?: number;
  readonly startMoisture?: { readonly min: number; readonly max: number };
};

function checkGrid(gridSize: number): RulesProblem[] {
  if (Number.isInteger(gridSize) && gridSize >= 1) return [];
  return [
    { code: 'SIM-BAD-GRID', path: 'gridSize', message: `grid size must be an integer ≥ 1, got ${gridSize}` },
  ];
}

function checkMoisture({ min, max }: { readonly min: number; readonly max: number }): RulesProblem[] {
  const ok =
    Number.isInteger(min) && Number.isInteger(max) && min >= 0 && min <= max && max <= WORLD.moistureMax;
  if (ok) return [];
  return [
    {
      code: 'SIM-BAD-MOISTURE-RANGE',
      path: 'startMoisture',
      message: `starting moisture must be integers with 0 ≤ min ≤ max ≤ ${WORLD.moistureMax}, got ${min}..${max}`,
    },
  ];
}

function checkAtLeast(path: string, value: number, min: number): RulesProblem[] {
  if (Number.isSafeInteger(value) && value >= min) return [];
  return [
    {
      code: 'SIM-BAD-CONFIG',
      path,
      message: `${path} must be a whole number of ${min} or more, got ${value}`,
    },
  ];
}

/** Every problem with these match settings, in the order gridSize, startMoisture, cycleBudget, startCredits, startWater. */
export function validateConfig(config: ConfigFields): readonly RulesProblem[] {
  return [
    ...(config.gridSize === undefined ? [] : checkGrid(config.gridSize)),
    ...(config.startMoisture === undefined ? [] : checkMoisture(config.startMoisture)),
    ...(config.cycleBudget === undefined ? [] : checkAtLeast('cycleBudget', config.cycleBudget, 1)),
    ...(config.startCredits === undefined ? [] : checkAtLeast('startCredits', config.startCredits, 0)),
    ...(config.startWater === undefined ? [] : checkAtLeast('startWater', config.startWater, 0)),
  ];
}

/** The invariant violation for a problem: its code and message, so a thrown error reads like the reported problem. */
export function toInvariantError(problem: RulesProblem): InvariantError {
  return new InvariantError(problem.code, problem.message);
}
