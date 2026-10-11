/**
 * Pure builtins implemented by the language itself: len, abs, min, max, str, int and print.
 * Spec: docs/02-language/standard-library.md §Pure helpers; surcharges from
 * docs/03-architecture/interpreter-vm.md §Op cost table (argument-dependent builtins); wordings from
 * errors-and-diagnostics.md §Runtime (R-BAD-ARG) and chief rulings 2026-10-11 (Q15-Q19).
 * Invariants: every surcharge is on top of the 1-cycle call (len = 1, str = 1 + len(result), …);
 * results are owned; arity was checked at compile time, so a wrong count is an invariant violation;
 * `int` never returns -0 and reads only the safe range (R-OVERFLOW beyond it).
 */

import { floorDiv } from '../int-math';
import { InvariantError } from '../invariant';
import { compareOrder } from './compare';
import type { OpContext } from './op-context';
import { reprForMessage, reprText } from './repr';
import { OVERFLOW, fail, succeed, type OpResult, type RuntimeError } from './runtime-error';
import { isDict, isIntLike, isList, isStr, toInt, type RtValue } from './value';

/** Fixed surcharge of len, abs and multi-argument min/max (standard-library.md: cost 1). */
const FIXED_COST = 1;

export type PrintOutcome = { ok: true; line: string; cost: number } | { ok: false; error: RuntimeError };

/** `len(x)` for text (UTF-16 code units), lists and dicts. */
export function lenBuiltin(ctx: OpContext, args: readonly RtValue[]): OpResult {
  const x = single('len', args);
  if (isStr(x)) return succeed(x.text.length, FIXED_COST);
  if (isList(x)) return succeed(x.items.length, FIXED_COST);
  if (isDict(x)) return succeed(x.entries.size, FIXED_COST);
  return fail(badArg(`\`len\` needs a list, dict or text, but got \`${reprForMessage(ctx, x)}\`.`));
}

/** `abs(n)` for an int or bool; the result is an int. */
export function absBuiltin(ctx: OpContext, args: readonly RtValue[]): OpResult {
  const x = single('abs', args);
  if (!isIntLike(x)) return fail(badArg(`\`abs\` needs a number, but got \`${reprForMessage(ctx, x)}\`.`));
  const n = toInt(x);
  return succeed(n < 0 ? 0 - n : n, FIXED_COST);
}

export function minBuiltin(ctx: OpContext, args: readonly RtValue[]): OpResult {
  return extremum(ctx, 'min', args, (sign) => sign < 0);
}

export function maxBuiltin(ctx: OpContext, args: readonly RtValue[]): OpResult {
  return extremum(ctx, 'max', args, (sign) => sign > 0);
}

/** `str(x)`: a str argument is returned as is; anything else is printed with the repr rules. */
export function strBuiltin(ctx: OpContext, args: readonly RtValue[]): OpResult {
  const x = single('str', args);
  if (isStr(x)) {
    ctx.heap.retain(x);
    return succeed(x, 1 + x.text.length);
  }
  const printed = reprText(ctx, x);
  if (!printed.ok) return fail(printed.error);
  const r = ctx.heap.allocStr(printed.text);
  return r.ok ? succeed(r.value, 1 + printed.text.length) : fail(r.error);
}

/** `int(x)`: reads text (cost 1 + len(s)) or converts an int or bool (cost 1). */
export function intBuiltin(ctx: OpContext, args: readonly RtValue[]): OpResult {
  const x = single('int', args);
  if (isIntLike(x)) return succeed(toInt(x), FIXED_COST);
  if (!isStr(x))
    return fail(badArg(`\`int\` needs text or a number, but got \`${reprForMessage(ctx, x)}\`.`));
  const parsed = parseWholeNumber(x.text);
  if (parsed === UNREADABLE) {
    return fail(badArg(`\`int\` can't read ${reprForMessage(ctx, x)} as a whole number.`));
  }
  if (parsed === TOO_BIG) return fail(OVERFLOW);
  return succeed(parsed, 1 + x.text.length);
}

/**
 * The line `print(…)` writes: arguments formatted as str() does, joined with one space, a top-level
 * text unquoted. The line itself may pass 256 units (chief ruling Q18); it is output, not a value.
 */
export function printLine(ctx: OpContext, args: readonly RtValue[]): PrintOutcome {
  const parts: string[] = [];
  for (const arg of args) {
    if (isStr(arg)) {
      parts.push(arg.text);
      continue;
    }
    const printed = reprText(ctx, arg);
    if (!printed.ok) return { ok: false, error: printed.error };
    parts.push(printed.text);
  }
  const line = parts.join(' ');
  return { ok: true, line, cost: 1 + line.length };
}

/**
 * min/max: one list (cost 1 + len) or two or more values (cost 1). The first candidate wins ties
 * (chief ruling Q19); ordering errors are R-TYPE from the comparison rules.
 */
function extremum(
  ctx: OpContext,
  name: 'min' | 'max',
  args: readonly RtValue[],
  replaces: (sign: number) => boolean,
): OpResult {
  if (args.length === 0) throw arityError(name, 0);
  const only = args.length === 1 ? (args[0] ?? null) : undefined;
  if (only !== undefined && !isList(only)) {
    return fail(
      badArg(`\`${name}\` needs a list or two or more values, but got \`${reprForMessage(ctx, only)}\`.`),
    );
  }
  const candidates = only === undefined ? args : only.items;
  const cost = only === undefined ? FIXED_COST : FIXED_COST + candidates.length;
  let best = candidates[0];
  if (best === undefined) return fail(badArg(`\`${name}\` needs at least one value.`));
  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i] ?? null;
    const order = compareOrder(ctx, candidate, best);
    if (!order.ok) return fail(order.error);
    if (replaces(order.sign)) best = candidate;
  }
  ctx.heap.retain(best);
  return succeed(best, cost);
}

function single(name: string, args: readonly RtValue[]): RtValue {
  const [x] = args;
  if (args.length !== 1 || x === undefined) throw arityError(name, args.length);
  return x;
}

function arityError(name: string, count: number): InvariantError {
  return new InvariantError('LANG-INTRINSIC-ARITY', `${name}() got ${String(count)} arguments`);
}

function badArg(message: string): RuntimeError {
  return { code: 'R-BAD-ARG', message };
}

const UNREADABLE = 'unreadable';
const TOO_BIG = 'too-big';
const DECIMAL = 10;
const UNDERSCORE = '_';
/** The six ASCII whitespace characters Python's int() strips (chief ruling Q17). */
const INT_WHITESPACE: ReadonlySet<string> = new Set([' ', '\t', '\n', '\r', '\v', '\f']);

/**
 * int(s) grammar (chief ruling Q17): surrounding Python whitespace, an optional sign, then ASCII
 * digits with single underscores only between digits. Leading zeros are fine; -0 reads as 0.
 */
function parseWholeNumber(text: string): number | typeof UNREADABLE | typeof TOO_BIG {
  const body = stripIntWhitespace(text);
  const negative = body.startsWith('-');
  const digits = negative || body.startsWith('+') ? body.slice(1) : body;
  if (!isDigitRun(digits)) return UNREADABLE;
  let value = 0;
  for (const ch of digits) {
    if (ch === UNDERSCORE) continue;
    const digit = ch.charCodeAt(0) - ZERO_CODE;
    if (value > floorDiv(Number.MAX_SAFE_INTEGER - digit, DECIMAL)) return TOO_BIG;
    value = value * DECIMAL + digit;
  }
  return negative && value !== 0 ? 0 - value : value;
}

const ZERO_CODE = '0'.charCodeAt(0);

function stripIntWhitespace(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && INT_WHITESPACE.has(text.charAt(start))) start += 1;
  while (end > start && INT_WHITESPACE.has(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

/** Digits with single underscores only between digits; at least one digit. */
function isDigitRun(text: string): boolean {
  let previousWasDigit = false;
  for (const ch of text) {
    if (isAsciiDigit(ch)) previousWasDigit = true;
    else if (ch === UNDERSCORE && previousWasDigit) previousWasDigit = false;
    else return false;
  }
  return previousWasDigit;
}

function isAsciiDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}
