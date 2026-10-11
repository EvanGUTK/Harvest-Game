import { describe, expect, it } from 'vitest';
import { INTRINSICS, INTRINSIC_NAMES, METHODS, acceptsArgCount, isIntrinsicName } from './intrinsics';

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
});
