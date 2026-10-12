/**
 * Integer statistics for the balance report: mean, nearest-rank quantiles and a score distribution.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness (score distribution per strategy).
 * Invariants: integers only (the mean is floored with floorDiv, never `/`); empty input gives null instead
 * of a made-up number; inputs are never reordered or changed.
 */

import { floorDiv } from '@harvest/lang';

const PERCENT = 100;
const LOWER_QUARTILE = 25;
const MEDIAN = 50;
const UPPER_QUARTILE = 75;

export type Distribution = {
  n: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
};

/** Division rounded up, for positive divisors. */
export function ceilDiv(a: number, b: number): number {
  return -floorDiv(-a, b);
}

/** The floored average, or null for no values. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return floorDiv(
    values.reduce((sum, v) => sum + v, 0),
    values.length,
  );
}

/** Nearest-rank quantile of an already sorted list: the value at rank ceil(p × n ÷ 100), clamped to the list. */
export function quantile(sorted: readonly number[], percent: number): number | null {
  if (sorted.length === 0) return null;
  const rank = ceilDiv(percent * sorted.length, PERCENT);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? null;
}

/** Min, quartiles, max and floored mean of the values, or null for none. */
export function distribution(values: readonly number[]): Distribution | null {
  const sorted = [...values].sort((a, b) => a - b);
  const [min, p25, median, p75, max] = [
    sorted[0],
    quantile(sorted, LOWER_QUARTILE),
    quantile(sorted, MEDIAN),
    quantile(sorted, UPPER_QUARTILE),
    sorted[sorted.length - 1],
  ];
  const average = mean(sorted);
  if (
    min === undefined ||
    p25 === null ||
    median === null ||
    p75 === null ||
    max === undefined ||
    average === null
  ) {
    return null;
  }
  return { n: sorted.length, min, p25, median, p75, max, mean: average };
}
