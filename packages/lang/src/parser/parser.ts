/**
 * Sprout parser entry point: source files → one `Program` in run order, plus every lexer and parser
 * diagnostic. Spec: docs/02-language/language-spec.md §Grammar, §Files; docs/03-architecture/interpreter-vm.md §Parser.
 * Invariants: never throws on any input; `limits` always come in as a parameter; diagnostics are ordered
 * by file (run order), then line, then column, and ties keep the order they were found in.
 */

import { tokenize } from '../lexer/lexer';
import type { Diagnostic, Limits, SourceFile, SourceFiles } from '../types';
import { countNodes, type FileNode, type Program } from './ast';
import { TokenCursor } from './cursor';
import { StatementParser } from './statements';

/** The entry file: it always exists and runs last (language-spec.md §Files). */
export const MAIN_FILE_NAME = 'main.sprout';

export type ParseResult = {
  readonly program: Program;
  /**
   * Lexer and parser diagnostics in source order. The program may be compiled only when none of them has
   * `severity: 'error'`: the AST then holds exactly what the source says.
   */
  readonly diagnostics: readonly Diagnostic[];
  /** Nodes in `program` by the counting rule in ast.ts (the editor shows `nodes / maxAstNodes`). */
  readonly nodeCount: number;
};

/** Parses every file, in run order, into one program. */
export function parse(files: SourceFiles, limits: Limits): ParseResult {
  const fileNodes: FileNode[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const file of runOrder(files)) {
    const parsed = parseFile(file, limits);
    fileNodes.push(parsed.node);
    diagnostics.push(...parsed.diagnostics);
  }
  const program: Program = { type: 'Program', files: fileNodes };
  return { program, diagnostics, nodeCount: countNodes(program) };
}

/** Every file except `main.sprout` in the given order, then `main.sprout` (language-spec.md §Files). */
export function runOrder(files: SourceFiles): readonly SourceFile[] {
  return [
    ...files.filter((f) => f.name !== MAIN_FILE_NAME),
    ...files.filter((f) => f.name === MAIN_FILE_NAME),
  ];
}

function parseFile(file: SourceFile, limits: Limits): { node: FileNode; diagnostics: readonly Diagnostic[] } {
  const lexed = tokenize(file, limits);
  const cursor = new TokenCursor(lexed.tokens, file.name);
  const node = new StatementParser(cursor, limits).parseFile();
  return { node, diagnostics: inSourceOrder([...lexed.diagnostics, ...cursor.diagnostics]) };
}

/** Array.prototype.sort is stable, so diagnostics at the same position keep the order they were found in. */
function inSourceOrder(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => a.range.line - b.range.line || a.range.col - b.range.col);
}
