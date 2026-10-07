import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_LIMITS } from '../types';
import { countTokens } from './count-tokens';
import { tokenize, utf8Length } from './lexer';
import type { TokenKind } from './token';

const lex = (text: string, limits = DEFAULT_LIMITS) => tokenize({ name: 'main.sprout', text }, limits);
const kinds = (text: string): TokenKind[] => lex(text).tokens.map((t) => t.kind);
const texts = (text: string): string[] =>
  lex(text)
    .tokens.filter(
      (t) => t.kind !== 'NEWLINE' && t.kind !== 'INDENT' && t.kind !== 'DEDENT' && t.kind !== 'EOF',
    )
    .map((t) => t.text);
const codes = (text: string): string[] => lex(text).diagnostics.map((d) => d.code);

describe('tokenize: tokens and spans', () => {
  it('splits names, keywords, ints, strings and operators (language-spec.md §Lexical structure)', () => {
    expect(texts('if x >= 10: plant(RADISH)')).toEqual([
      'if',
      'x',
      '>=',
      '10',
      ':',
      'plant',
      '(',
      'RADISH',
      ')',
    ]);
    expect(kinds('if x')).toEqual(['KEYWORD', 'NAME', 'NEWLINE', 'EOF']);
  });

  it('gives every token a 1-based line/col and 0-based offset/length (interpreter-vm.md §Lexer)', () => {
    const [a, b] = lex('ab = 7').tokens;
    expect(a).toMatchObject({
      kind: 'NAME',
      text: 'ab',
      line: 1,
      col: 1,
      offset: 0,
      length: 2,
      file: 'main.sprout',
    });
    expect(b).toMatchObject({ kind: 'OP', text: '=', line: 1, col: 4, offset: 3, length: 1 });
    const second = lex('x\n  y').tokens.find((t) => t.text === 'y');
    expect(second).toMatchObject({ line: 2, col: 3, offset: 4 });
  });

  it('matches the longest operator first (`//=` before `//` before `/`)', () => {
    expect(texts('a //= b // c / d == e != f <= g')).toEqual([
      'a',
      '//=',
      'b',
      '//',
      'c',
      '/',
      'd',
      '==',
      'e',
      '!=',
      'f',
      '<=',
      'g',
    ]);
  });

  it('lexes `/` as an operator so the parser can offer the E-SLASH-DIVISION fix-it', () => {
    expect(kinds('a / 2')).toEqual(['NAME', 'OP', 'INT', 'NEWLINE', 'EOF']);
    expect(codes('a / 2')).toEqual([]);
  });

  it('treats comments as nothing: no token, no count', () => {
    expect(texts('x = 1  # set x\n# whole line\ny = 2')).toEqual(['x', '=', '1', 'y', '=', '2']);
    expect(countTokens([{ name: 'main.sprout', text: '# only a comment' }])).toBe(0);
  });

  it('accepts \\r\\n and \\r line endings as one NEWLINE', () => {
    expect(kinds('a\r\nb\rc')).toEqual(['NAME', 'NEWLINE', 'NAME', 'NEWLINE', 'NAME', 'NEWLINE', 'EOF']);
  });
});

describe('tokenize: integers', () => {
  it('allows `_` between digits and decodes the value (`1_000`)', () => {
    const [t] = lex('1_000').tokens;
    expect(t).toMatchObject({ kind: 'INT', text: '1_000', value: 1000 });
  });

  it('stops a number at a trailing or doubled underscore (Python rule), leaving the rest to the next token', () => {
    expect(texts('1_')).toEqual(['1', '_']);
    expect(texts('1__0')).toEqual(['1', '__0']);
  });

  it('rejects leading zeros with a fix-it that removes them (E-LEADING-ZERO)', () => {
    const { diagnostics } = lex('x = 007');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'E-LEADING-ZERO', range: { line: 1, col: 5, endCol: 8 } });
    expect(diagnostics[0]?.fix?.edits[0]?.newText).toBe('7');
    expect(codes('0')).toEqual([]);
  });

  it('rejects integers above 9,007,199,254,740,991 (E-INT-TOO-BIG) and accepts the limit itself', () => {
    expect(codes('9007199254740991')).toEqual([]);
    expect(codes('9007199254740992')).toEqual(['E-INT-TOO-BIG']);
    expect(codes('99999999999999999999')).toEqual(['E-INT-TOO-BIG']);
    expect(lex('9007199254740991').tokens[0]?.value).toBe(9007199254740991);
  });
});

describe('tokenize: strings', () => {
  it('decodes the five escapes and keeps either quote style', () => {
    expect(lex(String.raw`"a\n\t\\\"b"`).tokens[0]?.value).toBe('a\n\t\\"b');
    expect(lex(String.raw`'it\'s'`).tokens[0]?.value).toBe("it's");
  });

  it('reports unknown escapes (E-BAD-ESCAPE) but keeps lexing', () => {
    const { tokens, diagnostics } = lex(String.raw`"a\qb" + 1`);
    expect(diagnostics.map((d) => d.code)).toEqual(['E-BAD-ESCAPE']);
    expect(tokens.map((t) => t.kind)).toEqual(['STRING', 'OP', 'INT', 'NEWLINE', 'EOF']);
  });

  it('reports a missing closing quote on the same line (E-UNTERMINATED-STRING) as an ERROR token', () => {
    const { tokens, diagnostics } = lex('x = "hello\ny = 2');
    expect(diagnostics.map((d) => d.code)).toEqual(['E-UNTERMINATED-STRING']);
    expect(tokens.map((t) => t.kind)).toEqual([
      'NAME',
      'OP',
      'ERROR',
      'NEWLINE',
      'NAME',
      'OP',
      'INT',
      'NEWLINE',
      'EOF',
    ]);
  });

  it('rejects literals longer than 256 characters (E-STRING-TOO-LONG) by decoded length', () => {
    expect(codes(`"${'a'.repeat(256)}"`)).toEqual([]);
    expect(codes(`"${'a'.repeat(257)}"`)).toEqual(['E-STRING-TOO-LONG']);
  });
});

describe('tokenize: identifiers', () => {
  it('distinguishes keywords from names, case-sensitively', () => {
    expect(kinds('True true None none')).toEqual(['KEYWORD', 'NAME', 'KEYWORD', 'NAME', 'NEWLINE', 'EOF']);
  });

  it('rejects names longer than 32 characters (E-IDENT-TOO-LONG)', () => {
    expect(codes('a'.repeat(32))).toEqual([]);
    expect(codes('a'.repeat(33))).toEqual(['E-IDENT-TOO-LONG']);
  });
});

describe('tokenize: indentation', () => {
  it('emits INDENT/DEDENT around a block and balances them at EOF', () => {
    expect(kinds('if x:\n    y\nz')).toEqual([
      'KEYWORD',
      'NAME',
      'OP',
      'NEWLINE',
      'INDENT',
      'NAME',
      'NEWLINE',
      'DEDENT',
      'NAME',
      'NEWLINE',
      'EOF',
    ]);
    expect(kinds('if x:\n    y')).toEqual([
      'KEYWORD',
      'NAME',
      'OP',
      'NEWLINE',
      'INDENT',
      'NAME',
      'NEWLINE',
      'DEDENT',
      'EOF',
    ]);
  });

  it('counts a tab as 4 spaces (language-spec.md §Lexical structure)', () => {
    expect(kinds('if x:\n\ty\n    z')).toEqual([
      'KEYWORD',
      'NAME',
      'OP',
      'NEWLINE',
      'INDENT',
      'NAME',
      'NEWLINE',
      'NAME',
      'NEWLINE',
      'DEDENT',
      'EOF',
    ]);
    expect(codes('if x:\n\ty\n    z')).toEqual([]);
  });

  it('ignores blank and comment-only lines for indentation, whatever their own indentation', () => {
    const src = 'if x:\n    y\n\n        # deep comment\n  \n    z\nw';
    expect(kinds(src)).toEqual([
      'KEYWORD',
      'NAME',
      'OP',
      'NEWLINE',
      'INDENT',
      'NAME',
      'NEWLINE',
      'NAME',
      'NEWLINE',
      'DEDENT',
      'NAME',
      'NEWLINE',
      'EOF',
    ]);
    expect(codes(src)).toEqual([]);
  });

  it('closes several blocks at once', () => {
    expect(kinds('a:\n  b:\n    c\nd').filter((k) => k === 'DEDENT')).toHaveLength(2);
  });

  it('reports a dedent to a level that was never opened (E-MIXED-INDENT) with a fix-it to the nearest level', () => {
    const { diagnostics, tokens } = lex('if x:\n    y\n  z');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'E-MIXED-INDENT', range: { line: 3, col: 1, endCol: 3 } });
    expect(diagnostics[0]?.fix?.edits[0]?.newText).toBe('');
    expect(tokens.filter((t) => t.kind === 'DEDENT')).toHaveLength(1);
  });
});

describe('tokenize: implicit line joining', () => {
  it('ignores newlines and indentation inside (), [] and {}', () => {
    const src = 'f(1,\n      2,\n  [3,\n4], {\n5: 6})\nz';
    const ks = kinds(src);
    expect(ks.filter((k) => k === 'NEWLINE')).toHaveLength(2);
    expect(ks).not.toContain('INDENT');
    expect(codes(src)).toEqual([]);
  });

  it('does not let an unmatched closing bracket drive the depth negative', () => {
    expect(kinds(')\nx')).toEqual(['OP', 'NEWLINE', 'NAME', 'NEWLINE', 'EOF']);
  });
});

describe('tokenize: errors and recovery', () => {
  it('turns an unknown character into an ERROR token and keeps going (E-UNEXPECTED-CHAR)', () => {
    const { tokens, diagnostics } = lex('x = 1 $ y ? 2 €');
    expect(diagnostics.map((d) => d.code)).toEqual([
      'E-UNEXPECTED-CHAR',
      'E-UNEXPECTED-CHAR',
      'E-UNEXPECTED-CHAR',
    ]);
    expect(tokens.filter((t) => t.kind === 'ERROR').map((t) => t.text)).toEqual(['$', '?', '€']);
    expect(tokens.filter((t) => t.kind === 'NAME').map((t) => t.text)).toEqual(['x', 'y']);
  });

  it('keeps an astral character together as one ERROR token', () => {
    const errors = lex('x 😀 y').tokens.filter((t) => t.kind === 'ERROR');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.text).toBe('😀');
  });

  it('rejects a file over maxSourceBytes with E-SRC-TOO-BIG and lexes nothing else', () => {
    const { tokens, diagnostics } = lex('x'.repeat(20), { ...DEFAULT_LIMITS, maxSourceBytes: 16 });
    expect(diagnostics.map((d) => d.code)).toEqual(['E-SRC-TOO-BIG']);
    expect(tokens.map((t) => t.kind)).toEqual(['EOF']);
  });

  it('measures the size in UTF-8 bytes, not characters', () => {
    expect(utf8Length('a')).toBe(1);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('€')).toBe(3);
    expect(utf8Length('😀')).toBe(4);
  });
});

describe('countTokens (scoring-and-judging.md §Token count)', () => {
  it('counts NAME, KEYWORD, INT, STRING and OP over all files, and nothing else', () => {
    const files = [
      { name: 'helpers.sprout', text: 'def tend():\n    if is_ripe():\n        harvest()  # pop\n' },
      { name: 'main.sprout', text: 'while True:\n    tend()\n    sell(RADISH, 1_000)\n' },
    ];
    // helpers: def tend ( ) : if is_ripe ( ) : harvest ( ) = 13; main: while True : tend ( ) sell ( RADISH , 1_000 ) = 12
    expect(countTokens(files)).toBe(25);
  });

  it('counts a literal as one token and excludes ERROR tokens', () => {
    expect(countTokens([{ name: 'main.sprout', text: '"a b c" 1_000 $' }])).toBe(2);
  });

  it('gives the idle program 0 tokens', () => {
    expect(countTokens([])).toBe(0);
    expect(countTokens([{ name: 'main.sprout', text: '' }])).toBe(0);
  });
});

describe('tokenize: properties', () => {
  it('never throws, always ends with EOF, and balances INDENT/DEDENT on any input', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (text) => {
        const { tokens } = lex(text);
        expect(tokens[tokens.length - 1]?.kind).toBe('EOF');
        const indents = tokens.filter((t) => t.kind === 'INDENT').length;
        const dedents = tokens.filter((t) => t.kind === 'DEDENT').length;
        expect(indents).toBe(dedents);
      }),
      { numRuns: 300 },
    );
  });

  it('produces tokens in non-decreasing offset order that lie within the source', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const { tokens } = lex(text);
        let last = 0;
        for (const t of tokens) {
          expect(t.offset).toBeGreaterThanOrEqual(last);
          expect(t.offset + t.length).toBeLessThanOrEqual(text.length);
          last = t.offset;
        }
      }),
      { numRuns: 300 },
    );
  });
});
