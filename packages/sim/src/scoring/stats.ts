/**
 * The per-player facts scoring needs, filled by the scheduler and world during a match.
 * Design: docs/01-game-design/scoring-and-judging.md, docs/03-architecture/simulation-engine.md §Clock arithmetic.
 * Invariants: one entry per slot, already aggregated over that slot's drones; `credits` is the balance
 * after end-of-match liquidation; every cycle value is an integer.
 */

/** The match rules scoring reads; both come from `SimConfig`. */
export type ScoringRules = {
  startCredits: number;
  cycleBudget: number;
};

export type PlayerStats = {
  slot: number;
  /** The player runs the idle program (no compiled module). All other stats are ignored. */
  idle: boolean;
  /** Final credits after liquidation. */
  credits: number;
  /** Start cycle of the last `sell` that sold at least one unit; null when the player never sold. */
  lastSaleAt: number | null;
  /** 1-cycle VM instructions executed, summed over the slot's drones (scoring-and-judging.md §Tiebreakers). */
  logicCycles: number;
  /** `countTokens` over the locked program. */
  programTokens: number;
  /** Ripe crops harvested into the silo. */
  cropsHarvested: number;
  /** Maximum over the slot's drones of `min(agent.clock, budget)`. */
  cyclesUsed: number;
  /** Units sold across all `sell` lots. */
  unitsSold: number;
  /** Σ over sell lots of `units × floorDiv(price × BASIS_POINTS, basePrice)`; Market Timer divides it by `unitsSold`. */
  saleBpUnits: number;
  /** Crops successfully planted. */
  cropsPlanted: number;
  /** Some crop of this player had growth paused for lack of moisture while unripe (Never Thirsty). */
  everDryPaused: boolean;
  /** First 200 `print` lines. */
  output: string[];
  /** Runtime error of a real program, or the compile diagnostic that made the player idle. */
  error?: { code: string; line: number };
};
