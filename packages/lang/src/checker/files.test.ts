import { describe, expect, it } from 'vitest';
import { checkSources, TEST_OPTIONS } from '../test-support/check-options';
import { DEFAULT_LIMITS, type SourceFile } from '../types';

const def = (name: string): string => `def ${name}():\n    pass\n`;

describe('E-DUPLICATE-DEF (errors-and-diagnostics.md: "`tend` is defined in two files: `main.sprout` and `helpers.sprout`. Keep one.")', () => {
  it('reports the later def (in run order) at its name, naming both files', () => {
    const files: SourceFile[] = [
      { name: 'main.sprout', text: `x = 1\n${def('tend')}` },
      { name: 'helpers.sprout', text: def('tend') },
    ];
    expect(checkSources(files)).toEqual([
      {
        code: 'E-DUPLICATE-DEF',
        severity: 'error',
        range: { file: 'main.sprout', line: 2, col: 5, endLine: 2, endCol: 9 },
        message: '`tend` is defined in two files: `main.sprout` and `helpers.sprout`. Keep one.',
      },
    ]);
  });

  it('lets a later def in the same file rebind the name, as in Python', () => {
    expect(checkSources(`${def('tend')}${def('tend')}`)).toEqual([]);
  });

  it('reports each later file against the first one', () => {
    const files: SourceFile[] = [
      { name: 'a.sprout', text: def('go') },
      { name: 'b.sprout', text: def('go') },
      { name: 'main.sprout', text: def('go') },
    ];
    expect(checkSources(files).map((d) => [d.range.file, d.message])).toEqual([
      ['b.sprout', '`go` is defined in two files: `b.sprout` and `a.sprout`. Keep one.'],
      ['main.sprout', '`go` is defined in two files: `main.sprout` and `a.sprout`. Keep one.'],
    ]);
  });
});

describe('E-TOO-MANY-FILES (language-spec.md §Files; limits.maxFiles)', () => {
  const helpers = (n: number): SourceFile[] =>
    Array.from({ length: n }, (_, i) => ({ name: `h${String(i)}.sprout`, text: 'pass\n' }));

  it('accepts exactly maxFiles files', () => {
    expect(checkSources([...helpers(9), { name: 'main.sprout', text: 'pass\n' }])).toEqual([]);
  });

  it('reports one file too many once, at the first file that does not fit', () => {
    expect(checkSources([...helpers(10), { name: 'main.sprout', text: 'pass\n' }])).toEqual([
      {
        code: 'E-TOO-MANY-FILES',
        severity: 'error',
        range: { file: 'h9.sprout', line: 1, col: 1, endLine: 1, endCol: 1 },
        message: 'Your program can have at most 10 files.',
      },
    ]);
  });

  it('uses the showdown wording when the limit is 1, and points at the extra file, never main.sprout', () => {
    const options = { ...TEST_OPTIONS, limits: { ...DEFAULT_LIMITS, maxFiles: 1 } };
    const files: SourceFile[] = [
      { name: 'main.sprout', text: 'pass\n' },
      { name: 'extra.sprout', text: 'pass\n' },
    ];
    expect(checkSources(files, options)).toMatchObject([
      {
        code: 'E-TOO-MANY-FILES',
        range: { file: 'extra.sprout' },
        message: 'A showdown program can have only 1 file.',
      },
    ]);
  });
});
