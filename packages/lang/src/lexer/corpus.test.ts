import { describe, expect, it } from 'vitest';
import { CORPUS } from '../test-support/corpus';
import { DEFAULT_LIMITS } from '../types';
import { tokenize } from './lexer';

describe('lexer corpus snapshots (LANG-06.1; deferred from LANG-01 to the shared corpus)', () => {
  for (const file of CORPUS) {
    it(`tokenizes ${file.name} to its snapshot token stream`, () => {
      const { tokens, diagnostics } = tokenize(file, DEFAULT_LIMITS);
      const lines = tokens.map(
        (t) => `${String(t.line)}:${String(t.col)} ${t.kind} ${JSON.stringify(t.text)}`,
      );
      expect(
        [...lines, '--- diagnostics ---', ...diagnostics.map((d) => d.code)].join('\n'),
      ).toMatchSnapshot();
    });
  }
});
