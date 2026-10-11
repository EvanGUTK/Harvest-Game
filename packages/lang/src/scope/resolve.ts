/**
 * Name resolution: which frame slot, global slot, intrinsic, builtin or constant every name occurrence
 * refers to. The one implementation shared by the checker and the compiler (chief ruling 2026-10-11).
 * Spec: docs/02-language/language-spec.md §Scoping, §Files (one global namespace, run order).
 * Invariants: pure and total (no diagnostics, never throws); every map is filled in pre-order over the
 * files in run order, so slot numbers and iteration order are deterministic.
 */

import {
  childNodes,
  type AstNode,
  type DefStmt,
  type Identifier,
  type NameExpr,
  type Program,
  type Statement,
} from '../parser/ast';
import { bindingName, boundNames, declaredGlobals, scopeStatements } from './bindings';
import type { FunctionScope, ResolveOptions, Resolution, ScopeInfo } from './scope';

/** Resolves every name of `program` against its own bindings and the host-supplied name sets. */
export function resolveScopes(program: Program, options: ResolveOptions): ScopeInfo {
  const globals = collectGlobals(program);
  const resolver = new Resolver(new Map(globals.map((name, slot) => [name, slot])), options);
  for (const file of program.files) resolver.resolveBody(file.body, null);
  return { globals, functions: resolver.functions, resolutions: resolver.resolutions };
}

/**
 * The global slot order: each module-level binding and each name declared `global` inside a `def`, first
 * occurrence wins, in pre-order over the files in run order.
 */
function collectGlobals(program: Program): readonly string[] {
  const names = new Set<string>();
  const visitDef = (def: DefStmt): void => {
    for (const stmt of scopeStatements(def.body)) {
      if (stmt.type === 'GlobalStmt') for (const name of stmt.names) names.add(name.name);
      if (stmt.type === 'DefStmt') visitDef(stmt);
    }
  };
  for (const file of program.files) {
    for (const stmt of scopeStatements(file.body)) {
      const bound = bindingName(stmt);
      if (bound !== null) names.add(bound);
      if (stmt.type === 'DefStmt') visitDef(stmt);
    }
  }
  return [...names];
}

/** The local slots of `def`: parameters, then names bound in the body that are not declared `global`. */
function functionScope(def: DefStmt): FunctionScope {
  const declaredGlobal = declaredGlobals(def.body);
  const locals = def.params.map((p) => p.name);
  for (const name of boundNames(def.body)) {
    if (!declaredGlobal.has(name) && !locals.includes(name)) locals.push(name);
  }
  return { def, locals, declaredGlobal };
}

/**
 * Walks the tree once, resolving each NameExpr and binding Identifier in the scope it appears in.
 * A class because the walk accumulates two result maps; it is created and discarded in `resolveScopes`.
 */
class Resolver {
  readonly functions = new Map<DefStmt, FunctionScope>();
  readonly resolutions = new Map<NameExpr | Identifier, Resolution>();

  constructor(
    private readonly globalSlots: ReadonlyMap<string, number>,
    private readonly options: ResolveOptions,
  ) {}

  /** `fn` is the enclosing function's scope, or `null` at the top level of a file. */
  resolveBody(body: readonly Statement[], fn: FunctionScope | null): void {
    for (const stmt of body) this.visit(stmt, fn);
  }

  /** Resolves `node` and everything under it; only nodes that name something need special handling. */
  private visit(node: AstNode, fn: FunctionScope | null): void {
    if (node.type === 'DefStmt') {
      this.visitDef(node, fn);
    } else if (node.type === 'MethodCallExpr') {
      // The method name is not a variable: resolve the receiver and the arguments only.
      this.visit(node.object, fn);
      for (const arg of node.args) this.visit(arg, fn);
    } else if (node.type === 'GlobalStmt') {
      for (const name of node.names) this.resolutions.set(name, this.globalOrUnknown(name.name));
    } else if (node.type === 'NameExpr' || node.type === 'Identifier') {
      this.resolutions.set(node, this.resolve(node.name, fn));
    } else {
      for (const child of childNodes(node)) this.visit(child, fn);
    }
  }

  /** The def name belongs to the enclosing scope; parameters and body to the def's own scope. */
  private visitDef(def: DefStmt, enclosing: FunctionScope | null): void {
    this.resolutions.set(def.name, this.resolve(def.name.name, enclosing));
    const scope = functionScope(def);
    this.functions.set(def, scope);
    for (const param of def.params) this.resolutions.set(param, this.resolve(param.name, scope));
    this.resolveBody(def.body, scope);
  }

  /** Local, then global, then intrinsic, builtin and constant, else unknown (language-spec.md §Scoping). */
  private resolve(name: string, fn: FunctionScope | null): Resolution {
    const slot = fn === null ? -1 : fn.locals.indexOf(name);
    if (slot >= 0) return { kind: 'local', slot };
    const global = this.globalOrUnknown(name);
    if (global.kind === 'global') return global;
    if (this.options.intrinsicNames.has(name)) return { kind: 'intrinsic', name };
    if (this.options.hostNames.has(name)) return { kind: 'builtin', name };
    if (this.options.constantNames.has(name)) return { kind: 'constant', name };
    return global;
  }

  private globalOrUnknown(name: string): Resolution {
    const slot = this.globalSlots.get(name);
    return slot === undefined ? { kind: 'unknown' } : { kind: 'global', slot };
  }
}
