import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { InvariantError } from './invariant';
import { floorDiv, floorMod } from './int-math';

const MAX = Number.MAX_SAFE_INTEGER;
const MIN = Number.MIN_SAFE_INTEGER;
const TWO_POW_53 = 2 ** 53;

/** Reference: Python floor division and modulo on BigInt (BigInt `/` truncates toward zero). */
const pyFloorDiv = (a: bigint, b: bigint): bigint => {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
};
const pyFloorMod = (a: bigint, b: bigint): bigint => a - b * pyFloorDiv(a, b);

const safeInt = fc.integer({ min: MIN, max: MAX });
const nonZeroSafeInt = safeInt.filter((n) => n !== 0);
const smallInt = fc.integer({ min: -1_000, max: 1_000 });
const nonZeroSmallInt = smallInt.filter((n) => n !== 0);
/** Operands within 1,000 of ±2^53, where a naive float quotient is most likely to be inexact. */
const nearLimit = fc.oneof(
  fc.integer({ min: MAX - 1_000, max: MAX }),
  fc.integer({ min: MIN, max: MIN + 1_000 }),
);
/** Dividends and non-zero divisors of both signs spanning the whole safe range. */
const dividend = fc.oneof(safeInt, smallInt, nearLimit);
const divisor = fc.oneof(nonZeroSafeInt, nonZeroSmallInt, nearLimit);

const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof InvariantError ? e.code : 'not an InvariantError';
  }
  return undefined;
};

describe('floorDiv and floorMod: Python floor semantics (language-spec.md §Types)', () => {
  it('rounds the quotient toward negative infinity for every sign combination', () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(7, -2)).toBe(-4);
    expect(floorDiv(-7, -2)).toBe(3);
  });

  it('gives the remainder the sign of the divisor for every sign combination', () => {
    expect(floorMod(7, 2)).toBe(1);
    expect(floorMod(-7, 2)).toBe(1);
    expect(floorMod(7, -2)).toBe(-1);
    expect(floorMod(-7, -2)).toBe(-1);
  });

  it('is exact when the divisor divides the dividend, with no floor correction', () => {
    expect(floorDiv(6, 3)).toBe(2);
    expect(floorDiv(-6, 3)).toBe(-2);
    expect(floorDiv(6, -3)).toBe(-2);
    expect(floorDiv(-6, -3)).toBe(2);
    expect(floorMod(-6, 3)).toBe(0);
    expect(floorMod(6, -3)).toBe(0);
  });

  it('returns +0, never -0, for zero quotients and zero remainders', () => {
    // JS gives -0 for `-4 % 2` and for `0 / -5`; both helpers must normalise to +0.
    expect(Object.is(floorMod(-4, 2), 0)).toBe(true);
    expect(Object.is(floorMod(-6, 3), 0)).toBe(true);
    expect(Object.is(floorMod(6, -3), 0)).toBe(true);
    expect(Object.is(floorMod(0, -5), 0)).toBe(true);
    expect(Object.is(floorMod(-0, 5), 0)).toBe(true);
    expect(Object.is(floorDiv(0, 5), 0)).toBe(true);
    expect(Object.is(floorDiv(0, -5), 0)).toBe(true);
    expect(Object.is(floorDiv(-0, 5), 0)).toBe(true);
    expect(Object.is(floorDiv(-0, -5), 0)).toBe(true);
    expect(Object.is(floorDiv(-3, -5), 0)).toBe(true);
  });

  it('never returns -0 for any pair of safe-integer operands', () => {
    fc.assert(
      fc.property(dividend, divisor, (a, b) => {
        expect(Object.is(floorDiv(a, b), -0)).toBe(false);
        expect(Object.is(floorMod(a, b), -0)).toBe(false);
      }),
      { numRuns: 2_000 },
    );
  });

  it('handles a dividend smaller in magnitude than the divisor', () => {
    expect(floorDiv(3, 5)).toBe(0);
    expect(floorMod(3, 5)).toBe(3);
    expect(floorDiv(-3, 5)).toBe(-1);
    expect(floorMod(-3, 5)).toBe(2);
    expect(floorDiv(3, -5)).toBe(-1);
    expect(floorMod(3, -5)).toBe(-2);
    expect(floorDiv(-3, -5)).toBe(0);
    expect(floorMod(-3, -5)).toBe(-3);
  });

  it('is exact at the ±9,007,199,254,740,991 boundaries', () => {
    expect(floorDiv(MAX, 2)).toBe(4_503_599_627_370_495);
    expect(floorMod(MAX, 2)).toBe(1);
    expect(floorDiv(MIN, 2)).toBe(-4_503_599_627_370_496);
    expect(floorMod(MIN, 2)).toBe(1);
    expect(floorDiv(MAX, 3)).toBe(3_002_399_751_580_330);
    expect(floorMod(MAX, 3)).toBe(1);
    expect(floorDiv(MAX, 1)).toBe(MAX);
    expect(floorDiv(MAX, -1)).toBe(MIN);
    expect(floorDiv(MIN, -1)).toBe(MAX);
    expect(floorDiv(MAX, MAX)).toBe(1);
    expect(floorDiv(MIN, MAX)).toBe(-1);
    expect(floorDiv(MAX - 1, MAX)).toBe(0);
    expect(floorDiv(-1, MAX)).toBe(-1);
    expect(floorMod(-1, MAX)).toBe(MAX - 1);
    expect(floorMod(1, MIN)).toBe(MIN + 1);
  });

  it('matches a BigInt reference of Python // and % across the full safe range, near ±2^53 and for both divisor signs', () => {
    fc.assert(
      fc.property(dividend, divisor, (a, b) => {
        expect(BigInt(floorDiv(a, b))).toBe(pyFloorDiv(BigInt(a), BigInt(b)));
        expect(BigInt(floorMod(a, b))).toBe(pyFloorMod(BigInt(a), BigInt(b)));
      }),
      { numRuns: 2_000 },
    );
  });

  it('satisfies a === b * floorDiv(a, b) + floorMod(a, b) exactly', () => {
    fc.assert(
      fc.property(dividend, divisor, (a, b) => {
        const q = BigInt(floorDiv(a, b));
        const r = BigInt(floorMod(a, b));
        expect(BigInt(b) * q + r).toBe(BigInt(a));
      }),
      { numRuns: 2_000 },
    );
  });

  it('keeps 0 <= floorMod(a, b) < |b| for a positive divisor', () => {
    fc.assert(
      fc.property(
        dividend,
        divisor.filter((n) => n > 0),
        (a, b) => {
          const r = floorMod(a, b);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThan(b);
        },
      ),
      { numRuns: 2_000 },
    );
  });

  it('returns safe integers for every pair of safe-integer operands', () => {
    fc.assert(
      fc.property(dividend, divisor, (a, b) => {
        expect(Number.isSafeInteger(floorDiv(a, b))).toBe(true);
        expect(Number.isSafeInteger(floorMod(a, b))).toBe(true);
      }),
    );
  });
});

describe('floorDiv and floorMod: programmer errors (standards.md §Errors)', () => {
  it('throws LANG-INT-DIV-ZERO on a zero divisor, because the VM raises R-DIV-ZERO before calling', () => {
    expect(errorCode(() => floorDiv(1, 0))).toBe('LANG-INT-DIV-ZERO');
    expect(errorCode(() => floorMod(1, 0))).toBe('LANG-INT-DIV-ZERO');
    expect(errorCode(() => floorDiv(0, -0))).toBe('LANG-INT-DIV-ZERO');
  });

  it('throws LANG-INT-NOT-SAFE on an operand that is not a safe integer', () => {
    const bad = [
      Number.NaN,
      0.5,
      -1.5,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      TWO_POW_53,
      -TWO_POW_53,
    ];
    for (const x of bad) {
      expect(errorCode(() => floorDiv(x, 3))).toBe('LANG-INT-NOT-SAFE');
      expect(errorCode(() => floorDiv(3, x))).toBe('LANG-INT-NOT-SAFE');
      expect(errorCode(() => floorMod(x, 3))).toBe('LANG-INT-NOT-SAFE');
      expect(errorCode(() => floorMod(3, x))).toBe('LANG-INT-NOT-SAFE');
    }
  });

  it('is an Error subclass with a stable code and name', () => {
    try {
      floorDiv(1, 0);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(InvariantError);
      expect((e as InvariantError).name).toBe('InvariantError');
    }
  });
});
