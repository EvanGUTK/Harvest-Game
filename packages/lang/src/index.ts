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

// ---------- Source, diagnostics, limits ----------

export {
  DEFAULT_LIMITS,
  type Diagnostic,
  type Limits,
  type SourceFile,
  type SourceFiles,
  type Span,
  type TextEdit,
} from './types';
import type { Diagnostic, Limits, SourceFiles } from './types';

// ---------- Lexer (LANG-01) ----------

export { tokenize, type LexResult } from './lexer/lexer';
export { utf8Length } from './lexer/utf8';
export { countTokens } from './lexer/count-tokens';
export { KEYWORDS, OPERATORS, isCountedToken, type Token, type TokenKind } from './lexer/token';

// ---------- Features ----------

/** Language features the campaign unlocks one by one (curriculum.md §Feature gating map is the source). */
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
