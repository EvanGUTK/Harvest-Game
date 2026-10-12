/**
 * Sprout checker entry point: static rules over a parsed, resolved program, before compilation.
 * Spec: docs/03-architecture/interpreter-vm.md §Checker; docs/02-language/errors-and-diagnostics.md.
 * Invariants: pure; never throws; diagnostics come back ordered by file (run order), then line, then
 * column, and ties keep the order the rules found them in. A program compiles only when neither the
 * parse nor the check produced an error-severity diagnostic.
 */

import type { Program } from '../parser/ast';
import type { ResolveOptions, ScopeInfo } from '../scope/scope';
import type { ConstantDef, Diagnostic, Feature, HostSignature, Limits, LockReason } from '../types';
import { INTRINSIC_NAMES } from '../intrinsics/intrinsics';
import { checkArity } from './arity';
import { checkDuplicateDefs, checkFileCount } from './files';
import { checkGating } from './gating';
import { checkPureLoops } from './infinite-loop';
import { checkNames } from './names';
import { checkReachability } from './reachability';
import { checkUnused } from './unused';
import { checkUseBeforeDef } from './use-before-def';

export type CheckOptions = {
  readonly hostSignatures: readonly HostSignature[];
  readonly constants: readonly ConstantDef[];
  readonly lockedFeatures: ReadonlyMap<Feature, LockReason>;
  readonly lockedNames: ReadonlyMap<string, LockReason>;
  readonly limits: Limits;
};

export type CheckResult = {
  /** Errors and warnings in source order. */
  readonly diagnostics: readonly Diagnostic[];
};

/** The name sets `resolveScopes` needs, taken from the same options the checker uses, so they cannot drift. */
export function scopeNames(opts: CheckOptions): ResolveOptions {
  return {
    hostNames: new Set(opts.hostSignatures.map((s) => s.name)),
    constantNames: new Set(opts.constants.map((c) => c.name)),
    intrinsicNames: INTRINSIC_NAMES,
  };
}

/**
 * Runs every checker rule over `program`, whose names `scopes` resolved with `scopeNames(opts)`. Diagnostics
 * are sorted by position (file in run order, then line, then column). The sort is stable, so diagnostics at
 * the same position keep the fixed order of the passes below.
 */
export function check(program: Program, scopes: ScopeInfo, opts: CheckOptions): CheckResult {
  const diagnostics = [
    ...checkFileCount(program, opts.limits),
    ...checkDuplicateDefs(program),
    ...checkGating(program, scopes, opts),
    ...checkNames(program, scopes, opts),
    ...checkArity(program, scopes, opts),
    ...checkReachability(program),
    ...checkPureLoops(program, scopes, opts),
    ...checkUseBeforeDef(program, scopes),
    ...checkUnused(program, scopes),
  ];
  return { diagnostics: inSourceOrder(diagnostics, program) };
}

/** Diagnostics sorted by file (run order), line and column; stable, so ties keep their given order. */
export function inSourceOrder(diagnostics: readonly Diagnostic[], program: Program): Diagnostic[] {
  const fileIndex = new Map(program.files.map((f, i) => [f.name, i]));
  const rank = (d: Diagnostic) => fileIndex.get(d.range.file) ?? program.files.length;
  return [...diagnostics].sort(
    (a, b) => rank(a) - rank(b) || a.range.line - b.range.line || a.range.col - b.range.col,
  );
}
