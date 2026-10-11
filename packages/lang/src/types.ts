/**
 * Shared source, diagnostic, limit and value types for @harvest/lang.
 * Spec: docs/02-language/language-spec.md §Limits, §Types; docs/02-language/errors-and-diagnostics.md
 * §Diagnostic shape; docs/03-architecture/interpreter-vm.md §Public API (Value, ValueOps).
 * Lives apart from index.ts so lexer/parser modules can import it without an import cycle.
 */

export type SourceFile = { name: string; text: string };
/** One file must be named `main.sprout`; it runs last, after every other file in tab order. */
export type SourceFiles = readonly SourceFile[];

/** 1-based line and col; col counts UTF-16 code units; `endCol` is exclusive. */
export type Span = { file: string; line: number; col: number; endLine: number; endCol: number };

export type TextEdit = { span: Span; newText: string };

export type Diagnostic = {
  /** Stable code, e.g. 'E-MISSING-COLON'. See docs/02-language/errors-and-diagnostics.md */
  code: string;
  severity: 'error' | 'warning' | 'hint';
  range: Span;
  message: string;
  help?: string;
  fix?: { label: string; edits: TextEdit[] };
  learnMore?: string;
};

export type Limits = {
  maxSourceBytes: number; // 16_384
  maxAstNodes: number; // 5_000
  maxNesting: number; // 12
  maxExpressionDepth: number; // 64
  maxCallDepth: number; // 64
  maxCollectionSize: number; // 1_024
  maxHeapCells: number; // 16_384
  maxPrintLines: number; // 200
  maxIdentifierLength: number; // 32
  maxStringLength: number; // 256
  maxFiles: number; // 10 (campaign) / 1 (showdown v1)
};

export const DEFAULT_LIMITS: Limits = {
  maxSourceBytes: 16_384,
  maxAstNodes: 5_000,
  maxNesting: 12,
  maxExpressionDepth: 64,
  maxCallDepth: 64,
  maxCollectionSize: 1_024,
  maxHeapCells: 16_384,
  maxPrintLines: 200,
  maxIdentifierLength: 32,
  maxStringLength: 256,
  maxFiles: 10,
};

// ---------- Values (LANG-05) ----------

export type ValueKind = 'int' | 'bool' | 'none' | 'str' | 'list' | 'dict' | 'function' | 'const';

/** A game constant visible to programs, e.g. { name: 'RADISH', id: 10, group: 'crop' }. */
export type ConstantDef = { name: string; id: number; group: string };

/** Opaque runtime value. The concrete representation is internal to the VM. */
export type Value = { readonly __brand: 'SproutValue' };

/** The only way hosts build and inspect Values. Implemented in M0 (LANG-05). */
export interface ValueOps {
  int(n: number): Value;
  bool(b: boolean): Value;
  str(s: string): Value;
  constant(id: number): Value;
  readonly none: Value;
  kindOf(v: Value): ValueKind;
  asInt(v: Value): number;
  asBool(v: Value): boolean;
  asStr(v: Value): string;
  asConstantId(v: Value): number;
}
