import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Token, TokenKind } from '../lexer/token';
import { DEFAULT_LIMITS, type Limits, type Span, type TextEdit } from '../types';
import { childNodes, countNodes, type AstNode } from './ast';
import { TokenCursor } from './cursor';
import { parse } from './parser';
import { sexprProgram } from './sexpr';
import { StatementParser } from './statements';

const parseMain = (text: string, limits: Limits = DEFAULT_LIMITS) =>
  parse([{ name: 'main.sprout', text }], limits);
const codes = (text: string, limits: Limits = DEFAULT_LIMITS): string[] =>
  parseMain(text, limits).diagnostics.map((d) => d.code);
const tree = (text: string): string => sexprProgram(parseMain(text).program);

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

/** Applies every fix-it of `code` and returns the fixed source (which must re-parse without `code`). */
function applyFixes(text: string, code: string): string {
  const fixes = parseMain(text)
    .diagnostics.filter((d) => d.code === code)
    .flatMap((d) => d.fix?.edits ?? []);
  expect(fixes.length).toBeGreaterThan(0);
  return applyEdits(text, fixes);
}

describe('E-MISSING-COLON (errors-and-diagnostics.md: "This `if` line needs a `:` at the end.")', () => {
  it('reports the missing `:` with an insertion fix-it after the last token of the header', () => {
    expect(parseMain('if is_ripe()\n    harvest()\n').diagnostics).toEqual([
      {
        code: 'E-MISSING-COLON',
        severity: 'error',
        range: span(1, 12, 1, 13),
        message: 'This `if` line needs a `:` at the end.',
        help: 'Python-style languages use `:` to start a block.',
        fix: { label: 'Add `:`', edits: [{ span: span(1, 13, 1, 13), newText: ':' }] },
      },
    ]);
  });

  const headers: readonly (readonly [string, string])[] = [
    ['if', 'if a\n    pass\n'],
    ['elif', 'if a:\n    pass\nelif b\n    pass\n'],
    ['else', 'if a:\n    pass\nelse\n    pass\n'],
    ['while', 'while a  # comment\n    pass\n'],
    ['for', 'for x in xs\n    pass\n'],
    ['repeat', 'repeat 3\n    pass\n'],
    ['def', 'def f(a, b)\n    pass\n'],
  ];
  for (const [keyword, source] of headers) {
    it(`names the \`${keyword}\` line, reads it as if the \`:\` were there, and its fix-it re-parses cleanly`, () => {
      const result = parseMain(source);
      expect(result.diagnostics).toMatchObject([
        { code: 'E-MISSING-COLON', message: `This \`${keyword}\` line needs a \`:\` at the end.` },
      ]);
      const fixed = applyFixes(source, 'E-MISSING-COLON');
      expect(codes(fixed)).toEqual([]);
      expect(sexprProgram(result.program)).toBe(sexprProgram(parseMain(fixed).program));
    });
  }
});

describe('E-ASSIGN-IN-IF (errors-and-diagnostics.md: "Use `==` to compare. A single `=` stores a value.")', () => {
  it('reports `=` in an `if` condition with a fix-it that replaces it with `==`', () => {
    expect(parseMain('if x = 3:\n    pass\n').diagnostics).toEqual([
      {
        code: 'E-ASSIGN-IN-IF',
        severity: 'error',
        range: span(1, 6, 1, 7),
        message: 'Use `==` to compare. A single `=` stores a value.',
        fix: { label: 'Change `=` to `==`', edits: [{ span: span(1, 6, 1, 7), newText: '==' }] },
      },
    ]);
  });

  for (const source of [
    'if x = 3:\n    pass\n',
    'if a:\n    pass\nelif crop() = None:\n    pass\n',
    'while n = 0:\n    pass\n',
  ]) {
    it(`reads the condition as a comparison and its fix-it re-parses cleanly: ${JSON.stringify(source)}`, () => {
      const fixed = applyFixes(source, 'E-ASSIGN-IN-IF');
      expect(codes(fixed)).toEqual([]);
      expect(tree(source)).toBe(tree(fixed));
    });
  }

  it('also repairs a missing colon after the repaired condition', () => {
    expect(codes('if x = 3\n    pass\n')).toEqual(['E-ASSIGN-IN-IF', 'E-MISSING-COLON']);
  });

  it('is only for `if`, `elif` and `while` conditions', () => {
    expect(codes('repeat n = 3:\n    pass\n')).toEqual(['E-UNEXPECTED-TOKEN']);
    expect(codes('for x in n = 3:\n    pass\n')).toEqual(['E-UNEXPECTED-TOKEN']);
  });
});

describe('E-NESTED-DEF (chief ruling 2026-10-11: `def` only at the top level of a file)', () => {
  const message = 'Define functions at the top level, not inside other functions or blocks.';

  it('reports a `def` inside another `def` at its `def` keyword', () => {
    expect(parseMain('def f():\n    def g():\n        pass\n').diagnostics).toEqual([
      { code: 'E-NESTED-DEF', severity: 'error', range: span(2, 5, 2, 8), message },
    ]);
  });

  for (const header of ['if a:', 'while a:', 'for x in xs:', 'repeat 3:']) {
    it(`reports a \`def\` inside \`${header}\``, () => {
      expect(codes(`${header}\n    def g():\n        pass\n`)).toEqual(['E-NESTED-DEF']);
    });
  }

  it('accepts `def` at the top level of every file', () => {
    expect(
      parse(
        [
          { name: 'helpers.sprout', text: 'def a():\n    pass\n' },
          { name: 'main.sprout', text: 'def b():\n    pass\n' },
        ],
        DEFAULT_LIMITS,
      ).diagnostics,
    ).toEqual([]);
  });
});

describe('E-RETURN-OUTSIDE, E-BREAK-OUTSIDE, E-CONTINUE-OUTSIDE (language-spec.md §Grammar)', () => {
  it('reports `return` outside a `def`, at the keyword, with the catalogue wording', () => {
    expect(parseMain('return 5\n').diagnostics).toEqual([
      {
        code: 'E-RETURN-OUTSIDE',
        severity: 'error',
        range: span(1, 1, 1, 7),
        message: '`return` only works inside a function made with `def`.',
      },
    ]);
    expect(codes('while True:\n    return\n')).toEqual(['E-RETURN-OUTSIDE']);
  });

  it('reports `break` and `continue` outside a loop with the catalogue wording', () => {
    expect(parseMain('break\ncontinue\n').diagnostics).toEqual([
      {
        code: 'E-BREAK-OUTSIDE',
        severity: 'error',
        range: span(1, 1, 1, 6),
        message: '`break` only works inside a loop.',
      },
      {
        code: 'E-CONTINUE-OUTSIDE',
        severity: 'error',
        range: span(2, 1, 2, 9),
        message: '`continue` only works inside a loop.',
      },
    ]);
    expect(codes('if a:\n    break\n')).toEqual(['E-BREAK-OUTSIDE']);
    expect(codes('def f():\n    continue\n')).toEqual(['E-CONTINUE-OUTSIDE']);
  });

  it('keeps the statement in the AST so the rest of the program is checked as written', () => {
    expect(tree('break\nx = 1\n')).toBe('(file "main.sprout" (break) (= x 1))');
  });

  it('accepts them where they belong, including `repeat` as a loop (chief ruling Q5)', () => {
    const ok = [
      'def f():\n    return\n',
      'def f():\n    if a:\n        return 1\n',
      'def f():\n    while a:\n        return 1\n',
      'while a:\n    if b:\n        break\n    continue\n',
      'for x in xs:\n    break\n',
      'repeat 3:\n    continue\n',
      'def f():\n    for x in xs:\n        break\n',
    ];
    for (const source of ok) expect(codes(source)).toEqual([]);
  });
});

describe('E-TOO-DEEP for blocks (language-spec.md §Limits: nesting depth 12)', () => {
  const nested = (levels: number): string => {
    let out = '';
    for (let i = 0; i < levels; i += 1) out += `${'    '.repeat(i)}if a:\n`;
    return `${out}${'    '.repeat(levels)}pass\n`;
  };

  it('accepts exactly 12 nested blocks', () => {
    expect(codes(nested(12))).toEqual([]);
  });

  it('reports the 13th once, at its header keyword, and keeps parsing', () => {
    const result = parseMain(`${nested(14)}x = 1\n`);
    expect(result.diagnostics).toEqual([
      {
        code: 'E-TOO-DEEP',
        severity: 'error',
        range: span(13, 49, 13, 51),
        message: 'This block is nested more than 12 levels deep.',
        help: 'Move the inner part into a function.',
      },
    ]);
    expect(result.program.files[0]?.body.at(-1)?.type).toBe('AssignStmt');
  });

  it('follows the limit it is given', () => {
    const limits = { ...DEFAULT_LIMITS, maxNesting: 2 };
    expect(codes(nested(2), limits)).toEqual([]);
    expect(codes(nested(3), limits)).toEqual(['E-TOO-DEEP']);
  });
});

describe('E-PROGRAM-TOO-BIG (language-spec.md §Limits: 5,000 AST nodes per program)', () => {
  /** Each `x = 1` line is 3 nodes (AssignStmt, NameExpr, IntLiteral); a trailing `x` adds 2. */
  const program = (assignments: number, trailingName: boolean): string =>
    `${'x = 1\n'.repeat(assignments)}${trailingName ? 'x\n' : ''}`;

  it('accepts exactly 5,000 nodes', () => {
    const result = parseMain(program(1666, true));
    expect(result.nodeCount).toBe(5000);
    expect(result.diagnostics).toEqual([]);
  });

  it('reports 5,001 nodes once, at the first node over the limit', () => {
    const result = parseMain(program(1667, false));
    expect(result.nodeCount).toBe(5001);
    expect(result.diagnostics).toEqual([
      {
        code: 'E-PROGRAM-TOO-BIG',
        severity: 'error',
        // Lines 1–1666 hold nodes 0–4997; line 1667's AssignStmt and NameExpr are 4998 and 4999, so
        // node 5000 (the 5,001st) is its IntLiteral.
        range: span(1667, 5, 1667, 6),
        message: 'Your program has more than 5,000 pieces (AST nodes), the most one program can have.',
        help: 'Use functions to replace code that repeats.',
      },
    ]);
  });

  it('counts all files together and follows the limit it is given', () => {
    const limits = { ...DEFAULT_LIMITS, maxAstNodes: 5 };
    const files = [
      { name: 'main.sprout', text: 'y = 2\n' },
      { name: 'a.sprout', text: 'x = 1\n' },
    ];
    const result = parse(files, limits);
    expect(result.diagnostics).toMatchObject([
      { code: 'E-PROGRAM-TOO-BIG', range: { file: 'main.sprout', line: 1, col: 5 } },
    ]);
    expect(result.diagnostics[0]?.message).toContain('more than 5 pieces');
  });

  it('keeps the diagnostic among the others in source order', () => {
    const limits = { ...DEFAULT_LIMITS, maxAstNodes: 3 };
    expect(codes('a = 1\nb = 2\nc ** 2\n', limits)).toEqual(['E-PROGRAM-TOO-BIG', 'E-NO-POWER']);
  });
});

describe('parse: recovery (interpreter-vm.md §Parser: skip to the next statement and keep parsing)', () => {
  it('reports several errors in one program and still parses every good statement', () => {
    const source = [
      'def tend()',
      '    if crop() = None:',
      '        plant(RADISH',
      'x = 10 / 2',
      'return x',
      'y = )',
      'while True:',
      '    move(EAST)',
      '',
    ].join('\n');
    // The unclosed `plant(` joins the following lines (implicit line joining), so the next problem the
    // parser can see is the `x` on line 4 where a `,` or `)` should be.
    expect(parseMain(source).diagnostics.map((d) => [d.code, d.range.line, d.help])).toEqual([
      ['E-MISSING-COLON', 1, 'Python-style languages use `:` to start a block.'],
      ['E-ASSIGN-IN-IF', 2, undefined],
      ['E-UNEXPECTED-TOKEN', 4, 'A `,` or `)` should come next.'],
    ]);
    const later = 'x = 1\nreturn x\ny = )\nbreak\nwhile True:\n    move(EAST)\n';
    expect(parseMain(later).diagnostics.map((d) => d.code)).toEqual([
      'E-RETURN-OUTSIDE',
      'E-UNEXPECTED-TOKEN',
      'E-BREAK-OUTSIDE',
    ]);
    expect(tree(later)).toBe(
      '(file "main.sprout" (= x 1) (return x) (break) (while True (expr (call move EAST))))',
    );
  });

  it('skips a bad statement inside a block and keeps the rest of that block', () => {
    expect(tree('while a:\n    f(]\n    g()\nh()\n')).toBe(
      '(file "main.sprout" (while a (expr (call g))) (expr (call h)))',
    );
  });
});

describe('parse: properties (testing.md §Property/fuzz: the parser never throws)', () => {
  const snippets = fc.constantFrom(
    'if',
    'elif',
    'else',
    'while',
    'for',
    'in',
    'repeat',
    'def',
    'return',
    'break',
    'continue',
    'pass',
    'and',
    'or',
    'not',
    'True',
    'None',
    'global',
    'x',
    'f',
    '0',
    '12',
    '"s"',
    "'t",
    '+',
    '-',
    '*',
    '/',
    '//',
    '%',
    '=',
    '==',
    '+=',
    '/=',
    '<',
    '>=',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    ',',
    ':',
    '.',
    '$',
    ' ',
    '    ',
    '\t',
    '\n',
    '\n    ',
    '\n        ',
    '# c',
    '\\',
  );
  const source = fc.array(snippets, { maxLength: 60 }).map((parts) => parts.join(''));

  it('returns for any source and never throws', () => {
    fc.assert(
      fc.property(source, (text) => {
        expect(() => parseMain(text)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it("keeps every node's span inside its parent's span and inside its file", () => {
    fc.assert(
      fc.property(source, (text) => {
        const { program } = parseMain(text);
        for (const file of program.files) {
          const check = (node: AstNode, parent: Span): void => {
            expect(within(node.span, parent)).toBe(true);
            for (const child of childNodes(node)) check(child, node.span);
          };
          for (const stmt of file.body) check(stmt, file.span);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('reports nodeCount equal to a full walk of the tree', () => {
    fc.assert(
      fc.property(source, (text) => {
        const result = parseMain(text);
        expect(result.nodeCount).toBe(countNodes(result.program));
      }),
      { numRuns: 300 },
    );
  });

  it('has fix-its that each remove the diagnostic they belong to (errors-and-diagnostics.md §Principles)', () => {
    const fixable = new Set(['E-MISSING-COLON', 'E-ASSIGN-IN-IF', 'E-SLASH-DIVISION']);
    fc.assert(
      fc.property(source, (text) => {
        for (const diagnostic of parseMain(text).diagnostics) {
          if (!fixable.has(diagnostic.code) || diagnostic.fix === undefined) continue;
          const count = (t: string) => codes(t).filter((c) => c === diagnostic.code).length;
          expect(count(applyEdits(text, diagnostic.fix.edits))).toBeLessThan(count(text));
        }
      }),
      { numRuns: 500 },
    );
  });

  it('never throws on an arbitrary token stream, including unbalanced INDENT/DEDENT', () => {
    const kinds: readonly TokenKind[] = [
      'NAME',
      'KEYWORD',
      'INT',
      'STRING',
      'OP',
      'NEWLINE',
      'INDENT',
      'DEDENT',
      'ERROR',
    ];
    const token = fc.record({
      kind: fc.constantFrom(...kinds),
      text: fc.constantFrom(
        'x',
        'if',
        'def',
        'while',
        'not',
        'in',
        '1',
        '"a"',
        '(',
        ')',
        '[',
        ':',
        '=',
        '/',
        '*',
        '.',
        '',
      ),
    });
    fc.assert(
      fc.property(fc.array(token, { maxLength: 80 }), (raw) => {
        const tokens: Token[] = raw.map((t, i) => ({
          ...t,
          file: 'main.sprout',
          line: 1,
          col: i + 1,
          offset: i,
          length: t.text.length,
        }));
        tokens.push({
          kind: 'EOF',
          text: '',
          file: 'main.sprout',
          line: 1,
          col: raw.length + 1,
          offset: raw.length,
          length: 0,
        });
        expect(() =>
          new StatementParser(new TokenCursor(tokens, 'main.sprout'), DEFAULT_LIMITS).parseFile(),
        ).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});

function within(inner: Span, outer: Span): boolean {
  const startsAfter = inner.line > outer.line || (inner.line === outer.line && inner.col >= outer.col);
  const endsBefore =
    inner.endLine < outer.endLine || (inner.endLine === outer.endLine && inner.endCol <= outer.endCol);
  return inner.file === outer.file && startsAfter && endsBefore;
}
