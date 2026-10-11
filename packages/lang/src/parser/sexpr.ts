/**
 * Text renderings of the AST for tests and debugging: compact S-expressions without spans
 * (`(+ 1 (* 2 3))`, used by the precedence tables) and an indented outline with statement spans (used by
 * the corpus snapshots, interpreter-vm.md §Testing).
 * Invariant: two trees render to the same S-expression exactly when they have the same shape, operators
 * and values; the outline adds every statement's and clause's span.
 */

import type { Span } from '../types';
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

/** One line per statement, `[line:col-endLine:endCol] head`, with block bodies indented two spaces. */
export function outlineFile(file: FileNode): string {
  return [`[${spanText(file.span)}] file ${JSON.stringify(file.name)}`, ...outlineBody(file.body, '  ')].join(
    '\n',
  );
}

function outlineBody(stmts: readonly Statement[], indent: string): string[] {
  return stmts.flatMap((stmt) => outlineStatement(stmt, indent));
}

function outlineStatement(stmt: Statement, indent: string): string[] {
  const line = (span: Span, head: string) => `${indent}[${spanText(span)}] ${head}`;
  const inner = `${indent}  `;
  switch (stmt.type) {
    case 'IfStmt':
      return [
        line(stmt.span, `if ${sexpr(stmt.test)}`),
        ...outlineBody(stmt.body, inner),
        ...stmt.elifs.flatMap((e) => [line(e.span, `elif ${sexpr(e.test)}`), ...outlineBody(e.body, inner)]),
        ...(stmt.orelse === null ? [] : [`${indent}else`, ...outlineBody(stmt.orelse, inner)]),
      ];
    case 'WhileStmt':
      return [line(stmt.span, `while ${sexpr(stmt.test)}`), ...outlineBody(stmt.body, inner)];
    case 'ForStmt':
      return [
        line(stmt.span, `for ${stmt.target.name} in ${sexpr(stmt.iterable)}`),
        ...outlineBody(stmt.body, inner),
      ];
    case 'RepeatStmt':
      return [line(stmt.span, `repeat ${sexpr(stmt.count)}`), ...outlineBody(stmt.body, inner)];
    case 'DefStmt':
      return [
        line(stmt.span, `def ${stmt.name.name}(${stmt.params.map((p) => p.name).join(', ')})`),
        ...outlineBody(stmt.body, inner),
      ];
    case 'ExprStmt':
    case 'AssignStmt':
    case 'AugAssignStmt':
    case 'PassStmt':
    case 'BreakStmt':
    case 'ContinueStmt':
    case 'ReturnStmt':
    case 'GlobalStmt':
      return [line(stmt.span, sexprStatement(stmt))];
  }
}

function spanText(span: Span): string {
  return `${String(span.line)}:${String(span.col)}-${String(span.endLine)}:${String(span.endCol)}`;
}
