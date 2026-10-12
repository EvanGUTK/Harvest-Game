/**
 * Turns a RuntimeError into the Diagnostic a VM error yield carries.
 * Spec: docs/02-language/errors-and-diagnostics.md §Diagnostic shape, §Runtime; chief ruling Q7 (the
 * "`x` is `5`, `y` is `RADISH`." sentence only for operands the compiler recorded as plain names).
 * Invariants: called while the failing op's operands are still held, because RuntimeError.operands
 * are borrowed; the range is the failing instruction's span, else the current statement's.
 */

import type { Diagnostic, Span } from '../types';
import type { ModuleData, OperandNames } from '../compiler/bytecode';
import type { OpContext } from './op-context';
import { reprForMessage } from './repr';
import type { RuntimeError } from './runtime-error';
import type { RtValue } from './value';

export function runtimeDiagnostic(
  ctx: OpContext,
  data: ModuleData,
  error: RuntimeError,
  pc: number,
  fallback: Span,
): Diagnostic {
  return {
    code: error.code,
    severity: 'error',
    range: data.opSpans.get(pc) ?? fallback,
    message: withOperandNames(ctx, error, data.operandNames.get(pc)),
  };
}

function withOperandNames(ctx: OpContext, error: RuntimeError, names: OperandNames | undefined): string {
  if (error.operands === undefined || names === undefined) return error.message;
  const parts = error.operands.flatMap((operand: RtValue, i) => {
    const name = names[i];
    return name === null || name === undefined ? [] : [`\`${name}\` is \`${reprForMessage(ctx, operand)}\``];
  });
  return parts.length === 0 ? error.message : `${error.message} ${parts.join(', ')}.`;
}
