/**
 * Argument decoding for host calls: turns a `Value` into a crop, a direction or an int, or into R-BAD-ARG.
 * Design: docs/02-language/errors-and-diagnostics.md §Runtime errors (R-BAD-ARG wording), standard-library.md.
 * Invariants: expected failures are values, never exceptions; the wording is "`<builtin>` needs <hint>, but got
 * <what>" with the hint taken from the content metadata; a bool is never an int; crops and directions are decoded
 * by constant id so a constant of the wrong group is rejected, not misread.
 */

import { BUILTINS, type CropId } from '@harvest/content';
import type { Value, ValueOps } from '@harvest/lang';
import type { Direction } from '../world/actions';
import { constantName, cropOfConstantId, directionOfConstantId } from './constants';

export type BadArg = { readonly code: 'R-BAD-ARG'; readonly message: string };

export type Decoded<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: BadArg };

export type IntRange = { readonly min?: number; readonly max?: number };

/** What the metadata says parameter `index` of a builtin should be, e.g. "a crop like `RADISH`". */
export function paramHint(builtin: string, index: number): string {
  const hint = BUILTINS.find((b) => b.name === builtin)?.paramHints[index];
  if (hint === undefined) throw new Error(`no parameter ${index} on builtin ${builtin}`);
  return hint;
}

/** The value as the error message shows it: `5`, `NORTH`, `True`, `None`, `'text'` or "a list". */
function describeValue(values: ValueOps, v: Value): string {
  switch (values.kindOf(v)) {
    case 'int':
      return `\`${values.asInt(v)}\``;
    case 'bool':
      return values.asBool(v) ? '`True`' : '`False`';
    case 'none':
      return '`None`';
    case 'str':
      return `\`'${values.asStr(v)}'\``;
    case 'const':
      return `\`${constantName(values.asConstantId(v)) ?? 'a constant'}\``;
    case 'list':
      return 'a list';
    case 'dict':
      return 'a dict';
    case 'function':
      return 'a function';
  }
}

function bad<T>(builtin: string, hint: string, values: ValueOps, v: Value): Decoded<T> {
  return {
    ok: false,
    error: {
      code: 'R-BAD-ARG',
      message: `\`${builtin}\` needs ${hint}, but got ${describeValue(values, v)}`,
    },
  };
}

/** A crop constant such as `RADISH` (parameter 0 of the builtins that take a crop). */
export function decodeCrop(values: ValueOps, builtin: string, v: Value): Decoded<CropId> {
  const crop = values.kindOf(v) === 'const' ? cropOfConstantId(values.asConstantId(v)) : undefined;
  return crop === undefined ? bad(builtin, paramHint(builtin, 0), values, v) : { ok: true, value: crop };
}

/** A direction constant such as `NORTH`. */
export function decodeDirection(values: ValueOps, builtin: string, v: Value): Decoded<Direction> {
  const dir = values.kindOf(v) === 'const' ? directionOfConstantId(values.asConstantId(v)) : undefined;
  return dir === undefined ? bad(builtin, paramHint(builtin, 0), values, v) : { ok: true, value: dir };
}

/**
 * A whole number, optionally inside `range` (both bounds inclusive). `hintOverride` replaces the metadata hint when
 * the range depends on the world (`goto` coordinates depend on the farm size).
 */
export function decodeInt(
  values: ValueOps,
  builtin: string,
  index: number,
  v: Value,
  range: IntRange = {},
  hintOverride?: string,
): Decoded<number> {
  const isInt = values.kindOf(v) === 'int';
  const n = isInt ? values.asInt(v) : 0;
  const inRange = (range.min === undefined || n >= range.min) && (range.max === undefined || n <= range.max);
  if (isInt && inRange) return { ok: true, value: n };
  return bad(builtin, hintOverride ?? paramHint(builtin, index), values, v);
}
