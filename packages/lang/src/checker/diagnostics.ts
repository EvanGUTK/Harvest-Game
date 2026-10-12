/**
 * Every diagnostic the checker emits, with its catalogue wording and fix-it, in one place.
 * Spec: docs/02-language/errors-and-diagnostics.md §Catalogue (the checker may emit only codes listed there).
 * Invariant: builders are pure; the caller decides where and whether a diagnostic applies.
 */

import type { Diagnostic, Span } from '../types';

function error(code: string, range: Span, message: string): Diagnostic {
  return { code, severity: 'error', range, message };
}

/** `harvset` with the suggestion `harvest` (Levenshtein ≤ 2), or no suggestion. */
export function unknownName(range: Span, name: string, suggestion: string | null): Diagnostic {
  if (suggestion === null) {
    return {
      ...error('E-UNKNOWN-NAME', range, `I don't know \`${name}\`.`),
      help: 'Check the spelling, or give it a value first.',
    };
  }
  return {
    ...error('E-UNKNOWN-NAME', range, `I don't know \`${name}\`. Did you mean \`${suggestion}\`?`),
    fix: { label: `Change to \`${suggestion}\``, edits: [{ span: range, newText: suggestion }] },
  };
}

/** A builtin, intrinsic or constant name used as a variable, def, parameter, `for` target or `global` name. */
export function reservedName(range: Span, name: string, isConstant: boolean): Diagnostic {
  const what = isConstant ? 'a built-in name' : 'a built-in command';
  return error(
    'E-RESERVED-NAME',
    range,
    `\`${name}\` is ${what}, so it can't be used as a name. Pick another name.`,
  );
}

/** A builtin or intrinsic used without being called; the example call shows brackets per its arity. */
export function builtinNotValue(range: Span, name: string, takesArguments: boolean): Diagnostic {
  const example = takesArguments ? `${name}(...)` : `${name}()`;
  return error(
    'E-BUILTIN-NOT-VALUE',
    range,
    `\`${name}\` is a command: call it with brackets, like \`${example}\`.`,
  );
}

export function rangeOnlyInFor(range: Span): Diagnostic {
  return error('E-RANGE-ONLY-IN-FOR', range, '`range` can only be used in `for x in range(...)`.');
}

export function globalAfterUse(range: Span, name: string): Diagnostic {
  return error(
    'E-GLOBAL-AFTER-USE',
    range,
    `Put \`global ${name}\` before the first line that uses \`${name}\`.`,
  );
}

/** Reported at the later def; `thisFile` is where it is, `firstFile` where the name was first defined. */
export function duplicateDef(range: Span, name: string, thisFile: string, firstFile: string): Diagnostic {
  return error(
    'E-DUPLICATE-DEF',
    range,
    `\`${name}\` is defined in two files: \`${thisFile}\` and \`${firstFile}\`. Keep one.`,
  );
}

/** Wording per limit (chief ruling W2): a showdown allows exactly one file. */
export function tooManyFiles(range: Span, maxFiles: number): Diagnostic {
  const message =
    maxFiles === 1
      ? 'A showdown program can have only 1 file.'
      : `Your program can have at most ${String(maxFiles)} files.`;
  return error('E-TOO-MANY-FILES', range, message);
}

/** The same name twice in one parameter list (chief ruling 2026-10-12); reported at the repeat. */
export function duplicateParam(range: Span, name: string, fn: string): Diagnostic {
  return error(
    'E-DUPLICATE-PARAM',
    range,
    `\`${name}\` is listed twice in the parameters of \`${fn}\`. Give each parameter a different name.`,
  );
}

/** `global x` where x is a parameter of the same def (chief ruling 2026-10-12); reported at the global name. */
export function globalParam(range: Span, name: string, fn: string): Diagnostic {
  return error(
    'E-GLOBAL-PARAM',
    range,
    `\`${name}\` is a parameter of \`${fn}\`, so it can't be declared \`global\`. Rename the parameter or drop the \`global\` line.`,
  );
}
