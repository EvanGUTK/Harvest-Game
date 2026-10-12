/**
 * W-PURE-INFINITE-LOOP: a `while True:` whose body, directly or through any user function it calls
 * (transitively over the static call graph), has no `break` out of it, no `return`, no `halt()` and no
 * action or sensor call.
 * Spec: docs/03-architecture/interpreter-vm.md §Checker; docs/02-language/errors-and-diagnostics.md.
 * Invariants: a call whose target cannot be resolved statically is assumed to touch the farm (no false
 * warnings); a `return` inside a called function does not leave the caller's loop; recursion in the call
 * graph terminates because the analysis is a monotone fixed point over the static functions.
 */

import { childNodes, type AstNode, type Program, type Statement } from '../parser/ast';
import { assertNever } from '../invariant';
import type { ScopeInfo } from '../scope/scope';
import type { Diagnostic, Span } from '../types';
import type { CheckOptions } from './check';
import { pureInfiniteLoop } from './diagnostics';
import { blocksOf, breaksOut, containsReturn, isWhileTrue } from './loops';
import { staticFunctions } from './static-functions';

/** `halt()` always ends the loop, whatever its host signature says about the world. */
const HALT = 'halt';
const WHILE_KEYWORD_LENGTH = 'while'.length;

/** What a call reaches: farm-touching code, a static user function, or pure code. */
type CallTarget =
  | { readonly kind: 'touches' }
  | { readonly kind: 'static'; readonly name: string }
  | { readonly kind: 'pure' };

/** What a block of code does directly: whether it may touch the farm, and which static functions it calls. */
type DirectEffects = { readonly touches: boolean; readonly callees: ReadonlySet<string> };

export function checkPureLoops(program: Program, scopes: ScopeInfo, opts: CheckOptions): Diagnostic[] {
  const effects = new EffectAnalysis(program, scopes, opts);
  const diagnostics: Diagnostic[] = [];
  const walkBlock = (stmts: readonly Statement[]): void => {
    for (const stmt of stmts) {
      if (
        isWhileTrue(stmt) &&
        !breaksOut(stmt.body) &&
        !containsReturn(stmt.body) &&
        !effects.mayTouch(stmt.body)
      ) {
        diagnostics.push(pureInfiniteLoop(keywordSpan(stmt.span)));
      }
      for (const block of blocksOf(stmt, true)) walkBlock(block);
    }
  };
  for (const file of program.files) walkBlock(file.body);
  return diagnostics;
}

function keywordSpan(span: Span): Span {
  return { ...span, endLine: span.line, endCol: span.col + WHILE_KEYWORD_LENGTH };
}

/**
 * Which static functions may touch the farm, computed once per check. A class because it holds the
 * call-graph tables and the fixed point built from them.
 */
class EffectAnalysis {
  private readonly worldBuiltins: ReadonlySet<string>;
  private readonly statics: ReadonlyMap<string, readonly { readonly body: readonly Statement[] }[]>;
  private readonly touchingFunctions = new Set<string>();

  constructor(
    program: Program,
    private readonly scopes: ScopeInfo,
    opts: CheckOptions,
  ) {
    this.worldBuiltins = new Set(
      opts.hostSignatures.filter((s) => s.touchesWorld || s.name === HALT).map((s) => s.name),
    );
    this.statics = staticFunctions(program);
    this.solve();
  }

  /** True when running `body` may touch the farm, directly or through the functions it calls. */
  mayTouch(body: readonly Statement[]): boolean {
    const direct = this.direct(body);
    return direct.touches || [...direct.callees].some((name) => this.touchingFunctions.has(name));
  }

  /** Grows the set of touching functions until no function changes (at most one round per function). */
  private solve(): void {
    const directs = new Map<string, DirectEffects>();
    for (const [name, defs] of this.statics) directs.set(name, this.direct(defs.flatMap((d) => d.body)));
    for (let changed = true; changed;) {
      changed = false;
      for (const [name, direct] of directs) {
        if (this.touchingFunctions.has(name)) continue;
        if (direct.touches || [...direct.callees].some((callee) => this.touchingFunctions.has(callee))) {
          this.touchingFunctions.add(name);
          changed = true;
        }
      }
    }
  }

  private direct(body: readonly Statement[]): DirectEffects {
    let touches = false;
    const callees = new Set<string>();
    const visit = (node: AstNode): void => {
      if (node.type === 'DefStmt') return;
      if (node.type === 'CallExpr') {
        const target = this.callTarget(node.callee);
        if (target.kind === 'touches') touches = true;
        else if (target.kind === 'static') callees.add(target.name);
      }
      for (const child of childNodes(node)) visit(child);
    };
    for (const stmt of body) visit(stmt);
    return { touches, callees };
  }

  /** A call the analysis cannot resolve statically is assumed to touch the farm. */
  private callTarget(callee: AstNode): CallTarget {
    if (callee.type !== 'NameExpr') return { kind: 'touches' };
    const kind = this.scopes.resolutions.get(callee)?.kind;
    switch (kind) {
      case 'builtin':
        return this.worldBuiltins.has(callee.name) ? { kind: 'touches' } : { kind: 'pure' };
      case 'intrinsic':
        return { kind: 'pure' };
      case 'global':
        return this.statics.has(callee.name) ? { kind: 'static', name: callee.name } : { kind: 'touches' };
      case 'local':
      case 'constant':
      case 'unknown':
      case undefined:
        return { kind: 'touches' };
      default:
        return assertNever(kind);
    }
  }
}
