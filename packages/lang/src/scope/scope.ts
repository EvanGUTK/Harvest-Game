/**
 * Name-resolution results shared by the checker (LANG-03) and the compiler (LANG-04): local slots per
 * `def`, the one global slot order, and how every name occurrence resolves.
 * Spec: docs/02-language/language-spec.md §Scoping; docs/03-architecture/interpreter-vm.md §Checker, §Bytecode.
 * Invariants: resolution carries no diagnostics; ordering rules (E-GLOBAL-AFTER-USE, W-USE-BEFORE-DEF)
 * and reserved-name rules (E-RESERVED-NAME) are the checker's, which reads these results.
 */

import type { DefStmt, Identifier, NameExpr } from '../parser/ast';

/** How one name occurrence resolves. */
export type Resolution =
  /** A slot of the enclosing `def`'s frame (`FunctionScope.locals[slot]`). */
  | { readonly kind: 'local'; readonly slot: number }
  /** A module global (`ScopeInfo.globals[slot]`); LOAD_GLOBAL / STORE_GLOBAL index into it. */
  | { readonly kind: 'global'; readonly slot: number }
  /** A language intrinsic (`range`, `len`, `print`, …), from `ResolveOptions.intrinsicNames`. */
  | { readonly kind: 'intrinsic'; readonly name: string }
  /** A host builtin (`move`, `plant`, …), from `ResolveOptions.hostNames`. */
  | { readonly kind: 'builtin'; readonly name: string }
  /** A game constant (`RADISH`, `NORTH`, …), from `ResolveOptions.constantNames`. */
  | { readonly kind: 'constant'; readonly name: string }
  /** Defined nowhere: the checker reports E-LOCKED-FEATURE or E-UNKNOWN-NAME. */
  | { readonly kind: 'unknown' };

export type FunctionScope = {
  readonly def: DefStmt;
  /** Frame slot order: parameters, then names bound in the body in first-binding order, minus `global` ones. */
  readonly locals: readonly string[];
  /** Names the body declares `global`. */
  readonly declaredGlobal: ReadonlySet<string>;
};

export type ScopeInfo = {
  /**
   * The global slot order: the first binding of each module-level name, and each name declared `global` in
   * a `def`, in pre-order over the files in run order.
   */
  readonly globals: readonly string[];
  readonly functions: ReadonlyMap<DefStmt, FunctionScope>;
  /**
   * Every NameExpr and every binding Identifier (def name, parameter, `for` target, `global` name), keyed by
   * node identity, in pre-order. Method-name Identifiers are not variables and are absent.
   */
  readonly resolutions: ReadonlyMap<NameExpr | Identifier, Resolution>;
};

export type ResolveOptions = {
  readonly hostNames: ReadonlySet<string>;
  readonly constantNames: ReadonlySet<string>;
  readonly intrinsicNames: ReadonlySet<string>;
};
