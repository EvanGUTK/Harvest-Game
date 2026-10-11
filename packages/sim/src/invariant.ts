/**
 * Invariant violations in `sim`: programmer errors, never expected outcomes (those are values).
 * Standards: docs/09-engineering/standards.md §Errors. Every error carries a stable `code`.
 */

export type InvariantCode =
  | 'SIM-BAD-RANDOM-BOUND'
  | 'SIM-BAD-SEED'
  | 'SIM-BAD-SLOT'
  | 'SIM-BAD-SLOT-COUNT'
  | 'SIM-MARKET-TIME-REVERSED';

export class InvariantError extends Error {
  readonly code: InvariantCode;

  constructor(code: InvariantCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'InvariantError';
    this.code = code;
  }
}
