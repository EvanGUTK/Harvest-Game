/**
 * Sprout parser entry point: source files → one `Program` in run order, plus every lexer and parser
 * diagnostic. Spec: docs/02-language/language-spec.md §Grammar, §Files; docs/03-architecture/interpreter-vm.md §Parser.
 * Invariants: never throws on any input; `limits` always come in as a parameter; diagnostics are ordered
 * by file (run order), then line, then column, and ties keep the order they were found in.
 */

import { tokenize } from '../lexer/lexer';
import type { Diagnostic, Limits, SourceFile, SourceFiles } from '../types';
import { childNodes, countNodes, type FileNode, type AstNode, type Program } from './ast';
import { TokenCursor } from './cursor';
import { programTooBig } from './diagnostics';
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
  const nodeCount = countNodes(program);
  const overLimit = nodeCount > limits.maxAstNodes ? nodeAt(program, limits.maxAstNodes) : null;
  if (overLimit !== null) insertInOrder(diagnostics, programTooBig(overLimit.span, limits), program);
  return { program, diagnostics, nodeCount };
}

/** The node at 0-based `index` in pre-order (files in run order, children in source order). */
function nodeAt(program: Program, index: number): AstNode | null {
  const pending: AstNode[] = [];
  for (let f = program.files.length - 1; f >= 0; f -= 1)
    pending.push(...reversed(program.files[f]?.body ?? []));
  let seen = 0;
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (seen === index) return next;
    seen += 1;
    pending.push(...reversed(childNodes(next)));
  }
  return null;
}

function reversed<T>(items: readonly T[]): T[] {
  return [...items].reverse();
}

/** Places a whole-program diagnostic among the per-file ones, keeping file (run order), line, column order. */
function insertInOrder(diagnostics: Diagnostic[], diagnostic: Diagnostic, program: Program): void {
  const fileIndex = (d: Diagnostic) => program.files.findIndex((f) => f.name === d.range.file);
  const after = (d: Diagnostic) =>
    fileIndex(d) > fileIndex(diagnostic) ||
    (fileIndex(d) === fileIndex(diagnostic) && comparePositions(d, diagnostic) > 0);
  const at = diagnostics.findIndex(after);
  diagnostics.splice(at === -1 ? diagnostics.length : at, 0, diagnostic);
}

function comparePositions(a: Diagnostic, b: Diagnostic): number {
  return a.range.line - b.range.line || a.range.col - b.range.col;
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
  return [...diagnostics].sort(comparePositions);
}
