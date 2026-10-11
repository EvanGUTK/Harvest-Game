/**
 * Scores a finished match: one `PlayerResult` per slot plus the placements.
 * Design: docs/01-game-design/scoring-and-judging.md §Official score, §Tiebreakers.
 * Invariants: results are ordered by slot; placements are ordered by place then slot; awards are
 * assigned separately (awards.ts) because they compare players with each other.
 */

import type { PlayerResult } from '../index';
import { rankPlayers } from './ranking';
import type { Placement } from './ranking';
import { buildPlayerResult } from './result';
import type { PlayerStats, ScoringRules } from './stats';

export type MatchScore = {
  results: PlayerResult[];
  placements: Placement[];
};

/** Builds every player's result and ranks them with the tiebreakers. `stats` may come in any order. */
export function scorePlayers(rules: ScoringRules, stats: readonly PlayerStats[]): MatchScore {
  const bySlot = [...stats].sort((a, b) => a.slot - b.slot);
  const results = bySlot.map((s) => buildPlayerResult(rules, s));
  const placements = rankPlayers(results.map((result, i) => ({ ...result, idle: bySlot[i]?.idle ?? false })));
  return { results, placements };
}
