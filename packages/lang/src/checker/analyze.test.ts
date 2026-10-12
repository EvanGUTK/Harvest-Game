import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parser';
import { TEST_OPTIONS } from '../test-support/check-options';
import { analyze } from './analyze';

const analyzeText = (text: string) =>
  analyze(parse([{ name: 'main.sprout', text }], TEST_OPTIONS.limits).program, TEST_OPTIONS);

describe('analyze (interpreter-vm.md §Pipeline: the checker stage)', () => {
  it('splits errors from warnings and hints, each in source order', () => {
    const result = analyzeText('spare = 1\nharvset()\nwhile True:\n    pass\nx = 1\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['E-UNKNOWN-NAME']);
    expect(result.warnings.map((d) => [d.code, d.severity])).toEqual([
      ['W-UNUSED-VAR', 'hint'],
      ['W-PURE-INFINITE-LOOP', 'warning'],
      ['W-UNREACHABLE', 'warning'],
      ['W-UNUSED-VAR', 'hint'],
    ]);
  });

  it('returns the name resolution it checked with, for the compiler', () => {
    const result = analyzeText('total = 0\ndef f(a):\n    return a + total\n');
    expect(result.scopes.globals).toEqual(['total', 'f']);
    expect([...result.scopes.functions.values()].map((f) => f.locals)).toEqual([['a']]);
  });

  it('reports nothing for a clean program', () => {
    const result = analyzeText('move(EAST)\n');
    expect(result.diagnostics).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
