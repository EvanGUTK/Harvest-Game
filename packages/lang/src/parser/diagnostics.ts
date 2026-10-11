/**
 * Every diagnostic the parser emits, with its catalogue wording and fix-it, in one place.
 * Spec: docs/02-language/errors-and-diagnostics.md §Catalogue (the parser may emit only codes listed there).
 * Invariant: a fix-it's edits turn the program into one that re-parses without that diagnostic.
 */

import type { Token } from '../lexer/token';
import type { Limits, Span } from '../types';
import { joinSpans, tokenSpan, touching, type TokenCursor } from './cursor';

/** What the parser was looking for, used as the help line of E-UNEXPECTED-TOKEN. */
export type Expectation = string;

export const EXPECT_VALUE: Expectation =
  'A value should come next: a name, a number, text in quotes, `(` or `[`.';

/**
 * The current token is not what the grammar allows here. ERROR tokens were already reported by the lexer,
 * so they produce nothing more. Running into the end of the file inside brackets is E-UNCLOSED-BRACKET.
 */
export function reportUnexpected(c: TokenCursor, expected: Expectation, openBracket: Token | null): void {
  const token = c.peek();
  if (token.kind === 'ERROR') return;
  if (openBracket !== null && endsLine(token)) {
    reportUnclosedBracket(c, openBracket);
    return;
  }
  const previous = c.previous();
  if (
    previous.kind === 'INT' &&
    (token.kind === 'NAME' || token.kind === 'KEYWORD') &&
    touching(previous, token)
  ) {
    const text = previous.text + token.text;
    c.report('E-UNEXPECTED-TOKEN', joinSpans(tokenSpan(previous), tokenSpan(token)), {
      message: `I didn't expect \`${text}\` here.`,
      help: "Names can't start with a digit.",
    });
    return;
  }
  c.report('E-UNEXPECTED-TOKEN', tokenSpan(token), {
    message: endsLine(token)
      ? 'This line ends before it is finished.'
      : `I didn't expect \`${token.text}\` here.`,
    help:
      isCloser(token) && previous.kind === 'OP' && previous.text === ','
        ? 'Remove the extra comma.'
        : expected,
  });
}

export function reportUnclosedBracket(c: TokenCursor, open: Token): void {
  c.report('E-UNCLOSED-BRACKET', tokenSpan(open), {
    message: `This \`${open.text}\` is never closed.`,
    help: `Add a \`${closerOf(open.text)}\` where the brackets should end.`,
  });
}

/** `a / b`: recovered as `//` (errors-and-diagnostics.md E-SLASH-DIVISION, with fix-it). */
export function reportSlashDivision(c: TokenCursor, slash: Token): void {
  const replacement = slash.text === '/=' ? '//=' : '//';
  const range = tokenSpan(slash);
  c.report('E-SLASH-DIVISION', range, {
    message: 'Sprout uses whole numbers. Use `//` for division.',
    fix: {
      label: `Change \`${slash.text}\` to \`${replacement}\``,
      edits: [{ span: range, newText: replacement }],
    },
  });
}

/** `a ** b` (lexed as `*` `*`) or `a **= b` (`*` `*=`). */
export function reportNoPower(c: TokenCursor, first: Token, second: Token): void {
  c.report('E-NO-POWER', joinSpans(tokenSpan(first), tokenSpan(second)), {
    message: 'Sprout has no `**`. Multiply the number by itself instead.',
    help: 'For example, `x * x` is x squared.',
  });
}

/** `1.5` (lexed as INT `.` INT). */
export function reportNoFloat(c: TokenCursor, whole: Token, fraction: Token): void {
  c.report('E-NO-FLOAT', joinSpans(tokenSpan(whole), tokenSpan(fraction)), {
    message: `Sprout uses whole numbers, so \`${whole.text}.${fraction.text}\` can't be used.`,
    help: '`//` divides and drops the remainder, so everything stays a whole number.',
  });
}

/** `f() = 1`, `1 = x`: only a name or an indexed slot can be assigned (EBNF `target`). */
export function reportBadTarget(c: TokenCursor, target: Span): void {
  c.report('E-BAD-TARGET', target, {
    message: 'You can only store a value in a name or a list/dict slot.',
    help: 'For example `count = 5` or `scores[0] = 5`.',
  });
}

/** A `:` line whose block is not indented below it (catalogue wording, keyword interpolated). */
export function reportBodyNotIndented(c: TokenCursor, header: Token, at: Token): void {
  c.report('E-BAD-INDENT', tokenSpan(at), {
    message: `The lines inside this \`${header.text}\` should be indented one step further.`,
    help: 'Start the block on the next line, indented by 4 spaces.',
  });
}

/** An indented line with no `:` line above it to start a block. */
export function reportUnexpectedIndent(c: TokenCursor, indent: Token): void {
  c.report('E-BAD-INDENT', tokenSpan(indent), {
    message: 'This line is indented, but no `:` line above starts a block.',
    help: 'Line it up with the line above, or end the line above with `:` to start a block.',
  });
}

/** An expression nested deeper than `limits.maxExpressionDepth` (language-spec.md §Limits). */
export function reportExpressionTooDeep(c: TokenCursor, at: Token, limits: Limits): void {
  c.report('E-TOO-DEEP', tokenSpan(at), {
    message: `This expression is nested more than ${String(limits.maxExpressionDepth)} levels deep.`,
    help: 'Split it into smaller steps, or move part of it into a function.',
  });
}

/** Inside brackets the lexer emits no NEWLINE except at the end of the file. */
function endsLine(token: Token): boolean {
  return (
    token.kind === 'NEWLINE' || token.kind === 'EOF' || token.kind === 'DEDENT' || token.kind === 'INDENT'
  );
}

function isCloser(token: Token): boolean {
  return token.kind === 'OP' && (token.text === ')' || token.text === ']' || token.text === '}');
}

function closerOf(open: string): string {
  if (open === '(') return ')';
  if (open === '[') return ']';
  return '}';
}
