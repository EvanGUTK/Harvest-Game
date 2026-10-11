/**
 * Runtime errors as values: what the VM's semantic functions return when a Sprout program fails.
 * Spec: docs/02-language/errors-and-diagnostics.md §Runtime (codes and wording are normative).
 * Invariants: only codes from the catalogue; the VM attaches the source range when it turns a
 * RuntimeError into a Diagnostic, so nothing here knows about spans.
 */

import type { Limits } from '../types';
import { floorDiv, floorMod } from '../int-math';

export type RuntimeCode =
  | 'R-TYPE'
  | 'R-INDEX'
  | 'R-KEY'
  | 'R-DIV-ZERO'
  | 'R-OVERFLOW'
  | 'R-STACK-OVERFLOW'
  | 'R-COLLECTION-FULL'
  | 'R-OUT-OF-MEMORY'
  | 'R-STR-TOO-LONG'
  | 'R-BAD-ARG'
  | 'R-UNBOUND-LOCAL'
  | 'R-UNBOUND-GLOBAL'
  | 'R-NOT-CALLABLE'
  | 'R-WRONG-ARG-COUNT';

export type RuntimeError = { readonly code: RuntimeCode; readonly message: string };

const DIGIT_GROUP = 1_000;
const DIGITS_PER_GROUP = 3;

/** Formats a non-negative integer with thousands separators, as the catalogue writes limits: 16384 → "16,384". */
export function formatCount(n: number): string {
  if (n < DIGIT_GROUP) return String(n);
  const group = String(floorMod(n, DIGIT_GROUP)).padStart(DIGITS_PER_GROUP, '0');
  return `${formatCount(floorDiv(n, DIGIT_GROUP))},${group}`;
}

export function outOfMemory(limits: Limits): RuntimeError {
  return {
    code: 'R-OUT-OF-MEMORY',
    message: `Your program is holding too much data at once (${formatCount(limits.maxHeapCells)} cells). Let go of lists you no longer need.`,
  };
}

export function collectionFull(limits: Limits): RuntimeError {
  return {
    code: 'R-COLLECTION-FULL',
    message: `Lists and dicts can hold at most ${formatCount(limits.maxCollectionSize)} items.`,
  };
}

export function strTooLong(limits: Limits): RuntimeError {
  return {
    code: 'R-STR-TOO-LONG',
    message: `Text can be at most ${formatCount(limits.maxStringLength)} characters long.`,
  };
}
