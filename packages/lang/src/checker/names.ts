/**
 * Name rules: E-UNKNOWN-NAME (with suggestion), E-RESERVED-NAME, E-BUILTIN-NOT-VALUE, E-RANGE-ONLY-IN-FOR
 * and E-GLOBAL-AFTER-USE.
 * Spec: docs/02-language/language-spec.md §Scoping, §Types (function), §Iteration;
 * docs/03-architecture/interpreter-vm.md §Checker.
 * Invariants: reads resolutions from `resolveScopes` and never re-derives scope; walks in source order;
 * recursion is bounded by the expression-height and block-nesting limits.
 */

import {
  childNodes,
  type AstNode,
  type CallExpr,
  type DefStmt,
  type Identifier,
  type NameExpr,
  type Program,
} from '../parser/ast';
import { assertNever } from '../invariant';
import type { FunctionScope, ScopeInfo } from '../scope/scope';
import type { Diagnostic } from '../types';
import type { CheckOptions } from './check';
import { builtinNotValue, globalAfterUse, rangeOnlyInFor, reservedName, unknownName } from './diagnostics';
import { boundedDistance } from './levenshtein';

/** language-spec.md / errors-and-diagnostics.md: suggestions are names within Levenshtein distance 2. */
const MAX_SUGGESTION_DISTANCE = 2;
const RANGE = 'range';

/** How a NameExpr is used: called, as the `range` of a `for` header, or as a plain value. */
type Role = 'callee' | 'for-range' | 'value';

export function checkNames(program: Program, scopes: ScopeInfo, opts: CheckOptions): Diagnostic[] {
  const checker = new NameChecker(scopes, opts);
  for (const file of program.files) for (const stmt of file.body) checker.visit(stmt, null);
  return checker.diagnostics;
}

/**
 * One source-order walk of the program. A class because the walk carries the options and accumulates
 * diagnostics; it is created and discarded inside `checkNames`.
 */
class NameChecker {
  readonly diagnostics: Diagnostic[] = [];
  private readonly constantNames: ReadonlySet<string>;
  private readonly commandArity = new Map<string, boolean>();

  constructor(
    private readonly scopes: ScopeInfo,
    private readonly opts: CheckOptions,
  ) {
    this.constantNames = new Set(opts.constants.map((c) => c.name));
    for (const sig of opts.intrinsicSignatures) this.commandArity.set(sig.name, (sig.maxArgs ?? 1) > 0);
    for (const sig of opts.hostSignatures) this.commandArity.set(sig.name, sig.params.length > 0);
  }

  visit(node: AstNode, fn: FunctionScope | null, role: Role = 'value'): void {
    switch (node.type) {
      case 'DefStmt':
        this.visitDef(node);
        return;
      case 'AssignStmt':
      case 'AugAssignStmt':
        if (node.target.type === 'NameExpr') this.checkBinding(node.target);
        else this.visit(node.target, fn);
        this.visit(node.value, fn);
        return;
      case 'ForStmt':
        this.checkBinding(node.target);
        this.visitForIterable(node.iterable, fn);
        for (const stmt of node.body) this.visit(stmt, fn);
        return;
      case 'GlobalStmt':
        for (const name of node.names) this.checkBinding(name);
        return;
      case 'CallExpr':
        this.visitCall(node, fn, false);
        return;
      case 'MethodCallExpr':
        // The method name is not a variable; only the receiver and the arguments are names.
        this.visit(node.object, fn);
        for (const arg of node.args) this.visit(arg, fn);
        return;
      case 'NameExpr':
        this.checkName(node, fn, role);
        return;
      case 'Identifier':
      case 'IntLiteral':
      case 'StringLiteral':
      case 'BoolLiteral':
      case 'NoneLiteral':
      case 'ListLiteral':
      case 'DictLiteral':
      case 'UnaryExpr':
      case 'BinaryExpr':
      case 'LogicalExpr':
      case 'CompareExpr':
      case 'IndexExpr':
      case 'ExprStmt':
      case 'PassStmt':
      case 'BreakStmt':
      case 'ContinueStmt':
      case 'ReturnStmt':
      case 'IfStmt':
      case 'ElifClause':
      case 'WhileStmt':
      case 'RepeatStmt':
        for (const child of childNodes(node)) this.visit(child, fn);
        return;
      default:
        assertNever(node);
    }
  }

  private visitDef(def: DefStmt): void {
    this.checkBinding(def.name);
    for (const param of def.params) this.checkBinding(param);
    this.checkGlobalOrder(def);
    const scope = this.scopes.functions.get(def) ?? null;
    for (const stmt of def.body) this.visit(stmt, scope);
  }

  /** `for x in range(...)`: the one place `range` may appear (language-spec.md §Iteration). */
  private visitForIterable(iterable: AstNode, fn: FunctionScope | null): void {
    if (iterable.type === 'CallExpr') this.visitCall(iterable, fn, true);
    else this.visit(iterable, fn);
  }

  private visitCall(call: CallExpr, fn: FunctionScope | null, isForIterable: boolean): void {
    if (this.isRange(call.callee) && !isForIterable) {
      this.diagnostics.push(rangeOnlyInFor(call.span));
    } else {
      this.visit(call.callee, fn, isForIterable && this.isRange(call.callee) ? 'for-range' : 'callee');
    }
    for (const arg of call.args) this.visit(arg, fn);
  }

  private checkName(name: NameExpr, fn: FunctionScope | null, role: Role): void {
    const resolution = this.scopes.resolutions.get(name);
    if (resolution === undefined) return;
    switch (resolution.kind) {
      case 'unknown':
        this.diagnostics.push(unknownName(name.span, name.name, this.suggestion(name.name, fn)));
        return;
      case 'intrinsic':
      case 'builtin':
        if (name.name === RANGE && resolution.kind === 'intrinsic' && role !== 'for-range') {
          this.diagnostics.push(rangeOnlyInFor(name.span));
        } else if (role === 'value') {
          this.diagnostics.push(
            builtinNotValue(name.span, name.name, this.commandArity.get(name.name) ?? true),
          );
        }
        return;
      case 'local':
      case 'global':
      case 'constant':
        return;
      default:
        assertNever(resolution);
    }
  }

  private isRange(expr: AstNode): boolean {
    if (expr.type !== 'NameExpr') return false;
    return this.scopes.resolutions.get(expr)?.kind === 'intrinsic' && expr.name === RANGE;
  }

  /** A binding site may not use a builtin, intrinsic or constant name (E-RESERVED-NAME). */
  private checkBinding(node: NameExpr | Identifier): void {
    const isConstant = this.constantNames.has(node.name);
    if (isConstant || this.commandArity.has(node.name)) {
      this.diagnostics.push(reservedName(node.span, node.name, isConstant));
    }
  }

  /** `global x` must come before every other occurrence of `x` in the same def, parameters included. */
  private checkGlobalOrder(def: DefStmt): void {
    const seen = new Set(def.params.map((p) => p.name));
    const walk = (node: AstNode): void => {
      if (node.type === 'GlobalStmt') {
        for (const name of node.names)
          if (seen.has(name.name)) this.diagnostics.push(globalAfterUse(name.span, name.name));
      } else if (node.type === 'DefStmt') {
        seen.add(node.name.name);
      } else if (node.type === 'MethodCallExpr') {
        walk(node.object);
        for (const arg of node.args) walk(arg);
      } else if (node.type === 'NameExpr' || node.type === 'Identifier') {
        seen.add(node.name);
      } else {
        for (const child of childNodes(node)) walk(child);
      }
    };
    for (const stmt of def.body) walk(stmt);
  }

  /** The closest visible, unlocked name within distance 2; the first candidate wins a tie. */
  private suggestion(name: string, fn: FunctionScope | null): string | null {
    let best: string | null = null;
    let bestDistance = MAX_SUGGESTION_DISTANCE + 1;
    for (const candidate of this.candidates(fn)) {
      if (this.opts.lockedNames.has(candidate)) continue;
      const distance = boundedDistance(name, candidate, MAX_SUGGESTION_DISTANCE);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Locals of the enclosing def, globals, intrinsics, host builtins, constants: each in its own order. */
  private candidates(fn: FunctionScope | null): readonly string[] {
    return [
      ...(fn?.locals ?? []),
      ...this.scopes.globals,
      ...this.opts.intrinsicSignatures.map((s) => s.name),
      ...this.opts.hostSignatures.map((s) => s.name),
      ...this.opts.constants.map((c) => c.name),
    ];
  }
}
