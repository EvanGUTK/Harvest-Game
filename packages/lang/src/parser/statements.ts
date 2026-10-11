/**
 * Statement parser: one file's token stream → a `FileNode`.
 * Spec: docs/02-language/language-spec.md §Grammar (EBNF `program`, `statement`, `simple_stmt`,
 * `compound_stmt`, `block`).
 * Invariants: never throws; every loop consumes at least one token per turn, so parsing always reaches
 * EOF. A statement that cannot be parsed is reported once and dropped: a simple statement is skipped up
 * to and including its NEWLINE; a compound statement with a broken header still has its block parsed
 * (so errors inside it are reported) and is then dropped.
 */

import type { Token } from '../lexer/token';
import type {
  AssignTarget,
  BinaryOp,
  CompareExpr,
  DefStmt,
  ElifClause,
  Expression,
  FileNode,
  ForStmt,
  GlobalStmt,
  Identifier,
  IfStmt,
  RepeatStmt,
  ReturnStmt,
  Statement,
  WhileStmt,
} from './ast';
import {
  reportAssignInCondition,
  reportBadTarget,
  reportBlockTooDeep,
  reportBodyNotIndented,
  reportLoopKeywordOutside,
  reportMissingColon,
  reportNestedDef,
  reportReturnOutside,
  reportSlashDivision,
  reportUnexpected,
  reportUnexpectedIndent,
} from './diagnostics';
import { tokenSpan } from './cursor';
import { ExpressionParser } from './expressions';

/**
 * Where a statement sits: whether `break`/`continue` (`inLoop`) and `return` (`inDef`) are allowed, and
 * how many blocks enclose it (`depth`: 0 at the top level of a file, where alone `def` is allowed).
 */
type BlockContext = { readonly inLoop: boolean; readonly inDef: boolean; readonly depth: number };

const TOP_LEVEL: BlockContext = { inLoop: false, inDef: false, depth: 0 };

/** Augmented-assignment token → its arithmetic operator (`x += 1` means `x = x + 1`). */
const AUG_ASSIGN_OPS: ReadonlyMap<string, BinaryOp> = new Map<string, BinaryOp>([
  ['+=', '+'],
  ['-=', '-'],
  ['*=', '*'],
  ['//=', '//'],
  ['%=', '%'],
]);

export class StatementParser extends ExpressionParser {
  /** EBNF `program`. */
  parseFile(): FileNode {
    const body: Statement[] = [];
    for (;;) {
      body.push(...this.parseStatements(TOP_LEVEL));
      // The lexer balances INDENT/DEDENT, so a DEDENT here only comes from a malformed token stream.
      if (this.c.peek().kind !== 'DEDENT') break;
      this.c.next();
    }
    const eof = this.c.peek();
    return {
      type: 'FileNode',
      span: { file: this.c.file, line: 1, col: 1, endLine: eof.line, endCol: eof.col },
      name: this.c.file,
      body,
    };
  }

  /** Statements up to the DEDENT that closes the current block (left unconsumed) or EOF. */
  private parseStatements(ctx: BlockContext): Statement[] {
    const body: Statement[] = [];
    for (let token = this.c.peek(); token.kind !== 'EOF' && token.kind !== 'DEDENT'; token = this.c.peek()) {
      if (token.kind === 'INDENT') {
        body.push(...this.parseUnexpectedIndent(ctx));
      } else {
        const stmt = this.parseStatement(ctx);
        if (stmt !== null) body.push(stmt);
      }
    }
    return body;
  }

  /** Indented lines with no block to belong to: reported, then parsed as part of the current block. */
  private parseUnexpectedIndent(ctx: BlockContext): Statement[] {
    reportUnexpectedIndent(this.c, this.c.next());
    const body = this.parseStatements(ctx);
    if (this.c.peek().kind === 'DEDENT') this.c.next();
    return body;
  }

  /** EBNF `statement`; `null` after a reported error. */
  private parseStatement(ctx: BlockContext): Statement | null {
    const token = this.c.peek();
    if (token.kind === 'KEYWORD') {
      switch (token.text) {
        case 'if':
          return this.parseIf(ctx);
        case 'while':
          return this.parseWhile(ctx);
        case 'for':
          return this.parseFor(ctx);
        case 'repeat':
          return this.parseRepeat(ctx);
        case 'def':
          return this.parseDef(ctx);
        case 'elif':
        case 'else':
          return this.parseOrphanClause(ctx);
      }
    }
    const stmt = this.parseSimpleStatement();
    if (stmt === null) this.skipStatement();
    else this.checkPlacement(stmt.type, token, ctx);
    return stmt;
  }

  /** `return` outside a `def`, `break`/`continue` outside a loop: reported, the statement is kept. */
  private checkPlacement(type: Statement['type'], keyword: Token, ctx: BlockContext): void {
    if (type === 'ReturnStmt' && !ctx.inDef) reportReturnOutside(this.c, keyword);
    if ((type === 'BreakStmt' || type === 'ContinueStmt') && !ctx.inLoop)
      reportLoopKeywordOutside(this.c, keyword);
  }

  // ---------- simple statements ----------

  /** EBNF `simple_stmt NEWLINE`; on `null` the caller skips the rest of the line. */
  private parseSimpleStatement(): Statement | null {
    const start = this.c.peek();
    const stmt = this.parseSimpleStatementBody(start);
    if (stmt === null || !this.endOfStatement()) return null;
    return stmt;
  }

  private parseSimpleStatementBody(start: Token): Statement | null {
    if (start.kind === 'KEYWORD') {
      switch (start.text) {
        case 'pass':
          this.c.next();
          return { type: 'PassStmt', span: this.c.spanFrom(start) };
        case 'break':
          this.c.next();
          return { type: 'BreakStmt', span: this.c.spanFrom(start) };
        case 'continue':
          this.c.next();
          return { type: 'ContinueStmt', span: this.c.spanFrom(start) };
        case 'return':
          return this.parseReturn();
        case 'global':
          return this.parseGlobal();
      }
    }
    return this.parseExpressionStatement(start);
  }

  private parseReturn(): ReturnStmt | null {
    const start = this.c.next();
    if (this.c.peek().kind === 'NEWLINE')
      return { type: 'ReturnStmt', span: this.c.spanFrom(start), value: null };
    const value = this.parseExpression();
    return value === null ? null : { type: 'ReturnStmt', span: this.c.spanFrom(start), value };
  }

  /** EBNF `"global" NAME { "," NAME }`. */
  private parseGlobal(): GlobalStmt | null {
    const start = this.c.next();
    const names: Identifier[] = [];
    do {
      const name = this.expectName('A name should follow `global`, as in `global total`.');
      if (name === null) return null;
      names.push(name);
    } while (this.c.eatOp(',') !== null);
    return { type: 'GlobalStmt', span: this.c.spanFrom(start), names };
  }

  /** EBNF `assign | aug_assign | expr`: parsed as an expression first, then checked as a target. */
  private parseExpressionStatement(start: Token): Statement | null {
    const expr = this.parseExpression();
    if (expr === null) return null;
    const operator = this.c.peek();
    if (this.c.isOp('=')) {
      this.c.next();
      const target = this.assignTarget(expr);
      const value = this.parseExpression();
      if (target === null || value === null) return null;
      return { type: 'AssignStmt', span: this.c.spanFrom(start), target, value };
    }
    const op = this.augAssignOperator(operator);
    if (op !== null) {
      this.c.next();
      const target = this.assignTarget(expr);
      const value = this.parseExpression();
      if (target === null || value === null) return null;
      return {
        type: 'AugAssignStmt',
        span: this.c.spanFrom(start),
        target,
        op,
        operatorSpan: tokenSpan(operator),
        value,
      };
    }
    return { type: 'ExprStmt', span: this.c.spanFrom(start), expr };
  }

  /** `+=` … `%=`; `/=` is reported (E-SLASH-DIVISION) and read as `//=`. */
  private augAssignOperator(token: Token): BinaryOp | null {
    if (token.kind !== 'OP') return null;
    if (token.text === '/=') {
      reportSlashDivision(this.c, token);
      return '//';
    }
    return AUG_ASSIGN_OPS.get(token.text) ?? null;
  }

  /** EBNF `target`: a name or an indexed slot. Anything else is E-BAD-TARGET. */
  private assignTarget(expr: Expression): AssignTarget | null {
    if (expr.type === 'NameExpr' || expr.type === 'IndexExpr') return expr;
    reportBadTarget(this.c, expr.span);
    return null;
  }

  // ---------- compound statements ----------

  /** EBNF `if_stmt`. */
  private parseIf(ctx: BlockContext): IfStmt | null {
    const start = this.c.next();
    const test = this.parseCondition(start);
    const body = this.parseBlock(start, ctx);
    const elifs: ElifClause[] = [];
    let clausesOk = true;
    for (let elif = this.c.peek(); this.c.isKeyword('elif'); elif = this.c.peek()) {
      this.c.next();
      const elifTest = this.parseCondition(elif);
      const elifBody = this.parseBlock(elif, ctx);
      if (elifTest === null) clausesOk = false;
      else elifs.push({ type: 'ElifClause', span: this.c.spanFrom(elif), test: elifTest, body: elifBody });
    }
    const orelse = this.parseElse(ctx);
    if (test === null || !clausesOk || orelse === 'error') return null;
    return { type: 'IfStmt', span: this.c.spanFrom(start), test, body, elifs, orelse };
  }

  /** `else: block` after an `if`, or `null` when there is none. */
  private parseElse(ctx: BlockContext): Statement[] | null | 'error' {
    const elseToken = this.c.eatKeyword('else');
    if (elseToken === null) return null;
    const headerOk = this.finishHeader(this.expectColon(elseToken));
    const body = this.parseBlock(elseToken, ctx);
    return headerOk ? body : 'error';
  }

  /** EBNF `while_stmt`. */
  private parseWhile(ctx: BlockContext): WhileStmt | null {
    const start = this.c.next();
    const test = this.parseCondition(start);
    const body = this.parseBlock(start, { ...ctx, inLoop: true });
    return test === null ? null : { type: 'WhileStmt', span: this.c.spanFrom(start), test, body };
  }

  /** EBNF `repeat_stmt`. */
  private parseRepeat(ctx: BlockContext): RepeatStmt | null {
    const start = this.c.next();
    const count = this.parseHeaderExpression(start);
    const body = this.parseBlock(start, { ...ctx, inLoop: true });
    return count === null ? null : { type: 'RepeatStmt', span: this.c.spanFrom(start), count, body };
  }

  /** EBNF `for_stmt`. */
  private parseFor(ctx: BlockContext): ForStmt | null {
    const start = this.c.next();
    const header = this.parseForHeader();
    const headerOk = this.finishHeader(header !== null && this.expectColon(start));
    const body = this.parseBlock(start, { ...ctx, inLoop: true });
    if (header === null || !headerOk) return null;
    return {
      type: 'ForStmt',
      span: this.c.spanFrom(start),
      target: header.target,
      iterable: header.iterable,
      body,
    };
  }

  private parseForHeader(): { target: Identifier; iterable: Expression } | null {
    const target = this.expectName('A name should follow `for`, as in `for x in range(5):`.');
    if (target === null) return null;
    if (this.c.eatKeyword('in') === null) {
      reportUnexpected(this.c, '`in` should come next, as in `for x in range(5):`.', null);
      return null;
    }
    const iterable = this.parseExpression();
    return iterable === null ? null : { target, iterable };
  }

  /** EBNF `def_stmt`. Only at the top level of a file; elsewhere E-NESTED-DEF (the node is kept). */
  private parseDef(ctx: BlockContext): DefStmt | null {
    const start = this.c.next();
    if (ctx.depth > 0) reportNestedDef(this.c, start);
    const header = this.parseDefHeader();
    const headerOk = this.finishHeader(header !== null && this.expectColon(start));
    const body = this.parseBlock(start, { inLoop: false, inDef: true, depth: ctx.depth });
    if (header === null || !headerOk) return null;
    return { type: 'DefStmt', span: this.c.spanFrom(start), name: header.name, params: header.params, body };
  }

  private parseDefHeader(): { name: Identifier; params: Identifier[] } | null {
    const name = this.expectName('A name should follow `def`, as in `def tend():`.');
    if (name === null) return null;
    const open = this.c.eatOp('(');
    if (open === null) {
      reportUnexpected(this.c, 'A `(` should come next, as in `def tend():`.', null);
      return null;
    }
    const params: Identifier[] = [];
    if (this.c.eatOp(')') !== null) return { name, params };
    do {
      const param = this.expectName('A parameter name should come next.', open);
      if (param === null) return null;
      params.push(param);
    } while (this.c.eatOp(',') !== null);
    if (this.c.eatOp(')') === null) {
      reportUnexpected(this.c, 'A `,` or `)` should come next.', open);
      return null;
    }
    return { name, params };
  }

  /** An `elif` or `else` with no `if` before it: reported, its block parsed for errors, then dropped. */
  private parseOrphanClause(ctx: BlockContext): null {
    const keyword = this.c.peek();
    reportUnexpected(this.c, `\`${keyword.text}\` needs an \`if\` above it, at the same indent.`, null);
    this.c.next();
    this.skipToLineEnd();
    this.parseBlock(keyword, ctx);
    return null;
  }

  // ---------- headers and blocks ----------

  /** `keyword expr :` for `repeat`; `null` after a reported error. */
  private parseHeaderExpression(keyword: Token): Expression | null {
    const expr = this.parseExpression();
    return this.finishHeader(expr !== null && this.expectColon(keyword)) ? expr : null;
  }

  /**
   * The condition of `if`, `elif` or `while`, then `:`. `if x = 3:` is E-ASSIGN-IN-IF and is read as
   * `x == 3`, so the rest of the program is still checked.
   */
  private parseCondition(keyword: Token): Expression | null {
    const start = this.c.peek();
    const left = this.parseExpression();
    const equals = left === null ? null : this.c.eatOp('=');
    const test = left === null || equals === null ? left : this.repairAssignInCondition(start, left, equals);
    return this.finishHeader(test !== null && this.expectColon(keyword)) ? test : null;
  }

  /** At the `=` after `left` in a condition: reports E-ASSIGN-IN-IF and builds `left == right`. */
  private repairAssignInCondition(start: Token, left: Expression, equals: Token): CompareExpr | null {
    reportAssignInCondition(this.c, equals);
    const right = this.parseExpression();
    if (right === null) return null;
    const operands = [left, right];
    return this.built(
      {
        type: 'CompareExpr',
        span: this.c.spanFrom(start),
        operands,
        operators: [{ op: '==', span: tokenSpan(equals) }],
      },
      operands,
    );
  }

  /** After a header: when it failed, skips what is left of the line so the block can still be parsed. */
  private finishHeader(ok: boolean): boolean {
    if (!ok) this.skipToLineEnd();
    return ok;
  }

  /** The `:` that ends a header. A header line that simply stops is E-MISSING-COLON, read as if it were there. */
  private expectColon(keyword: Token): boolean {
    if (this.c.eatOp(':') !== null) return true;
    if (this.c.peek().kind === 'NEWLINE') {
      reportMissingColon(this.c, keyword, this.c.lastSignificant);
      return true;
    }
    reportUnexpected(this.c, `A \`:\` should end this \`${keyword.text}\` line.`, null);
    return false;
  }

  /**
   * EBNF `block = NEWLINE INDENT statement { statement } DEDENT`, after the header of `keyword`. A body
   * written on the header line (`if x: pass`, a Python habit) or not indented is E-BAD-INDENT, once.
   */
  private parseBlock(keyword: Token, ctx: BlockContext): Statement[] {
    const sameLine = this.c.peek().kind !== 'NEWLINE';
    if (sameLine) {
      reportBodyNotIndented(this.c, keyword, this.c.peek());
      this.skipToLineEnd();
    }
    if (this.c.peek().kind === 'NEWLINE') this.c.next();
    if (this.c.peek().kind !== 'INDENT') {
      if (!sameLine) reportBodyNotIndented(this.c, keyword, this.c.peek());
      return [];
    }
    this.c.next();
    const inner = { ...ctx, depth: ctx.depth + 1 };
    if (inner.depth === this.limits.maxNesting + 1) reportBlockTooDeep(this.c, keyword, this.limits);
    const body = this.parseStatements(inner);
    if (this.c.peek().kind === 'DEDENT') this.c.next();
    return body;
  }

  // ---------- helpers ----------

  private expectName(expected: string, openBracket: Token | null = null): Identifier | null {
    const token = this.c.peek();
    if (token.kind !== 'NAME') {
      reportUnexpected(this.c, expected, openBracket);
      return null;
    }
    this.c.next();
    return this.identifier(token);
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

  /** Skips to the NEWLINE that ends the current line, leaving it unconsumed. */
  private skipToLineEnd(): void {
    for (let token = this.c.peek(); token.kind !== 'NEWLINE' && token.kind !== 'EOF'; token = this.c.peek()) {
      this.c.next();
    }
  }

  /** Skips to just past the NEWLINE that ends the current line (or to EOF). */
  private skipStatement(): void {
    this.skipToLineEnd();
    if (this.c.peek().kind === 'NEWLINE') this.c.next();
  }
}
