import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type Span } from '../types';
import { childNodes, countNodes, type AstNode, type Expression, type Program, type Statement } from './ast';
import { parse } from './parser';

/**
 * Every node-valued field of `node`, found generically (not through childNodes): spans skipped, arrays
 * flattened, DictEntry records expanded into key and value, CompareOperator records (no nodes) skipped.
 */
function fieldNodes(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (isAstNode(value)) {
      out.push(value);
    } else if (typeof value === 'object' && value !== null && 'key' in value && 'value' in value) {
      visit(value.key);
      visit(value.value);
    }
  };
  for (const [key, value] of Object.entries(node)) if (key !== 'span' && key !== 'operatorSpan') visit(value);
  return out;
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && 'type' in value && 'span' in value;
}

/** Checks childNodes against the generic field walk for `node` and everything under it; returns the kinds seen. */
function checkTree(node: AstNode, kinds: Set<string>): void {
  kinds.add(node.type);
  expect(childNodes(node)).toEqual(fieldNodes(node));
  for (const child of childNodes(node)) checkTree(child, kinds);
}

const at: Span = { file: 'main.sprout', line: 1, col: 1, endLine: 1, endCol: 2 };
const name = (n: string): Expression => ({ type: 'NameExpr', span: at, name: n });
const ident = (n: string) => ({ type: 'Identifier', span: at, name: n }) as const;
const pass: Statement = { type: 'PassStmt', span: at };

/** One hand-built node of every statement kind, with every optional part present. */
const STATEMENTS: readonly Statement[] = [
  { type: 'ExprStmt', span: at, expr: name('e') },
  {
    type: 'AssignStmt',
    span: at,
    target: { type: 'IndexExpr', span: at, object: name('a'), index: name('i') },
    value: name('v'),
  },
  {
    type: 'AugAssignStmt',
    span: at,
    target: { type: 'NameExpr', span: at, name: 't' },
    op: '+',
    operatorSpan: at,
    value: name('v'),
  },
  pass,
  { type: 'BreakStmt', span: at },
  { type: 'ContinueStmt', span: at },
  { type: 'ReturnStmt', span: at, value: name('r') },
  { type: 'ReturnStmt', span: at, value: null },
  { type: 'GlobalStmt', span: at, names: [ident('g1'), ident('g2')] },
  {
    type: 'IfStmt',
    span: at,
    test: name('c'),
    body: [pass],
    elifs: [{ type: 'ElifClause', span: at, test: name('d'), body: [pass, pass] }],
    orelse: [{ type: 'BreakStmt', span: at }],
  },
  { type: 'IfStmt', span: at, test: name('c'), body: [pass], elifs: [], orelse: null },
  { type: 'WhileStmt', span: at, test: name('w'), body: [pass] },
  { type: 'ForStmt', span: at, target: ident('x'), iterable: name('xs'), body: [pass] },
  { type: 'RepeatStmt', span: at, count: name('n'), body: [pass] },
  { type: 'DefStmt', span: at, name: ident('f'), params: [ident('p'), ident('q')], body: [pass] },
];

const ALL_KINDS = [
  'NameExpr',
  'IntLiteral',
  'StringLiteral',
  'BoolLiteral',
  'NoneLiteral',
  'ListLiteral',
  'DictLiteral',
  'UnaryExpr',
  'BinaryExpr',
  'LogicalExpr',
  'CompareExpr',
  'CallExpr',
  'MethodCallExpr',
  'IndexExpr',
];

describe('childNodes (ast.ts: the node-counting rule behind E-PROGRAM-TOO-BIG)', () => {
  it('returns exactly the node-valued fields of every expression kind', () => {
    const source = '-f(a)[0].m(not b or c, [1], {"k": None}, True) * 2 < x'; // all 14 expression kinds
    const program = parse([{ name: 'main.sprout', text: source }], DEFAULT_LIMITS).program;
    const kinds = new Set<string>();
    for (const stmt of program.files[0]?.body ?? []) checkTree(stmt, kinds);
    for (const kind of ALL_KINDS) expect(kinds.has(kind)).toBe(true);
  });

  it('returns exactly the node-valued fields of every statement kind, ElifClause and Identifier', () => {
    const kinds = new Set<string>();
    for (const stmt of STATEMENTS) checkTree(stmt, kinds);
    expect([...kinds].sort()).toEqual(
      [
        'AssignStmt',
        'AugAssignStmt',
        'BreakStmt',
        'ContinueStmt',
        'DefStmt',
        'ElifClause',
        'ExprStmt',
        'ForStmt',
        'GlobalStmt',
        'Identifier',
        'IfStmt',
        'IndexExpr',
        'NameExpr',
        'PassStmt',
        'RepeatStmt',
        'ReturnStmt',
        'WhileStmt',
      ].sort(),
    );
  });

  it('counts every typed node except Program and FileNode', () => {
    const program: Program = {
      type: 'Program',
      files: [{ type: 'FileNode', span: at, name: 'main.sprout', body: STATEMENTS }],
    };
    const generic = (node: AstNode): number =>
      1 + fieldNodes(node).reduce((sum, child) => sum + generic(child), 0);
    expect(countNodes(program)).toBe(STATEMENTS.reduce((sum, stmt) => sum + generic(stmt), 0));
  });
});
