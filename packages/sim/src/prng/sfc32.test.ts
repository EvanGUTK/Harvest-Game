import { describe, expect, it } from 'vitest';
import { createSfc32, type Sfc32State } from './sfc32';

function take(state: Sfc32State, n: number): number[] {
  const rng = createSfc32(state);
  return Array.from({ length: n }, () => rng.next());
}

// Known answers computed independently (Python, 64-bit integers masked to 32 bits), not by this code.
describe('sfc32', () => {
  it('pins the first outputs for the state (1, 2, 3, 4) (§PRNG seeding: sfc32 schedule)', () => {
    expect(take([1, 2, 3, 4], 5)).toEqual([7, 34, 56_623_200, 188_882_296, 3_431_242_869]);
  });

  it('counts up from the all-zero state, which shows the counter word d advancing (§PRNG seeding)', () => {
    expect(take([0, 0, 0, 0], 3)).toEqual([0, 1, 2]);
  });

  it('exposes the four state words after n draws (§State hash, word 5)', () => {
    const rng = createSfc32([1, 2, 3, 4]);
    for (let i = 0; i < 5; i += 1) rng.next();
    expect(rng.state()).toEqual([3_301_093_142, 1_393_270_099, 4_227_304_151, 9]);
  });

  it('serializes: a generator restored from state() continues the same sequence (§Public API: snapshots)', () => {
    const original = createSfc32([0xdeadbeef, 0x12345678, 0x9abcdef0, 0x0fedcba9]);
    for (let i = 0; i < 100; i += 1) original.next();
    const restored = createSfc32(original.state());
    expect(Array.from({ length: 20 }, () => restored.next())).toEqual(
      Array.from({ length: 20 }, () => original.next()),
    );
  });

  it('does not alias the state array it returns (§State hash, word 5)', () => {
    const rng = createSfc32([1, 2, 3, 4]);
    const before = rng.state();
    rng.next();
    expect(before).toEqual([1, 2, 3, 4]);
  });

  it('keeps every state word a uint32 after each draw (§PRNG seeding: each state word kept as a uint32)', () => {
    const starts: Sfc32State[] = [
      [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff],
      [1, 2, 3, 4],
      [0xdeadbeef, 0x12345678, 0x9abcdef0, 0x0fedcba9],
    ];
    for (const start of starts) {
      const rng = createSfc32(start);
      for (let draw = 0; draw < 64; draw += 1) {
        rng.next();
        for (const word of rng.state()) {
          expect(Number.isInteger(word)).toBe(true);
          expect(word).toBeGreaterThanOrEqual(0);
          expect(word).toBeLessThanOrEqual(0xffffffff);
        }
      }
    }
  });

  it('always returns uint32 values (§PRNG seeding: next() returns a uint32)', () => {
    for (const v of take([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff], 64)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
