/**
 * Scores a finished match: one `PlayerResult` per slot plus the placements.
 * Design: docs/01-game-design/scoring-and-judging.md §Official score, §Tiebreakers.
 * Invariants: results are ordered by slot; placements are ordered by place then slot; awards are
 * assigned separately (awards.ts) because they compare players with each other.
 */

import type { PlayerResult } from '../index';
import { InvariantError } from '../invariant';
import { rankPlayers } from './ranking';
import type { Placement } from './ranking';
import { buildPlayerResult } from './result';
import type { PlayerStats, ScoringRules } from './stats';

export type MatchScore = {
  readonly results: readonly PlayerResult[];
  readonly placements: readonly Placement[];
};

/** The slots of a match are exactly 0..n−1, one stats entry each; anything else is a scheduler bug. */
function assertSlotsAreDense(sorted: readonly PlayerStats[]): void {
  sorted.forEach((s, i) => {
    if (s.slot !== i) {
      throw new InvariantError(
        'SIM-BAD-SLOT',
        `scoring needs one stats entry per slot 0..${sorted.length - 1}; found slot ${s.slot} at position ${i}`,
      );
    }
  });
}

/** Builds every player's result and ranks them with the tiebreakers. `stats` may come in any order. */
export function scorePlayers(rules: ScoringRules, stats: readonly PlayerStats[]): MatchScore {
  const bySlot = [...stats].sort((a, b) => a.slot - b.slot);
  assertSlotsAreDense(bySlot);
  const entries = bySlot.map((s) => ({ result: buildPlayerResult(rules, s), idle: s.idle }));
  const placements = rankPlayers(entries.map(({ result, idle }) => ({ ...result, idle })));
  return { results: entries.map((e) => e.result), placements };
}
