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

/**
 * E-WRONG-ARG-COUNT. With a hint, the catalogue sentence ("`move` needs 1 thing in the brackets: a
 * direction like `NORTH`.") and the given count as help; without one, "…, but got N." (chief ruling W3).
 */
export function wrongArgCount(
  range: Span,
  who: string,
  min: number,
  max: number | null,
  given: number,
  hint: string | null,
): Diagnostic {
  const needs = `${who} needs ${countPhrase(min, max)} in the brackets`;
  if (hint === null) return error('E-WRONG-ARG-COUNT', range, `${needs}, but got ${String(given)}.`);
  return { ...error('E-WRONG-ARG-COUNT', range, `${needs}: ${hint}.`), help: `You gave ${String(given)}.` };
}

/** "nothing", "1 thing", "2 things", "0 or 1 things", "1 to 3 things", "at least 1 thing". */
function countPhrase(min: number, max: number | null): string {
  if (max === null) return `at least ${things(min)}`;
  if (max === min) return min === 0 ? 'nothing' : things(min);
  if (max === min + 1) return `${String(min)} or ${String(max)} things`;
  return `${String(min)} to ${String(max)} things`;
}

function things(n: number): string {
  return n === 1 ? '1 thing' : `${String(n)} things`;
}

/** A method name no Sprout value has; the catalogue sentence names the three that exist. */
export function unknownMethod(range: Span, name: string, suggestion: string | null): Diagnostic {
  const methods = 'Lists have `.append` and `.pop`; dicts have `.get`.';
  if (suggestion === null) {
    return error('E-UNKNOWN-METHOD', range, `\`.${name}\` isn't a method in Sprout. ${methods}`);
  }
  return {
    ...error(
      'E-UNKNOWN-METHOD',
      range,
      `\`.${name}\` isn't a method in Sprout. Did you mean \`.${suggestion}\`?`,
    ),
    help: methods,
    fix: { label: `Change to \`.${suggestion}\``, edits: [{ span: range, newText: suggestion }] },
  };
}

/** What makes the code after it unreachable: an endless loop, or a statement that leaves the block. */
export type UnreachableCause = 'loop' | 'return' | 'break' | 'continue';

export function unreachable(range: Span, cause: UnreachableCause): Diagnostic {
  const message =
    cause === 'loop'
      ? 'This code will never run because the loop above never ends.'
      : `This code will never run because \`${cause}\` above always leaves this block.`;
  return { code: 'W-UNREACHABLE', severity: 'warning', range, message };
}

export function pureInfiniteLoop(range: Span): Diagnostic {
  return {
    code: 'W-PURE-INFINITE-LOOP',
    severity: 'warning',
    range,
    message:
      'This loop never ends and never touches the farm, so it will use up all your cycles doing nothing.',
  };
}

export function useBeforeDef(range: Span, name: string): Diagnostic {
  return {
    code: 'W-USE-BEFORE-DEF',
    severity: 'warning',
    range,
    message: `\`${name}\` isn't defined yet at this line. Move the \`def\` above.`,
  };
}

export function unusedVariable(range: Span, name: string): Diagnostic {
  return {
    code: 'W-UNUSED-VAR',
    severity: 'hint',
    range,
    message: `\`${name}\` is given a value but never used.`,
  };
}
