/**
 * Kind nouns for runtime error messages: "Can't add a number and a crop."
 * Spec: docs/02-language/errors-and-diagnostics.md §Runtime (R-TYPE), chief ruling 2026-10-11:
 * int and bool → "a number", str → "text", list → "a list", dict → "a dict", None → "None",
 * function → "a function", constant → "a " + its ConstantDef group.
 */

import { assertNever } from '../invariant';
import { constantDef, type ConstantTable } from './op-context';
import { typeError, type RuntimeError } from './runtime-error';
import type { RtValue } from './value';

export function kindNoun(v: RtValue, constants: ConstantTable): string {
  if (typeof v === 'number' || typeof v === 'boolean') return 'a number';
  if (v === null) return 'None';
  switch (v.tag) {
    case 'str':
      return 'text';
    case 'list':
      return 'a list';
    case 'dict':
      return 'a dict';
    case 'fn':
      return 'a function';
    case 'const':
      return `a ${constantDef(constants, v.id).group}`;
    default:
      return assertNever(v);
  }
}

/** Upper-cases the first letter, for a noun that starts a sentence ("A list can't be a dict key."). */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** R-TYPE for a list, dict or function used as a dict key (chief ruling 2026-10-11). */
export function unusableKeyError(v: RtValue, constants: ConstantTable): RuntimeError {
  return typeError(
    `${capitalise(kindNoun(v, constants))} can't be a dict key. Use a number, text, None or a constant.`,
  );
}
