/**
 * The pass/fail criteria the balance harness gates on (exit code 1 when any fails).
 * Design: docs/03-architecture/simulation-engine.md §Balance harness (starter-program criterion, hoard and dump
 * must not beat steady selling), docs/01-game-design/multiplayer-modes.md §Bots (every bot beats `pass`).
 * Invariants: a criterion with no data fails instead of passing; the worst seed decides the solo criteria and the
 * means decide the lobby criteria; integers only, shares are compared by cross-multiplication.
 */

import { BOTS } from '@harvest/content';
import { floorDiv } from '@harvest/lang';
import { hoardVersusSteady } from './metrics';
import { PASS_PROGRAM } from './strategies';
import { soloId, STARTER_LOBBY } from './scenario';
import type { RunRecord, VariantData } from './scenario';
import { mean } from './stats';

/** The starter program must finish with at least this many credits when run solo (provisional). */
export const STARTER_MIN_SOLO_SCORE = 250;
/** In an 8-player lobby the starter must reach at least this percentage of the Agronomist's score (provisional). */
export const STARTER_MIN_SHARE_PERCENT = 30;

const PERCENT = 100;
const NO_DATA = 'no data';

export type Criterion = {
  id: 'starter-solo' | 'starter-share' | 'bots-beat-pass' | 'dump-not-better' | 'clean-runs';
  title: string;
  passed: boolean;
  detail: string;
};

function soloScores(data: VariantData, programId: string): number[] {
  return (data.records.get(soloId(programId)) ?? []).map((r) => r.scores[0] ?? 0);
}

function noData(id: Criterion['id'], title: string): Criterion {
  return { id, title, passed: false, detail: NO_DATA };
}

function starterSolo(data: VariantData): Criterion {
  const title = `starter program finishes with at least ₵${STARTER_MIN_SOLO_SCORE} solo, on every seed`;
  const scores = soloScores(data, 'starter');
  if (scores.length === 0) return noData('starter-solo', title);
  const worst = Math.min(...scores);
  return {
    id: 'starter-solo',
    title,
    passed: worst >= STARTER_MIN_SOLO_SCORE,
    detail: `worst of ${scores.length} seeds ₵${worst}`,
  };
}

/** Slot 0 (the starter) and the mean of slots 1 to 7 (the Agronomists), per seed of the starter lobby. */
function starterAgainstAgronomists(records: readonly RunRecord[]): {
  starter: number[];
  agronomist: number[];
} {
  return {
    starter: records.map((r) => r.scores[0] ?? 0),
    agronomist: records.map((r) => mean(r.scores.slice(1)) ?? 0),
  };
}

function starterShare(data: VariantData): Criterion {
  const title = `starter program reaches ${STARTER_MIN_SHARE_PERCENT} % of the Agronomist in an 8-player lobby`;
  const records = data.records.get(STARTER_LOBBY.id) ?? [];
  const { starter, agronomist } = starterAgainstAgronomists(records);
  const starterMean = mean(starter);
  const agronomistMean = mean(agronomist);
  if (starterMean === null || agronomistMean === null) return noData('starter-share', title);
  const share = agronomistMean > 0 ? `${floorDiv(starterMean * PERCENT, agronomistMean)} %` : 'n/a';
  return {
    id: 'starter-share',
    title,
    passed: starterMean * PERCENT >= STARTER_MIN_SHARE_PERCENT * agronomistMean,
    detail: `starter ₵${starterMean} against Agronomist ₵${agronomistMean} = ${share}`,
  };
}

function botsBeatPass(data: VariantData): Criterion {
  const title = 'every bot beats a pass program, on every seed';
  const pass = soloScores(data, PASS_PROGRAM.id);
  if (pass.length === 0) return noData('bots-beat-pass', title);
  const losses = BOTS.flatMap((bot) =>
    soloScores(data, bot.id).flatMap((score, i) =>
      score > (pass[i] ?? 0)
        ? []
        : [`${bot.id} ₵${score} against pass ₵${pass[i] ?? 0} on seed ${data.seeds[i] ?? i}`],
    ),
  );
  const missing = BOTS.filter((bot) => soloScores(data, bot.id).length === 0).map(
    (bot) => `${bot.id} has ${NO_DATA}`,
  );
  const problems = [...losses, ...missing];
  return {
    id: 'bots-beat-pass',
    title,
    passed: problems.length === 0,
    detail: problems.length === 0 ? `all ${BOTS.length} bots beat pass` : problems.join('; '),
  };
}

function dumpNotBetter(data: VariantData): Criterion {
  const title = 'hoard-and-dump never beats steady selling';
  const result = hoardVersusSteady(data);
  if (result === null) return noData('dump-not-better', title);
  return {
    id: 'dump-not-better',
    title,
    passed: result.dumpMean <= result.steadyMean,
    detail: `steady ₵${result.steadyMean}, dump ₵${result.dumpMean} (mean over ${result.perSeed.length} seeds)`,
  };
}

function cleanRuns(data: VariantData): Criterion {
  const title = 'every program compiled and none stopped on a runtime error';
  const problems = [...data.records.values()].flatMap((records) =>
    records.flatMap((r) => [
      ...r.failedCompiles.map((slot) => `${r.lobbyId} slot ${slot} did not compile (seed ${r.seed})`),
      ...r.runtimeErrors.map(
        (e) => `${r.lobbyId} slot ${e.slot}: ${e.code} at line ${e.line} (seed ${r.seed})`,
      ),
    ]),
  );
  return {
    id: 'clean-runs',
    title,
    passed: problems.length === 0,
    detail: problems.length === 0 ? 'all runs clean' : problems.slice(0, 5).join('; '),
  };
}

/** Every criterion for one variant's data, in a fixed order. */
export function evaluateCriteria(data: VariantData): Criterion[] {
  return [starterSolo(data), starterShare(data), botsBeatPass(data), dumpNotBetter(data), cleanRuns(data)];
}
