# ADR-0005: Matchmaking on visible rank only (no hidden MMR)

- **Status:** proposed
- **Date:** 2026-10-07

## Context
The product owner wants ranked divisions Iron→Diamond with 3 tiers each, and no hidden MMR.

## Decision
Ranked matchmaking uses only `rank_index` (0–14) with time-widening windows and mutual acceptance. RP changes depend only on placement, current division, and visible opponent-tier adjustments.

## Consequences
- Transparent and easy to explain.
- Smurfs and strong newcomers must climb, which is mitigated by placements (double RP), win-streak bonus, and a campaign gate.
- Can be revisited (D-11) by adding hidden MMR only as a within-division tiebreaker.

## Alternatives considered
- **Glicko-2/TrueSkill hidden MMR:** better match quality, but less transparent and against the stated preference.
