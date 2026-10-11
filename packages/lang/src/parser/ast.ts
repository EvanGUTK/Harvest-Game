/**
 * Sprout abstract syntax tree: the contract between the parser and the checker/compiler.
 * Spec: docs/02-language/language-spec.md §Grammar (EBNF); docs/03-architecture/interpreter-vm.md §Parser.
 * Invariants: plain readonly objects with a `type` discriminant; every node's `span` runs from the first
 * to the last token its production consumed (never a NEWLINE) and lies inside its parent's span.
 * Parentheses produce no node: the inner expression's span excludes them, the enclosing node's includes
 * them. The tree holds well-formed nodes only; a statement the parser cannot repair is dropped and
 * reported, so an AST is compiled only when the parse produced no error diagnostic.
 *
 * Node counting rule (E-PROGRAM-TOO-BIG, language-spec.md §Limits): every object with a `type` counts
 * as one node, except the `Program` and `FileNode` containers. That is every statement, expression,
 * `ElifClause` and `Identifier`. `DictEntry` and `CompareOperator` records have no `type` and do not count.
 */

import type { Span } from '../types';

// ---------- expressions ----------

export type BinaryOp = '+' | '-' | '*' | '//' | '%';
export type CompareOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not in';
export type UnaryOp = '-' | 'not';
export type LogicalOp = 'and' | 'or';

/** A name in a binding or declaration position: def name, parameter, `for` target, `global` name, method name. */
export type Identifier = { readonly type: 'Identifier'; readonly span: Span; readonly name: string };

/** A name read (or assigned, as an `AssignStmt` target) as a variable. */
export type NameExpr = { readonly type: 'NameExpr'; readonly span: Span; readonly name: string };
export type IntLiteral = { readonly type: 'IntLiteral'; readonly span: Span; readonly value: number };
export type StringLiteral = { readonly type: 'StringLiteral'; readonly span: Span; readonly value: string };
export type BoolLiteral = { readonly type: 'BoolLiteral'; readonly span: Span; readonly value: boolean };
export type NoneLiteral = { readonly type: 'NoneLiteral'; readonly span: Span };

export type ListLiteral = {
  readonly type: 'ListLiteral';
  readonly span: Span;
  readonly elements: readonly Expression[];
};

/** One `key: value` pair of a dict literal. Not a node. */
export type DictEntry = { readonly key: Expression; readonly value: Expression };

export type DictLiteral = {
  readonly type: 'DictLiteral';
  readonly span: Span;
  readonly entries: readonly DictEntry[];
};

/** `-x` (arithmetic) or `not x` (boolean_ops; always yields a bool). */
export type UnaryExpr = {
  readonly type: 'UnaryExpr';
  readonly span: Span;
  readonly op: UnaryOp;
  readonly operand: Expression;
};

/** Left-associative arithmetic: `a - b - c` is `(a - b) - c`. */
export type BinaryExpr = {
  readonly type: 'BinaryExpr';
  readonly span: Span;
  readonly op: BinaryOp;
  readonly operatorSpan: Span;
  readonly left: Expression;
  readonly right: Expression;
};

/** Short-circuit `and` / `or`, left-associative; yields the deciding operand (language-spec.md §Truthiness). */
export type LogicalExpr = {
  readonly type: 'LogicalExpr';
  readonly span: Span;
  readonly op: LogicalOp;
  readonly operatorSpan: Span;
  readonly left: Expression;
  readonly right: Expression;
};

/** One operator of a comparison chain. Not a node. */
export type CompareOperator = { readonly op: CompareOp; readonly span: Span };

/**
 * A whole comparison chain, Python semantics: `a < b <= c` is `a < b and b <= c` with `b` evaluated
 * once. `operands.length >= 2` and `operators.length === operands.length - 1`; operator `i` sits between
 * operands `i` and `i + 1`.
 */
export type CompareExpr = {
  readonly type: 'CompareExpr';
  readonly span: Span;
  readonly operands: readonly Expression[];
  readonly operators: readonly CompareOperator[];
};

export type CallExpr = {
  readonly type: 'CallExpr';
  readonly span: Span;
  readonly callee: Expression;
  readonly args: readonly Expression[];
};

/** `object.method(args)`. Sprout has no attribute access, only method calls (EBNF `postfix`). */
export type MethodCallExpr = {
  readonly type: 'MethodCallExpr';
  readonly span: Span;
  readonly object: Expression;
  readonly method: Identifier;
  readonly args: readonly Expression[];
};

export type IndexExpr = {
  readonly type: 'IndexExpr';
  readonly span: Span;
  readonly object: Expression;
  readonly index: Expression;
};

export type Expression =
  | NameExpr
  | IntLiteral
  | StringLiteral
  | BoolLiteral
  | NoneLiteral
  | ListLiteral
  | DictLiteral
  | UnaryExpr
  | BinaryExpr
  | LogicalExpr
  | CompareExpr
  | CallExpr
  | MethodCallExpr
  | IndexExpr;

// ---------- statements ----------

/** EBNF `target`: a name, or an indexed slot (`postfix "[" expr "]"`). */
export type AssignTarget = NameExpr | IndexExpr;

export type ExprStmt = { readonly type: 'ExprStmt'; readonly span: Span; readonly expr: Expression };

export type AssignStmt = {
  readonly type: 'AssignStmt';
  readonly span: Span;
  readonly target: AssignTarget;
  readonly value: Expression;
};

/**
 * `target op= value`, meaning `target = target op value` (language-spec.md §Operators by type). For an
 * indexed target the object and index are evaluated once, as in Python.
 */
export type AugAssignStmt = {
  readonly type: 'AugAssignStmt';
  readonly span: Span;
  readonly target: AssignTarget;
  readonly op: BinaryOp;
  readonly operatorSpan: Span;
  readonly value: Expression;
};

export type PassStmt = { readonly type: 'PassStmt'; readonly span: Span };
export type BreakStmt = { readonly type: 'BreakStmt'; readonly span: Span };
export type ContinueStmt = { readonly type: 'ContinueStmt'; readonly span: Span };

export type ReturnStmt = {
  readonly type: 'ReturnStmt';
  readonly span: Span;
  readonly value: Expression | null;
};

export type GlobalStmt = {
  readonly type: 'GlobalStmt';
  readonly span: Span;
  readonly names: readonly Identifier[];
};

/** An `elif test:` clause. A node of its own, so `elif` never adds a block nesting level. */
export type ElifClause = {
  readonly type: 'ElifClause';
  readonly span: Span;
  readonly test: Expression;
  readonly body: readonly Statement[];
};

export type IfStmt = {
  readonly type: 'IfStmt';
  readonly span: Span;
  readonly test: Expression;
  readonly body: readonly Statement[];
  readonly elifs: readonly ElifClause[];
  readonly orelse: readonly Statement[] | null;
};

export type WhileStmt = {
  readonly type: 'WhileStmt';
  readonly span: Span;
  readonly test: Expression;
  readonly body: readonly Statement[];
};

export type ForStmt = {
  readonly type: 'ForStmt';
  readonly span: Span;
  readonly target: Identifier;
  readonly iterable: Expression;
  readonly body: readonly Statement[];
};

/** `repeat count:` (Sprout-only beginner sugar for `for _ in range(count):`). */
export type RepeatStmt = {
  readonly type: 'RepeatStmt';
  readonly span: Span;
  readonly count: Expression;
  readonly body: readonly Statement[];
};

export type DefStmt = {
  readonly type: 'DefStmt';
  readonly span: Span;
  readonly name: Identifier;
  readonly params: readonly Identifier[];
  readonly body: readonly Statement[];
};

export type Statement =
  | ExprStmt
  | AssignStmt
  | AugAssignStmt
  | PassStmt
  | BreakStmt
  | ContinueStmt
  | ReturnStmt
  | GlobalStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | RepeatStmt
  | DefStmt;

// ---------- containers ----------

/** One source file. `span` covers the whole file, from line 1 col 1 to its end. */
export type FileNode = {
  readonly type: 'FileNode';
  readonly span: Span;
  readonly name: string;
  readonly body: readonly Statement[];
};

/**
 * A whole program: files in run order (every file except `main.sprout` in the given order, then
 * `main.sprout` last; language-spec.md §Files). No span, because it covers several files.
 */
export type Program = { readonly type: 'Program'; readonly files: readonly FileNode[] };

/** Every counted node kind (see the counting rule in the header). */
export type AstNode = Expression | Statement | ElifClause | Identifier;

/** The direct child nodes of `node`, in source order. */
export function childNodes(node: AstNode): readonly AstNode[] {
  switch (node.type) {
    case 'Identifier':
    case 'NameExpr':
    case 'IntLiteral':
    case 'StringLiteral':
    case 'BoolLiteral':
    case 'NoneLiteral':
    case 'PassStmt':
    case 'BreakStmt':
    case 'ContinueStmt':
      return [];
    case 'ListLiteral':
      return node.elements;
    case 'DictLiteral':
      return node.entries.flatMap((entry) => [entry.key, entry.value]);
    case 'UnaryExpr':
      return [node.operand];
    case 'BinaryExpr':
    case 'LogicalExpr':
      return [node.left, node.right];
    case 'CompareExpr':
      return node.operands;
    case 'CallExpr':
      return [node.callee, ...node.args];
    case 'MethodCallExpr':
      return [node.object, node.method, ...node.args];
    case 'IndexExpr':
      return [node.object, node.index];
    case 'ExprStmt':
      return [node.expr];
    case 'AssignStmt':
    case 'AugAssignStmt':
      return [node.target, node.value];
    case 'ReturnStmt':
      return node.value === null ? [] : [node.value];
    case 'GlobalStmt':
      return node.names;
    case 'ElifClause':
    case 'WhileStmt':
      return [node.test, ...node.body];
    case 'IfStmt':
      return [node.test, ...node.body, ...node.elifs, ...(node.orelse ?? [])];
    case 'ForStmt':
      return [node.target, node.iterable, ...node.body];
    case 'RepeatStmt':
      return [node.count, ...node.body];
    case 'DefStmt':
      return [node.name, ...node.params, ...node.body];
  }
}

/** Counts every node under `program` by the rule in the header (Program and FileNode excluded). */
export function countNodes(program: Program): number {
  let count = 0;
  const pending: AstNode[] = program.files.flatMap((file) => file.body);
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    count += 1;
    pending.push(...childNodes(next));
  }
  return count;
}
