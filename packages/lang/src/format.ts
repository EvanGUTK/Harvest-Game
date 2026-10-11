/**
 * Number formatting shared by compile-time and runtime diagnostics.
 * Spec: docs/02-language/errors-and-diagnostics.md (the catalogue writes limits as 16,384).
 * Invariant: integers only (floorDiv/floorMod), so formatting is identical in every engine.
 */

import { floorDiv, floorMod } from './int-math';

const DIGIT_GROUP = 1_000;
const DIGITS_PER_GROUP = 3;

/** Formats a non-negative integer with thousands separators, as the catalogue writes limits: 16384 → "16,384". */
export function formatCount(n: number): string {
  if (n < DIGIT_GROUP) return String(n);
  const group = String(floorMod(n, DIGIT_GROUP)).padStart(DIGITS_PER_GROUP, '0');
  return `${formatCount(floorDiv(n, DIGIT_GROUP))},${group}`;
}
