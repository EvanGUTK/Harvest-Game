/**
 * sfc32 (Small Fast Counter, 32-bit): the match PRNG.
 * Design: docs/03-architecture/simulation-engine.md §PRNG seeding (SIM-05) and §State hash (word 5).
 * Invariants: only add, xor, shift and rotate, each result reduced with `>>> 0`; `next()`
 * returns a uint32; `state()` returns a fresh copy of the four words so the state hash and snapshots
 * can read them without aliasing the generator.
 */

export type Sfc32State = readonly [a: number, b: number, c: number, d: number];

export interface Sfc32 {
  next(): number;
  state(): Sfc32State;
}

const SHIFT_A = 9;
const SHIFT_B = 3;
const ROTATE_C = 21;
const ROTATE_C_COMPLEMENT = 11;

/** An sfc32 generator continuing from `state` (four uint32 words). */
export function createSfc32(state: Sfc32State): Sfc32 {
  let [a, b, c, d] = state;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  return {
    next(): number {
      const t = (((a + b) >>> 0) + d) >>> 0;
      d = (d + 1) >>> 0;
      a = (b ^ (b >>> SHIFT_A)) >>> 0;
      b = (c + (c << SHIFT_B)) >>> 0;
      c = ((c << ROTATE_C) | (c >>> ROTATE_C_COMPLEMENT)) >>> 0;
      c = (c + t) >>> 0;
      return t;
    },
    state(): Sfc32State {
      return [a, b, c, d];
    },
  };
}
