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
  | 'LANG-HOST-STR-TOO-LONG'
  | 'LANG-UNREACHABLE'
  | 'LANG-VALUE-UNKNOWN-CONST'
  | 'LANG-VALUE-UNKNOWN-FUNCTION'
  | 'LANG-METHOD-ARITY'
  | 'LANG-INTRINSIC-ARITY'
  | 'LANG-FOREIGN-MODULE'
  | 'LANG-BAD-BYTECODE'
  | 'LANG-BAD-MAX-STACK'
  | 'LANG-UNRESOLVED-LABEL'
  | 'LANG-VM-PENDING-HOST'
  | 'LANG-VM-NO-PENDING-HOST'
  | 'LANG-VM-BAD-COST'
  | 'LANG-VM-STACK'
  | 'LANG-BAD-SNAPSHOT'
  | 'LANG-VERSION-MISMATCH';

export class InvariantError extends Error {
  readonly code: InvariantCode;

  constructor(code: InvariantCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'InvariantError';
    this.code = code;
  }
}

/** Exhaustiveness guard: the `default` of every `switch` over a union (standards.md §TypeScript). */
export function assertNever(value: never): never {
  throw new InvariantError('LANG-UNREACHABLE', `unhandled union member: ${typeof value}`);
}
