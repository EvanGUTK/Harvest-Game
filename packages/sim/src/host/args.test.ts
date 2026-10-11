import { WAIT_BOUNDS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { createFakeValues } from '../testing/fake-values';
import { decodeCrop, decodeDirection, decodeInt, paramHint } from './args';

const values = createFakeValues();
const RADISH = 10;
const NORTH = 0;

// errors-and-diagnostics.md §Runtime errors: R-BAD-ARG wording, e.g. "`plant` needs a crop like `RADISH`, but got `5`".
describe('decodeCrop', () => {
  it('accepts a crop constant', () => {
    expect(decodeCrop(values, 'plant', values.constant(RADISH))).toEqual({ ok: true, value: 'radish' });
    expect(decodeCrop(values, 'plant', values.constant(12))).toEqual({ ok: true, value: 'melon' });
  });

  it('rejects an int with the catalogue wording', () => {
    expect(decodeCrop(values, 'plant', values.int(5))).toEqual({
      ok: false,
      error: { code: 'R-BAD-ARG', message: '`plant` needs a crop like `RADISH`, but got `5`' },
    });
  });

  it('rejects a direction constant, a bool, None, text and a list, naming what it got', () => {
    const got = (v: ReturnType<typeof values.int>) => {
      const r = decodeCrop(values, 'sell', v);
      return r.ok ? 'ok' : r.error.message;
    };
    expect(got(values.constant(NORTH))).toBe('`sell` needs a crop like `RADISH`, but got `NORTH`');
    expect(got(values.bool(true))).toBe('`sell` needs a crop like `RADISH`, but got `True`');
    expect(got(values.none)).toBe('`sell` needs a crop like `RADISH`, but got `None`');
    expect(got(values.str('corn'))).toBe("`sell` needs a crop like `RADISH`, but got `'corn'`");
    expect(got(values.list())).toBe('`sell` needs a crop like `RADISH`, but got a list');
  });
});

describe('decodeDirection', () => {
  it('accepts the four directions and rejects a crop', () => {
    expect(decodeDirection(values, 'move', values.constant(NORTH))).toEqual({ ok: true, value: 'north' });
    expect(decodeDirection(values, 'move', values.constant(3))).toEqual({ ok: true, value: 'west' });
    const bad = decodeDirection(values, 'move', values.constant(RADISH));
    expect(bad).toEqual({
      ok: false,
      error: { code: 'R-BAD-ARG', message: '`move` needs a direction like `NORTH`, but got `RADISH`' },
    });
  });
});

describe('decodeInt', () => {
  it('accepts an int inside the range, boundaries included', () => {
    const range = { min: WAIT_BOUNDS.min, max: WAIT_BOUNDS.max };
    expect(decodeInt(values, 'wait', 0, values.int(1), range)).toEqual({ ok: true, value: 1 });
    expect(decodeInt(values, 'wait', 0, values.int(5_000), range)).toEqual({ ok: true, value: 5_000 });
  });

  it('rejects an out-of-range int with the catalogue wording', () => {
    const range = { min: 1, max: 5_000 };
    expect(decodeInt(values, 'wait', 0, values.int(0), range)).toEqual({
      ok: false,
      error: {
        code: 'R-BAD-ARG',
        message: '`wait` needs a whole number of cycles from 1 to 5,000, but got `0`',
      },
    });
    expect(decodeInt(values, 'wait', 0, values.int(5_001), range).ok).toBe(false);
    expect(decodeInt(values, 'random', 0, values.int(0), { min: 1 })).toEqual({
      ok: false,
      error: { code: 'R-BAD-ARG', message: '`random` needs a whole number of 1 or more, but got `0`' },
    });
  });

  it('accepts a bool as 0 or 1, as in Python, and still checks the range (language-spec.md: a bool is also an int)', () => {
    expect(decodeInt(values, 'sell', 1, values.bool(true))).toEqual({ ok: true, value: 1 });
    expect(decodeInt(values, 'sell', 1, values.bool(false))).toEqual({ ok: true, value: 0 });
    expect(decodeInt(values, 'wait', 0, values.bool(true), { min: 1, max: 5_000 })).toEqual({
      ok: true,
      value: 1,
    });
    expect(decodeInt(values, 'wait', 0, values.bool(false), { min: 1, max: 5_000 }).ok).toBe(false);
  });

  it('rejects None and text where an int is needed', () => {
    for (const bad of [values.none, values.str('3')]) {
      expect(decodeInt(values, 'wait', 0, bad, { min: 1, max: 5_000 }).ok).toBe(false);
    }
  });

  it('accepts any int when no range is given', () => {
    expect(decodeInt(values, 'sell', 1, values.int(-3))).toEqual({ ok: true, value: -3 });
  });

  it('describes a goto coordinate range from the farm size', () => {
    const r = decodeInt(values, 'goto', 0, values.int(9), { min: 0, max: 7 }, 'a column from 0 to 7');
    expect(r).toEqual({
      ok: false,
      error: { code: 'R-BAD-ARG', message: '`goto` needs a column from 0 to 7, but got `9`' },
    });
  });
});

describe('paramHint', () => {
  it('reads the hint of a parameter from the content metadata', () => {
    expect(paramHint('plant', 0)).toBe('a crop like `RADISH`');
    expect(paramHint('goto', 1)).toBe('a row from 0 to the farm size minus 1');
  });
});
