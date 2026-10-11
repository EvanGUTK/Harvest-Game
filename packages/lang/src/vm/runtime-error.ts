/**
 * Runtime errors as values: what the VM's semantic functions return when a Sprout program fails.
 * Spec: docs/02-language/errors-and-diagnostics.md §Runtime (codes and wording are normative).
 * Invariants: only codes from the catalogue; the VM attaches the source range when it turns a
 * RuntimeError into a Diagnostic, so nothing here knows about spans.
 */

import type { Limits } from '../types';
import { floorDiv, floorMod } from '../int-math';
import type { RtValue } from './value';

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

/**
 * `operands` lets the VM add the approved second sentence of an R-TYPE message ("`x` is `5`, `y` is
 * `RADISH`.") when its debug info names an operand; semantic functions never format it themselves.
 */
export type RuntimeError = {
  readonly code: RuntimeCode;
  readonly message: string;
  readonly operands?: readonly RtValue[];
};

/**
 * Outcome of one semantic operation. `cost` is the surcharge only (interpreter-vm.md §Op cost table):
 * the VM charges 1 + cost. A failure carries no cost because a failed op charges only its base cycle.
 */
export type OpResult = { ok: true; value: RtValue; cost: number } | { ok: false; error: RuntimeError };

export function succeed(value: RtValue, cost: number): OpResult {
  return { ok: true, value, cost };
}

export function fail(error: RuntimeError): OpResult {
  return { ok: false, error };
}

export function typeError(message: string, operands: readonly RtValue[]): RuntimeError {
  return { code: 'R-TYPE', message, operands };
}

export const DIV_ZERO: RuntimeError = { code: 'R-DIV-ZERO', message: "Can't divide by zero (`//` or `%`)." };

export const OVERFLOW: RuntimeError = { code: 'R-OVERFLOW', message: 'That number got too big.' };

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

/** R-STACK-OVERFLOW from == or a repr nested beyond the call-depth limit (chief ruling 2026-10-11). */
export function deepNesting(limits: Limits): RuntimeError {
  return {
    code: 'R-STACK-OVERFLOW',
    message: `A value is nested too deeply to compare or print (${formatCount(limits.maxCallDepth)} levels max), for example a list that contains itself.`,
  };
}
