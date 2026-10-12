/**
 * W-UNREACHABLE: statements after one that never lets control reach the next line of its block.
 * Spec: docs/02-language/errors-and-diagnostics.md (W-UNREACHABLE); docs/03-architecture/interpreter-vm.md §Checker.
 * Invariant: one warning per block, at its first unreachable statement; code inside a later `if` that
 * returns is still reachable, because only the statement itself is considered, not its branches.
 */

import { assertNever } from '../invariant';
import type { Program, Statement } from '../parser/ast';
import type { Diagnostic } from '../types';
import { unreachable, type UnreachableCause } from './diagnostics';
import { blocksOf, breaksOut, isWhileTrue } from './loops';

export function checkReachability(program: Program): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const walkBlock = (stmts: readonly Statement[]): void => {
    let cause: UnreachableCause | null = null;
    for (const stmt of stmts) {
      if (cause !== null) {
        diagnostics.push(unreachable(stmt.span, cause));
        return;
      }
      for (const block of blocksOf(stmt, true)) walkBlock(block);
      cause = causeOf(stmt);
    }
  };
  for (const file of program.files) walkBlock(file.body);
  return diagnostics;
}

function causeOf(stmt: Statement): UnreachableCause | null {
  switch (stmt.type) {
    case 'ReturnStmt':
      return 'return';
    case 'BreakStmt':
      return 'break';
    case 'ContinueStmt':
      return 'continue';
    case 'WhileStmt':
      return isWhileTrue(stmt) && !breaksOut(stmt.body) ? 'loop' : null;
    case 'ExprStmt':
    case 'AssignStmt':
    case 'AugAssignStmt':
    case 'PassStmt':
    case 'GlobalStmt':
    case 'IfStmt':
    case 'ForStmt':
    case 'RepeatStmt':
    case 'DefStmt':
      return null;
    default:
      return assertNever(stmt);
  }
}
