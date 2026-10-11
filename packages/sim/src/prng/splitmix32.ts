/**
 * splitmix32: the seed expander for sfc32 stream states.
 * Design: docs/03-architecture/simulation-engine.md §PRNG seeding (SIM-05).
 * Invariants: all arithmetic is 32-bit (`Math.imul`, `>>> 0`); outputs are uint32. This is the
 * widely used 32-bit splitmix variant with the 0x21f0aaad / 0x735a2d97 finalizer; the known-answer
 * tests pin it, so changing any constant here is a RULES_VERSION bump.
 */

const GOLDEN_GAMMA = 0x9e3779b9;
const MIX_MULTIPLIER_1 = 0x21f0aaad;
const MIX_MULTIPLIER_2 = 0x735a2d97;
const SHIFT_1 = 16;
const SHIFT_2 = 15;

export type Splitmix32 = { next(): number };

/** A splitmix32 generator seeded with a uint32 (any int32 is reduced modulo 2^32). */
export function splitmix32(seed: number): Splitmix32 {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + GOLDEN_GAMMA) >>> 0;
      let z = state ^ (state >>> SHIFT_1);
      z = Math.imul(z, MIX_MULTIPLIER_1);
      z ^= z >>> SHIFT_2;
      z = Math.imul(z, MIX_MULTIPLIER_2);
      z ^= z >>> SHIFT_2;
      return z >>> 0;
    },
  };
}
