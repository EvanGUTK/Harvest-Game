/**
 * Invariant violations in `lang`: programmer errors, never expected outcomes (those are values,
 * such as runtime diagnostics). Standards: docs/09-engineering/standards.md §Errors.
 * One class per package; every error carries a stable `code` from the union below.
 */

export type InvariantCode = 'INT_DIV_ZERO' | 'INT_NOT_SAFE';

export class InvariantError extends Error {
  readonly code: InvariantCode;

  constructor(code: InvariantCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'InvariantError';
    this.code = code;
  }
}
