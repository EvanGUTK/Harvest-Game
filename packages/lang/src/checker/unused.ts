/**
 * W-UNUSED-VAR (hint): a variable that is given a value but never read.
 * Spec: docs/02-language/errors-and-diagnostics.md (W-UNUSED-VAR); language-spec.md §Scoping.
 * Invariants: variables are told apart by their resolution (a global slot, or a local slot of one def), so
 * a read anywhere in the program counts for a global; `x += 1` feeds only itself and is not a read;
 * `for` targets, parameters and names starting with `_` are never reported.
 */

import { childNodes, type AstNode, type NameExpr, type Program } from '../parser/ast';
import type { FunctionScope, ScopeInfo } from '../scope/scope';
import type { Diagnostic } from '../types';
import { unusedVariable } from './diagnostics';

/** Python's convention for a value kept on purpose but not used. */
const UNUSED_PREFIX = '_';

type Variable = { readonly firstBinding: NameExpr; read: boolean };

export function checkUnused(program: Program, scopes: ScopeInfo): Diagnostic[] {
  const variables = new Map<string, Variable>();
  const functionIds = new Map<FunctionScope, number>();
  const keyOf = (name: NameExpr, fn: FunctionScope | null): string | null => {
    const resolution = scopes.resolutions.get(name);
    if (resolution?.kind === 'global') return `global:${String(resolution.slot)}`;
    if (resolution?.kind !== 'local' || fn === null) return null;
    if (!functionIds.has(fn)) functionIds.set(fn, functionIds.size);
    return `local:${String(functionIds.get(fn))}:${String(resolution.slot)}`;
  };
  const bind = (name: NameExpr, fn: FunctionScope | null): void => {
    const key = keyOf(name, fn);
    if (key !== null && !variables.has(key)) variables.set(key, { firstBinding: name, read: false });
  };
  const read = (name: NameExpr, fn: FunctionScope | null): void => {
    const key = keyOf(name, fn);
    const variable = key === null ? undefined : variables.get(key);
    if (key !== null && variable === undefined) variables.set(key, { firstBinding: name, read: true });
    else if (variable !== undefined) variable.read = true;
  };
  const visit = (node: AstNode, fn: FunctionScope | null): void => {
    if (node.type === 'DefStmt') {
      const scope = scopes.functions.get(node) ?? null;
      for (const stmt of node.body) visit(stmt, scope);
    } else if (
      (node.type === 'AssignStmt' || node.type === 'AugAssignStmt') &&
      node.target.type === 'NameExpr'
    ) {
      bind(node.target, fn);
      visit(node.value, fn);
    } else if (node.type === 'MethodCallExpr') {
      visit(node.object, fn);
      for (const arg of node.args) visit(arg, fn);
    } else if (node.type === 'NameExpr') {
      read(node, fn);
    } else {
      for (const child of childNodes(node)) visit(child, fn);
    }
  };
  for (const file of program.files) for (const stmt of file.body) visit(stmt, null);
  const diagnostics: Diagnostic[] = [];
  for (const { firstBinding, read: wasRead } of variables.values()) {
    if (!wasRead && !firstBinding.name.startsWith(UNUSED_PREFIX)) {
      diagnostics.push(unusedVariable(firstBinding.span, firstBinding.name));
    }
  }
  return diagnostics;
}
