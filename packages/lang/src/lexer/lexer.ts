/**
 * Sprout lexer: source text → tokens with Python-style INDENT/DEDENT/NEWLINE.
 * Spec: docs/02-language/language-spec.md §Lexical structure; docs/03-architecture/interpreter-vm.md §Lexer.
 * Invariants: hand-written (no regex), never throws on any input, every token's `text` is the exact
 * source slice at `offset`, tokens never overlap, INDENT/DEDENT appear only at the start of a logical
 * line and are balanced by EOF, and an unknown character becomes an ERROR token so lexing continues.
 *
 * `Lexer` is a class because a tokenisation has lifecycle state (position, indent stack, bracket
 * depth); it is created and discarded inside `tokenize()` and never shared.
 */

import { DEFAULT_LIMITS, type Diagnostic, type Limits, type SourceFile, type Span } from '../types';
import { KEYWORDS, OPERATORS, type Token, type TokenKind } from './token';
import { utf8Length } from './utf8';

export type LexResult = { readonly tokens: readonly Token[]; readonly diagnostics: readonly Diagnostic[] };

/** language-spec.md: "A tab counts as 4 spaces." */
const TAB_WIDTH = 4;
/** Decimal digits of Number.MAX_SAFE_INTEGER (9,007,199,254,740,991), compared as strings. */
const MAX_SAFE_DIGITS = String(Number.MAX_SAFE_INTEGER);
const MAX_SAFE_PRETTY = '9,007,199,254,740,991';

export function tokenize(file: SourceFile, limits: Limits = DEFAULT_LIMITS): LexResult {
  return new Lexer(file, limits).run();
}

class Lexer {
  private readonly src: string;
  private readonly name: string;
  private readonly limits: Limits;
  private pos = 0;
  private line = 1;
  private col = 1;
  private readonly tokens: Token[] = [];
  private readonly diagnostics: Diagnostic[] = [];
  private readonly indentStack: number[] = [0];
  /** Odd widths already reported as E-MIXED-INDENT → the level they stand for, so one mistake is one diagnostic. */
  private readonly indentAlias = new Map<number, number>();
  private bracketDepth = 0;
  private atLineStart = true;
  private lineHasTokens = false;

  constructor(file: SourceFile, limits: Limits) {
    this.src = file.text;
    this.name = file.name;
    this.limits = limits;
  }

  run(): LexResult {
    if (utf8Length(this.src) > this.limits.maxSourceBytes) {
      this.report('E-SRC-TOO-BIG', this.spanAt(1, 1, 0), {
        message: `This file is bigger than ${String(this.limits.maxSourceBytes)} bytes.`,
        help: 'Split the program into smaller functions or files.',
      });
      this.emit('EOF', '', 0, 0, 1, 1);
      return { tokens: this.tokens, diagnostics: this.diagnostics };
    }
    while (this.pos < this.src.length) {
      if (this.atLineStart) this.handleIndentation();
      else this.lexToken();
    }
    if (this.lineHasTokens) this.emit('NEWLINE', '', this.pos, 0, this.line, this.col);
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this.emit('DEDENT', '', this.pos, 0, this.line, this.col);
    }
    this.emit('EOF', '', this.pos, 0, this.line, this.col);
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private lexToken(): void {
    const ch = this.src[this.pos] ?? '';
    if (ch === ' ' || ch === '\t') this.advance(1);
    else if (ch === '\n' || ch === '\r') this.handleNewline();
    else if (ch === '#') this.skipComment();
    else if (isDigit(ch)) this.lexNumber();
    else if (isIdentStart(ch)) this.lexName();
    else if (ch === '"' || ch === "'") this.lexString(ch);
    else {
      const op = this.matchOperator();
      if (op === null) this.lexUnexpected();
      else this.lexOperator(op);
    }
  }

  // ---------- line structure ----------

  /**
   * Measures leading whitespace (tab = 4) and emits INDENT/DEDENT. Blank and comment-only lines
   * produce nothing. Only called at the start of a logical line, never inside brackets.
   */
  private handleIndentation(): void {
    const start = this.pos;
    const startCol = this.col;
    let width = 0;
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === ' ') width += 1;
      else if (ch === '\t') width += TAB_WIDTH;
      else break;
      this.advance(1);
    }
    this.atLineStart = false;
    const next = this.src[this.pos];
    if (next === undefined || next === '\n' || next === '\r') return;
    if (next === '#') {
      this.skipComment();
      return;
    }

    width = this.indentAlias.get(width) ?? width;
    const top = this.indentStack[this.indentStack.length - 1] ?? 0;
    if (width > top) {
      this.indentStack.push(width);
      this.emit('INDENT', this.src.slice(start, this.pos), start, this.pos - start, this.line, startCol);
    } else if (width < top) {
      this.dedentTo(width, start, startCol);
    }
  }

  /** Pops to `width`; a width no enclosing block used is E-MIXED-INDENT, fixed to the enclosing level. */
  private dedentTo(width: number, start: number, startCol: number): void {
    let level = this.indentStack[this.indentStack.length - 1] ?? 0;
    while (this.indentStack.length > 1 && level > width) {
      this.indentStack.pop();
      this.emit('DEDENT', '', this.pos, 0, this.line, this.col);
      level = this.indentStack[this.indentStack.length - 1] ?? 0;
    }
    if (level === width) return;
    const span = this.spanAt(this.line, startCol, this.pos - start);
    this.report('E-MIXED-INDENT', span, {
      message: 'These lines are indented by different amounts. Pick one (4 spaces is standard).',
      help:
        level === 0
          ? `This line is indented by ${String(width)}, but it is not inside any block.`
          : `This line is indented by ${String(width)}, but the block around it uses ${String(level)}.`,
      fix: {
        label: level === 0 ? 'Start this line at the left edge' : `Indent by ${String(level)} spaces`,
        edits: [{ span, newText: ' '.repeat(level) }],
      },
    });
    this.indentAlias.set(width, level);
  }

  private handleNewline(): void {
    const start = this.pos;
    const startCol = this.col;
    const first = this.src[this.pos];
    this.pos += 1;
    if (first === '\r' && this.src[this.pos] === '\n') this.pos += 1;
    if (this.bracketDepth === 0) {
      if (this.lineHasTokens) {
        this.emit('NEWLINE', this.src.slice(start, this.pos), start, this.pos - start, this.line, startCol);
      }
      this.atLineStart = true;
      this.lineHasTokens = false;
    }
    this.line += 1;
    this.col = 1;
  }

  private skipComment(): void {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === '\n' || ch === '\r') return;
      this.advance(1);
    }
  }

  // ---------- tokens ----------

  private lexNumber(): void {
    const start = this.pos;
    const startCol = this.col;
    for (;;) {
      const ch = this.src[this.pos] ?? '';
      if (isDigit(ch) || (ch === '_' && isDigit(this.src[this.pos + 1] ?? ''))) this.advance(1);
      else break;
    }
    const text = this.src.slice(start, this.pos);
    const digits = removeUnderscores(text);
    const stripped = stripLeadingZeros(digits);
    const span = this.spanAt(this.line, startCol, text.length);
    if (digits.length > 1 && digits.startsWith('0')) {
      this.report('E-LEADING-ZERO', span, {
        message: "Whole numbers can't start with a zero.",
        fix: { label: 'Remove the leading zeros', edits: [{ span, newText: stripped }] },
      });
    }
    this.emit('INT', text, start, text.length, this.line, startCol, this.intValue(stripped, span));
  }

  /** 0 when the literal is out of range; the E-INT-TOO-BIG diagnostic makes the compile fail anyway. */
  private intValue(stripped: string, span: Span): number {
    const tooBig =
      stripped.length > MAX_SAFE_DIGITS.length ||
      (stripped.length === MAX_SAFE_DIGITS.length && stripped > MAX_SAFE_DIGITS);
    if (!tooBig) return Number(stripped);
    this.report('E-INT-TOO-BIG', span, {
      message: `That number is too big. Whole numbers go up to ${MAX_SAFE_PRETTY}.`,
    });
    return 0;
  }

  private lexName(): void {
    const start = this.pos;
    const startCol = this.col;
    while (isIdentChar(this.src[this.pos] ?? '')) this.advance(1);
    const text = this.src.slice(start, this.pos);
    if (text.length > this.limits.maxIdentifierLength) {
      this.report('E-IDENT-TOO-LONG', this.spanAt(this.line, startCol, text.length), {
        message: `Names can be at most ${String(this.limits.maxIdentifierLength)} characters. Try a shorter one.`,
      });
    }
    this.emit(KEYWORDS.has(text) ? 'KEYWORD' : 'NAME', text, start, text.length, this.line, startCol);
  }

  private lexString(quote: string): void {
    const start = this.pos;
    const startCol = this.col;
    this.advance(1);
    let value = '';
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === undefined || ch === '\n' || ch === '\r') {
        this.unterminatedString(start, startCol, quote);
        return;
      }
      if (ch === quote) {
        this.advance(1);
        break;
      }
      if (ch === '\\') {
        value += this.readEscape();
      } else {
        value += ch;
        this.advance(1);
      }
    }
    const text = this.src.slice(start, this.pos);
    if (value.length > this.limits.maxStringLength) {
      this.report('E-STRING-TOO-LONG', this.spanAt(this.line, startCol, text.length), {
        message: `This text is longer than ${String(this.limits.maxStringLength)} characters. Split it into shorter pieces.`,
      });
    }
    this.emit('STRING', text, start, text.length, this.line, startCol, value);
  }

  /** At a backslash. Advances past the escape and returns its decoded text; unknown escapes are kept literally. */
  private readEscape(): string {
    const nextCp = this.src.codePointAt(this.pos + 1);
    const next = nextCp === undefined ? undefined : String.fromCodePoint(nextCp);
    if (next === undefined || next === '\n' || next === '\r') {
      // A trailing backslash: the unterminated-string diagnostic that follows is enough.
      this.advance(1);
      return '\\';
    }
    const decoded = decodeEscape(next);
    const escapeText = `\\${next}`;
    if (decoded === null) {
      this.report('E-BAD-ESCAPE', this.spanAt(this.line, this.col, escapeText.length), {
        message: `\`${escapeText}\` isn't a known escape. You can use \\\\, \\', \\", \\n and \\t.`,
      });
    }
    this.advance(escapeText.length);
    return decoded ?? escapeText;
  }

  private unterminatedString(start: number, startCol: number, quote: string): void {
    const text = this.src.slice(start, this.pos);
    this.report('E-UNTERMINATED-STRING', this.spanAt(this.line, startCol, text.length), {
      message: 'This text is missing its closing quote.',
      fix: {
        label: `Add the closing ${quote}`,
        edits: [{ span: this.spanAt(this.line, this.col, 0), newText: quote }],
      },
    });
    this.emit('ERROR', text, start, text.length, this.line, startCol);
  }

  private matchOperator(): string | null {
    for (const op of OPERATORS) if (this.src.startsWith(op, this.pos)) return op;
    return null;
  }

  private lexOperator(op: string): void {
    if (op === '(' || op === '[' || op === '{') this.bracketDepth += 1;
    if ((op === ')' || op === ']' || op === '}') && this.bracketDepth > 0) this.bracketDepth -= 1;
    this.emit('OP', op, this.pos, op.length, this.line, this.col);
    this.advance(op.length);
  }

  private lexUnexpected(): void {
    const text = String.fromCodePoint(this.src.codePointAt(this.pos) ?? 0);
    this.report('E-UNEXPECTED-CHAR', this.spanAt(this.line, this.col, text.length), {
      message: `I don't know what to do with \`${text}\`. Sprout doesn't use that character.`,
    });
    this.emit('ERROR', text, this.pos, text.length, this.line, this.col);
    this.advance(text.length);
  }

  // ---------- helpers ----------

  private advance(n: number): void {
    this.pos += n;
    this.col += n;
  }

  private emit(
    kind: TokenKind,
    text: string,
    offset: number,
    length: number,
    line: number,
    col: number,
    value?: number | string,
  ): void {
    const token: Token = { kind, text, file: this.name, line, col, offset, length };
    if (value !== undefined) token.value = value;
    if (kind !== 'NEWLINE' && kind !== 'INDENT' && kind !== 'DEDENT' && kind !== 'EOF')
      this.lineHasTokens = true;
    this.tokens.push(token);
  }

  /** Every lexical span is single-line: strings cannot span lines and no other token contains a newline. */
  private spanAt(line: number, col: number, length: number): Span {
    return { file: this.name, line, col, endLine: line, endCol: col + length };
  }

  private report(
    code: string,
    range: Span,
    body: { message: string; help?: string; fix?: Diagnostic['fix'] },
  ): void {
    const diagnostic: Diagnostic = { code, severity: 'error', range, message: body.message };
    if (body.help !== undefined) diagnostic.help = body.help;
    if (body.fix !== undefined) diagnostic.fix = body.fix;
    this.diagnostics.push(diagnostic);
  }
}

// ---------- character classes (ASCII only; anything else is E-UNEXPECTED-CHAR outside strings) ----------

function isDigit(ch: string): boolean {
  return ch.length === 1 && ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return ch.length === 1 && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_');
}

function isIdentChar(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

function decodeEscape(ch: string): string | null {
  switch (ch) {
    case 'n':
      return '\n';
    case 't':
      return '\t';
    case '\\':
      return '\\';
    case "'":
      return "'";
    case '"':
      return '"';
    default:
      return null;
  }
}

function removeUnderscores(text: string): string {
  let out = '';
  for (const ch of text) if (ch !== '_') out += ch;
  return out;
}

function stripLeadingZeros(digits: string): string {
  let i = 0;
  while (i < digits.length - 1 && digits[i] === '0') i += 1;
  return digits.slice(i);
}
