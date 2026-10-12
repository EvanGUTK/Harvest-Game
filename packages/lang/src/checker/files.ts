/**
 * Whole-program file rules: E-TOO-MANY-FILES and E-DUPLICATE-DEF.
 * Spec: docs/02-language/language-spec.md §Files; docs/03-architecture/interpreter-vm.md §Checker.
 * Invariants: files are visited in run order (the order `Program.files` already has), so "later" means
 * later in run order; only top-level defs take part (a nested def is already E-NESTED-DEF).
 */

import type { Program } from '../parser/ast';
import type { Diagnostic, Limits, Span } from '../types';
import { duplicateDef, tooManyFiles } from './diagnostics';

/**
 * More files than `limits.maxFiles`: reported once, at the start of the file in run-order slot
 * `maxFiles - 1`. `main.sprout` runs last, so that slot is always a file the player can remove.
 */
export function checkFileCount(program: Program, limits: Limits): Diagnostic[] {
  if (program.files.length <= limits.maxFiles) return [];
  const extra = program.files[Math.max(0, limits.maxFiles - 1)] ?? program.files[0];
  if (extra === undefined) return [];
  const range: Span = { file: extra.name, line: 1, col: 1, endLine: 1, endCol: 1 };
  return [tooManyFiles(range, limits.maxFiles)];
}

/** The same function name defined at the top level of two different files. */
export function checkDuplicateDefs(program: Program): Diagnostic[] {
  const firstFile = new Map<string, string>();
  const diagnostics: Diagnostic[] = [];
  for (const file of program.files) {
    for (const stmt of file.body) {
      if (stmt.type !== 'DefStmt') continue;
      const name = stmt.name.name;
      const first = firstFile.get(name);
      if (first === undefined) firstFile.set(name, file.name);
      else if (first !== file.name) diagnostics.push(duplicateDef(stmt.name.span, name, file.name, first));
    }
  }
  return diagnostics;
}
