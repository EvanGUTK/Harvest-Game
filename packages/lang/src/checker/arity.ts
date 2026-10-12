/**
 * Argument counts known at compile time (E-WRONG-ARG-COUNT): host builtins, intrinsics, methods by name,
 * and direct calls of user functions whose parameter count is certain.
 * Spec: docs/02-language/language-spec.md §Type interactions (Calling); docs/03-architecture/interpreter-vm.md
 * §Checker; chief rulings 2026-10-11 (method arity by name, parameter hints).
 * Invariants: a call whose target is only known at run time (a variable, a parameter, a name rebound to
 * something else) is left to the runtime R-WRONG-ARG-COUNT; walks in source order.
 */

import { childNodes, type AstNode, type CallExpr, type MethodCallExpr, type Program } from '../parser/ast';
import { assertNever } from '../invariant';
import { INTRINSICS, METHODS, type Arity as IntrinsicArity } from '../intrinsics/intrinsics';
import type { ScopeInfo } from '../scope/scope';
import { bindingName, scopeStatements } from '../scope/bindings';
import type { Diagnostic, Span } from '../types';
import type { CheckOptions } from './check';
import { unknownMethod, wrongArgCount } from './diagnostics';
import { boundedDistance, MAX_SUGGESTION_DISTANCE } from './levenshtein';

/** An accepted argument count: `max: null` means any number from `min` up. */
type Arity = { readonly min: number; readonly max: number | null };

/** lang's own arity table (intrinsics.ts) in this module's shape, where `max: null` means unbounded. */
function arityOf(arity: IntrinsicArity): Arity {
  return { min: arity.min, max: arity.max ?? null };
}

/** Beginner descriptions of what each intrinsic takes (chief ruling W3: the checker's own hint table). */
const INTRINSIC_HINTS: ReadonlyMap<string, string> = new Map([
  ['range', 'a stop number, or a start, a stop and a step'],
  ['len', 'a list, a dict or text'],
  ['abs', 'a number'],
  ['min', 'a list, or two or more values'],
  ['max', 'a list, or two or more values'],
  ['str', 'the value to turn into text'],
  ['int', 'the text or number to turn into a whole number'],
]);

export function checkArity(program: Program, scopes: ScopeInfo, opts: CheckOptions): Diagnostic[] {
  const targets = new CallTargets(program, opts);
  const diagnostics: Diagnostic[] = [];
  const visit = (node: AstNode): void => {
    const diagnostic =
      node.type === 'CallExpr'
        ? targets.checkCall(node, scopes)
        : node.type === 'MethodCallExpr'
          ? checkMethod(node)
          : null;
    if (diagnostic !== null) diagnostics.push(diagnostic);
    for (const child of childNodes(node)) visit(child);
  };
  for (const file of program.files) for (const stmt of file.body) visit(stmt);
  return diagnostics;
}

/**
 * Arity by method name, and E-UNKNOWN-METHOD for any other name: no Sprout value has another method, so
 * such a call could only fail (chief ruling 2026-10-11, superseding "unknown methods are the runtime's").
 */
function checkMethod(call: MethodCallExpr): Diagnostic | null {
  const name = call.method.name;
  const methodArity = [...METHODS].find(([method]) => method === name)?.[1];
  const arity = methodArity === undefined ? undefined : arityOf(methodArity);
  if (arity === undefined) return unknownMethod(call.method.span, name, closestMethod(name));
  return mismatch(call.span, `\`.${name}\``, arity, call.args.length, null);
}

/** The known method within the suggestion distance of `name`, the first one in METHODS order on a tie. */
function closestMethod(name: string): string | null {
  let best: string | null = null;
  let bestDistance = MAX_SUGGESTION_DISTANCE + 1;
  for (const candidate of METHODS.keys()) {
    const distance = boundedDistance(name, candidate, MAX_SUGGESTION_DISTANCE);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** The diagnostic for `given` arguments against `arity`, or `null` when the count is accepted. */
function mismatch(
  range: Span,
  who: string,
  arity: Arity,
  given: number,
  hint: string | null,
): Diagnostic | null {
  const tooFew = given < arity.min;
  const tooMany = arity.max !== null && given > arity.max;
  return tooFew || tooMany ? wrongArgCount(range, who, arity.min, arity.max, given, hint) : null;
}

/** "a, b and c": the hints of a host signature as one phrase, when there is one hint per parameter. */
function joinHints(hints: readonly string[] | undefined, params: number): string | null {
  if (hints?.length !== params || params === 0) return null;
  if (hints.length === 1) return hints[0] ?? null;
  return `${hints.slice(0, -1).join(', ')} and ${hints[hints.length - 1] ?? ''}`;
}

/**
 * What every callable name accepts: host builtins, intrinsics, and user functions whose parameter count is
 * certain. A class because the tables are built once per check from the options and the program.
 */
class CallTargets {
  private readonly hosts = new Map<string, { arity: Arity; hint: string | null }>();
  private readonly intrinsics = new Map<string, Arity>();
  private readonly userFunctions: ReadonlyMap<string, number>;

  constructor(program: Program, opts: CheckOptions) {
    for (const sig of opts.hostSignatures) {
      const max = sig.params.length;
      this.hosts.set(sig.name, {
        arity: { min: max - (sig.optionalParams ?? 0), max },
        hint: joinHints(sig.paramHints, max),
      });
    }
    for (const [name, arity] of INTRINSICS) this.intrinsics.set(name, arityOf(arity));
    this.userFunctions = certainUserArities(program);
  }

  checkCall(call: CallExpr, scopes: ScopeInfo): Diagnostic | null {
    if (call.callee.type !== 'NameExpr') return null;
    const name = call.callee.name;
    const who = `\`${name}\``;
    const given = call.args.length;
    const kind = scopes.resolutions.get(call.callee)?.kind;
    switch (kind) {
      case 'builtin': {
        const host = this.hosts.get(name);
        return host === undefined ? null : mismatch(call.span, who, host.arity, given, host.hint);
      }
      case 'intrinsic': {
        const arity = this.intrinsics.get(name);
        return arity === undefined
          ? null
          : mismatch(call.span, who, arity, given, INTRINSIC_HINTS.get(name) ?? null);
      }
      case 'global': {
        const params = this.userFunctions.get(name);
        return params === undefined
          ? null
          : mismatch(call.span, who, { min: params, max: params }, given, null);
      }
      case 'local':
      case 'constant':
      case 'unknown':
      case undefined:
        return null;
      default:
        return assertNever(kind);
    }
  }
}

/**
 * Parameter counts of top-level defs whose name is bound by nothing else (no assignment, `for` target or
 * `global` declaration anywhere) and whose defs, if several, agree. Only these calls are certain.
 */
function certainUserArities(program: Program): ReadonlyMap<string, number> {
  const counts = new Map<string, number | null>();
  const reboundElsewhere = new Set<string>();
  for (const file of program.files) {
    for (const stmt of scopeStatements(file.body)) {
      if (stmt.type === 'DefStmt' && file.body.includes(stmt)) {
        const previous = counts.get(stmt.name.name);
        counts.set(
          stmt.name.name,
          previous === undefined || previous === stmt.params.length ? stmt.params.length : null,
        );
        for (const inner of scopeStatements(stmt.body)) {
          if (inner.type === 'GlobalStmt') for (const name of inner.names) reboundElsewhere.add(name.name);
        }
      } else {
        const bound = bindingName(stmt);
        if (bound !== null) reboundElsewhere.add(bound);
      }
    }
  }
  const certain = new Map<string, number>();
  for (const [name, count] of counts)
    if (count !== null && !reboundElsewhere.has(name)) certain.set(name, count);
  return certain;
}
