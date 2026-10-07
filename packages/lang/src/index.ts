/**
 * @harvest/lang: the Sprout language (lexer → parser → checker → compiler → VM).
 *
 * Status: interface only. Implementation is milestone M0 (backlog LANG-01..06).
 * Spec: docs/02-language/language-spec.md, docs/03-architecture/interpreter-vm.md
 *
 * Purity rule: this package must not use DOM, Node APIs, Date, Math.random,
 * performance, crypto, or floating-point arithmetic. It depends on nothing.
 *
 * Host contract: `lang` knows nothing about farming. The host (@harvest/sim) supplies builtin
 * signatures and game constants at COMPILE time; the compiler bakes each builtin's cycle cost and
 * world-touching flag into its CALL_HOST operands, so a VM snapshot is self-contained and the VM
 * needs no second table. Per-player cost differences (campaign drone upgrades) are expressed by
 * compiling each player's program with that player's host signatures.
 */

export const LANGUAGE_VERSION = '0.1.0';

// ---------- Source & diagnostics ----------

export type SourceFile = { name: string; text: string };
/** One file must be named `main.sprout`; it runs last, after every other file in tab order. */
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
  | 'repeat'
  | 'for'
  | 'if'
  | 'comparison'
  | 'while'
  | 'boolean_ops'
  | 'variables'
  | 'arithmetic'
  | 'def'
  | 'return'
  | 'lists'
  | 'for_in_list'
  | 'dicts'
  | 'global';

export type Limits = {
  maxSourceBytes: number; // 16_384
  maxAstNodes: number; // 5_000
  maxNesting: number; // 12
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
  maxCallDepth: 64,
  maxCollectionSize: 1_024,
  maxHeapCells: 16_384,
  maxPrintLines: 200,
  maxIdentifierLength: 32,
  maxStringLength: 256,
  maxFiles: 10,
};

// ---------- Host functions and constants (injected by @harvest/sim) ----------

export type HostId = number;

export type ValueKind = 'int' | 'bool' | 'none' | 'str' | 'list' | 'dict' | 'function' | 'const';

export type HostSignature = {
  id: HostId;
  name: string;
  params: readonly ValueKind[];
  optionalParams?: number;
  returns: ValueKind | 'any';
  /** Extra cycles on top of the 1-cycle CALL_HOST instruction. Baked into bytecode at compile time. */
  cost: number;
  /** True if the call reads or mutates the world (forces a scheduler yield). */
  touchesWorld: boolean;
  /** Campaign gating: chapter number or skill-node id that unlocks this builtin (editor 🔒 text). */
  unlock?: string;
};

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

// ---------- Compile ----------

export type CompileOptions = {
  languageVersion: string;
  hostSignatures: readonly HostSignature[];
  constants: readonly ConstantDef[];
  /** Campaign gating: language features not yet unlocked produce E-LOCKED-FEATURE. */
  lockedFeatures: ReadonlySet<Feature>;
  /** Campaign gating: builtins and constants not yet unlocked. E-LOCKED-FEATURE wins over E-UNKNOWN-NAME. */
  lockedNames: ReadonlySet<string>;
  limits: Limits;
};

export type BytecodeModule = {
  readonly __brand: 'BytecodeModule';
  readonly languageVersion: string;
  /** countTokens() of the source this module was compiled from (tiebreak #3, Clean Code award). */
  readonly tokenCount: number;
};

export type CompileResult =
  | { ok: true; module: BytecodeModule; tokenCount: number; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

// ---------- VM ----------

export type VMYield =
  | { kind: 'host'; fn: HostId; args: readonly Value[]; cost: number; atCycle: number }
  | { kind: 'line'; line: number; atCycle: number }
  | { kind: 'halt'; atCycle: number }
  | { kind: 'error'; error: Diagnostic; atCycle: number }
  | { kind: 'budget'; atCycle: number };

/** Serializable VM state (frames, heap, globals, ip, cycles). Opaque outside lang. */
export type VMSnapshot = { readonly __brand: 'VMSnapshot'; readonly languageVersion: string };

export interface VM {
  /**
   * Run pure instructions until a world-touching host call, halt, error, or maxCycles.
   * With `stopAtLine`, also yields `{ kind: 'line' }` at the next statement boundary (debugger Step).
   */
  run(maxCycles: number, opts?: { stopAtLine?: boolean }): VMYield;
  /**
   * Supply the pending host call's result and continue on the next run(). `cost` overrides the
   * baked default when the actual cost differs (failed actions cost 5, wait(n) costs n, goto costs
   * move × distance). See simulation-engine.md §Clock arithmetic.
   */
  resume(value: Value, cost?: number): void;
  readonly cycles: number;
  snapshot(): VMSnapshot;
}

export interface LangEngine {
  compile(source: SourceFiles, opts: CompileOptions): CompileResult;
  /**
   * Lexer tokens over all files, excluding NEWLINE, INDENT, DEDENT, EOF, comments and ERROR tokens;
   * a literal is one token (scoring-and-judging.md §Token count). The one definition every surface uses.
   */
  countTokens(source: SourceFiles): number;
  createVM(module: BytecodeModule, limits: Limits): VM;
  restoreVM(snapshot: VMSnapshot): VM;
  readonly values: ValueOps;
}
