/**
 * Compact S-expression rendering of the AST, without spans: `(+ 1 (* 2 3))`.
 * Used by the parser's precedence tables and the corpus snapshots (interpreter-vm.md §Testing), and as a
 * debugging aid. Spans are tested separately, so leaving them out keeps the tables readable.
 * Invariant: two trees render to the same text exactly when they have the same shape, operators and values.
 */

import type { Expression, FileNode, Program, Statement } from './ast';

export function sexprProgram(program: Program): string {
  return program.files.map(sexprFile).join('\n');
}

export function sexprFile(file: FileNode): string {
  return `(file ${JSON.stringify(file.name)}${body(file.body)})`;
}

export function sexprStatement(stmt: Statement): string {
  switch (stmt.type) {
    case 'ExprStmt':
      return `(expr ${sexpr(stmt.expr)})`;
    case 'AssignStmt':
      return `(= ${sexpr(stmt.target)} ${sexpr(stmt.value)})`;
    case 'AugAssignStmt':
      return `(${stmt.op}= ${sexpr(stmt.target)} ${sexpr(stmt.value)})`;
    case 'PassStmt':
      return '(pass)';
    case 'BreakStmt':
      return '(break)';
    case 'ContinueStmt':
      return '(continue)';
    case 'ReturnStmt':
      return stmt.value === null ? '(return)' : `(return ${sexpr(stmt.value)})`;
    case 'GlobalStmt':
      return `(global ${stmt.names.map((n) => n.name).join(' ')})`;
    case 'IfStmt': {
      const elifs = stmt.elifs.map((e) => ` (elif ${sexpr(e.test)}${body(e.body)})`).join('');
      const orelse = stmt.orelse === null ? '' : ` (else${body(stmt.orelse)})`;
      return `(if ${sexpr(stmt.test)}${body(stmt.body)}${elifs}${orelse})`;
    }
    case 'WhileStmt':
      return `(while ${sexpr(stmt.test)}${body(stmt.body)})`;
    case 'ForStmt':
      return `(for ${stmt.target.name} ${sexpr(stmt.iterable)}${body(stmt.body)})`;
    case 'RepeatStmt':
      return `(repeat ${sexpr(stmt.count)}${body(stmt.body)})`;
    case 'DefStmt':
      return `(def ${stmt.name.name} (${stmt.params.map((p) => p.name).join(' ')})${body(stmt.body)})`;
  }
}

export function sexpr(expr: Expression): string {
  switch (expr.type) {
    case 'NameExpr':
      return expr.name;
    case 'IntLiteral':
      return String(expr.value);
    case 'StringLiteral':
      return JSON.stringify(expr.value);
    case 'BoolLiteral':
      return expr.value ? 'True' : 'False';
    case 'NoneLiteral':
      return 'None';
    case 'ListLiteral':
      return list('list', expr.elements.map(sexpr));
    case 'DictLiteral':
      return list(
        'dict',
        expr.entries.map((e) => `(${sexpr(e.key)} ${sexpr(e.value)})`),
      );
    case 'UnaryExpr':
      return `(${expr.op} ${sexpr(expr.operand)})`;
    case 'BinaryExpr':
    case 'LogicalExpr':
      return `(${expr.op} ${sexpr(expr.left)} ${sexpr(expr.right)})`;
    case 'CompareExpr':
      return `(cmp ${compareChain(
        expr.operands,
        expr.operators.map((o) => o.op),
      )})`;
    case 'CallExpr':
      return list(`call ${sexpr(expr.callee)}`, expr.args.map(sexpr));
    case 'MethodCallExpr':
      return list(`method ${sexpr(expr.object)} ${expr.method.name}`, expr.args.map(sexpr));
    case 'IndexExpr':
      return `(index ${sexpr(expr.object)} ${sexpr(expr.index)})`;
  }
}

function compareChain(operands: readonly Expression[], ops: readonly string[]): string {
  return operands
    .map((operand, i) => (i === 0 ? sexpr(operand) : `${ops[i - 1] ?? '?'} ${sexpr(operand)}`))
    .join(' ');
}

function list(head: string, items: readonly string[]): string {
  return items.length === 0 ? `(${head})` : `(${head} ${items.join(' ')})`;
}

function body(stmts: readonly Statement[]): string {
  return stmts.map((s) => ` ${sexprStatement(s)}`).join('');
}
