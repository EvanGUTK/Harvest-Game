/**
 * Integer floor division and modulo with Python semantics: the one place in the engine where `/` is
 * allowed (simulation-engine.md §Determinism, standards.md §Purity, chief ruling 2026-10-11).
 * Spec: docs/02-language/language-spec.md §Types (`//` and `%` floor; range ±9,007,199,254,740,991).
 *
 * Exactness, for safe integers a and b with b ≠ 0:
 * - r = a % b is exact: JS `%` on doubles is fmod, which is always exact. r takes the sign of a and
 *   |r| < |b|, |r| ≤ |a|.
 * - a - r is exact: a and r share a sign and |r| ≤ |a|, so |a - r| ≤ |a| < 2^53 and is an integer.
 * - (a - r) / b is exact: a - r is an integer multiple of b, so the true quotient is an integer of
 *   magnitude ≤ |a| < 2^53, which is representable; IEEE division is correctly rounded, so it returns
 *   that integer. This is the truncated quotient.
 * - Flooring differs from truncation only when r ≠ 0 and r and b have opposite signs: then q - 1 and
 *   r + b. Both stay within the safe range (|q| ≤ |a| and |b| ≥ 2 when r ≠ 0).
 * Results are never -0. A zero divisor or a non-safe-integer operand is a programmer error
 * (`InvariantError`): callers such as the VM check first and report R-DIV-ZERO / R-OVERFLOW themselves.
 */

import { InvariantError } from './invariant';

/** `a // b` in Python: the quotient rounded toward negative infinity. */
export function floorDiv(a: number, b: number): number {
  assertOperands(a, b);
  const r = a % b;
  const q = (a - r) / b;
  if (needsFloorCorrection(r, b)) return q - 1;
  return q === 0 ? 0 : q;
}

/** `a % b` in Python: the remainder takes the sign of the divisor, so `a === b * floorDiv(a, b) + floorMod(a, b)`. */
export function floorMod(a: number, b: number): number {
  assertOperands(a, b);
  const r = a % b;
  if (needsFloorCorrection(r, b)) return r + b;
  return r === 0 ? 0 : r;
}

/** Truncation and flooring disagree exactly when there is a remainder whose sign differs from the divisor's. */
function needsFloorCorrection(r: number, b: number): boolean {
  return r !== 0 && r < 0 !== b < 0;
}

function assertOperands(a: number, b: number): void {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new InvariantError('INT_NOT_SAFE', `expected safe integers, got ${String(a)} and ${String(b)}`);
  }
  if (b === 0) throw new InvariantError('INT_DIV_ZERO', `division of ${String(a)} by zero`);
}
