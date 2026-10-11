import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type Span } from '../types';
import { childNodes, countNodes, type Expression, type AstNode } from './ast';
import { parse } from './parser';
import { sexpr } from './sexpr';

const parseMain = (text: string) => parse([{ name: 'main.sprout', text }], DEFAULT_LIMITS);

/** The single expression statement of a one-line program, failing loudly on anything else. */
function expr(text: string): Expression {
  const result = parseMain(text);
  expect(result.diagnostics).toEqual([]);
  const stmt = result.program.files[0]?.body[0];
  if (stmt?.type !== 'ExprStmt') throw new Error(`expected one expression statement in ${text}`);
  return stmt.expr;
}

const tree = (text: string): string => sexpr(expr(text));

const span = (line: number, col: number, endLine: number, endCol: number): Span => ({
  file: 'main.sprout',
  line,
  col,
  endLine,
  endCol,
});

describe('parse: precedence (language-spec.md §Grammar: or < and < not < comparison < sum < term < unary < postfix < atom)', () => {
  const table: readonly (readonly [string, string])[] = [
    ['a or b and c', '(or a (and b c))'],
    ['a and b or c', '(or (and a b) c)'],
    ['not a and b', '(and (not a) b)'],
    ['a and not b', '(and a (not b))'],
    ['not a == b', '(not (cmp a == b))'],
    ['not a in b', '(not (cmp a in b))'],
    ['a == b + c', '(cmp a == (+ b c))'],
    ['a + b < c', '(cmp (+ a b) < c)'],
    ['a + b * c', '(+ a (* b c))'],
    ['a * b + c', '(+ (* a b) c)'],
    ['a - b // c % d', '(- a (% (// b c) d))'],
    ['-a * b', '(* (- a) b)'],
    ['a * -b', '(* a (- b))'],
    ['-a.pop()', '(- (method a pop))'],
    ['-f(x)[0]', '(- (index (call f x) 0))'],
    ['(a + b) * c', '(* (+ a b) c)'],
    ['(a or b) and c', '(and (or a b) c)'],
    ['not (a and b)', '(not (and a b))'],
    ['- - a', '(- (- a))'],
    ['not not a', '(not (not a))'],
    ['a < b or c > d', '(or (cmp a < b) (cmp c > d))'],
  ];
  for (const [source, expected] of table) {
    it(`parses \`${source}\` as ${expected}`, () => {
      expect(tree(source)).toBe(expected);
    });
  }
});

describe('parse: associativity (language-spec.md §Grammar: `{ op operand }` loops are left-associative)', () => {
  const table: readonly (readonly [string, string])[] = [
    ['a - b - c', '(- (- a b) c)'],
    ['a + b - c', '(- (+ a b) c)'],
    ['a // b % c', '(% (// a b) c)'],
    ['a * b // c', '(// (* a b) c)'],
    ['a or b or c', '(or (or a b) c)'],
    ['a and b and c', '(and (and a b) c)'],
  ];
  for (const [source, expected] of table) {
    it(`parses \`${source}\` as ${expected}`, () => {
      expect(tree(source)).toBe(expected);
    });
  }
});

describe('parse: comparisons (language-spec.md §Grammar `comparison`; chained comparisons behave as in Python)', () => {
  it('makes a chained comparison one node with ordered operands and operators', () => {
    const node = expr('0 <= x < 8');
    expect(node.type).toBe('CompareExpr');
    if (node.type !== 'CompareExpr') return;
    expect(node.operands.map(sexpr)).toEqual(['0', 'x', '8']);
    expect(node.operators.map((o) => o.op)).toEqual(['<=', '<']);
    expect(node.operators.map((o) => o.span)).toEqual([span(1, 3, 1, 5), span(1, 8, 1, 9)]);
  });

  it('parses every comparison operator', () => {
    expect(tree('a == b != c < d <= e > f >= g in h not in i')).toBe(
      '(cmp a == b != c < d <= e > f >= g in h not in i)',
    );
  });

  it('treats `not in` as one operator whose span covers both keywords', () => {
    const node = expr('a not  in b');
    if (node.type !== 'CompareExpr') throw new Error('expected a comparison');
    expect(node.operators).toEqual([{ op: 'not in', span: span(1, 3, 1, 10) }]);
  });

  it('does not chain across parentheses', () => {
    expect(tree('(a < b) < c')).toBe('(cmp (cmp a < b) < c)');
  });
});

describe('parse: atoms (language-spec.md §Grammar `atom`)', () => {
  const table: readonly (readonly [string, string])[] = [
    ['x', 'x'],
    ['42', '42'],
    ['1_000', '1000'],
    ['"hi"', '"hi"'],
    ["'a\\tb'", '"a\\tb"'],
    ['True', 'True'],
    ['False', 'False'],
    ['None', 'None'],
    ['(x)', 'x'],
    ['((x))', 'x'],
    ['[]', '(list)'],
    ['[1]', '(list 1)'],
    ['[1, a + 2, [3]]', '(list 1 (+ a 2) (list 3))'],
    ['{}', '(dict)'],
    ['{1: "a"}', '(dict (1 "a"))'],
    ['{RADISH: 2, "k": [1, 2]}', '(dict (RADISH 2) ("k" (list 1 2)))'],
  ];
  for (const [source, expected] of table) {
    it(`parses \`${source}\` as ${expected}`, () => {
      expect(tree(source)).toBe(expected);
    });
  }

  it('keeps the decoded literal values the lexer produced', () => {
    expect(expr('9007199254740991')).toMatchObject({ type: 'IntLiteral', value: 9007199254740991 });
    expect(expr('"a\\"b"')).toMatchObject({ type: 'StringLiteral', value: 'a"b' });
    expect(expr('True')).toMatchObject({ type: 'BoolLiteral', value: true });
    expect(expr('None')).toMatchObject({ type: 'NoneLiteral' });
  });

  it('joins the lines of a bracketed expression (interpreter-vm.md §Lexer: implicit line joining)', () => {
    expect(tree('[1,\n  2,\n    3]')).toBe('(list 1 2 3)');
    expect(tree('f(a,\nb)')).toBe('(call f a b)');
  });
});

describe('parse: postfix (language-spec.md §Grammar `postfix`)', () => {
  const table: readonly (readonly [string, string])[] = [
    ['f()', '(call f)'],
    ['f(1)', '(call f 1)'],
    ['f(1, x, "s")', '(call f 1 x "s")'],
    ['a[0]', '(index a 0)'],
    ['a[i + 1]', '(index a (+ i 1))'],
    ['lst.append(x)', '(method lst append x)'],
    ['lst.pop()', '(method lst pop)'],
    ['d.get(k, 0)', '(method d get k 0)'],
    ['grid[y][x]', '(index (index grid y) x)'],
    ['a[0].pop()(1)', '(call (method (index a 0) pop) 1)'],
    ['f(g(h(1)))', '(call f (call g (call h 1)))'],
    ['[1, 2][0]', '(index (list 1 2) 0)'],
    ['"abc"[1]', '(index "abc" 1)'],
    ['(f)(x)', '(call f x)'],
  ];
  for (const [source, expected] of table) {
    it(`parses \`${source}\` as ${expected}`, () => {
      expect(tree(source)).toBe(expected);
    });
  }
});

describe('parse: expression spans (errors-and-diagnostics.md §Principles: point at the exact spot)', () => {
  it('spans a binary expression from its first to its last token, and records the operator span', () => {
    const node = expr('a + bc');
    expect(node).toMatchObject({
      type: 'BinaryExpr',
      span: span(1, 1, 1, 7),
      operatorSpan: span(1, 3, 1, 4),
    });
  });

  it('leaves parentheses out of the inner node and puts them in the enclosing one', () => {
    const node = expr('(a + b) * c');
    if (node.type !== 'BinaryExpr') throw new Error('expected a binary expression');
    expect(node.span).toEqual(span(1, 1, 1, 12));
    expect(node.left.span).toEqual(span(1, 2, 1, 7));
  });

  it('spans calls, method calls and indexing up to the closing bracket', () => {
    expect(expr('f(x, y)').span).toEqual(span(1, 1, 1, 8));
    const method = expr('lst.append(1)');
    expect(method).toMatchObject({ span: span(1, 1, 1, 14) });
    if (method.type !== 'MethodCallExpr') throw new Error('expected a method call');
    expect(method.method).toEqual({ type: 'Identifier', span: span(1, 5, 1, 11), name: 'append' });
    expect(expr('a[0]').span).toEqual(span(1, 1, 1, 5));
  });

  it('spans a multi-line bracketed expression across lines', () => {
    expect(expr('[1,\n  22]').span).toEqual(span(1, 1, 2, 6));
  });

  it('spans a unary expression from its operator', () => {
    expect(expr('not  x')).toMatchObject({ type: 'UnaryExpr', op: 'not', span: span(1, 1, 1, 7) });
    expect(expr('-x')).toMatchObject({ type: 'UnaryExpr', op: '-', span: span(1, 1, 1, 3) });
  });

  it("keeps every child's span inside its parent's span", () => {
    const check = (node: AstNode): void => {
      for (const child of childNodes(node)) {
        expect(within(child.span, node.span)).toBe(true);
        check(child);
      }
    };
    check(expr('-f(a, [1, {2: (b)}])[c].pop(not d or e < g <= h) // 3 % 4'));
  });
});

describe('countNodes (ast.ts header: every typed node except Program and FileNode)', () => {
  it('counts expressions, identifiers and statements', () => {
    // ExprStmt, MethodCallExpr, NameExpr lst, Identifier append, IntLiteral 1 → 5
    expect(countNodes(parseMain('lst.append(1)').program)).toBe(5);
    // ExprStmt, DictLiteral, 2 keys, 2 values → 6 (DictEntry is not a node)
    expect(countNodes(parseMain('{1: 2, 3: 4}').program)).toBe(6);
    // ExprStmt, CompareExpr, 3 operands → 5 (operators are not nodes)
    expect(countNodes(parseMain('0 <= x < 8').program)).toBe(5);
    // Parentheses add nothing.
    expect(countNodes(parseMain('((x))').program)).toBe(2);
  });
});

function within(inner: Span, outer: Span): boolean {
  const startsAfter = inner.line > outer.line || (inner.line === outer.line && inner.col >= outer.col);
  const endsBefore =
    inner.endLine < outer.endLine || (inner.endLine === outer.endLine && inner.endCol <= outer.endCol);
  return inner.file === outer.file && startsAfter && endsBefore;
}
