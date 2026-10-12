import { describe, expect, it } from 'vitest';
import { InvariantError } from '../invariant';
import { countTokens } from '../lexer/count-tokens';
import { TEST_OPTIONS } from '../test-support/check-options';
import { CORPUS } from '../test-support/corpus';
import type { CompileOptions, SourceFiles } from '../types';
import { LANGUAGE_VERSION } from '../version';
import { moduleData } from './bytecode';
import { compile } from './compile';

const OPTIONS: CompileOptions = { ...TEST_OPTIONS, languageVersion: LANGUAGE_VERSION };
const main = (text: string): SourceFiles => [{ name: 'main.sprout', text }];

describe('compile() (interpreter-vm.md §Public API: LangEngine.compile → CompileResult)', () => {
  it('returns a validated module, the token count and the warnings for a correct program', () => {
    const source = main('spare = 1\nmove(EAST)\n');
    const result = compile(source, OPTIONS);
    if (!result.ok) throw new Error('expected the program to compile');
    expect(result.tokenCount).toBe(countTokens(source));
    expect(moduleData(result.module).tokenCount).toBe(result.tokenCount);
    expect(result.module.languageVersion).toBe(LANGUAGE_VERSION);
    expect(result.warnings.map((d) => d.code)).toEqual(['W-UNUSED-VAR']);
  });

  it('reports parse errors alone, without checker noise about statements the parser dropped', () => {
    const result = compile(main('x = )\nprint(x)\n'), OPTIONS);
    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'E-UNEXPECTED-TOKEN' })],
    });
  });

  it('reports every check error together with the warnings, in source order', () => {
    const result = compile(main('spare = 1\nharvset()\n'), OPTIONS);
    if (result.ok) throw new Error('expected errors');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['W-UNUSED-VAR', 'E-UNKNOWN-NAME']);
  });

  for (const name of ['spec-example.sprout', 'starter-showdown.sprout']) {
    it(`compiles ${name} with no diagnostics`, () => {
      const file = CORPUS.find((f) => f.name === name);
      if (file === undefined) throw new Error(`no corpus file ${name}`);
      const result = compile(main(file.text), OPTIONS);
      expect(result.ok && result.warnings).toEqual([]);
    });
  }

  it('throws LANG-VERSION-MISMATCH when called for another language version (a host bug, never a diagnostic)', () => {
    expect(() => compile(main('pass\n'), { ...OPTIONS, languageVersion: '9.9.9' })).toThrow(InvariantError);
  });
});
