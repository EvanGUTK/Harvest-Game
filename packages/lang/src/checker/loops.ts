/**
 * Loop facts shared by the warnings: which loops are `while True:` and which bodies can leave them.
 * Spec: docs/03-architecture/interpreter-vm.md §Checker (W-UNREACHABLE, W-PURE-INFINITE-LOOP).
 * Invariant: a `break` belongs to the innermost enclosing loop, so breaks inside nested loops and defs
 * never count for an outer loop.
 */

import type { Statement, WhileStmt } from '../parser/ast';

/** `while True:` written literally: the only loop the checker can prove never ends by itself. */
export function isWhileTrue(stmt: Statement): stmt is WhileStmt {
  return stmt.type === 'WhileStmt' && stmt.test.type === 'BoolLiteral' && stmt.test.value;
}

/** True when `body` has a `break` that leaves the loop whose body it is. */
export function breaksOut(body: readonly Statement[]): boolean {
  return body.some((stmt) => {
    if (stmt.type === 'BreakStmt') return true;
    if (stmt.type === 'IfStmt') {
      return (
        breaksOut(stmt.body) || stmt.elifs.some((e) => breaksOut(e.body)) || breaksOut(stmt.orelse ?? [])
      );
    }
    return false;
  });
}

/** True when `body` (nested blocks included, nested defs excluded) has a `return`. */
export function containsReturn(body: readonly Statement[]): boolean {
  return body.some((stmt) => stmt.type === 'ReturnStmt' || blocksOf(stmt, false).some(containsReturn));
}

/** The statement blocks directly inside `stmt`, in source order; `def` bodies only when asked. */
export function blocksOf(stmt: Statement, withDefBodies: boolean): readonly (readonly Statement[])[] {
  switch (stmt.type) {
    case 'IfStmt':
      return [stmt.body, ...stmt.elifs.map((e) => e.body), ...(stmt.orelse === null ? [] : [stmt.orelse])];
    case 'WhileStmt':
    case 'ForStmt':
    case 'RepeatStmt':
      return [stmt.body];
    case 'DefStmt':
      return withDefBodies ? [stmt.body] : [];
    case 'ExprStmt':
    case 'AssignStmt':
    case 'AugAssignStmt':
    case 'PassStmt':
    case 'BreakStmt':
    case 'ContinueStmt':
    case 'ReturnStmt':
    case 'GlobalStmt':
      return [];
  }
}
