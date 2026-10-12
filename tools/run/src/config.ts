/**
 * The `SimConfig` of a showdown run: the showdown defaults plus the seed, grid and budget.
 * Design: docs/03-architecture/simulation-engine.md §Public API (SimConfig), packages/content SHOWDOWN_DEFAULTS.
 * Invariants: moisture decays, the market is shared, spawn and random are off (D-24, D-18), no modifiers.
 */

import { RULES_VERSION, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { LANGUAGE_VERSION } from '@harvest/lang';
import type { SimConfig } from '@harvest/sim';

/** What a command line chooses; everything else is the showdown default. */
export type MatchChoices = {
  seed: number;
  gridSize: number;
  cycleBudget: number;
};

export function showdownConfig(choices: MatchChoices): SimConfig {
  return {
    rulesVersion: RULES_VERSION,
    languageVersion: LANGUAGE_VERSION,
    seed: choices.seed,
    gridSize: choices.gridSize,
    cycleBudget: choices.cycleBudget,
    startCredits: SHOWDOWN_DEFAULTS.startCredits,
    startWater: SHOWDOWN_DEFAULTS.startWater,
    startMoisture: SHOWDOWN_DEFAULTS.startMoisture,
    moistureDecay: true,
    sharedMarket: true,
    randomEnabled: SHOWDOWN_DEFAULTS.randomEnabled,
    spawnEnabled: SHOWDOWN_DEFAULTS.spawnEnabled,
    modifiers: { rocks: false, weather: false },
  };
}
