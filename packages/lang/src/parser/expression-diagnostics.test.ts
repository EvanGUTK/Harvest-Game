import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type Diagnostic, type Limits, type Span, type TextEdit } from '../types';
import { parse } from './parser';
import { sexprProgram } from './sexpr';

const parseMain = (text: string, limits: Limits = DEFAULT_LIMITS) =>
  parse([{ name: 'main.sprout', text }], limits);
const codes = (text: string, limits: Limits = DEFAULT_LIMITS): string[] =>
  parseMain(text, limits).diagnostics.map((d) => d.code);
const only = (text: string): Diagnostic => {
  const { diagnostics } = parseMain(text);
  expect(diagnostics).toHaveLength(1);
  const [first] = diagnostics;
  if (first === undefined) throw new Error('expected one diagnostic');
  return first;
};

const span = (line: number, col: number, endLine: number, endCol: number): Span => ({
  file: 'main.sprout',
  line,
  col,
  endLine,
  endCol,
});

/** Applies fix-it edits (1-based line/col, UTF-16 columns) to `text`, last edit first. */
function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') lineStarts.push(i + 1);
  const offset = (line: number, col: number) => (lineStarts[line - 1] ?? 0) + col - 1;
  const ordered = [...edits].sort(
    (a, b) => offset(b.span.line, b.span.col) - offset(a.span.line, a.span.col),
  );
  let out = text;
  for (const edit of ordered) {
    out =
      out.slice(0, offset(edit.span.line, edit.span.col)) +
      edit.newText +
      out.slice(offset(edit.span.endLine, edit.span.endCol));
  }
  return out;
}

describe('E-SLASH-DIVISION (errors-and-diagnostics.md: "Sprout uses whole numbers. Use `//` for division.")', () => {
  it('reports `/` with the catalogue wording and a fix-it that replaces it with `//`', () => {
    const diagnostic = only('a / 2');
    expect(diagnostic).toEqual({
      code: 'E-SLASH-DIVISION',
      severity: 'error',
      range: span(1, 3, 1, 4),
      message: 'Sprout uses whole numbers. Use `//` for division.',
      fix: { label: 'Change `/` to `//`', edits: [{ span: span(1, 3, 1, 4), newText: '//' }] },
    });
  });

  it('reads `/` as `//`, so the rest of the expression is still checked', () => {
    expect(sexprProgram(parseMain('a / 2 + b').program)).toBe('(file "main.sprout" (expr (+ (// a 2) b)))');
  });

  it('has a fix-it whose result re-parses without the diagnostic', () => {
    const source = 'x // 2 + a / b / c';
    const fixes = parseMain(source).diagnostics.flatMap((d) => d.fix?.edits ?? []);
    expect(fixes).toHaveLength(2);
    const fixed = applyEdits(source, fixes);
    expect(fixed).toBe('x // 2 + a // b // c');
    expect(codes(fixed)).toEqual([]);
  });
});

describe('E-NO-POWER (errors-and-diagnostics.md: "Sprout has no `**`. Multiply the number by itself instead.")', () => {
  it('reports `**` as one diagnostic over both stars', () => {
    expect(only('a ** 2')).toMatchObject({
      code: 'E-NO-POWER',
      range: span(1, 3, 1, 5),
      message: 'Sprout has no `**`. Multiply the number by itself instead.',
    });
  });

  it('reports `**=` (lexed `*` `*=`) the same way', () => {
    expect(only('a **= 2')).toMatchObject({ code: 'E-NO-POWER', range: span(1, 3, 1, 6) });
  });

  it('does not mistake `a * *b`-like spacing for `**`', () => {
    expect(codes('a * * b')).toEqual(['E-UNEXPECTED-TOKEN']);
  });
});

describe('E-NO-FLOAT (errors-and-diagnostics.md: "Sprout uses whole numbers, so `1.5` can\'t be used.")', () => {
  it('reports `1.5` (lexed INT `.` INT) as one diagnostic over the whole literal', () => {
    expect(only('x + 1.5')).toMatchObject({
      code: 'E-NO-FLOAT',
      range: span(1, 5, 1, 8),
      message: "Sprout uses whole numbers, so `1.5` can't be used.",
    });
  });

  it('treats spaced-out `1 . 5` as a bad method call, not a decimal', () => {
    expect(codes('1 . 5')).toEqual(['E-UNEXPECTED-TOKEN']);
  });
});

describe('E-UNEXPECTED-TOKEN (errors-and-diagnostics.md: "I didn\'t expect `)` here.")', () => {
  it('names the unexpected token and says what should come instead', () => {
    expect(only('a + )')).toMatchObject({
      code: 'E-UNEXPECTED-TOKEN',
      range: span(1, 5, 1, 6),
      message: "I didn't expect `)` here.",
      help: 'A value should come next: a name, a number, text in quotes, `(` or `[`.',
    });
  });

  it('reports a line that stops in the middle of an expression', () => {
    expect(only('a +')).toMatchObject({
      code: 'E-UNEXPECTED-TOKEN',
      message: 'This line ends before it is finished.',
    });
  });

  it('reports juxtaposed tokens such as `12abc` over both tokens, with the digit help line', () => {
    expect(only('12abc')).toMatchObject({
      code: 'E-UNEXPECTED-TOKEN',
      range: span(1, 1, 1, 6),
      message: "I didn't expect `12abc` here.",
      help: "Names can't start with a digit.",
    });
    expect(only('f(3x)')).toMatchObject({ range: span(1, 3, 1, 5), help: "Names can't start with a digit." });
  });

  it('asks to remove a trailing comma, which the EBNF does not allow (Python habit)', () => {
    for (const source of ['[1, 2,]', 'f(a,)', '{1: 2,}']) {
      expect(only(source)).toMatchObject({ code: 'E-UNEXPECTED-TOKEN', help: 'Remove the extra comma.' });
    }
  });

  it('allows `.` only for a method call', () => {
    expect(only('a.b')).toMatchObject({
      code: 'E-UNEXPECTED-TOKEN',
      help: 'A method call needs brackets, as in `lst.pop()`.',
    });
    expect(only('a.(1)')).toMatchObject({ help: 'A method name should follow `.`, as in `lst.append(x)`.' });
  });

  it('asks for `:` between a dict key and its value', () => {
    expect(only('{1 2}')).toMatchObject({ help: 'A `:` should come between a key and its value.' });
  });

  it('rejects a keyword that is not a value', () => {
    expect(only('x + while')).toMatchObject({ message: "I didn't expect `while` here." });
  });

  it('adds nothing on top of a lexer ERROR token, which the lexer already reported', () => {
    expect(codes('a + $')).toEqual(['E-UNEXPECTED-CHAR']);
    expect(codes('f("abc)')).toEqual(['E-UNTERMINATED-STRING']);
  });
});

describe('E-UNCLOSED-BRACKET (errors-and-diagnostics.md: "This `(` is never closed.")', () => {
  it('points at the bracket that is never closed when the file ends inside it', () => {
    expect(only('f(1,\n2')).toEqual({
      code: 'E-UNCLOSED-BRACKET',
      severity: 'error',
      range: span(1, 2, 1, 3),
      message: 'This `(` is never closed.',
      help: 'Add a `)` where the brackets should end.',
    });
  });

  it('names the innermost open bracket', () => {
    expect(only('[1, {2: (3')).toMatchObject({ code: 'E-UNCLOSED-BRACKET', range: span(1, 9, 1, 10) });
    expect(only('f([1,')).toMatchObject({ code: 'E-UNCLOSED-BRACKET', message: 'This `[` is never closed.' });
  });

  it('says which closer should come next', () => {
    expect(only('(a b)')).toMatchObject({ code: 'E-UNEXPECTED-TOKEN', help: 'A `)` should come next.' });
    expect(only('a[1 2]')).toMatchObject({ help: 'A `]` should come next.' });
    expect(only('[1 2]')).toMatchObject({ help: 'A `,` or `]` should come next.' });
  });

  it('reports a wrong closer as an unexpected token, not as unclosed', () => {
    expect(only('f(1]')).toMatchObject({
      code: 'E-UNEXPECTED-TOKEN',
      help: 'A `,` or `)` should come next.',
    });
  });
});

describe('E-TOO-DEEP for expressions (language-spec.md §Limits: expression tree height 64)', () => {
  const parens = (n: number) => `${'('.repeat(n)}x${')'.repeat(n)}`;

  it('accepts a height of exactly maxExpressionDepth: a leaf inside 63 parentheses or prefix operators', () => {
    expect(codes(parens(63))).toEqual([]);
    expect(codes(`${'not '.repeat(63)}x`)).toEqual([]);
    expect(codes(`${'-'.repeat(63)}x`)).toEqual([]);
  });

  it('reports one level more, once, at the token where the limit is crossed', () => {
    const { diagnostics } = parseMain(parens(64));
    expect(diagnostics).toEqual([
      {
        code: 'E-TOO-DEEP',
        severity: 'error',
        range: span(1, 65, 1, 66),
        message: 'This expression is nested more than 64 levels deep.',
        help: 'Split it into smaller steps, or move part of it into a function.',
      },
    ]);
  });

  it('counts every kind of bracket and prefix operator toward the same depth', () => {
    // Each `[f(-` adds three levels (list element, call argument, prefix `-`): 1 + 3 × 21 = 64.
    expect(codes(`${'[f(-'.repeat(21)}x${')]'.repeat(21)}`)).toEqual([]);
    expect(codes(`${'[f(-'.repeat(22)}x${')]'.repeat(22)}`)).toEqual(['E-TOO-DEEP']);
  });

  it('follows the limit it is given, not DEFAULT_LIMITS', () => {
    const limits = { ...DEFAULT_LIMITS, maxExpressionDepth: 3 };
    expect(codes('((x))', limits)).toEqual([]);
    expect(codes('(((x)))', limits)).toEqual(['E-TOO-DEEP']);
  });

  it('counts left-deep chains, which the parser builds without recursing (chief ruling 2026-10-11)', () => {
    const sum = (terms: number) => Array.from({ length: terms }, () => 'a').join(' + ');
    // A chain of n terms is n - 1 BinaryExpr nodes stacked on the first leaf: height n.
    expect(codes(sum(64))).toEqual([]);
    expect(parseMain(sum(65)).diagnostics).toMatchObject([
      { code: 'E-TOO-DEEP', range: span(1, 257, 1, 258) },
    ]);
    expect(codes(`f${'()'.repeat(63)}`)).toEqual([]);
    expect(codes(`f${'()'.repeat(64)}`)).toEqual(['E-TOO-DEEP']);
    expect(codes(`x${'[0]'.repeat(64)}`)).toEqual(['E-TOO-DEEP']);
    expect(codes(`x${'.pop()'.repeat(64)}`)).toEqual(['E-TOO-DEEP']);
    expect(codes(Array.from({ length: 65 }, () => 'a').join(' and '))).toEqual(['E-TOO-DEEP']);
  });

  it('leaves a flat comparison chain at height 2, however long', () => {
    expect(codes(Array.from({ length: 2_500 }, () => 'a').join(' < '))).toEqual([]);
  });

  it('counts the comparison that repairs `if x = y:` (E-ASSIGN-IN-IF)', () => {
    const chain = Array.from({ length: 64 }, () => 'a').join(' + ');
    expect(codes(`if ${chain} == 1:\n    pass\n`)).toEqual(['E-TOO-DEEP']);
    expect(codes(`if ${chain} = 1:\n    pass\n`)).toEqual(['E-ASSIGN-IN-IF', 'E-TOO-DEEP']);
  });

  it('never throws on `f` followed by 4,991 `()` or a 2,500-term `+` chain', () => {
    expect(codes(`f${'()'.repeat(4_991)}`)).toEqual(['E-TOO-DEEP']);
    expect(codes(Array.from({ length: 2_500 }, () => 'a').join(' + '))).toEqual(['E-TOO-DEEP']);
  });

  it('never throws on 10,000 levels of brackets or `not`, and keeps parsing the next line', () => {
    // 10,000 levels need more than 16 KB of source, so the source limit is lifted for this test only.
    const roomy = { ...DEFAULT_LIMITS, maxSourceBytes: 100_000 };
    expect(codes(`${'('.repeat(10_000)}x`, roomy)).toEqual(['E-TOO-DEEP']);
    const nots = parseMain(`${'not '.repeat(10_000)}x\ny`, roomy);
    expect(nots.diagnostics.map((d) => d.code)).toEqual(['E-TOO-DEEP']);
    expect(sexprProgram(nots.program)).toBe('(file "main.sprout" (expr y))');
    expect(codes(`${'-'.repeat(10_000)}x`, roomy)).toEqual(['E-TOO-DEEP']);
  });
});

describe('parse: diagnostics and recovery (interpreter-vm.md §Parser)', () => {
  it('reports a bad statement and still parses the statements after it', () => {
    const result = parseMain('a +\nb ** 2\nc');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['E-UNEXPECTED-TOKEN', 'E-NO-POWER']);
    expect(sexprProgram(result.program)).toBe('(file "main.sprout" (expr c))');
  });

  it('merges lexer and parser diagnostics in source order', () => {
    const result = parseMain('a ** 2\nb + 007 007\nc + ?');
    expect(result.diagnostics.map((d) => [d.code, d.range.line, d.range.col])).toEqual([
      ['E-NO-POWER', 1, 3],
      ['E-LEADING-ZERO', 2, 5],
      ['E-LEADING-ZERO', 2, 9],
      ['E-UNEXPECTED-TOKEN', 2, 9],
      ['E-UNEXPECTED-CHAR', 3, 5],
    ]);
  });

  it('reports nodeCount by the ast.ts counting rule', () => {
    expect(parseMain('f(1, 2)').nodeCount).toBe(5);
    expect(parseMain('').nodeCount).toBe(0);
  });
});
