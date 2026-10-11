/**
 * Statement parser: one file's token stream → a `FileNode`.
 * Spec: docs/02-language/language-spec.md §Grammar (EBNF `program`, `statement`, `simple_stmt`).
 * Invariants: never throws; a statement that cannot be parsed is reported once and skipped up to and
 * including the NEWLINE that ends it, so parsing always moves forward and later statements are still parsed.
 */

import type { ExprStmt, FileNode, Statement } from './ast';
import { reportUnexpected } from './diagnostics';
import { ExpressionParser } from './expressions';

export class StatementParser extends ExpressionParser {
  /** EBNF `program`. */
  parseFile(): FileNode {
    const body: Statement[] = [];
    while (this.c.peek().kind !== 'EOF') {
      const stmt = this.parseStatement();
      if (stmt !== null) body.push(stmt);
    }
    const eof = this.c.peek();
    return {
      type: 'FileNode',
      span: { file: this.c.file, line: 1, col: 1, endLine: eof.line, endCol: eof.col },
      name: this.c.file,
      body,
    };
  }

  /** EBNF `statement`; `null` after a reported error (the statement's tokens were skipped). */
  private parseStatement(): Statement | null {
    const stmt = this.parseExprStmt();
    if (stmt === null) this.skipStatement();
    return stmt;
  }

  private parseExprStmt(): ExprStmt | null {
    const start = this.c.peek();
    const expr = this.parseExpression();
    if (expr === null) return null;
    if (!this.endOfStatement()) return null;
    return { type: 'ExprStmt', span: this.c.spanFrom(start), expr };
  }

  /** At the end of a simple statement: consumes the NEWLINE that must end it. */
  private endOfStatement(): boolean {
    if (this.c.peek().kind === 'NEWLINE') {
      this.c.next();
      return true;
    }
    reportUnexpected(this.c, 'This line should end here.', null);
    return false;
  }

  /** Skips to just past the next NEWLINE (or to EOF). */
  private skipStatement(): void {
    for (let token = this.c.peek(); token.kind !== 'EOF'; token = this.c.peek()) {
      this.c.next();
      if (token.kind === 'NEWLINE') return;
    }
  }
}
