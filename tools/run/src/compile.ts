/**
 * Compiles one program for a showdown slot: the step `sprout run` and the balance harness share.
 * Design: docs/03-architecture/simulation-engine.md §Public API (`PlayerInput`), scoring-and-judging.md §Idle program.
 * Invariants: a program that does not compile becomes the idle program (module null) carrying its first diagnostic,
 * as on the server; the showdown limits apply and nothing is locked.
 */

import { DEFAULT_LIMITS, LANGUAGE_VERSION } from '@harvest/lang';
import type { Diagnostic, SourceFiles } from '@harvest/lang';
import type { PlayerInput } from '@harvest/sim';
import type { Runtime } from './runtime';

export type CompiledProgram = {
  input: PlayerInput;
  /** False when the program did not compile and plays as the idle program. */
  compiled: boolean;
  /** Errors when it did not compile, warnings when it did. */
  diagnostics: readonly Diagnostic[];
};

/** Compiles `files` for `slot` with the runtime's compiler and host tables. */
export function compileProgram(
  runtime: Pick<Runtime, 'engine' | 'hostSignatures' | 'constants'>,
  slot: number,
  files: SourceFiles,
): CompiledProgram {
  const result = runtime.engine.compile(files, {
    languageVersion: LANGUAGE_VERSION,
    hostSignatures: runtime.hostSignatures,
    constants: runtime.constants,
    lockedFeatures: new Map(),
    lockedNames: new Map(),
    limits: DEFAULT_LIMITS,
  });
  if (result.ok) {
    return { input: { slot, module: result.module }, compiled: true, diagnostics: result.warnings };
  }
  const first = result.diagnostics[0];
  const input: PlayerInput =
    first === undefined
      ? { slot, module: null }
      : { slot, module: null, compileError: { code: first.code, line: first.range.line } };
  return { input, compiled: false, diagnostics: result.diagnostics };
}
