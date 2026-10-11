import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../types';
import { createOpContext, type OpContext } from './op-context';
import { MESSAGE_REPR_LENGTH, printValue, quoteStr, reprForMessage, reprText } from './repr';
import { constValue, dictKeyOf, fnValue, literalStr, type ListObj, type RtValue } from './value';

const context = (): OpContext =>
  createOpContext(DEFAULT_LIMITS, [{ name: 'RADISH', id: 10, group: 'crop' }], ['tend']);

const list = (ctx: OpContext, xs: RtValue[]): ListObj => {
  const r = ctx.heap.allocList(xs);
  if (!r.ok) throw new Error('alloc failed');
  return r.value;
};
const nested = (ctx: OpContext, depth: number): ListObj => {
  let v = list(ctx, []);
  for (let i = 1; i < depth; i += 1) v = list(ctx, [v]);
  return v;
};
const repr = (ctx: OpContext, v: RtValue): string => {
  const r = reprText(ctx, v);
  if (!r.ok) throw new Error(`unexpected ${r.error.code}`);
  return r.text;
};
const reprError = (ctx: OpContext, v: RtValue): string | undefined => {
  const r = reprText(ctx, v);
  return r.ok ? undefined : r.error.code;
};

describe('repr of scalars (standard-library.md §Pure helpers: str)', () => {
  it('prints ints in decimal and True, False, None as Python does', () => {
    const ctx = context();
    expect(repr(ctx, 42)).toBe('42');
    expect(repr(ctx, -7)).toBe('-7');
    expect(repr(ctx, Number.MIN_SAFE_INTEGER)).toBe('-9007199254740991');
    expect(repr(ctx, true)).toBe('True');
    expect(repr(ctx, false)).toBe('False');
    expect(repr(ctx, null)).toBe('None');
  });

  it('prints constants by name and functions as <function name> (chief ruling 2026-10-11, Q9)', () => {
    const ctx = context();
    expect(repr(ctx, constValue(10))).toBe('RADISH');
    expect(repr(ctx, fnValue(0))).toBe('<function tend>');
  });
});

describe('quoteStr: Python repr rules for text (chief ruling 2026-10-11, Q10)', () => {
  it('uses single quotes, or double quotes when the text has a single quote and no double quote', () => {
    expect(quoteStr('abc')).toBe("'abc'");
    expect(quoteStr('')).toBe("''");
    expect(quoteStr("it's")).toBe('"it\'s"');
    expect(quoteStr('say "hi"')).toBe('\'say "hi"\'');
    expect(quoteStr('it\'s "x"')).toBe("'it\\'s \"x\"'");
  });

  it('escapes backslash, tab, newline, carriage return, other controls below 0x20 and 0x7f', () => {
    expect(quoteStr('a\\b')).toBe("'a\\\\b'");
    expect(quoteStr('\t\n\r')).toBe("'\\t\\n\\r'");
    expect(quoteStr('\u0000\u001f\u007f\u001b')).toBe("'\\x00\\x1f\\x7f\\x1b'");
  });

  it('keeps every other code unit verbatim, including non-ASCII and lone surrogates', () => {
    expect(quoteStr('é😀 ~')).toBe("'é😀 ~'");
    expect(quoteStr('\ud800')).toBe("'\ud800'");
    expect(quoteStr('\u0080 ')).toBe("'\u0080 '");
  });
});

describe('repr of lists and dicts (standard-library.md §Pure helpers: str)', () => {
  it("prints lists as [1, 'a', RADISH] with quoted strings inside", () => {
    const ctx = context();
    expect(repr(ctx, list(ctx, [1, literalStr('a'), constValue(10)]))).toBe("[1, 'a', RADISH]");
    expect(repr(ctx, list(ctx, []))).toBe('[]');
    expect(repr(ctx, list(ctx, [list(ctx, [1]), list(ctx, [])]))).toBe('[[1], []]');
  });

  it('prints dicts as {1: 2} in insertion order, keeping the first-inserted key', () => {
    const ctx = context();
    const d = ctx.heap.allocDict();
    const set = (k: RtValue, v: RtValue) => {
      const dk = dictKeyOf(k);
      if (dk === undefined) throw new Error('bad key');
      expect(ctx.heap.dictSet(d, dk, k, v)).toBeUndefined();
    };
    expect(repr(ctx, d)).toBe('{}');
    set(true, 1);
    set(literalStr('b'), list(ctx, [null]));
    set(1, 2);
    set(constValue(10), false);
    expect(repr(ctx, d)).toBe("{True: 2, 'b': [None], RADISH: False}");
  });

  it('raises R-STR-TOO-LONG once the text passes 256 units', () => {
    const ctx = context();
    // 85 single-digit elements: 1 + 85 + 2 × 84 + 1 = 255 units; 86 elements: 258.
    expect(repr(ctx, list(ctx, new Array<RtValue>(85).fill(0)))).toHaveLength(255);
    expect(reprError(ctx, list(ctx, new Array<RtValue>(86).fill(0)))).toBe('R-STR-TOO-LONG');
    expect(reprError(ctx, list(ctx, [literalStr('x'.repeat(255))]))).toBe('R-STR-TOO-LONG');
  });

  it('applies the == depth rule: 64 nested levels print, 65 raise R-STACK-OVERFLOW (chief ruling Q3/Q4)', () => {
    const ctx = context();
    expect(repr(ctx, nested(ctx, 64))).toBe('['.repeat(64) + ']'.repeat(64));
    expect(reprError(ctx, nested(ctx, 65))).toBe('R-STACK-OVERFLOW');
  });

  it('raises R-STACK-OVERFLOW for a list that contains itself, before the length limit', () => {
    const ctx = context();
    const a = list(ctx, []);
    expect(ctx.heap.listAppend(a, a)).toBeUndefined();
    const r = reprText(ctx, a);
    expect(r.ok ? undefined : r.error).toEqual({
      code: 'R-STACK-OVERFLOW',
      message:
        'A value is nested too deeply to compare or print (64 levels max), for example a list that contains itself.',
    });
  });

  it('raises R-STR-TOO-LONG when the length passes 256 before the depth passes 64', () => {
    const ctx = context();
    const deep = nested(ctx, 65);
    expect(reprError(ctx, list(ctx, [literalStr('x'.repeat(250)), deep]))).toBe('R-STR-TOO-LONG');
  });
});

describe('reprForMessage: reprs inside error messages (chief ruling 2026-10-11, Q11)', () => {
  it('prints short values unchanged', () => {
    const ctx = context();
    expect(reprForMessage(ctx, constValue(10))).toBe('RADISH');
    expect(reprForMessage(ctx, literalStr('abc'))).toBe("'abc'");
  });

  it('cuts at 40 UTF-16 units and appends …', () => {
    const ctx = context();
    expect(MESSAGE_REPR_LENGTH).toBe(40);
    const exact = literalStr('x'.repeat(38));
    expect(reprForMessage(ctx, exact)).toBe(`'${'x'.repeat(38)}'`);
    const long = list(ctx, new Array<RtValue>(30).fill(7));
    expect(reprForMessage(ctx, long)).toBe(`${'[7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7'.slice(0, 40)}…`);
  });

  it('never cuts a surrogate pair in half before the …', () => {
    const ctx = context();
    // "'xx" is 3 units, then 18 emoji make 39; the 19th emoji's high surrogate would be unit 40.
    const text = reprForMessage(ctx, literalStr(`xx${'😀'.repeat(30)}`));
    expect(text).toBe(`'xx${'😀'.repeat(18)}…`);
  });

  it('never raises, even for a list that contains itself', () => {
    const ctx = context();
    const a = list(ctx, []);
    expect(ctx.heap.listAppend(a, a)).toBeUndefined();
    expect(reprForMessage(ctx, a)).toBe(`${'['.repeat(40)}…`);
  });
});

describe('printValue policies', () => {
  it('prints [...] and {...} beyond the depth limit when asked not to raise', () => {
    const ctx = context();
    const d = ctx.heap.allocDict();
    const r = printValue(ctx, list(ctx, [list(ctx, [d]), d]), {
      maxLength: 100,
      maxDepth: 2,
      onLimit: 'mark',
    });
    expect(r).toEqual({ ok: true, text: '[[{...}], {}]' });
    const deep = printValue(ctx, nested(ctx, 3), { maxLength: 100, maxDepth: 2, onLimit: 'mark' });
    expect(deep).toEqual({ ok: true, text: '[[[...]]]' });
  });
});
