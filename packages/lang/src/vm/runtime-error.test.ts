import { describe, expect, it } from 'vitest';
import { formatCount } from './runtime-error';

describe('formatCount (errors-and-diagnostics.md §Runtime writes limits as 16,384)', () => {
  it('groups digits in threes with commas, keeping zero-padded inner groups', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_000)).toBe('1,000');
    expect(formatCount(1_005)).toBe('1,005');
    expect(formatCount(16_384)).toBe('16,384');
    expect(formatCount(1_000_000)).toBe('1,000,000');
    expect(formatCount(Number.MAX_SAFE_INTEGER)).toBe('9,007,199,254,740,991');
  });
});
