/**
 * Token model for the Sprout lexer.
 * Spec: docs/02-language/language-spec.md §Lexical structure; docs/03-architecture/interpreter-vm.md §Lexer.
 * Invariant: every token knows its file, 1-based line/col and 0-based offset/length.
 */

export type TokenKind =
  'NAME' | 'KEYWORD' | 'INT' | 'STRING' | 'OP' | 'NEWLINE' | 'INDENT' | 'DEDENT' | 'EOF' | 'ERROR';

export type Token = {
  kind: TokenKind;
  /** Exact source text (empty for NEWLINE at EOF, INDENT, DEDENT, EOF). */
  text: string;
  /** Decoded value: the integer for INT, the unescaped string for STRING. */
  value?: number | string;
  file: string;
  line: number;
  col: number;
  offset: number;
  length: number;
};

export const KEYWORDS: ReadonlySet<string> = new Set([
  'if',
  'elif',
  'else',
  'while',
  'for',
  'in',
  'repeat',
  'def',
  'return',
  'break',
  'continue',
  'pass',
  'and',
  'or',
  'not',
  'True',
  'False',
  'None',
  'global',
]);

/**
 * Operators by length, longest first, so matching is greedy. `/` and `/=` are lexed as operators
 * only so the parser can report E-SLASH-DIVISION with a fix-it (language-spec.md §Lexical structure).
 */
export const OPERATORS: readonly string[] = [
  '//=',
  '//',
  '==',
  '!=',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '%=',
  '/=',
  '+',
  '-',
  '*',
  '%',
  '/',
  '=',
  '<',
  '>',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  ':',
  '.',
];

/** Tokens that count toward `programTokens` (scoring-and-judging.md §Token count). */
export function isCountedToken(kind: TokenKind): boolean {
  switch (kind) {
    case 'NAME':
    case 'KEYWORD':
    case 'INT':
    case 'STRING':
    case 'OP':
      return true;
    case 'NEWLINE':
    case 'INDENT':
    case 'DEDENT':
    case 'EOF':
    case 'ERROR':
      return false;
  }
}
