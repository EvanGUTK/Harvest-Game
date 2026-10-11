/**
 * The value printer behind `str()`, `print` and the reprs inside runtime error messages.
 * Spec: docs/02-language/standard-library.md §Pure helpers (str: Python repr rules, constants by
 * name); chief rulings 2026-10-11: Q4 (depth rule shared with ==), Q9 (`<function name>`), Q10 (ASCII
 * escapes), Q11 (message reprs cut at 40 units with "…", `[...]`/`{...}` beyond the depth limit).
 * Invariants: iterative over an explicit frame stack (no JS recursion); output is produced left to
 * right and stops at the first limit reached, so which error wins (length or depth) is deterministic.
 */

import { constantDef, functionName, type OpContext } from './op-context';
import { deepNesting, strTooLong, type RuntimeError } from './runtime-error';
import { floorDiv, floorMod } from '../int-math';
import type { DictEntry, DictObj, ListObj, RtValue } from './value';

type Scalar = Exclude<RtValue, ListObj | DictObj>;

/** Q11: reprs inside error messages are cut at this many UTF-16 units, then "…" is appended. */
export const MESSAGE_REPR_LENGTH = 40;
const ELLIPSIS = '…';

export type PrintPolicy = {
  readonly maxLength: number;
  /** Container nesting allowed; the outermost container is depth 1. */
  readonly maxDepth: number;
  /** 'raise': R-STR-TOO-LONG / R-STACK-OVERFLOW. 'mark': cut with "…" and print [...] / {...}. */
  readonly onLimit: 'raise' | 'mark';
};

export type PrintResult = { ok: true; text: string } | { ok: false; error: RuntimeError };

/** The full repr under the str() limits (256 units, 64 levels); strings are quoted. */
export function reprText(ctx: OpContext, v: RtValue): PrintResult {
  return printValue(ctx, v, {
    maxLength: ctx.limits.maxStringLength,
    maxDepth: ctx.limits.maxCallDepth,
    onLimit: 'raise',
  });
}

/** A repr for an error message: never raises, at most 40 units plus "…". */
export function reprForMessage(ctx: OpContext, v: RtValue): string {
  const r = printValue(ctx, v, {
    maxLength: MESSAGE_REPR_LENGTH,
    maxDepth: ctx.limits.maxCallDepth,
    onLimit: 'mark',
  });
  return r.ok ? r.text : r.error.message;
}

export function printValue(ctx: OpContext, root: RtValue, policy: PrintPolicy): PrintResult {
  return new Printer(ctx, policy).print(root);
}

const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const FIRST_PRINTABLE = 0x20;
const DELETE = 0x7f;
const NAMED_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['\\', '\\\\'],
  ['\t', '\\t'],
  ['\n', '\\n'],
  ['\r', '\\r'],
]);
const HEX_DIGITS = 2;
const HEX_RADIX = 16;
const SLOTS_PER_ENTRY = 2;

/** Python's repr of a str for the ASCII range; every other code unit is kept verbatim (Q10). */
export function quoteStr(text: string): string {
  const quote = text.includes(SINGLE_QUOTE) && !text.includes(DOUBLE_QUOTE) ? DOUBLE_QUOTE : SINGLE_QUOTE;
  let out = quote;
  for (let i = 0; i < text.length; i += 1) out += escapeUnit(text.charAt(i), quote);
  return out + quote;
}

function escapeUnit(unit: string, quote: string): string {
  const named = NAMED_ESCAPES.get(unit);
  if (named !== undefined) return named;
  if (unit === quote) return `\\${quote}`;
  const code = unit.charCodeAt(0);
  if (code < FIRST_PRINTABLE || code === DELETE)
    return `\\x${code.toString(HEX_RADIX).padStart(HEX_DIGITS, '0')}`;
  return unit;
}

type Frame =
  | { readonly kind: 'list'; readonly items: readonly RtValue[]; next: number }
  | { readonly kind: 'dict'; readonly entries: readonly DictEntry[]; next: number };

/** One print run: output buffer, frame stack and the first limit hit. Created and discarded per call. */
class Printer {
  private readonly ctx: OpContext;
  private readonly policy: PrintPolicy;
  private readonly parts: string[] = [];
  private readonly frames: Frame[] = [];
  private length = 0;
  private stopped = false;
  private error: RuntimeError | undefined = undefined;

  constructor(ctx: OpContext, policy: PrintPolicy) {
    this.ctx = ctx;
    this.policy = policy;
  }

  print(root: RtValue): PrintResult {
    this.value(root);
    let frame = this.frames.at(-1);
    while (frame !== undefined && !this.stopped) {
      this.step(frame);
      frame = this.frames.at(-1);
    }
    if (this.error) return { ok: false, error: this.error };
    return { ok: true, text: this.parts.join('') };
  }

  /** Emits the next separator and member of `frame`, or its closing bracket when it is exhausted. */
  private step(frame: Frame): void {
    if (frame.kind === 'list') this.stepList(frame);
    else this.stepDict(frame);
  }

  private stepList(frame: Frame & { kind: 'list' }): void {
    if (frame.next === frame.items.length) {
      this.close(']');
      return;
    }
    if (frame.next > 0) this.emit(', ');
    const item = frame.items[frame.next] ?? null;
    frame.next += 1;
    this.value(item);
  }

  /** A dict frame walks 2 slots per entry: the key at even slots, the value at odd ones. */
  private stepDict(frame: Frame & { kind: 'dict' }): void {
    if (frame.next === frame.entries.length * SLOTS_PER_ENTRY) {
      this.close('}');
      return;
    }
    const entry = frame.entries[floorDiv(frame.next, SLOTS_PER_ENTRY)];
    const isKey = floorMod(frame.next, SLOTS_PER_ENTRY) === 0;
    if (isKey && frame.next > 0) this.emit(', ');
    if (!isKey) this.emit(': ');
    frame.next += 1;
    if (entry !== undefined) this.value(isKey ? entry.key : entry.value);
  }

  private close(bracket: string): void {
    this.frames.pop();
    this.emit(bracket);
  }

  private value(v: RtValue): void {
    if (typeof v === 'object' && v !== null && (v.tag === 'list' || v.tag === 'dict')) {
      this.open(v.tag === 'list' ? { kind: 'list', items: v.items, next: 0 } : dictFrame(v.entries));
      return;
    }
    this.emit(this.scalar(v));
  }

  private open(frame: Frame): void {
    const [opening, marker] = frame.kind === 'list' ? ['[', '[...]'] : ['{', '{...}'];
    if (this.frames.length + 1 > this.policy.maxDepth) {
      if (this.policy.onLimit === 'raise') this.fail(deepNesting(this.ctx.limits));
      else this.emit(marker);
      return;
    }
    this.frames.push(frame);
    this.emit(opening);
  }

  private scalar(v: Scalar): string {
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (v === null) return 'None';
    switch (v.tag) {
      case 'str':
        return quoteStr(v.text);
      case 'const':
        return constantDef(this.ctx.constants, v.id).name;
      case 'fn':
        return `<function ${functionName(this.ctx, v.index)}>`;
    }
  }

  private emit(text: string): void {
    if (this.stopped) return;
    if (this.length + text.length <= this.policy.maxLength) {
      this.parts.push(text);
      this.length += text.length;
      return;
    }
    if (this.policy.onLimit === 'raise') {
      this.fail(strTooLong(this.ctx.limits));
      return;
    }
    this.parts.push(text.slice(0, this.policy.maxLength - this.length), ELLIPSIS);
    this.stopped = true;
  }

  private fail(error: RuntimeError): void {
    this.error = error;
    this.stopped = true;
  }
}

function dictFrame(entries: ReadonlyMap<unknown, DictEntry>): Frame {
  return { kind: 'dict', entries: [...entries.values()], next: 0 };
}
