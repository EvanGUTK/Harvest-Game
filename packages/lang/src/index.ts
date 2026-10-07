/**
 * @harvest/lang: the Sprout language (lexer → parser → checker → compiler → VM).
 *
 * Status: interface only. Implementation is milestone M0 (backlog LANG-01..06).
 * Spec: docs/02-language/language-spec.md, docs/03-architecture/interpreter-vm.md
 *
 * Purity rule: this package must not use DOM, Node APIs, Date, Math.random,
 * performance, crypto, or floating-point arithmetic.
 */

export const LANGUAGE_VERSION = '0.1.0';

// ---------- Source & diagnostics ----------

export type SourceFile = { name: string; text: string };
export type SourceFiles = readonly SourceFile[];

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

// ---------- Features & limits ----------

export type Feature =
  | 'repeat' | 'for' | 'if' | 'while' | 'boolean_ops' | 'variables' | 'arithmetic'
  | 'def' | 'return' | 'lists' | 'for_in_list' | 'dicts' | 'global';

export type Limits = {
  maxSourceBytes: number;     // 16_384
  maxAstNodes: number;        // 5_000
  maxNesting: number;         // 12
  maxCallDepth: number;       // 64
  maxCollectionSize: number;  // 1_024
  maxHeapCells: number;       // 16_384
  maxPrintLines: number;      // 200
};

export const DEFAULT_LIMITS: Limits = {
  maxSourceBytes: 16_384,
  maxAstNodes: 5_000,
  maxNesting: 12,
  maxCallDepth: 64,
  maxCollectionSize: 1_024,
  maxHeapCells: 16_384,
  maxPrintLines: 200,
};

// ---------- Host functions (injected by @harvest/sim) ----------

export type HostId = number;

export type ValueKind = 'int' | 'bool' | 'none' | 'str' | 'list' | 'dict' | 'function' | 'const';

export type HostSignature = {
  id: HostId;
  name: string;
  params: readonly ValueKind[];
  optionalParams?: number;
  returns: ValueKind | 'any';
  /** Extra cycles on top of the 1-cycle CALL_HOST instruction. */
  cost: number;
  /** True if the call reads or mutates the world (forces a scheduler yield). */
  touchesWorld: boolean;
};

/** Opaque runtime value. The concrete representation is internal to the VM. */
export type Value = { readonly __brand: 'SproutValue' };

// ---------- Compile ----------

export type CompileOptions = {
  languageVersion: string;
  hostSignatures: readonly HostSignature[];
  /** Campaign gating: features not yet unlocked produce E-LOCKED-FEATURE. */
  lockedFeatures: ReadonlySet<Feature>;
  limits: Limits;
};

export type BytecodeModule = { readonly __brand: 'BytecodeModule'; readonly languageVersion: string };

export type CompileResult =
  | { ok: true; module: BytecodeModule; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

// ---------- VM ----------

export type VMYield =
  | { kind: 'host'; fn: HostId; args: readonly Value[]; cost: number; atCycle: number }
  | { kind: 'halt'; atCycle: number }
  | { kind: 'error'; error: Diagnostic; atCycle: number }
  | { kind: 'budget'; atCycle: number };

export interface VM {
  /** Run pure instructions until a world-touching host call, halt, error, or maxCycles. */
  run(maxCycles: number): VMYield;
  /** Supply the pending host call's result and continue on the next run(). */
  resume(value: Value): void;
  readonly cycles: number;
  snapshot(): unknown;
}

export interface LangEngine {
  compile(source: SourceFiles, opts: CompileOptions): CompileResult;
  createVM(module: BytecodeModule, limits: Limits): VM;
}
