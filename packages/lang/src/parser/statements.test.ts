import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type SourceFile, type Span } from '../types';
import { childNodes, countNodes, type Node, type Statement } from './ast';
import { parse } from './parser';
import { sexprFile, sexprStatement } from './sexpr';

const parseMain = (text: string) => parse([{ name: 'main.sprout', text }], DEFAULT_LIMITS);
const codes = (text: string): string[] => parseMain(text).diagnostics.map((d) => d.code);

/** The statements of a program that must parse cleanly, rendered one per element. */
function statements(text: string): string[] {
  const result = parseMain(text);
  expect(result.diagnostics).toEqual([]);
  return (result.program.files[0]?.body ?? []).map(sexprStatement);
}

const tree = (text: string): string => statements(text).join(' ');

function firstStatement(text: string): Statement {
  const stmt = parseMain(text).program.files[0]?.body[0];
  if (stmt === undefined) throw new Error(`no statement in ${text}`);
  return stmt;
}

const span = (line: number, col: number, endLine: number, endCol: number, file = 'main.sprout'): Span => ({
  file,
  line,
  col,
  endLine,
  endCol,
});

describe('parse: simple statements (language-spec.md §Grammar `simple_stmt`)', () => {
  const table: readonly (readonly [string, string])[] = [
    ['x = 1', '(= x 1)'],
    ['grid[y][x] = RADISH', '(= (index (index grid y) x) RADISH)'],
    ['(x) = 1', '(= x 1)'],
    ['total += 1', '(+= total 1)'],
    ['n -= a * 2', '(-= n (* a 2))'],
    ['n *= 3', '(*= n 3)'],
    ['n //= 2', '(//= n 2)'],
    ['n %= 8', '(%= n 8)'],
    ['counts[RADISH] += 1', '(+= (index counts RADISH) 1)'],
    ['move(EAST)', '(expr (call move EAST))'],
    ['x == 3', '(expr (cmp x == 3))'],
    ['pass', '(pass)'],
    ['global total', '(global total)'],
    ['global a, b, c', '(global a b c)'],
  ];
  for (const [source, expected] of table) {
    it(`parses \`${source}\` as ${expected}`, () => {
      expect(tree(source)).toBe(expected);
    });
  }

  it('parses `return` with and without a value', () => {
    expect(tree('def f():\n    return\n')).toBe('(def f () (return))');
    expect(tree('def f(a):\n    return a + 1\n')).toBe('(def f (a) (return (+ a 1)))');
  });

  it('parses `break` and `continue`', () => {
    expect(tree('while True:\n    break\n    continue\n')).toBe('(while True (break) (continue))');
  });

  it('records the operator span of an augmented assignment', () => {
    expect(firstStatement('total += 1')).toMatchObject({
      type: 'AugAssignStmt',
      op: '+',
      operatorSpan: span(1, 7, 1, 9),
      span: span(1, 1, 1, 11),
    });
  });

  it('reads `/=` as `//=` and reports E-SLASH-DIVISION with the `//=` fix-it', () => {
    const result = parseMain('n /= 2');
    expect(result.diagnostics).toMatchObject([
      { code: 'E-SLASH-DIVISION', fix: { edits: [{ span: span(1, 3, 1, 5), newText: '//=' }] } },
    ]);
    expect(result.program.files[0]?.body.map(sexprStatement)).toEqual(['(//= n 2)']);
  });

  it('keeps names in binding positions as Identifier nodes', () => {
    expect(firstStatement('global a, bb')).toMatchObject({
      type: 'GlobalStmt',
      names: [
        { type: 'Identifier', name: 'a', span: span(1, 8, 1, 9) },
        { type: 'Identifier', name: 'bb', span: span(1, 11, 1, 13) },
      ],
    });
  });
});

describe('parse: compound statements (language-spec.md §Grammar `compound_stmt`)', () => {
  it('parses `if` alone, with `elif`s, and with `else`', () => {
    expect(tree('if a:\n    x = 1\n')).toBe('(if a (= x 1))');
    expect(tree('if a:\n    f()\nelif b:\n    g()\nelif c:\n    h()\nelse:\n    k()\n')).toBe(
      '(if a (expr (call f)) (elif b (expr (call g))) (elif c (expr (call h))) (else (expr (call k))))',
    );
    expect(tree('if a:\n    pass\nelse:\n    pass\n')).toBe('(if a (pass) (else (pass)))');
  });

  it('makes `elif` an ElifClause of the same IfStmt, not a nested `if`', () => {
    const stmt = firstStatement('if a:\n    pass\nelif b:\n    pass\n');
    expect(stmt).toMatchObject({
      type: 'IfStmt',
      orelse: null,
      elifs: [{ type: 'ElifClause', span: span(3, 1, 4, 9) }],
      span: span(1, 1, 4, 9),
    });
  });

  it('parses `while`, `for` and `repeat`', () => {
    expect(tree('while x < 3:\n    x += 1\n')).toBe('(while (cmp x < 3) (+= x 1))');
    expect(tree('for y in range(world_size()):\n    move(NORTH)\n')).toBe(
      '(for y (call range (call world_size)) (expr (call move NORTH)))',
    );
    expect(tree('for t in tiles:\n    pass\n')).toBe('(for t tiles (pass))');
    expect(tree('repeat 5:\n    move(EAST)\n')).toBe('(repeat 5 (expr (call move EAST)))');
  });

  it('parses `for` whose iterable is itself an `in` comparison, as Python does', () => {
    expect(tree('for x in a in b:\n    pass\n')).toBe('(for x (cmp a in b) (pass))');
  });

  it('parses `def` with no, one and several parameters', () => {
    expect(tree('def tend():\n    pass\n')).toBe('(def tend () (pass))');
    expect(tree('def go(x):\n    pass\n')).toBe('(def go (x) (pass))');
    expect(tree('def go(x, y, z):\n    pass\n')).toBe('(def go (x y z) (pass))');
  });

  it('parses nested blocks and returns to the outer level after each DEDENT', () => {
    expect(tree('while True:\n    for x in xs:\n        if x:\n            break\n    f()\ng()\n')).toBe(
      '(while True (for x xs (if x (break))) (expr (call f))) (expr (call g))',
    );
  });

  it('ignores blank and comment-only lines inside blocks (language-spec.md §Lexical structure)', () => {
    expect(tree('if a:\n\n    # note\n    x = 1\n        # deeper comment\n\n    y = 2\n')).toBe(
      '(if a (= x 1) (= y 2))',
    );
  });

  it('spans a compound statement from its keyword to the end of its last body statement', () => {
    const stmt = firstStatement('while ok:\n    a = 1\n    bb = 22\n\nz = 0\n');
    expect(stmt.span).toEqual(span(1, 1, 3, 12));
    if (stmt.type !== 'WhileStmt') throw new Error('expected while');
    expect(stmt.body.map((s) => s.span)).toEqual([span(2, 5, 2, 10), span(3, 5, 3, 12)]);
  });

  it('keeps identifiers of `for` and `def` with their spans', () => {
    expect(firstStatement('for i in r:\n    pass\n')).toMatchObject({
      target: { type: 'Identifier', name: 'i', span: span(1, 5, 1, 6) },
    });
    expect(firstStatement('def f(a, b):\n    pass\n')).toMatchObject({
      name: { type: 'Identifier', name: 'f', span: span(1, 5, 1, 6) },
      params: [
        { name: 'a', span: span(1, 7, 1, 8) },
        { name: 'b', span: span(1, 10, 1, 11) },
      ],
    });
  });
});

describe('parse: example programs (language-spec.md §Example; standard-library.md §Example)', () => {
  const specExample = [
    '# Plant radishes on every tile, then keep harvesting and replanting.',
    'def tend():',
    '    if is_ripe():',
    '        harvest()',
    '        plant(RADISH)',
    '    elif crop() == None:',
    '        plant(RADISH)',
    '',
    'def sweep():',
    '    for y in range(world_size()):',
    '        for x in range(world_size()):',
    '            tend()',
    '            move(EAST)',
    '        move(NORTH)',
    '',
    'while True:',
    '    sweep()',
    '    if inventory(RADISH) >= 20:',
    '        sell(RADISH, inventory(RADISH))',
    '',
  ].join('\n');

  it('parses the spec example with no diagnostics', () => {
    expect(statements(specExample)).toEqual([
      '(def tend () (if (call is_ripe) (expr (call harvest)) (expr (call plant RADISH)) (elif (cmp (call crop) == None) (expr (call plant RADISH)))))',
      '(def sweep () (for y (call range (call world_size)) (for x (call range (call world_size)) (expr (call tend)) (expr (call move EAST))) (expr (call move NORTH))))',
      '(while True (expr (call sweep)) (if (cmp (call inventory RADISH) >= 20) (expr (call sell RADISH (call inventory RADISH)))))',
    ]);
  });

  it("keeps every child's span inside its parent's span in the spec example", () => {
    const check = (node: Node): void => {
      for (const child of childNodes(node)) {
        const inside =
          (child.span.line > node.span.line ||
            (child.span.line === node.span.line && child.span.col >= node.span.col)) &&
          (child.span.endLine < node.span.endLine ||
            (child.span.endLine === node.span.endLine && child.span.endCol <= node.span.endCol));
        expect(inside).toBe(true);
        check(child);
      }
    };
    for (const stmt of parseMain(specExample).program.files[0]?.body ?? []) check(stmt);
  });
});

describe('E-BAD-TARGET', () => {
  it('reports an assignment to something that is not a name or an indexed slot', () => {
    for (const [source, range] of [
      ['f() = 1', span(1, 1, 1, 4)],
      ['1 = x', span(1, 1, 1, 2)],
      ['a + b = c', span(1, 1, 1, 6)],
      ['lst.pop() += 1', span(1, 1, 1, 10)],
    ] as const) {
      expect(parseMain(source).diagnostics).toEqual([
        {
          code: 'E-BAD-TARGET',
          severity: 'error',
          range,
          message: 'You can only store a value in a name or a list/dict slot.',
          help: 'For example `count = 5` or `scores[0] = 5`.',
        },
      ]);
    }
  });

  it('drops the statement and parses the next one', () => {
    const result = parseMain('f() = 1\nx = 2\n');
    expect(result.program.files[0]?.body.map(sexprStatement)).toEqual(['(= x 2)']);
  });
});

describe('E-BAD-INDENT (errors-and-diagnostics.md: "The lines inside this `while` should be indented one step further.")', () => {
  it('reports a block body that is not indented, naming the header keyword', () => {
    expect(parseMain('while True:\nmove(EAST)\n').diagnostics).toEqual([
      {
        code: 'E-BAD-INDENT',
        severity: 'error',
        range: span(2, 1, 2, 5),
        message: 'The lines inside this `while` should be indented one step further.',
        help: 'Start the block on the next line, indented by 4 spaces.',
      },
    ]);
  });

  it('reports a body written on the header line, once', () => {
    expect(parseMain('if x: harvest()\n').diagnostics).toMatchObject([
      {
        code: 'E-BAD-INDENT',
        range: span(1, 7, 1, 14),
        message: 'The lines inside this `if` should be indented one step further.',
      },
    ]);
  });

  it('reports a header with no block at the end of the file', () => {
    expect(codes('def f():')).toEqual(['E-BAD-INDENT']);
  });

  it('reports an indented line with no `:` line above it, and still parses it', () => {
    const result = parseMain('a = 1\n    b = 2\nc = 3\n');
    expect(result.diagnostics).toEqual([
      {
        code: 'E-BAD-INDENT',
        severity: 'error',
        range: span(2, 1, 2, 5),
        message: 'This line is indented, but no `:` line above starts a block.',
        help: 'Line it up with the line above, or end the line above with `:` to start a block.',
      },
    ]);
    expect(result.program.files[0]?.body.map(sexprStatement)).toEqual(['(= a 1)', '(= b 2)', '(= c 3)']);
  });
});

describe('parse: statement-level syntax errors', () => {
  const table: readonly (readonly [string, string])[] = [
    ['for 1 in x:\n    pass\n', 'A name should follow `for`, as in `for x in range(5):`.'],
    ['for x of y:\n    pass\n', '`in` should come next, as in `for x in range(5):`.'],
    ['def (x):\n    pass\n', 'A name should follow `def`, as in `def tend():`.'],
    ['def f x:\n    pass\n', 'A `(` should come next, as in `def tend():`.'],
    ['def f(1):\n    pass\n', 'A parameter name should come next.'],
    ['def f(a b):\n    pass\n', 'A `,` or `)` should come next.'],
    ['global 5\n', 'A name should follow `global`, as in `global total`.'],
    ['else:\n    pass\n', '`else` needs an `if` above it, at the same indent.'],
    ['a = b = 1\n', 'This line should end here.'],
  ];
  for (const [source, help] of table) {
    it(`reports E-UNEXPECTED-TOKEN for ${JSON.stringify(source)}`, () => {
      expect(parseMain(source).diagnostics).toMatchObject([{ code: 'E-UNEXPECTED-TOKEN', help }]);
    });
  }

  it('parses the block of a broken header so errors inside it are reported too', () => {
    expect(codes('while x y:\n    f() = 1\nz = 1\n')).toEqual(['E-UNEXPECTED-TOKEN', 'E-BAD-TARGET']);
  });

  it('drops a broken compound statement but keeps parsing after its block', () => {
    const result = parseMain('if a b:\n    a = 1\nb = 2\n');
    expect(result.program.files[0]?.body.map(sexprStatement)).toEqual(['(= b 2)']);
  });
});

describe('parse: files and run order (language-spec.md §Files)', () => {
  const files: SourceFile[] = [
    { name: 'main.sprout', text: 'tend()\n' },
    { name: 'helpers.sprout', text: 'def tend():\n    pass\n' },
    { name: 'more.sprout', text: 'x = 1\n' },
  ];

  it('puts every file except main.sprout first, in the given order, and main.sprout last', () => {
    const { program } = parse(files, DEFAULT_LIMITS);
    expect(program.files.map((f) => f.name)).toEqual(['helpers.sprout', 'more.sprout', 'main.sprout']);
    expect(program.files.map(sexprFile)).toEqual([
      '(file "helpers.sprout" (def tend () (pass)))',
      '(file "more.sprout" (= x 1))',
      '(file "main.sprout" (expr (call tend)))',
    ]);
  });

  it("puts each file's own name on its spans", () => {
    const { program } = parse(files, DEFAULT_LIMITS);
    expect(program.files[0]?.body[0]?.span).toEqual(span(1, 1, 2, 9, 'helpers.sprout'));
    expect(program.files[2]?.body[0]?.span).toEqual(span(1, 1, 1, 7, 'main.sprout'));
  });

  it('spans each file from line 1 col 1 to its end', () => {
    const { program } = parse([{ name: 'main.sprout', text: 'a\nbc' }], DEFAULT_LIMITS);
    expect(program.files[0]?.span).toEqual(span(1, 1, 2, 3));
    expect(parse([{ name: 'main.sprout', text: '' }], DEFAULT_LIMITS).program.files[0]?.span).toEqual(
      span(1, 1, 1, 1),
    );
  });

  it('orders diagnostics by file in run order, then by position', () => {
    const { diagnostics } = parse(
      [
        { name: 'main.sprout', text: 'a ** 2\n' },
        { name: 'b.sprout', text: 'x = $\nf() = 1\n' },
      ],
      DEFAULT_LIMITS,
    );
    expect(diagnostics.map((d) => [d.range.file, d.code])).toEqual([
      ['b.sprout', 'E-UNEXPECTED-CHAR'],
      ['b.sprout', 'E-BAD-TARGET'],
      ['main.sprout', 'E-NO-POWER'],
    ]);
  });

  it('counts nodes across all files together', () => {
    const { program, nodeCount } = parse(files, DEFAULT_LIMITS);
    // helpers: DefStmt, Identifier, PassStmt (3); more: AssignStmt, NameExpr, IntLiteral (3); main: ExprStmt, CallExpr, NameExpr (3)
    expect(nodeCount).toBe(9);
    expect(countNodes(program)).toBe(9);
  });
});
