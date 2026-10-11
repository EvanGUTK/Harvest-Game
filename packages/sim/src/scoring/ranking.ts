/**
 * Placement of players: score, then the three tiebreakers, then shared places.
 * Design: docs/01-game-design/scoring-and-judging.md §Tiebreakers, §Idle program.
 * Invariants: idle players rank below every player with a program; players equal on every key share a
 * place and slot order never separates them (it only orders the output); the next place after a shared
 * group skips the group's size (1st, =2nd, =2nd, 4th).
 */

export type RankEntry = {
  readonly slot: number;
  readonly idle: boolean;
  readonly score: number;
  readonly cyclesLastChange: number;
  readonly logicCycles: number;
  readonly programTokens: number;
};

export type Placement = {
  readonly slot: number;
  /** 1-based; players in a shared group all hold the group's best place. */
  readonly place: number;
  /** True when at least one other player holds the same place ("=2nd"). */
  readonly shared: boolean;
};

/** Negative when `a` places ahead of `b`; 0 when they are equal on every key. Idle always loses. */
function comparePlacement(a: RankEntry, b: RankEntry): number {
  if (a.idle !== b.idle) return a.idle ? 1 : -1;
  if (a.idle) return 0;
  return (
    b.score - a.score ||
    a.cyclesLastChange - b.cyclesLastChange ||
    a.logicCycles - b.logicCycles ||
    a.programTokens - b.programTokens
  );
}

function bySlot(a: RankEntry, b: RankEntry): number {
  return a.slot - b.slot;
}

/** Ranks the players; the result is ordered by place, then slot. */
export function rankPlayers(entries: readonly RankEntry[]): Placement[] {
  const ordered = [...entries].sort((a, b) => comparePlacement(a, b) || bySlot(a, b));
  const placements: Placement[] = [];
  let groupStart = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    const first = ordered[groupStart];
    if (current === undefined || first === undefined) continue;
    if (comparePlacement(first, current) !== 0) groupStart = i;
    placements.push({ slot: current.slot, place: groupStart + 1, shared: false });
  }
  return markShared(placements);
}

function markShared(placements: Placement[]): Placement[] {
  return placements.map((p) => ({ ...p, shared: placements.filter((q) => q.place === p.place).length > 1 }));
}
