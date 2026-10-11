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

// ---------- Hashing ----------

export {
  FNV1A_OFFSET_BASIS,
  FNV1A_PRIME,
  HashInputError,
  type HashInputCode,
  fnv1a32Ascii,
  fnv1a32Bytes,
  fnv1a32Words,
} from './hash/fnv1a';

// ---------- Lexer (LANG-01) ----------

export { tokenize, type LexResult } from './lexer/lexer';
export { utf8Length } from './lexer/utf8';
export { countTokens } from './lexer/count-tokens';
export { KEYWORDS, OPERATORS, isCountedToken, type Token, type TokenKind } from './lexer/token';

// ---------- Integer math and invariants ----------

export { floorDiv, floorMod } from './int-math';
export { InvariantError, assertNever, type InvariantCode } from './invariant';

// ---------- Parser (LANG-02) ----------

export { parse, type ParseResult } from './parser/parser';
export type {
  AssignStmt,
  AssignTarget,
  AugAssignStmt,
  BinaryExpr,
  BinaryOp,
  BoolLiteral,
  BreakStmt,
  CallExpr,
  CompareExpr,
  CompareOp,
  CompareOperator,
  ContinueStmt,
  DefStmt,
  DictEntry,
  DictLiteral,
  ElifClause,
  Expression,
  ExprStmt,
  FileNode,
  ForStmt,
  GlobalStmt,
  Identifier,
  IfStmt,
  IndexExpr,
  IntLiteral,
  ListLiteral,
  LogicalExpr,
  LogicalOp,
  MethodCallExpr,
  NameExpr,
  AstNode,
  NoneLiteral,
  PassStmt,
  Program,
  RepeatStmt,
  ReturnStmt,
  Statement,
  StringLiteral,
  UnaryExpr,
  UnaryOp,
  WhileStmt,
} from './parser/ast';

// ---------- Checker (LANG-03) ----------

export {
  check,
  scopeNames,
  type CheckOptions,
  type CheckResult,
  type IntrinsicSignature,
} from './checker/check';
export type { ScopeInfo } from './scope/scope';

// ---------- Features ----------

export type { Feature } from './types';

// ---------- Host functions and constants (injected by @harvest/sim) ----------

export type { ConstantDef, HostId, HostSignature, Value, ValueKind, ValueOps } from './types';

// ---------- Compile ----------

export type { BytecodeModule, CompileOptions, CompileResult } from './types';

// ---------- VM ----------

export type { LangEngine, VM, VMSnapshot, VMYield } from './types';
