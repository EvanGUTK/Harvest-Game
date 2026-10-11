/**
 * The one token counter every surface uses (scoring-and-judging.md §Token count):
 * lexer tokens over all files, excluding NEWLINE, INDENT, DEDENT, EOF, comments and ERROR tokens.
 * A number or string literal is one token. Diagnostics are ignored; an oversize file counts 0.
 */

import { DEFAULT_LIMITS, type SourceFiles } from '../types';
import { tokenize } from './lexer';
import { isCountedToken } from './token';

/** Counts the tokens of every file; see scoring-and-judging.md §Token count for what counts. */
export function countTokens(source: SourceFiles): number {
  let count = 0;
  for (const file of source) {
    for (const token of tokenize(file, DEFAULT_LIMITS).tokens) {
      if (isCountedToken(token.kind)) count += 1;
    }
  }
  return count;
}
