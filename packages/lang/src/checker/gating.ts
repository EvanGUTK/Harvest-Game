/**
 * Campaign gating (E-LOCKED-FEATURE): syntax whose Feature is locked, and references to locked builtin and
 * constant names. Each lock carries its reason, which picks the catalogue suffix.
 * Spec: docs/02-language/curriculum.md §Feature gating map (normative); docs/02-language/errors-and-diagnostics.md
 * (E-LOCKED-FEATURE, locked names); docs/02-language/standard-library.md (spawn, random in multiplayer).
 * Invariants: one diagnostic per node; never-gated syntax (literals, call syntax, `pass`, `for` targets,
 * def parameters) produces nothing; a locked name wins over E-UNKNOWN-NAME (names.ts and arity.ts skip it).
 */

import { childNodes, type AstNode, type CompareOperator, type ForStmt, type Program } from '../parser/ast';
import type { ScopeInfo } from '../scope/scope';
import type { Diagnostic, Feature, LockReason, Span } from '../types';
import type { CheckOptions } from './check';
import { assertNever } from '../invariant';
import { lockedFeature } from './diagnostics';

/** What one node needs unlocked, where to point, and how to name it in "<subject> isn't unlocked yet." */
type Gate = {
  readonly feature: Feature;
  readonly range: Span;
  readonly subject: string;
  readonly plural?: boolean;
};

/** Method names and the Feature their call needs (curriculum.md: list methods → lists, dict methods → dicts). */
const METHOD_FEATURES: ReadonlyMap<string, Feature> = new Map<string, Feature>([
  ['append', 'lists'],
  ['pop', 'lists'],
  ['get', 'dicts'],
]);

const RANGE = 'range';

export function checkGating(program: Program, scopes: ScopeInfo, opts: CheckOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const visit = (node: AstNode): void => {
    for (const gate of gatesOf(node, scopes)) {
      const reason = opts.lockedFeatures.get(gate.feature);
      if (reason !== undefined) {
        diagnostics.push(lockedFeature(gate.range, gate.subject, gate.plural ?? false, reason));
        break;
      }
    }
    if (node.type === 'NameExpr') {
      const nameReason = lockedNameReason(node.name, scopes.resolutions.get(node)?.kind, opts);
      if (nameReason !== undefined)
        diagnostics.push(lockedFeature(node.span, `\`${node.name}\``, false, nameReason));
    }
    for (const child of childNodes(node)) visit(child);
  };
  for (const file of program.files) for (const stmt of file.body) visit(stmt);
  return diagnostics;
}

/**
 * The lock reason when `name` refers to a locked builtin, intrinsic or constant, or to nothing at all.
 * A name the program binds itself is the program's own and is never locked.
 */
export function lockedNameReason(
  name: string,
  kind: string | undefined,
  opts: CheckOptions,
): LockReason | undefined {
  if (kind !== 'builtin' && kind !== 'intrinsic' && kind !== 'constant' && kind !== 'unknown')
    return undefined;
  return opts.lockedNames.get(name);
}

/**
 * The Features `node` itself needs (not its children), in the order they are checked; only the first locked
 * one is reported, so a node gets at most one diagnostic (curriculum.md §Feature gating map).
 */
function gatesOf(node: AstNode, scopes: ScopeInfo): readonly Gate[] {
  const gate = singleGate(node, scopes);
  if (node.type === 'AugAssignStmt' && node.target.type === 'NameExpr') {
    // `x += 1` needs variables and arithmetic: variables first (chief ruling 2026-10-11).
    return [
      ...(gate === null ? [] : [gate]),
      { feature: 'arithmetic', range: node.operatorSpan, subject: `\`${node.op}=\`` },
    ];
  }
  if (node.type === 'CompareExpr') return node.operators.map(compareGate);
  return gate === null ? [] : [gate];
}

function compareGate(operator: CompareOperator): Gate {
  const membership = operator.op === 'in' || operator.op === 'not in';
  return {
    feature: membership ? 'lists' : 'comparison',
    range: operator.span,
    subject: `\`${operator.op}\``,
  };
}

/** The one Feature a node needs before any second check (`+=` arithmetic, later comparison operators). */
function singleGate(node: AstNode, scopes: ScopeInfo): Gate | null {
  switch (node.type) {
    case 'RepeatStmt':
      return keywordGate('repeat', node.span, 'repeat');
    case 'ForStmt':
      return isRangeLoop(node, scopes)
        ? keywordGate('for', node.span, 'for')
        : { feature: 'for_in_list', range: keywordSpan(node.span, 'for'), subject: '`for` over a list' };
    case 'IfStmt':
      return keywordGate('if', node.span, 'if');
    case 'WhileStmt':
      return keywordGate('while', node.span, 'while');
    case 'BreakStmt':
      return keywordGate('while', node.span, 'break');
    case 'ContinueStmt':
      return keywordGate('while', node.span, 'continue');
    case 'DefStmt':
      return keywordGate('def', node.span, 'def');
    case 'GlobalStmt':
      return keywordGate('global', node.span, 'global');
    case 'ReturnStmt':
      return node.value === null
        ? null
        : { feature: 'return', range: keywordSpan(node.span, 'return'), subject: '`return` with a value' };
    case 'AssignStmt':
      return node.target.type === 'NameExpr'
        ? { feature: 'variables', range: node.target.span, subject: 'Storing a value with `=`' }
        : null;
    case 'AugAssignStmt':
      return node.target.type === 'NameExpr'
        ? { feature: 'variables', range: node.target.span, subject: 'Storing a value with `=`' }
        : { feature: 'arithmetic', range: node.operatorSpan, subject: `\`${node.op}=\`` };
    case 'BinaryExpr':
      return { feature: 'arithmetic', range: node.operatorSpan, subject: `\`${node.op}\`` };
    case 'UnaryExpr':
      return node.op === 'not'
        ? keywordGate('boolean_ops', node.span, 'not')
        : { feature: 'arithmetic', range: keywordSpan(node.span, '-'), subject: '`-`' };
    case 'LogicalExpr':
      return { feature: 'boolean_ops', range: node.operatorSpan, subject: `\`${node.op}\`` };
    case 'CompareExpr':
      return null;
    case 'ListLiteral':
      return { feature: 'lists', range: node.span, subject: 'Lists', plural: true };
    case 'DictLiteral':
      return { feature: 'dicts', range: node.span, subject: 'Dicts', plural: true };
    case 'IndexExpr':
      // `d[k]` and `lst[i]` cannot be told apart statically; lists unlock first (chief ruling 2026-10-11).
      return { feature: 'lists', range: node.span, subject: 'Indexing with `[ ]`' };
    case 'MethodCallExpr': {
      const feature = METHOD_FEATURES.get(node.method.name);
      return feature === undefined
        ? null
        : { feature, range: node.method.span, subject: `\`.${node.method.name}\`` };
    }
    case 'ExprStmt':
    case 'PassStmt':
    case 'ElifClause':
    case 'Identifier':
    case 'NameExpr':
    case 'IntLiteral':
    case 'StringLiteral':
    case 'BoolLiteral':
    case 'NoneLiteral':
    case 'CallExpr':
      return null;
    default:
      return assertNever(node);
  }
}

/** `for NAME in range(...)`: the only loop the `for` Feature covers. */
function isRangeLoop(loop: ForStmt, scopes: ScopeInfo): boolean {
  const iterable = loop.iterable;
  return (
    iterable.type === 'CallExpr' &&
    iterable.callee.type === 'NameExpr' &&
    iterable.callee.name === RANGE &&
    scopes.resolutions.get(iterable.callee)?.kind === 'intrinsic'
  );
}

function keywordGate(feature: Feature, span: Span, keyword: string): Gate {
  return { feature, range: keywordSpan(span, keyword), subject: `\`${keyword}\`` };
}

/** The span of the keyword or symbol a node starts with. */
function keywordSpan(span: Span, keyword: string): Span {
  return { ...span, endLine: span.line, endCol: span.col + keyword.length };
}
