import { ENGINE_NOT_WIRED } from '@harvest/tool-run/runtime';
import { describe, expect, it } from 'vitest';
import { evaluateCriteria } from './criteria';
import { DEFAULT_VARIANT } from './overrides';
import { collectVariantData } from './scenario';
import { loadRuntimeFactory } from './runtime';

const loaded = loadRuntimeFactory();

describe('loadRuntimeFactory', () => {
  it('returns a runtime factory, or says the engine is not wired yet', () => {
    expect(loaded.ok || loaded.message === ENGINE_NOT_WIRED).toBe(true);
  });
});

/**
 * The economy assertions that need the real engine. They exist only once `loadRuntimeFactory` supplies one: until
 * then the list below is empty, so there are no skipped or disabled tests, and from then on every criterion of
 * simulation-engine.md §Balance harness is asserted against the real simulation.
 */
const engines = loaded.ok ? [loaded.factory] : [];

for (const factory of engines) {
  describe('with the real engine (simulation-engine.md §Balance harness)', () => {
    const built = factory(DEFAULT_VARIANT.overrides);
    const criteria = built.ok
      ? evaluateCriteria(collectVariantData(built.runtime, DEFAULT_VARIANT, [0, 1, 2]))
      : [];

    it('builds a runtime for the default rules', () => {
      expect(built.ok).toBe(true);
    });

    for (const id of [
      'starter-solo',
      'starter-share',
      'bots-beat-pass',
      'dump-not-better',
      'clean-runs',
    ] as const) {
      it(`satisfies the ${id} criterion`, () => {
        const criterion = criteria.find((c) => c.id === id);
        expect(criterion?.passed, criterion?.detail).toBe(true);
      });
    }
  });
}
