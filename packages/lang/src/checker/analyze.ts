/**
 * The checker's single entry point inside lang: resolve names once, then run every checker pass.
 * Spec: docs/03-architecture/interpreter-vm.md §Pipeline (Parser → Checker → Compiler), §Checker.
 * Invariants: internal to lang (not exported from index.ts, chief ruling 2026-10-12); resolveScopes runs
 * exactly once, and the same ScopeInfo feeds every pass and, through `scopes`, the compiler; diagnostics
 * keep check()'s source order.
 */

import type { Program } from '../parser/ast';
import { resolveScopes } from '../scope/resolve';
import type { ScopeInfo } from '../scope/scope';
import type { Diagnostic } from '../types';
import { check, scopeNames, type CheckOptions } from './check';

export type Analysis = {
  /** Error-severity diagnostics; the program compiles only when there are none. */
  readonly diagnostics: readonly Diagnostic[];
  /** Warnings and hints, shown to the player but never blocking. */
  readonly warnings: readonly Diagnostic[];
  /** The name resolution the checker used, for the compiler (LOAD_LOCAL vs LOAD_GLOBAL). */
  readonly scopes: ScopeInfo;
};

/** Resolves `program`'s names once and checks it; CompileOptions satisfies CheckOptions. */
export function analyze(program: Program, opts: CheckOptions): Analysis {
  const scopes = resolveScopes(program, scopeNames(opts));
  const all = check(program, scopes, opts).diagnostics;
  return {
    diagnostics: all.filter((d) => d.severity === 'error'),
    warnings: all.filter((d) => d.severity !== 'error'),
    scopes,
  };
}
