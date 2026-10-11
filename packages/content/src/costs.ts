/**
 * Builtin cycle costs and bounds (on top of the 1-cycle CALL_HOST). Lives in its own module so the stdlib
 * metadata can read it without importing the package index; `index.ts` re-exports everything here.
 * Design: docs/02-language/standard-library.md. Changing any value changes simulation results (bump RULES_VERSION).
 */

export const ACTION_COSTS = {
  move: 20, // goto(x, y) costs move × wrapped Manhattan distance, derived at runtime from the drone's move cost
  plant: 30,
  plantFailed: 5,
  harvest: 30,
  harvestEmpty: 5,
  till: 30,
  tillFailed: 5,
  water: 25,
  waterFailed: 5,
  refill: 60,
  refillFailed: 5,
  sell: 10,
  spawn: 200,
  spawnFailed: 5,
  halt: 0, // plus the 1-cycle CALL_HOST, like every builtin
} as const; // wait(n) costs n (argument-dependent); bounds in WAIT_BOUNDS

export const SENSOR_COSTS = {
  pos_x: 1,
  pos_y: 1,
  world_size: 1,
  crop: 2,
  is_ripe: 2,
  is_withered: 2,
  growth: 2,
  soil: 2,
  moisture: 2,
  water_left: 1,
  credits: 1,
  inventory: 1,
  price: 3,
  seed_cost: 1,
  measure: 5,
  cycles: 1,
  cycles_left: 1,
} as const;

/** Host-provided pure helpers (not language intrinsics, which cost 1 cycle inside lang). */
export const PURE_COSTS = {
  random: 2,
} as const;

/** `wait(n)` costs n cycles; n outside these bounds is a runtime error (R-BAD-ARG). */
export const WAIT_BOUNDS = { min: 1, max: 5_000 } as const;

/** `wait(n)` costs this many cycles for each unit of `n` (the per-unit default the stdlib metadata carries). */
export const WAIT_CYCLES_PER_UNIT = 1;
