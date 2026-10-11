/**
 * The per-player facts scoring needs, filled by the scheduler and world during a match.
 * Design: docs/01-game-design/scoring-and-judging.md, docs/03-architecture/simulation-engine.md §Clock arithmetic.
 * Invariants: one entry per slot, already aggregated over that slot's drones; `credits` is the balance
 * after end-of-match liquidation; every cycle value is an integer.
 */

/** The match rules scoring reads; both come from `SimConfig`. */
export type ScoringRules = {
  readonly startCredits: number;
  readonly cycleBudget: number;
};

export type PlayerStats = {
  readonly slot: number;
  /** The player runs the idle program (no compiled module). All other stats are ignored. */
  readonly idle: boolean;
  /** Final credits after liquidation. */
  readonly credits: number;
  /** Start cycle of the last `sell` that sold at least one unit; null when the player never sold. */
  readonly lastSaleAt: number | null;
  /** 1-cycle VM instructions executed, summed over the slot's drones (scoring-and-judging.md §Tiebreakers). */
  readonly logicCycles: number;
  /** `countTokens` over the locked program. */
  readonly programTokens: number;
  /** Ripe crops harvested into the silo. */
  readonly cropsHarvested: number;
  /** Maximum over the slot's drones of `min(agent.clock, budget)`. */
  readonly cyclesUsed: number;
  /** Units sold across all `sell` lots. */
  readonly unitsSold: number;
  /** Σ over sell lots of `units × floorDiv(price × BASIS_POINTS, basePrice)`; Market Timer divides it by `unitsSold`. */
  readonly saleBpUnits: number;
  /** Crops successfully planted. */
  readonly cropsPlanted: number;
  /** Some crop of this player had growth paused for lack of moisture while unripe (Never Thirsty). */
  readonly everDryPaused: boolean;
  /** First 200 `print` lines. */
  readonly output: readonly string[];
  /** Runtime error of a real program, or the compile diagnostic that made the player idle. */
  readonly error?: { readonly code: string; readonly line: number };
};
