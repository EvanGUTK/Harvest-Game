/**
 * Rule overrides for one balance run: numbers that shadow the showdown defaults and `content`'s market numbers
 * without ever changing them. A variant is a named set of overrides; the matrix runs every scenario per variant.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness (rule tweaks), packages/content MARKET.
 * Invariants: overrides are plain whole numbers; applying them returns new objects and never writes into the
 * config or into content; their bounds are sim's `validateRules` and `validateConfig`, not a second copy here; the market numbers an override can name are exactly the keys of MARKET.
 */

import { MARKET, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { validateConfig, validateRules } from '@harvest/sim';
import type { MarketRules, SimConfig } from '@harvest/sim';

/** What a variant may change. Anything left out keeps its showdown default. */
export type RulesOverrides = {
  gridSize?: number;
  cycleBudget?: number;
  startCredits?: number;
  startWater?: number;
  startMoisture?: { min: number; max: number };
  market?: Partial<MarketRules>;
};

export type Variant = { name: string; overrides: RulesOverrides };

export type ParsedVariant = { ok: true; variant: Variant } | { ok: false; message: string };

export const DEFAULT_VARIANT: Variant = { name: 'default', overrides: {} };

type TopLevelKey = 'gridSize' | 'cycleBudget' | 'startCredits' | 'startWater';

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set<TopLevelKey>([
  'gridSize',
  'cycleBudget',
  'startCredits',
  'startWater',
]);

const MARKET_KEYS = Object.keys(MARKET) as (keyof MarketRules)[];

const VARIANT_SEPARATOR = ':';
const MARKET_PREFIX = 'market.';
const DIGITS = /^\d+$/;

/** The config with the grid, budget, credits, water and starting moisture overrides applied. */
export function applyToConfig(base: SimConfig, overrides: RulesOverrides): SimConfig {
  return {
    ...base,
    gridSize: overrides.gridSize ?? base.gridSize,
    cycleBudget: overrides.cycleBudget ?? base.cycleBudget,
    startCredits: overrides.startCredits ?? base.startCredits,
    startWater: overrides.startWater ?? base.startWater,
    startMoisture: overrides.startMoisture ? { ...overrides.startMoisture } : { ...base.startMoisture },
  };
}

/** Content's market numbers with the variant's market overrides on top. */
export function marketRulesOf(overrides: RulesOverrides): MarketRules {
  return { ...MARKET, ...overrides.market };
}

/** The overrides being collected, so the readonly market numbers are written here before they are frozen into a variant. */
type Accumulated = {
  top: Partial<Record<TopLevelKey, number>>;
  market: { -readonly [K in keyof MarketRules]?: number };
  moisture: { min?: number; max?: number };
};

function readNumber(text: string): number | null {
  if (!DIGITS.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

function isTopLevelKey(key: string): key is TopLevelKey {
  return TOP_LEVEL_KEYS.has(key);
}

function isMarketKey(key: string): key is keyof MarketRules {
  return (MARKET_KEYS as readonly string[]).includes(key);
}

/** Records one `key=value` pair, or returns why it cannot be. */
function record(acc: Accumulated, key: string, value: number): string | null {
  if (isTopLevelKey(key)) {
    if (key in acc.top) return `${key} is given twice`;
    acc.top[key] = value;
    return null;
  }
  if (key === 'startMoisture.min' || key === 'startMoisture.max') {
    const bound = key === 'startMoisture.min' ? 'min' : 'max';
    if (bound in acc.moisture) return `${key} is given twice`;
    acc.moisture[bound] = value;
    return null;
  }
  if (key.startsWith(MARKET_PREFIX)) {
    const marketKey = key.slice(MARKET_PREFIX.length);
    if (!isMarketKey(marketKey))
      return `unknown market key "${marketKey}" (known: ${MARKET_KEYS.join(', ')})`;
    if (marketKey in acc.market) return `${key} is given twice`;
    acc.market[marketKey] = value;
    return null;
  }
  return `unknown key "${key}"`;
}

/** The first problem the overrides' numbers have against sim's bounds, or null when the run is playable. */
function firstProblem(overrides: RulesOverrides): string | null {
  const problems = [...validateConfig(overrides), ...validateRules({ market: marketRulesOf(overrides) })];
  return problems[0]?.message ?? null;
}

function overridesOf(acc: Accumulated): RulesOverrides {
  const overrides: RulesOverrides = { ...acc.top };
  if (acc.moisture.min !== undefined || acc.moisture.max !== undefined) {
    overrides.startMoisture = {
      min: acc.moisture.min ?? SHOWDOWN_DEFAULTS.startMoisture.min,
      max: acc.moisture.max ?? SHOWDOWN_DEFAULTS.startMoisture.max,
    };
  }
  if (Object.keys(acc.market).length > 0) overrides.market = acc.market;
  return overrides;
}

/** Parses `name:key=value,key=value` into a variant; keys are the ones RulesOverrides names. */
export function parseVariant(text: string): ParsedVariant {
  const fail = (reason: string): ParsedVariant => ({ ok: false, message: `variant "${text}": ${reason}` });
  const at = text.indexOf(VARIANT_SEPARATOR);
  if (at < 0) return fail(`write it as name${VARIANT_SEPARATOR}key=value,key=value`);
  const name = text.slice(0, at);
  if (name === '') return fail('the name is empty');
  const body = text.slice(at + 1);
  const acc: Accumulated = { top: {}, market: {}, moisture: {} };
  for (const pair of body === '' ? [] : body.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 0) return fail(`"${pair}" is not key=value`);
    const value = readNumber(pair.slice(eq + 1));
    if (value === null) return fail(`"${pair}" needs a whole number after the =`);
    const problem = record(acc, pair.slice(0, eq), value);
    if (problem !== null) return fail(problem);
  }
  const overrides = overridesOf(acc);
  const problem = firstProblem(overrides);
  return problem === null ? { ok: true, variant: { name, overrides } } : fail(problem);
}
