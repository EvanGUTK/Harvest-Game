/**
 * The normative tie-break between drones whose pending calls start at the same cycle.
 * Design: docs/03-architecture/simulation-engine.md §Tie-break (normative).
 * Invariants: `agentIndex = slot × MAX_DRONES + droneNo`; `N = nSlots × MAX_DRONES` is constant for the whole match
 * (halted or not-yet-spawned agents never change it); among equal `t`, the smallest
 * `(agentIndex − (t mod N) + N) mod N` runs first, so the agent whose index equals `t mod N` goes first, then
 * ascending indices, wrapping; ranks are distinct, so the choice never depends on list order.
 */

export type PendingCall = { readonly agentIndex: number; readonly t: number };

/** The rank of `agentIndex` among agents tied at cycle `t`; 0 runs first. All operands are non-negative. */
export function tieBreakRank(agentIndex: number, t: number, nAgents: number): number {
  return (agentIndex - (t % nAgents) + nAgents) % nAgents;
}

/** The pending call to apply next: the earliest cycle, ties broken by rank; undefined when nothing is pending. */
export function pickNext<T extends PendingCall>(pending: readonly T[], nAgents: number): T | undefined {
  let best: T | undefined;
  for (const candidate of pending) {
    if (best === undefined || isBefore(candidate, best, nAgents)) best = candidate;
  }
  return best;
}

function isBefore(a: PendingCall, b: PendingCall, nAgents: number): boolean {
  if (a.t !== b.t) return a.t < b.t;
  return tieBreakRank(a.agentIndex, a.t, nAgents) < tieBreakRank(b.agentIndex, b.t, nAgents);
}
