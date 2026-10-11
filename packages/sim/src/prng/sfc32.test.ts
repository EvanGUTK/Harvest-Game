import { describe, expect, it } from 'vitest';
import { createSfc32, type Sfc32State } from './sfc32';

function take(state: Sfc32State, n: number): number[] {
  const rng = createSfc32(state);
  return Array.from({ length: n }, () => rng.next());
}

// Known answers computed independently (Python, 64-bit integers masked to 32 bits), not by this code.
describe('sfc32', () => {
  it('pins the first outputs for the state (1, 2, 3, 4)', () => {
    expect(take([1, 2, 3, 4], 5)).toEqual([7, 34, 56_623_200, 188_882_296, 3_431_242_869]);
  });

  it('counts up from the all-zero state, which shows the counter word d advancing', () => {
    expect(take([0, 0, 0, 0], 3)).toEqual([0, 1, 2]);
  });

  it('exposes the four state words after n draws', () => {
    const rng = createSfc32([1, 2, 3, 4]);
    for (let i = 0; i < 5; i += 1) rng.next();
    expect(rng.state()).toEqual([3_301_093_142, 1_393_270_099, 4_227_304_151, 9]);
  });

  it('serializes: a generator restored from state() continues the same sequence', () => {
    const original = createSfc32([0xdeadbeef, 0x12345678, 0x9abcdef0, 0x0fedcba9]);
    for (let i = 0; i < 100; i += 1) original.next();
    const restored = createSfc32(original.state());
    expect(Array.from({ length: 20 }, () => restored.next())).toEqual(
      Array.from({ length: 20 }, () => original.next()),
    );
  });

  it('does not alias the state array it returns', () => {
    const rng = createSfc32([1, 2, 3, 4]);
    const before = rng.state();
    rng.next();
    expect(before).toEqual([1, 2, 3, 4]);
  });

  it('always returns uint32 values', () => {
    for (const v of take([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff], 64)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
