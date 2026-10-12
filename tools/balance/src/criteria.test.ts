import { describe, expect, it } from 'vitest';
import { evaluateCriteria, STARTER_MIN_SHARE_PERCENT, STARTER_MIN_SOLO_SCORE } from './criteria';
import type { Criterion } from './criteria';
import { HOARD_LOBBY, soloId, STARTER_LOBBY } from './scenario';
import type { RunRecord, VariantData } from './scenario';

const SEEDS = [0, 1];

function record(lobbyId: string, seed: number, scores: number[], over: Partial<RunRecord> = {}): RunRecord {
  return {
    lobbyId,
    seed,
    variant: 'default',
    scores,
    lots: [],
    failedCompiles: [],
    runtimeErrors: [],
    ...over,
  };
}

/** A VariantData whose records a test may still edit. */
type EditableData = Omit<VariantData, 'records'> & { records: Map<string, RunRecord[]> };

/** Per-seed scores for each lobby; `solo` entries are the slot-0 score per seed. */
function build(parts: {
  solo?: Record<string, number[]>;
  starterLobby?: number[][];
  hoard?: number[][];
  extra?: RunRecord[];
}): EditableData {
  const records = new Map<string, RunRecord[]>();
  for (const [id, scores] of Object.entries(parts.solo ?? {})) {
    records.set(
      soloId(id),
      scores.map((s, i) => record(soloId(id), SEEDS[i] ?? i, [s])),
    );
  }
  if (parts.starterLobby) {
    records.set(
      STARTER_LOBBY.id,
      parts.starterLobby.map((s, i) => record(STARTER_LOBBY.id, SEEDS[i] ?? i, s)),
    );
  }
  if (parts.hoard)
    records.set(
      HOARD_LOBBY.id,
      parts.hoard.map((s, i) => record(HOARD_LOBBY.id, SEEDS[i] ?? i, s)),
    );
  for (const r of parts.extra ?? []) records.set(r.lobbyId, [...(records.get(r.lobbyId) ?? []), r]);
  return { variant: 'default', seeds: SEEDS, records };
}

const PASSING = {
  solo: {
    starter: [300, 280],
    pass: [100, 100],
    seedling: [150, 160],
    grower: [200, 210],
    agronomist: [400, 420],
  },
  starterLobby: [
    [300, 400, 400, 400, 400, 400, 400, 400],
    [280, 420, 420, 420, 420, 420, 420, 420],
  ],
  hoard: [
    [200, 200, 200, 200, 150, 150, 150, 150],
    [210, 210, 210, 210, 160, 160, 160, 160],
  ],
};

function byId(criteria: readonly Criterion[], id: string): Criterion {
  const found = criteria.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no criterion ${id}`);
  return found;
}

describe('thresholds (simulation-engine.md §Starter-program criterion)', () => {
  it('are ₵250 solo and 30 % of the Agronomist', () => {
    expect(STARTER_MIN_SOLO_SCORE).toBe(250);
    expect(STARTER_MIN_SHARE_PERCENT).toBe(30);
  });
});

describe('evaluateCriteria', () => {
  it('passes everything for a healthy economy', () => {
    const criteria = evaluateCriteria(build(PASSING));
    expect(criteria.map((c) => [c.id, c.passed])).toEqual([
      ['starter-solo', true],
      ['starter-share', true],
      ['bots-beat-pass', true],
      ['dump-not-better', true],
      ['clean-runs', true],
    ]);
  });

  describe('starter-solo: at least ₵250 on every seed', () => {
    it('fails on the worst seed even when the mean is fine', () => {
      const criteria = evaluateCriteria(
        build({ ...PASSING, solo: { ...PASSING.solo, starter: [400, 249] } }),
      );
      expect(byId(criteria, 'starter-solo').passed).toBe(false);
      expect(byId(criteria, 'starter-solo').detail).toContain('249');
    });

    it('passes at exactly ₵250', () => {
      const criteria = evaluateCriteria(
        build({ ...PASSING, solo: { ...PASSING.solo, starter: [250, 250] } }),
      );
      expect(byId(criteria, 'starter-solo').passed).toBe(true);
    });
  });

  describe('starter-share: starter mean ≥ 30 % of the Agronomist mean in the 8-player lobby', () => {
    it('passes at exactly 30 %', () => {
      const lobby = [[30, 100, 100, 100, 100, 100, 100, 100]];
      const criteria = evaluateCriteria(build({ ...PASSING, starterLobby: lobby, solo: PASSING.solo }));
      expect(byId(criteria, 'starter-share').passed).toBe(true);
    });

    it('fails just below 30 %: ₵29 against ₵100', () => {
      const lobby = [[29, 100, 100, 100, 100, 100, 100, 100]];
      const criteria = evaluateCriteria(build({ ...PASSING, starterLobby: lobby }));
      expect(byId(criteria, 'starter-share').passed).toBe(false);
      expect(byId(criteria, 'starter-share').detail).toContain('29');
    });

    it('averages the seven Agronomists of a seed first and the seeds second', () => {
      // seed 0: starter 40, agronomists average 100; seed 1: starter 20, agronomists average 100 → starter 30, agronomist 100
      const lobby = [
        [40, 100, 100, 100, 100, 100, 100, 100],
        [20, 100, 100, 100, 100, 100, 100, 100],
      ];
      const criteria = evaluateCriteria(build({ ...PASSING, starterLobby: lobby }));
      expect(byId(criteria, 'starter-share').passed).toBe(true);
    });
  });

  describe('bots-beat-pass: every bot beats pass on every seed', () => {
    it('fails when a bot only ties pass on one seed', () => {
      const solo = { ...PASSING.solo, seedling: [150, 100] };
      const criteria = evaluateCriteria(build({ ...PASSING, solo }));
      expect(byId(criteria, 'bots-beat-pass').passed).toBe(false);
      expect(byId(criteria, 'bots-beat-pass').detail).toContain('seedling');
    });

    it('names every losing bot', () => {
      const solo = { ...PASSING.solo, seedling: [90, 90], grower: [90, 300] };
      const detail = byId(evaluateCriteria(build({ ...PASSING, solo })), 'bots-beat-pass').detail;
      expect(detail).toContain('seedling');
      expect(detail).toContain('grower');
      expect(detail).not.toContain('agronomist');
    });

    it('compares each seed with pass on the same seed', () => {
      const solo = { ...PASSING.solo, pass: [100, 500], seedling: [150, 160] };
      expect(byId(evaluateCriteria(build({ ...PASSING, solo })), 'bots-beat-pass').passed).toBe(false);
    });
  });

  describe('dump-not-better: hoard and dump never beats steady selling', () => {
    it('passes when dumpers tie the steady farmers', () => {
      const hoard = [[100, 100, 100, 100, 100, 100, 100, 100]];
      expect(byId(evaluateCriteria(build({ ...PASSING, hoard })), 'dump-not-better').passed).toBe(true);
    });

    it('fails when the dumpers’ mean is higher', () => {
      const hoard = [[100, 100, 100, 100, 101, 101, 101, 101]];
      const criterion = byId(evaluateCriteria(build({ ...PASSING, hoard })), 'dump-not-better');
      expect(criterion.passed).toBe(false);
      expect(criterion.detail).toContain('101');
    });
  });

  describe('clean-runs: every program compiled and none stopped on a runtime error', () => {
    it('fails and names the lobby when a program did not compile', () => {
      const bad = record(soloId('grower'), 0, [0], { failedCompiles: [0] });
      const data = build(PASSING);
      data.records.set(soloId('grower'), [bad, ...(data.records.get(soloId('grower'))?.slice(1) ?? [])]);
      const criterion = byId(evaluateCriteria(data), 'clean-runs');
      expect(criterion.passed).toBe(false);
      expect(criterion.detail).toContain('solo:grower');
    });

    it('fails and shows the code and line of a runtime error', () => {
      const data = build(PASSING);
      const list = data.records.get(soloId('starter')) ?? [];
      data.records.set(soloId('starter'), [
        record(soloId('starter'), 0, [300], { runtimeErrors: [{ slot: 0, code: 'R-INDEX', line: 7 }] }),
        ...list.slice(1),
      ]);
      const criterion = byId(evaluateCriteria(data), 'clean-runs');
      expect(criterion.passed).toBe(false);
      expect(criterion.detail).toContain('R-INDEX');
      expect(criterion.detail).toContain('7');
    });
  });

  it('fails every criterion that has no data instead of passing it, e.g. when no seed ran', () => {
    const criteria = evaluateCriteria({ variant: 'default', seeds: [], records: new Map() });
    expect(criteria.filter((c) => c.id !== 'clean-runs').every((c) => !c.passed)).toBe(true);
    expect(byId(criteria, 'starter-solo').detail).toContain('no data');
  });
});
