import { describe, expect, it } from 'vitest';
import { splitmix32 } from './splitmix32';

function take(seed: number, n: number): number[] {
  const g = splitmix32(seed);
  return Array.from({ length: n }, () => g.next());
}

// Known answers computed independently (Python, 64-bit integers masked to 32 bits), not by this code.
describe('splitmix32', () => {
  it('pins the first outputs for seed 0 (simulation-engine.md §PRNG seeding)', () => {
    expect(take(0, 4)).toEqual([1_684_164_658, 3_653_269_916, 2_939_563_536, 2_141_751_570]);
  });

  it('pins the first outputs for seed 1', () => {
    expect(take(1, 4)).toEqual([1_580_013_426, 350_525_680, 3_524_174_333, 3_011_703_609]);
  });

  it('pins the first outputs for seed 12345', () => {
    expect(take(12_345, 4)).toEqual([3_283_241_497, 613_117_429, 2_940_958_500, 516_375_437]);
  });

  it('pins the first outputs for the largest uint32 seed', () => {
    expect(take(0xffffffff, 4)).toEqual([3_950_124_170, 4_293_442_868, 1_302_505_678, 2_762_329_221]);
  });

  it('is a pure function of its seed: two generators with one seed agree', () => {
    expect(take(777, 16)).toEqual(take(777, 16));
  });

  it('always returns uint32 values', () => {
    for (const v of take(0xdeadbeef, 64)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
