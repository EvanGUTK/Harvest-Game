/**
 * Turns one player's match stats into their `PlayerResult`, including the idle program's fixed result.
 * Design: docs/01-game-design/scoring-and-judging.md §Official score, §Idle program, §Tiebreakers.
 * Invariants: an idle player always reports score 0 and zeroed stats whatever the stats say; awards start
 * empty because they depend on the whole lobby (see awards.ts).
 */

import type { PlayerResult } from '../index';
import type { PlayerStats, ScoringRules } from './stats';

function withError(result: PlayerResult, error: PlayerStats['error']): PlayerResult {
  return error === undefined ? result : { ...result, error };
}

function idleResult(rules: ScoringRules, stats: PlayerStats): PlayerResult {
  return withError(
    {
      slot: stats.slot,
      score: 0,
      cyclesLastChange: rules.cycleBudget,
      logicCycles: 0,
      programTokens: 0,
      cropsHarvested: 0,
      awards: [],
      output: [],
    },
    stats.error,
  );
}

function programResult(rules: ScoringRules, stats: PlayerStats): PlayerResult {
  return withError(
    {
      slot: stats.slot,
      score: stats.credits,
      cyclesLastChange: stats.lastSaleAt ?? rules.cycleBudget,
      logicCycles: stats.logicCycles,
      programTokens: stats.programTokens,
      cropsHarvested: stats.cropsHarvested,
      awards: [],
      output: stats.output,
    },
    stats.error,
  );
}

/** The result of one player before awards: score is final credits, except for the idle program (score 0). */
export function buildPlayerResult(rules: ScoringRules, stats: PlayerStats): PlayerResult {
  return stats.idle ? idleResult(rules, stats) : programResult(rules, stats);
}
