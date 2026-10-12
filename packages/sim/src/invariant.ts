/**
 * Invariant violations in `sim`: programmer errors, never expected outcomes (those are values).
 * Standards: docs/09-engineering/standards.md §Errors. Every error carries a stable `code`.
 */

export type InvariantCode =
  | 'SIM-BAD-COORD'
  | 'SIM-BAD-CYCLE'
  | 'SIM-BAD-GRID'
  | 'SIM-BAD-MOISTURE-RANGE'
  | 'SIM-BAD-RANDOM-BOUND'
  | 'SIM-BAD-SCRIPT'
  | 'SIM-BAD-SEED'
  | 'SIM-BAD-SLOT'
  | 'SIM-BAD-SLOT-COUNT'
  | 'SIM-TIME-BACKWARDS'
  | 'SIM-UNREACHABLE';

export class InvariantError extends Error {
  readonly code: InvariantCode;

  constructor(code: InvariantCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'InvariantError';
    this.code = code;
  }
}

/** Ends every `switch` over a union: a missed case is a compile error, and a smuggled value throws at run time. */
export function assertNever(value: never): never {
  throw new InvariantError('SIM-UNREACHABLE', `unreachable value: ${String(value)}`);
}
