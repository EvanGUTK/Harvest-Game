/**
 * W-USE-BEFORE-DEF: top-level code that names a function whose `def` has not run yet.
 * Spec: docs/02-language/language-spec.md §Scoping ("the checker raises W-USE-BEFORE-DEF statically for the
 * obvious top-level case"), §Files (run order).
 * Invariants: walks top-level code in run order, nested blocks included; a `def` body runs only when called,
 * so it is never looked into; only static functions (bound by nothing but `def`) are considered.
 */

import { childNodes, type AstNode, type Program } from '../parser/ast';
import type { ScopeInfo } from '../scope/scope';
import type { Diagnostic } from '../types';
import { useBeforeDef } from './diagnostics';
import { staticFunctions } from './static-functions';

export function checkUseBeforeDef(program: Program, scopes: ScopeInfo): Diagnostic[] {
  const statics = staticFunctions(program);
  const defined = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const visit = (node: AstNode): void => {
    if (node.type === 'DefStmt') {
      defined.add(node.name.name);
      return;
    }
    if (
      node.type === 'NameExpr' &&
      statics.has(node.name) &&
      !defined.has(node.name) &&
      scopes.resolutions.get(node)?.kind === 'global'
    ) {
      diagnostics.push(useBeforeDef(node.span, node.name));
    }
    for (const child of childNodes(node)) visit(child);
  };
  for (const file of program.files) for (const stmt of file.body) visit(stmt);
  return diagnostics;
}
