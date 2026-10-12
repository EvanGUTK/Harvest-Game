/**
 * Sprout checker entry point: static rules over a parsed, resolved program, before compilation.
 * Spec: docs/03-architecture/interpreter-vm.md §Checker; docs/02-language/errors-and-diagnostics.md.
 * Invariants: pure; never throws; diagnostics come back ordered by file (run order), then line, then
 * column, and ties keep the order the rules found them in. A program compiles only when neither the
 * parse nor the check produced an error-severity diagnostic.
 */

import type { Program } from '../parser/ast';
import type { ResolveOptions, ScopeInfo } from '../scope/scope';
import type { ConstantDef, Diagnostic, Feature, HostSignature, Limits } from '../types';
import { checkDuplicateDefs, checkFileCount } from './files';
import { checkNames } from './names';

/**
 * Arity of a language intrinsic (`range`, `len`, `print`, …). Provisional: replaced by lang-vm's intrinsic
 * table when it lands (chief ruling 2026-10-11). `maxArgs: null` means any number.
 */
export type IntrinsicSignature = {
  readonly name: string;
  readonly minArgs: number;
  readonly maxArgs: number | null;
};

export type CheckOptions = {
  readonly hostSignatures: readonly HostSignature[];
  readonly constants: readonly ConstantDef[];
  readonly lockedFeatures: ReadonlySet<Feature>;
  readonly lockedNames: ReadonlySet<string>;
  readonly limits: Limits;
  readonly intrinsicSignatures: readonly IntrinsicSignature[];
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
    intrinsicNames: new Set(opts.intrinsicSignatures.map((s) => s.name)),
  };
}

/** Runs every checker rule over `program`, whose names `scopes` resolved with `scopeNames(opts)`. */
export function check(program: Program, scopes: ScopeInfo, opts: CheckOptions): CheckResult {
  const diagnostics = [
    ...checkFileCount(program, opts.limits),
    ...checkDuplicateDefs(program),
    ...checkNames(program, scopes, opts),
  ];
  return { diagnostics: inSourceOrder(diagnostics, program) };
}

function inSourceOrder(diagnostics: readonly Diagnostic[], program: Program): Diagnostic[] {
  const fileIndex = new Map(program.files.map((f, i) => [f.name, i]));
  const rank = (d: Diagnostic) => fileIndex.get(d.range.file) ?? program.files.length;
  return [...diagnostics].sort(
    (a, b) => rank(a) - rank(b) || a.range.line - b.range.line || a.range.col - b.range.col,
  );
}
