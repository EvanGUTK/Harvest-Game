import { describe, expect, it } from 'vitest';
import { distribution, mean, quantile } from './stats';

describe('mean', () => {
  it('floors the average: [1, 2] is 1', () => {
    expect(mean([1, 2])).toBe(1);
  });

  it('floors toward minus infinity for negatives: [-1, -2] is -2', () => {
    expect(mean([-1, -2])).toBe(-2);
  });

  it('is the value itself for one value', () => {
    expect(mean([250])).toBe(250);
  });

  it('is null for no values rather than dividing by zero', () => {
    expect(mean([])).toBeNull();
  });
});

describe('quantile (nearest rank)', () => {
  const sorted = [10, 20, 30, 40];

  it('takes the value at rank ceil(p × n ÷ 100): p25 of 4 is the 1st, p50 the 2nd, p75 the 3rd', () => {
    expect([quantile(sorted, 25), quantile(sorted, 50), quantile(sorted, 75)]).toEqual([10, 20, 30]);
  });

  it('takes the last value at p100 and the first at p0', () => {
    expect([quantile(sorted, 100), quantile(sorted, 0)]).toEqual([40, 10]);
  });

  it('rounds the rank up: p26 of 4 is the 2nd value', () => {
    expect(quantile(sorted, 26)).toBe(20);
  });

  it('is null for no values', () => {
    expect(quantile([], 50)).toBeNull();
  });
});

describe('distribution', () => {
  it('summarises unsorted values: [5, 1, 3] has min 1, p25 1, median 3, p75 5, max 5, mean 3', () => {
    expect(distribution([5, 1, 3])).toEqual({ n: 3, min: 1, p25: 1, median: 3, p75: 5, max: 5, mean: 3 });
  });

  it('does not reorder or change its input', () => {
    const values = [5, 1, 3];
    distribution(values);
    expect(values).toEqual([5, 1, 3]);
  });

  it('is the same number everywhere for a single value', () => {
    expect(distribution([100])).toEqual({
      n: 1,
      min: 100,
      p25: 100,
      median: 100,
      p75: 100,
      max: 100,
      mean: 100,
    });
  });

  it('is null for no values', () => {
    expect(distribution([])).toBeNull();
  });
});
