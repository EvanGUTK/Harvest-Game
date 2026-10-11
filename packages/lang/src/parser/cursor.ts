/**
 * Token cursor for the recursive-descent parser: position, lookahead, span building and diagnostics.
 * Spec: docs/03-architecture/interpreter-vm.md §Parser.
 * Invariants: the token array always ends with EOF (the lexer guarantees it) and the cursor never moves
 * past it, so `peek` and `next` are total; `lastSignificant` is the last consumed token that is not
 * NEWLINE, INDENT, DEDENT or EOF, which is where every node's span ends.
 *
 * `TokenCursor` is a class because one file's parse has lifecycle state (position, diagnostics); it is
 * created and discarded inside `parse()` and never shared.
 */

import type { Token } from '../lexer/token';
import type { Diagnostic, Span } from '../types';

export type DiagnosticBody = { message: string; help?: string; fix?: Diagnostic['fix'] };

export class TokenCursor {
  private pos = 0;
  private last: Token;
  private readonly eof: Token;
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly tokens: readonly Token[],
    readonly file: string,
  ) {
    this.eof = tokens[tokens.length - 1] ?? startOfFileEof(file);
    this.last = this.peek();
  }

  /** The token `ahead` positions from the current one, clamped to EOF. */
  peek(ahead = 0): Token {
    return this.tokens[this.pos + ahead] ?? this.eof;
  }

  /** The token before the current one (the current one at the start of the file). */
  previous(): Token {
    return this.tokens[this.pos - 1] ?? this.peek();
  }

  next(): Token {
    const token = this.peek();
    if (token.kind !== 'EOF') this.pos += 1;
    if (isSignificant(token)) this.last = token;
    return token;
  }

  /** The last consumed token that carries source text; node spans end here. */
  get lastSignificant(): Token {
    return this.last;
  }

  isOp(text: string, ahead = 0): boolean {
    const token = this.peek(ahead);
    return token.kind === 'OP' && token.text === text;
  }

  isKeyword(text: string, ahead = 0): boolean {
    const token = this.peek(ahead);
    return token.kind === 'KEYWORD' && token.text === text;
  }

  /** Consumes the current token when it is the operator `text`. */
  eatOp(text: string): Token | null {
    return this.isOp(text) ? this.next() : null;
  }

  eatKeyword(text: string): Token | null {
    return this.isKeyword(text) ? this.next() : null;
  }

  /** The span from the start of `first` to the end of the last significant token consumed so far. */
  spanFrom(first: Token): Span {
    return joinSpans(tokenSpan(first), tokenSpan(this.last));
  }

  report(code: string, range: Span, body: DiagnosticBody): void {
    const diagnostic: Diagnostic = { code, severity: 'error', range, message: body.message };
    if (body.help !== undefined) diagnostic.help = body.help;
    if (body.fix !== undefined) diagnostic.fix = body.fix;
    this.diagnostics.push(diagnostic);
  }
}

/** Stands in for the lexer's EOF if a token array ever arrives empty, so the cursor stays total. */
function startOfFileEof(file: string): Token {
  return { kind: 'EOF', text: '', file, line: 1, col: 1, offset: 0, length: 0 };
}

function isSignificant(token: Token): boolean {
  return (
    token.kind !== 'NEWLINE' && token.kind !== 'INDENT' && token.kind !== 'DEDENT' && token.kind !== 'EOF'
  );
}

/** Every token lies on one line (interpreter-vm.md §Lexer), so its span is `length` columns wide. */
export function tokenSpan(token: Token): Span {
  return {
    file: token.file,
    line: token.line,
    col: token.col,
    endLine: token.line,
    endCol: token.col + token.length,
  };
}

/** A zero-width span just after `token`: where an insertion fix-it goes. */
export function spanAfter(token: Token): Span {
  const end = token.col + token.length;
  return { file: token.file, line: token.line, col: end, endLine: token.line, endCol: end };
}

export function joinSpans(first: Span, last: Span): Span {
  return { file: first.file, line: first.line, col: first.col, endLine: last.endLine, endCol: last.endCol };
}

/** True when `second` starts exactly where `first` ends, with no space between (juxtaposition). */
export function touching(first: Token, second: Token): boolean {
  return first.offset + first.length === second.offset;
}
