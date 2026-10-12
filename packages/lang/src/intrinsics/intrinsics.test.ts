import { describe, expect, it } from 'vitest';
import {
  CALLABLE_INTRINSICS,
  INTRINSICS,
  INTRINSIC_NAMES,
  METHODS,
  METHOD_IDS,
  acceptsArgCount,
  isIntrinsicName,
} from './intrinsics';

describe('intrinsics table (standard-library.md §Pure helpers)', () => {
  it('lists exactly the pure helpers the language implements itself', () => {
    expect([...INTRINSIC_NAMES]).toEqual(['range', 'len', 'abs', 'min', 'max', 'str', 'int', 'print']);
    expect(isIntrinsicName('len')).toBe(true);
    expect(isIntrinsicName('plant')).toBe(false);
    expect(isIntrinsicName('append')).toBe(false);
  });

  it('accepts the documented argument counts', () => {
    const accepts = (name: Parameters<typeof INTRINSICS.get>[0], count: number) => {
      const arity = INTRINSICS.get(name);
      if (arity === undefined) throw new Error(`no ${name}`);
      return acceptsArgCount(arity, count);
    };
    expect([0, 1, 2, 3, 4].map((n) => accepts('range', n))).toEqual([false, true, true, true, false]);
    expect([0, 1, 2].map((n) => accepts('len', n))).toEqual([false, true, false]);
    expect([0, 1, 2, 9].map((n) => accepts('min', n))).toEqual([false, true, true, true]);
    expect([0, 5].map((n) => accepts('print', n))).toEqual([true, true]);
  });

  it('checks method arity by name: append 1, pop 0-1, get 1-2 (chief rulings Q13, Q14)', () => {
    expect(METHODS.get('append')).toEqual({ min: 1, max: 1 });
    expect(METHODS.get('pop')).toEqual({ min: 0, max: 1 });
    expect(METHODS.get('get')).toEqual({ min: 1, max: 2 });
  });

  it('numbers the CALL_INTRINSIC and CALL_METHOD targets stably, leaving range to ITER_INIT', () => {
    expect(CALLABLE_INTRINSICS).toEqual(['len', 'abs', 'min', 'max', 'str', 'int', 'print']);
    expect(METHOD_IDS).toEqual(['append', 'pop', 'get']);
    for (const name of CALLABLE_INTRINSICS) expect(INTRINSICS.has(name)).toBe(true);
    for (const name of METHOD_IDS) expect(METHODS.has(name)).toBe(true);
  });
});
