/**
 * Binding sites of one scope: which names a module or a `def` body binds, and which it declares `global`.
 * Spec: docs/02-language/language-spec.md §Scoping.
 * Invariants: a scope is a statement list plus every nested block (`if`/`elif`/`else`, `while`, `for`,
 * `repeat`) but never a nested `def` body, which is its own scope; names come out in first-binding order
 * (pre-order over the source), each once.
 */

import type { Statement } from '../parser/ast';

/**
 * Names bound in the scope: NameExpr targets of assignment and augmented assignment, `for` targets and
 * `def` names. An indexed target (`grid[0] = 1`) binds nothing.
 */
export function boundNames(body: readonly Statement[]): readonly string[] {
  const names = new Set<string>();
  for (const stmt of scopeStatements(body)) {
    const name = bindingName(stmt);
    if (name !== null) names.add(name);
  }
  return [...names];
}

/** Names declared by `global` statements of the scope. */
export function declaredGlobals(body: readonly Statement[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of scopeStatements(body)) {
    if (stmt.type === 'GlobalStmt') for (const name of stmt.names) names.add(name.name);
  }
  return names;
}

/** The name `stmt` itself binds in its scope, if any (nested blocks are not looked into). */
export function bindingName(stmt: Statement): string | null {
  switch (stmt.type) {
    case 'AssignStmt':
    case 'AugAssignStmt':
      return stmt.target.type === 'NameExpr' ? stmt.target.name : null;
    case 'ForStmt':
      return stmt.target.name;
    case 'DefStmt':
      return stmt.name.name;
    case 'ExprStmt':
    case 'PassStmt':
    case 'BreakStmt':
    case 'ContinueStmt':
    case 'ReturnStmt':
    case 'GlobalStmt':
    case 'IfStmt':
    case 'WhileStmt':
    case 'RepeatStmt':
      return null;
  }
}

/** Every statement of the scope in pre-order: nested blocks included, nested `def` bodies excluded. */
export function scopeStatements(body: readonly Statement[]): readonly Statement[] {
  const out: Statement[] = [];
  const visit = (stmts: readonly Statement[]): void => {
    for (const stmt of stmts) {
      out.push(stmt);
      for (const block of nestedBlocks(stmt)) visit(block);
    }
  };
  visit(body);
  return out;
}

/** The blocks of `stmt` that belong to the same scope, in source order. */
function nestedBlocks(stmt: Statement): readonly (readonly Statement[])[] {
  switch (stmt.type) {
    case 'IfStmt':
      return [stmt.body, ...stmt.elifs.map((e) => e.body), ...(stmt.orelse === null ? [] : [stmt.orelse])];
    case 'WhileStmt':
    case 'ForStmt':
    case 'RepeatStmt':
      return [stmt.body];
    case 'DefStmt':
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
