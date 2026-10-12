/**
 * Validation of the tunable rules a run is given: the bounds the simulation relies on, written once.
 * Design: docs/03-architecture/simulation-engine.md §Market (the numbers are `content`'s, or a run's overrides).
 * Invariants: validation reports every problem as a value (a code, the path of the number and a message), never throws;
 * the market entry points call it and throw an InvariantError when it finds any, so a bad rule cannot reach the
 * arithmetic; callers that take rules from a user (the balance harness) call it first and report the problems.
 */

import { BASIS_POINTS, WORLD } from '@harvest/content';
import { assertNever, InvariantError } from './invariant';
import type { MarketRules } from './market/market';

/**
 * The market rules use RULES-* codes, the match settings CONFIG-OUT-OF-RANGE, and the grid and the starting moisture
 * keep the invariant codes the layout generator has always thrown, so their messages do not change.
 */
export type RulesProblemCode =
  | 'RULES-NOT-A-SAFE-INTEGER'
  | 'RULES-OUT-OF-RANGE'
  | 'RULES-DECAY-GROWS'
  | 'CONFIG-OUT-OF-RANGE'
  | 'SIM-BAD-GRID'
  | 'SIM-BAD-MOISTURE-RANGE';

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
      code: 'CONFIG-OUT-OF-RANGE',
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

/** The invariant violation for a problem: the layout's own codes where they exist, SIM-BAD-RULES otherwise. */
export function toInvariantError(problem: RulesProblem): InvariantError {
  switch (problem.code) {
    case 'SIM-BAD-GRID':
    case 'SIM-BAD-MOISTURE-RANGE':
      return new InvariantError(problem.code, problem.message);
    case 'RULES-NOT-A-SAFE-INTEGER':
    case 'RULES-OUT-OF-RANGE':
    case 'RULES-DECAY-GROWS':
    case 'CONFIG-OUT-OF-RANGE':
      return new InvariantError('SIM-BAD-RULES', problem.message);
    default:
      return assertNever(problem.code);
  }
}
