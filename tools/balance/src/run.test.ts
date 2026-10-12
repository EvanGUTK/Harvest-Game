import { describe, expect, it } from 'vitest';
import type { RulesOverrides } from './overrides';
import { EXIT_CRITERIA_FAILED, EXIT_ENGINE_NOT_WIRED, EXIT_OK, EXIT_USAGE, main } from './run';
import type { Io } from './run';
import type { RuntimeFactory } from './runtime';
import { fakeRuntime } from './testing';
import type { ScoreRule } from './testing';

type Harness = {
  io: Io;
  out: string[];
  err: string[];
  overridesSeen: RulesOverrides[];
  factory: RuntimeFactory;
};

/** Dump halves (slots 4 to 7 of an 8-player lobby) score lower, so hoard-and-dump does not beat steady selling. */
const HEALTHY: ScoreRule = ({ seed, tokens, slot, players }) =>
  100 + tokens + seed - (players === 8 && slot >= 4 ? 1_000 : 0);
/** Everyone ends with the starting credits: the starter misses ₵250 and the bots do not beat pass. */
const FLAT: ScoreRule = () => 100;

function harness(rule: ScoreRule): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const overridesSeen: RulesOverrides[] = [];
  const factory: RuntimeFactory = (overrides) => {
    overridesSeen.push(overrides);
    return { ok: true, runtime: fakeRuntime(rule).runtime };
  };
  return { io: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) }, out, err, overridesSeen, factory };
}

describe('main', () => {
  it('prints the usage and exits 2 on a bad command line, without building a runtime', () => {
    const h = harness(HEALTHY);
    const code = main(['--seeds', '0'], h.io, () => {
      throw new Error('the runtime must not be built');
    });
    expect(code).toBe(EXIT_USAGE);
    expect(h.err.join('\n')).toContain('usage: balance');
    expect(h.out).toEqual([]);
  });

  it('exits 70 with the engine-not-wired message when there is no runtime', () => {
    const h = harness(HEALTHY);
    const code = main([], h.io, () => ({ ok: false, message: 'the engine is not wired yet' }));
    expect(code).toBe(EXIT_ENGINE_NOT_WIRED);
    expect(h.err.join('\n')).toContain('the engine is not wired yet');
    expect(h.out).toEqual([]);
  });

  it('exits 70 when the factory cannot build a runtime for a variant', () => {
    const h = harness(HEALTHY);
    const code = main([], h.io, () => ({
      ok: true,
      factory: () => ({ ok: false, message: 'no market rules yet' }),
    }));
    expect(code).toBe(EXIT_ENGINE_NOT_WIRED);
    expect(h.err.join('\n')).toContain('no market rules yet');
  });

  it('exits 0 and prints RESULT: PASS when every criterion passes', () => {
    const h = harness(HEALTHY);
    const code = main(['--seeds', '2'], h.io, () => ({ ok: true, factory: h.factory }));
    expect(code).toBe(EXIT_OK);
    const text = h.out.join('\n');
    expect(text).toContain('== variant default (2 seeds) ==');
    expect(text).toContain('RESULT: PASS (0 of 5 criteria failing)');
  });

  it('exits 1 and prints RESULT: FAIL when a criterion fails', () => {
    const h = harness(FLAT);
    const code = main(['--seeds', '2'], h.io, () => ({ ok: true, factory: h.factory }));
    expect(code).toBe(EXIT_CRITERIA_FAILED);
    const text = h.out.join('\n');
    expect(text).toContain('FAIL  starter-solo');
    expect(text).toContain('FAIL  bots-beat-pass');
    expect(text).toMatch(/RESULT: FAIL \(\d+ of 5 criteria failing\)/);
  });

  it('builds a runtime per variant from that variant’s overrides, the default one first', () => {
    const h = harness(HEALTHY);
    main(['--seeds', '1', '--variant', 'tight:market.priceFloorBp=3000'], h.io, () => ({
      ok: true,
      factory: h.factory,
    }));
    expect(h.overridesSeen).toEqual([{}, { market: { priceFloorBp: 3_000 } }]);
  });

  it('reports every variant and fails the run if any variant fails', () => {
    const out: string[] = [];
    const rules: ScoreRule[] = [HEALTHY, FLAT];
    let built = 0;
    const factory: RuntimeFactory = () => ({
      ok: true,
      runtime: fakeRuntime(rules[built++] ?? FLAT).runtime,
    });
    const code = main(
      ['--seeds', '1', '--variant', 'flat:gridSize=6'],
      { stdout: (t) => out.push(t), stderr: () => undefined },
      () => ({ ok: true, factory }),
    );
    const text = out.join('\n');
    expect(code).toBe(EXIT_CRITERIA_FAILED);
    expect(text).toContain('== variant default (1 seeds) ==');
    expect(text).toContain('== variant flat (1 seeds) ==');
  });

  it('with --json prints only the report as JSON, with the verdict, and keeps the exit code', () => {
    const h = harness(HEALTHY);
    const code = main(['--seeds', '1', '--json'], h.io, () => ({ ok: true, factory: h.factory }));
    expect(code).toBe(EXIT_OK);
    expect(h.out).toHaveLength(1);
    const parsed: unknown = JSON.parse(h.out[0] ?? '');
    expect(parsed).toMatchObject({ passed: true, variants: [{ variant: 'default', seeds: 1 }] });
  });

  it('with --json and a failing criterion still exits 1', () => {
    const h = harness(FLAT);
    expect(main(['--seeds', '1', '--json'], h.io, () => ({ ok: true, factory: h.factory }))).toBe(
      EXIT_CRITERIA_FAILED,
    );
    expect(JSON.parse(h.out[0] ?? '')).toMatchObject({ passed: false });
  });
});
