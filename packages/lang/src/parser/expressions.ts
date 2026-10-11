/**
 * Recursive-descent expression parser, one method per EBNF level:
 * or < and < not < comparison < sum < term < unary < postfix < atom.
 * Spec: docs/02-language/language-spec.md §Grammar (EBNF), §Limits (expression nesting depth).
 * Invariants: never throws; a method returns `null` only after a diagnostic was recorded (or the lexer
 * already reported the ERROR token it stopped at), and callers pass `null` straight up without
 * reporting again. The height of every expression tree is at most `limits.maxExpressionDepth`
 * (language-spec.md §Limits): a leaf is height 1, a node is one more than its tallest child, and a pair of
 * parentheses adds one. Heights are computed as nodes are built, so left-deep chains (`a + b + …`,
 * `f()()…`) are caught; recursion is bounded because every nested `parseExpression` or prefix operator
 * sits inside a construct that adds at least one to the height, so the descent depth is checked too.
 *
 * A class because one parse has lifecycle state (depth, heights, open brackets); the statement parser
 * extends it.
 */

import type { Token } from '../lexer/token';
import type { Limits } from '../types';
import type {
  BinaryOp,
  CompareOp,
  CompareOperator,
  DictEntry,
  Expression,
  Identifier,
  LogicalOp,
  UnaryOp,
} from './ast';
import { joinSpans, tokenSpan, touching, type TokenCursor } from './cursor';
import {
  EXPECT_VALUE,
  reportExpressionTooDeep,
  reportNoFloat,
  reportNoPower,
  reportSlashDivision,
  reportUnexpected,
  type Expectation,
} from './diagnostics';

/** Operator token text → AST operator, per EBNF level (typed lookups instead of casts). */
const COMPARE_OPS: ReadonlyMap<string, CompareOp> = new Map<string, CompareOp>([
  ['==', '=='],
  ['!=', '!='],
  ['<', '<'],
  ['<=', '<='],
  ['>', '>'],
  ['>=', '>='],
]);
const SUM_OPS: ReadonlyMap<string, BinaryOp> = new Map<string, BinaryOp>([
  ['+', '+'],
  ['-', '-'],
]);
const TERM_OPS: ReadonlyMap<string, BinaryOp> = new Map<string, BinaryOp>([
  ['*', '*'],
  ['//', '//'],
  ['%', '%'],
]);

export class ExpressionParser {
  /** Nested `parseExpression` and prefix-operator levels currently open (never more than the height). */
  private depth = 0;
  /** Height of each expression built so far in this file (bounded by the file's size). */
  private readonly heights = new Map<Expression, number>();
  private readonly openBrackets: Token[] = [];

  constructor(
    protected readonly c: TokenCursor,
    protected readonly limits: Limits,
  ) {}

  /** EBNF `expr`. */
  parseExpression(): Expression | null {
    if (!this.enterLevel()) return null;
    const result = this.parseLogical('or', () => this.parseLogical('and', () => this.parseNot()));
    this.depth -= 1;
    return result;
  }

  /** The innermost bracket still open, so running into the end of the file names it. */
  protected innermostBracket(): Token | null {
    return this.openBrackets[this.openBrackets.length - 1] ?? null;
  }

  protected identifier(token: Token): Identifier {
    return { type: 'Identifier', span: tokenSpan(token), name: token.text };
  }

  /**
   * Records the height of a newly built node (one more than its tallest child), or reports E-TOO-DEEP
   * once, at the token that completed it, and returns `null`.
   */
  protected built<T extends Expression>(node: T, children: readonly Expression[]): T | null {
    let tallest = 0;
    for (const child of children) tallest = Math.max(tallest, this.heightOf(child));
    return this.withHeight(node, tallest + 1);
  }

  private withHeight<T extends Expression>(node: T, height: number): T | null {
    if (height > this.limits.maxExpressionDepth) {
      reportExpressionTooDeep(this.c, this.c.lastSignificant, this.limits);
      return null;
    }
    this.heights.set(node, height);
    return node;
  }

  private heightOf(expr: Expression): number {
    return this.heights.get(expr) ?? 1;
  }

  /** Descending into a nested expression or a prefix operator; the result is at least this tall. */
  private enterLevel(): boolean {
    if (this.depth >= this.limits.maxExpressionDepth) {
      reportExpressionTooDeep(this.c, this.c.peek(), this.limits);
      return false;
    }
    this.depth += 1;
    return true;
  }

  /** EBNF `or_expr` / `and_expr`: left-associative short-circuit operators. */
  private parseLogical(op: LogicalOp, operand: () => Expression | null): Expression | null {
    const start = this.c.peek();
    let left = operand();
    if (left === null) return null;
    for (let opToken = this.c.eatKeyword(op); opToken !== null; opToken = this.c.eatKeyword(op)) {
      const right = operand();
      if (right === null) return null;
      const node: Expression | null = this.built(
        {
          type: 'LogicalExpr',
          span: this.c.spanFrom(start),
          op,
          operatorSpan: tokenSpan(opToken),
          left,
          right,
        },
        [left, right],
      );
      if (node === null) return null;
      left = node;
    }
    return left;
  }

  /** EBNF `not_expr`. */
  private parseNot(): Expression | null {
    return this.c.isKeyword('not') ? this.parsePrefix('not', () => this.parseNot()) : this.parseComparison();
  }

  /** EBNF `comparison`: a whole chain is one CompareExpr; a lone operand is returned as it is. */
  private parseComparison(): Expression | null {
    const start = this.c.peek();
    const first = this.parseSum();
    if (first === null) return null;
    const operands: Expression[] = [first];
    const operators: CompareOperator[] = [];
    for (let op = this.takeCompareOperator(); op !== null; op = this.takeCompareOperator()) {
      const right = this.parseSum();
      if (right === null) return null;
      operators.push(op);
      operands.push(right);
    }
    if (operators.length === 0) return first;
    return this.built({ type: 'CompareExpr', span: this.c.spanFrom(start), operands, operators }, operands);
  }

  private takeCompareOperator(): CompareOperator | null {
    const token = this.c.peek();
    const op = token.kind === 'OP' ? COMPARE_OPS.get(token.text) : undefined;
    if (op !== undefined) {
      this.c.next();
      return { op, span: tokenSpan(token) };
    }
    if (this.c.isKeyword('in')) return { op: 'in', span: tokenSpan(this.c.next()) };
    if (this.c.isKeyword('not') && this.c.isKeyword('in', 1)) {
      const not = this.c.next();
      const inToken = this.c.next();
      return { op: 'not in', span: joinSpans(tokenSpan(not), tokenSpan(inToken)) };
    }
    return null;
  }

  /** EBNF `sum`. */
  private parseSum(): Expression | null {
    return this.parseBinary(
      () => this.parseTerm(),
      () => this.takeOperator(SUM_OPS),
    );
  }

  /** EBNF `term`. */
  private parseTerm(): Expression | null {
    return this.parseBinary(
      () => this.parseUnary(),
      () => this.takeTermOperator(),
    );
  }

  /**
   * A left-associative binary level. `takeOp` returns the operator it consumed, `null` when the next
   * token is not one of this level's operators, or `'error'` after reporting a malformed operator.
   */
  private parseBinary(
    operand: () => Expression | null,
    takeOp: () => { op: BinaryOp; token: Token } | null | 'error',
  ): Expression | null {
    const start = this.c.peek();
    let left = operand();
    if (left === null) return null;
    for (;;) {
      const taken = takeOp();
      if (taken === 'error') return null;
      if (taken === null) return left;
      const right = operand();
      if (right === null) return null;
      const node: Expression | null = this.built(
        {
          type: 'BinaryExpr',
          span: this.c.spanFrom(start),
          op: taken.op,
          operatorSpan: tokenSpan(taken.token),
          left,
          right,
        },
        [left, right],
      );
      if (node === null) return null;
      left = node;
    }
  }

  private takeOperator(ops: ReadonlyMap<string, BinaryOp>): { op: BinaryOp; token: Token } | null {
    const token = this.c.peek();
    const op = token.kind === 'OP' ? ops.get(token.text) : undefined;
    if (op === undefined) return null;
    this.c.next();
    return { op, token };
  }

  /** `*`, `//`, `%`; `/` is reported and read as `//`; `**` (lexed `*` `*`) is reported. */
  private takeTermOperator(): { op: BinaryOp; token: Token } | null | 'error' {
    const token = this.c.peek();
    const after = this.c.peek(1);
    if (
      this.c.isOp('*') &&
      after.kind === 'OP' &&
      (after.text === '*' || after.text === '*=') &&
      touching(token, after)
    ) {
      reportNoPower(this.c, token, after);
      return 'error';
    }
    if (this.c.isOp('/')) {
      reportSlashDivision(this.c, token);
      this.c.next();
      return { op: '//', token };
    }
    return this.takeOperator(TERM_OPS);
  }

  /** EBNF `unary`. */
  private parseUnary(): Expression | null {
    return this.c.isOp('-') ? this.parsePrefix('-', () => this.parseUnary()) : this.parsePostfix();
  }

  /** A prefix `-` or `not` at the current token; each one is a nesting level. */
  private parsePrefix(op: UnaryOp, operandParser: () => Expression | null): Expression | null {
    const start = this.c.peek();
    if (!this.enterLevel()) return null;
    this.c.next();
    const operand = operandParser();
    this.depth -= 1;
    if (operand === null) return null;
    return this.built({ type: 'UnaryExpr', span: this.c.spanFrom(start), op, operand }, [operand]);
  }

  /** EBNF `postfix`: calls, indexing and method calls, applied left to right. */
  private parsePostfix(): Expression | null {
    const start = this.c.peek();
    let expr = this.parseAtom();
    while (expr !== null) {
      if (this.c.isOp('(')) {
        const callee: Expression = expr;
        const args = this.parseList(this.c.next(), ')', () => this.parseExpression());
        expr =
          args === null
            ? null
            : this.built({ type: 'CallExpr', span: this.c.spanFrom(start), callee, args }, [callee, ...args]);
      } else if (this.c.isOp('[')) {
        const object: Expression = expr;
        const index = this.parseIndex(this.c.next());
        expr =
          index === null
            ? null
            : this.built({ type: 'IndexExpr', span: this.c.spanFrom(start), object, index }, [object, index]);
      } else if (this.c.isOp('.')) {
        expr = this.parseMethodCall(start, expr);
      } else {
        return expr;
      }
    }
    return null;
  }

  private parseIndex(open: Token): Expression | null {
    return this.inBrackets(open, () => {
      const index = this.parseExpression();
      if (index === null) return null;
      return this.expectCloser(']', open, false) ? index : null;
    });
  }

  /** At the `.` after `object`. `1.5` (INT `.` INT, nothing between) is E-NO-FLOAT. */
  private parseMethodCall(start: Token, object: Expression): Expression | null {
    const before = this.c.previous();
    const dot = this.c.next();
    const name = this.c.peek();
    if (before.kind === 'INT' && name.kind === 'INT' && touching(before, dot) && touching(dot, name)) {
      reportNoFloat(this.c, before, name);
      return null;
    }
    if (name.kind !== 'NAME') {
      reportUnexpected(
        this.c,
        'A method name should follow `.`, as in `lst.append(x)`.',
        this.innermostBracket(),
      );
      return null;
    }
    this.c.next();
    if (!this.c.isOp('(')) {
      reportUnexpected(this.c, 'A method call needs brackets, as in `lst.pop()`.', this.innermostBracket());
      return null;
    }
    const args = this.parseList(this.c.next(), ')', () => this.parseExpression());
    if (args === null) return null;
    return this.built(
      { type: 'MethodCallExpr', span: this.c.spanFrom(start), object, method: this.identifier(name), args },
      [object, ...args],
    );
  }

  /** EBNF `atom`. */
  private parseAtom(): Expression | null {
    const token = this.c.peek();
    const span = tokenSpan(token);
    switch (token.kind) {
      case 'NAME':
        this.c.next();
        return { type: 'NameExpr', span, name: token.text };
      case 'INT':
        this.c.next();
        return { type: 'IntLiteral', span, value: typeof token.value === 'number' ? token.value : 0 };
      case 'STRING':
        this.c.next();
        return { type: 'StringLiteral', span, value: typeof token.value === 'string' ? token.value : '' };
      case 'KEYWORD':
        return this.parseKeywordAtom(token);
      case 'OP':
        return this.parseBracketAtom(token);
      case 'NEWLINE':
      case 'INDENT':
      case 'DEDENT':
      case 'EOF':
      case 'ERROR':
        reportUnexpected(this.c, EXPECT_VALUE, this.innermostBracket());
        return null;
    }
  }

  private parseKeywordAtom(token: Token): Expression | null {
    const span = tokenSpan(token);
    if (token.text === 'True' || token.text === 'False') {
      this.c.next();
      return { type: 'BoolLiteral', span, value: token.text === 'True' };
    }
    if (token.text === 'None') {
      this.c.next();
      return { type: 'NoneLiteral', span };
    }
    reportUnexpected(this.c, EXPECT_VALUE, this.innermostBracket());
    return null;
  }

  private parseBracketAtom(token: Token): Expression | null {
    if (token.text === '(') return this.parseParenthesized(this.c.next());
    if (token.text === '[') {
      const elements = this.parseList(this.c.next(), ']', () => this.parseExpression());
      return elements === null
        ? null
        : this.built({ type: 'ListLiteral', span: this.c.spanFrom(token), elements }, elements);
    }
    if (token.text === '{') {
      const entries = this.parseList(this.c.next(), '}', () => this.parseDictEntry());
      return entries === null
        ? null
        : this.built(
            { type: 'DictLiteral', span: this.c.spanFrom(token), entries },
            entries.flatMap((e) => [e.key, e.value]),
          );
    }
    reportUnexpected(this.c, EXPECT_VALUE, this.innermostBracket());
    return null;
  }

  /** `( expr )`: no node of its own; the inner expression keeps its own span, and the parentheses add 1 to its height. */
  private parseParenthesized(open: Token): Expression | null {
    return this.inBrackets(open, () => {
      const inner = this.parseExpression();
      if (inner === null) return null;
      return this.expectCloser(')', open, false) ? this.withHeight(inner, this.heightOf(inner) + 1) : null;
    });
  }

  /** EBNF `kv`. */
  private parseDictEntry(): DictEntry | null {
    const key = this.parseExpression();
    if (key === null) return null;
    if (this.c.eatOp(':') === null) {
      reportUnexpected(this.c, 'A `:` should come between a key and its value.', this.innermostBracket());
      return null;
    }
    const value = this.parseExpression();
    return value === null ? null : { key, value };
  }

  /**
   * Comma-separated items up to `close`, after the opening bracket `open` (EBNF `args`, list and dict
   * literals). The EBNF has no trailing comma, so `[1, 2,]` is an error (with a kind help line).
   */
  private parseList<T>(open: Token, close: string, item: () => T | null): T[] | null {
    return this.inBrackets(open, () => {
      const items: T[] = [];
      if (this.c.eatOp(close) !== null) return items;
      for (;;) {
        const parsed = item();
        if (parsed === null) return null;
        items.push(parsed);
        if (this.c.eatOp(',') === null) break;
      }
      return this.expectCloser(close, open, true) ? items : null;
    });
  }

  /** Consumes `close`, or reports what should have come instead (`,` too, inside a comma-separated list). */
  private expectCloser(close: string, open: Token, afterListItem: boolean): boolean {
    if (this.c.eatOp(close) !== null) return true;
    const expected: Expectation = afterListItem
      ? `A \`,\` or \`${close}\` should come next.`
      : `A \`${close}\` should come next.`;
    reportUnexpected(this.c, expected, open);
    return false;
  }

  private inBrackets<T>(open: Token, parse: () => T): T {
    this.openBrackets.push(open);
    const result = parse();
    this.openBrackets.pop();
    return result;
  }
}
