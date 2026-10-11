/**
 * Invariant violations in `lang`: programmer errors, never expected outcomes (those are values,
 * such as runtime diagnostics). Standards: docs/09-engineering/standards.md §Errors.
 * One class per package; every error carries a stable `code` from the union below.
 */

export type InvariantCode =
  | 'LANG-INT-DIV-ZERO'
  | 'LANG-INT-NOT-SAFE'
  | 'LANG-VALUE-KIND'
  | 'LANG-VALUE-RANGE'
  | 'LANG-HEAP-REFCOUNT'
  | 'LANG-HEAP-INDEX'
  | 'LANG-VALUE-UNKNOWN-CONST'
  | 'LANG-VALUE-UNKNOWN-FUNCTION';

export class InvariantError extends Error {
  readonly code: InvariantCode;

  constructor(code: InvariantCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'InvariantError';
    this.code = code;
  }
}
