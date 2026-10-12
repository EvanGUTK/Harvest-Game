import { RULES_VERSION, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { LANGUAGE_VERSION } from '@harvest/lang';
import { describe, expect, it } from 'vitest';
import { showdownConfig } from './config';

describe('showdownConfig', () => {
  it('is the showdown defaults with the seed, grid and budget given', () => {
    expect(showdownConfig({ seed: 42, gridSize: 6, cycleBudget: 9_000 })).toEqual({
      rulesVersion: RULES_VERSION,
      languageVersion: LANGUAGE_VERSION,
      seed: 42,
      gridSize: 6,
      cycleBudget: 9_000,
      startCredits: SHOWDOWN_DEFAULTS.startCredits,
      startWater: SHOWDOWN_DEFAULTS.startWater,
      startMoisture: SHOWDOWN_DEFAULTS.startMoisture,
      moistureDecay: true,
      sharedMarket: true,
      randomEnabled: SHOWDOWN_DEFAULTS.randomEnabled,
      spawnEnabled: SHOWDOWN_DEFAULTS.spawnEnabled,
      modifiers: { rocks: false, weather: false },
    });
  });

  it('turns off spawn and random as a ranked showdown does (D-24, D-18)', () => {
    const config = showdownConfig({ seed: 0, gridSize: 8, cycleBudget: 30_000 });
    expect(config.spawnEnabled).toBe(false);
    expect(config.randomEnabled).toBe(false);
  });
});
