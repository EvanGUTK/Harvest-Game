import { describe, expect, it } from 'vitest';
import { CORPUS } from '../test-support/corpus';
import { DEFAULT_LIMITS, type Diagnostic } from '../types';
import { parse } from './parser';
import { outlineFile } from './sexpr';

/** Files the corpus expects to be free of diagnostics (every file except the deliberate error file). */
const CLEAN = new Set(CORPUS.map((f) => f.name).filter((name) => name !== 'errors.sprout'));

const diagnosticLine = (d: Diagnostic): string =>
  `${d.code} ${String(d.range.line)}:${String(d.range.col)}-${String(d.range.endLine)}:${String(d.range.endCol)} ${d.message}`;

describe('parser corpus snapshots (LANG-06.1; interpreter-vm.md §Testing: AST snapshots of the corpus)', () => {
  for (const file of CORPUS) {
    it(`parses ${file.name} to its snapshot AST and diagnostics`, () => {
      const result = parse([file], DEFAULT_LIMITS);
      const node = result.program.files[0];
      if (node === undefined) throw new Error(`no file node for ${file.name}`);
      expect(
        [outlineFile(node), '--- diagnostics ---', ...result.diagnostics.map(diagnosticLine)].join('\n'),
      ).toMatchSnapshot();
      if (CLEAN.has(file.name)) expect(result.diagnostics).toEqual([]);
    });
  }
});
