import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_LIMITS } from '../types';
import { countTokens } from './count-tokens';
import { tokenize } from './lexer';
import { utf8Length } from './utf8';
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
    // 400 source characters decode to 200: no error
    expect(codes(`"${'\\n'.repeat(200)}"`)).toEqual([]);
    // UTF-16 code units: an astral character counts 2
    expect(codes(`"${'😀'.repeat(128)}"`)).toEqual([]);
    expect(codes(`"${'😀'.repeat(129)}"`)).toEqual(['E-STRING-TOO-LONG']);
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

describe('tokenize: review cases (LANG-01 reviewer)', () => {
  it('does not treat the rest of a line as indentation after a bracket closes mid-line', () => {
    expect(kinds('x = f(1,\n2) + 3')).toEqual([
      'NAME',
      'OP',
      'NAME',
      'OP',
      'INT',
      'OP',
      'INT',
      'OP',
      'OP',
      'INT',
      'NEWLINE',
      'EOF',
    ]);
    const src = 'if x:\n    y = [\n1,\n2] + z\n    w';
    expect(codes(src)).toEqual([]);
    expect(kinds(src).filter((k) => k === 'INDENT' || k === 'DEDENT')).toEqual(['INDENT', 'DEDENT']);
  });

  it('places INDENT and DEDENT only at the start of a logical line', () => {
    const { tokens } = lex('if x:\n    y = (1,\n  2)\n    z\nw');
    tokens.forEach((t, i) => {
      if (t.kind === 'INDENT' || t.kind === 'DEDENT') {
        const prev = tokens[i - 1]?.kind;
        expect(prev === undefined || prev === 'NEWLINE' || prev === 'INDENT' || prev === 'DEDENT').toBe(true);
      }
    });
  });

  it('checks maxSourceBytes at the boundary, in UTF-8 bytes', () => {
    const limits = { ...DEFAULT_LIMITS, maxSourceBytes: 16 };
    expect(lex('x'.repeat(16), limits).diagnostics).toHaveLength(0);
    expect(codes('x'.repeat(17))).toEqual([]);
    expect(lex('x'.repeat(17), limits).diagnostics.map((d) => d.code)).toEqual(['E-SRC-TOO-BIG']);
    expect(lex('€'.repeat(5) + 'x', limits).diagnostics).toHaveLength(0); // 15 + 1 = 16 bytes
    expect(lex('€'.repeat(5) + 'xx', limits).diagnostics.map((d) => d.code)).toEqual(['E-SRC-TOO-BIG']);
    expect(countTokens([{ name: 'main.sprout', text: 'x '.repeat(10_000) }])).toBe(0);
  });

  it('fixes E-MIXED-INDENT to the enclosing level, including a non-zero one and with tabs', () => {
    const { diagnostics } = lex('a:\n    b:\n        c\n      d');
    expect(diagnostics.map((d) => d.code)).toEqual(['E-MIXED-INDENT']);
    expect(diagnostics[0]?.fix?.edits[0]?.newText).toBe('    ');
    expect(codes('a:\n\tb\n  c')).toEqual(['E-MIXED-INDENT']);
  });

  it('does not cascade E-MIXED-INDENT onto following lines at the same odd width', () => {
    expect(codes('if x:\n    y\n  z\n  w\nv')).toEqual(['E-MIXED-INDENT']);
  });

  it('emits a silent INDENT for an over-indented line (the parser reports E-BAD-INDENT)', () => {
    expect(kinds('if x:\n  a\n    b')).toContain('INDENT');
    expect(codes('if x:\n  a\n    b')).toEqual([]);
  });

  it('lexes every operator in the table and rejects a lone `!`', () => {
    const ops = [
      '//=',
      '//',
      '==',
      '!=',
      '<=',
      '>=',
      '+=',
      '-=',
      '*=',
      '%=',
      '/=',
      '+',
      '-',
      '*',
      '%',
      '/',
      '=',
      '<',
      '>',
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      ',',
      ':',
      '.',
    ];
    for (const op of ops) {
      const [t] = lex(`a ${op} b`).tokens.filter((x) => x.kind === 'OP');
      expect(t?.text).toBe(op);
    }
    expect(codes('a ! b')).toEqual(['E-UNEXPECTED-CHAR']);
  });

  it('pins juxtaposed forms the parser must reject: `**` is `* *`, `1.5` is `INT . INT`, `12abc` is `INT NAME`', () => {
    expect(texts('a ** b')).toEqual(['a', '*', '*', 'b']);
    expect(texts('1.5')).toEqual(['1', '.', '5']);
    expect(texts('12abc')).toEqual(['12', 'abc']);
  });

  it('tracks line and col across \\r\\n and lone \\r, and a NEWLINE token covers its line ending', () => {
    const { tokens } = lex('a\r\nb\rc');
    expect(tokens.find((t) => t.text === 'b')).toMatchObject({ line: 2, col: 1, offset: 3 });
    expect(tokens.find((t) => t.text === 'c')).toMatchObject({ line: 3, col: 1, offset: 5 });
    expect(tokens[1]).toMatchObject({ kind: 'NEWLINE', text: '\r\n', length: 2 });
  });

  it('counts a tab as one column but four indentation spaces, and a space before a tab as width 5', () => {
    expect(lex('\tx').tokens.find((t) => t.text === 'x')).toMatchObject({ col: 2 });
    expect(kinds('if a:\n \tb\n     c')).not.toContain('ERROR');
    expect(codes('if a:\n \tb\n     c')).toEqual([]);
  });

  it('spans a bad escape with an astral character over the whole code point', () => {
    const { diagnostics, tokens } = lex('"\\😀"');
    expect(diagnostics[0]).toMatchObject({ code: 'E-BAD-ESCAPE', range: { col: 2, endCol: 5 } });
    expect(tokens[0]).toMatchObject({ kind: 'STRING', value: '\\😀' });
  });

  it('reports only E-UNTERMINATED-STRING for a string ending in a backslash', () => {
    expect(codes('"abc\\')).toEqual(['E-UNTERMINATED-STRING']);
    expect(codes('"abc\\\nx')).toEqual(['E-UNTERMINATED-STRING']);
  });

  it('drops underscores in the leading-zero fix-it', () => {
    expect(lex('007_000').diagnostics[0]?.fix?.edits[0]?.newText).toBe('7000');
  });

  it('lets an unclosed bracket swallow the rest of the file without NEWLINE or INDENT (the parser reports it)', () => {
    expect(kinds('f(1,\n\nz = 1')).toEqual([
      'NAME',
      'OP',
      'INT',
      'OP',
      'NAME',
      'OP',
      'INT',
      'NEWLINE',
      'EOF',
    ]);
  });
});

describe('tokenize: properties', () => {
  const alphabet = fc.constantFrom(
    ' ',
    ' ',
    '\t',
    '\n',
    '\r\n',
    '\r',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    '"',
    "'",
    '\\',
    '#',
    'a',
    'if',
    '1',
    '0',
    '_',
    ':',
    '/',
    '//',
    '=',
    '==',
    '€',
    '😀',
    'x = 1',
    'if a:\n    b',
  );
  const source = fc.array(alphabet, { maxLength: 40 }).map((parts) => parts.join(''));

  const lineCol = (text: string, offset: number): { line: number; col: number } => {
    let line = 1;
    let col = 1;
    for (let i = 0; i < offset; i += 1) {
      const ch = text[i];
      if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) {
        line += 1;
        col = 1;
      } else if (ch !== '\r') {
        col += 1;
      }
    }
    return { line, col };
  };

  it('never throws, ends with EOF and balances INDENT/DEDENT on any input', () => {
    fc.assert(
      fc.property(source, (text) => {
        const { tokens } = lex(text);
        expect(tokens[tokens.length - 1]?.kind).toBe('EOF');
        expect(tokens.filter((t) => t.kind === 'INDENT')).toHaveLength(
          tokens.filter((t) => t.kind === 'DEDENT').length,
        );
      }),
      { numRuns: 500 },
    );
  });

  it('every token text is the exact source slice, tokens never overlap, and line/col match the offset', () => {
    fc.assert(
      fc.property(source, (text) => {
        const { tokens } = lex(text);
        let end = 0;
        for (const t of tokens) {
          expect(t.offset).toBeGreaterThanOrEqual(end);
          expect(text.slice(t.offset, t.offset + t.length)).toBe(t.text);
          expect(lineCol(text, t.offset)).toEqual({ line: t.line, col: t.col });
          end = t.offset + t.length;
        }
        expect(end).toBeLessThanOrEqual(text.length);
      }),
      { numRuns: 500 },
    );
  });

  it('INDENT and DEDENT only ever follow NEWLINE, INDENT, DEDENT or the start of the file', () => {
    fc.assert(
      fc.property(source, (text) => {
        const { tokens } = lex(text);
        tokens.forEach((t, i) => {
          if (t.kind !== 'INDENT' && t.kind !== 'DEDENT') return;
          const prev = tokens[i - 1]?.kind;
          expect(prev === undefined || prev === 'NEWLINE' || prev === 'INDENT' || prev === 'DEDENT').toBe(
            true,
          );
        });
      }),
      { numRuns: 500 },
    );
  });
});
