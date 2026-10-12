/**
 * The user functions a call by name certainly reaches: names bound only by top-level `def`s.
 * Spec: docs/02-language/language-spec.md §Scoping (def binds when it executes), §Files.
 * Invariant: a name that is also assigned, used as a `for` target or declared `global` anywhere is not
 * static, because what it holds when a call runs is only known at run time.
 */

import type { DefStmt, Program } from '../parser/ast';
import { bindingName, scopeStatements } from '../scope/bindings';

/** Every static function name with its defs, in run order (one file may rebind a name with a later def). */
export function staticFunctions(program: Program): ReadonlyMap<string, readonly DefStmt[]> {
  const defs = new Map<string, DefStmt[]>();
  const rebound = new Set<string>();
  for (const file of program.files) {
    for (const stmt of scopeStatements(file.body)) {
      if (stmt.type === 'DefStmt' && file.body.includes(stmt)) {
        defs.set(stmt.name.name, [...(defs.get(stmt.name.name) ?? []), stmt]);
        for (const inner of scopeStatements(stmt.body)) {
          if (inner.type === 'GlobalStmt') for (const name of inner.names) rebound.add(name.name);
        }
      } else {
        const bound = bindingName(stmt);
        if (bound !== null) rebound.add(bound);
      }
    }
  }
  const result = new Map<string, readonly DefStmt[]>();
  for (const [name, list] of defs) if (!rebound.has(name)) result.set(name, list);
  return result;
}
