import { describe, expect, it } from 'vitest';
import { assertNever, InvariantError } from './invariant';

type Shape = 'circle' | 'square';

function area(shape: Shape): number {
  switch (shape) {
    case 'circle':
      return 3;
    case 'square':
      return 4;
    default:
      return assertNever(shape);
  }
}

describe('InvariantError', () => {
  it('carries a stable code and prefixes the message with it (standards.md §Errors)', () => {
    const error = new InvariantError('SIM-BAD-GRID', 'grid size must be ≥ 1');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('SIM-BAD-GRID');
    expect(error.name).toBe('InvariantError');
    expect(error.message).toBe('SIM-BAD-GRID: grid size must be ≥ 1');
  });
});

describe('assertNever', () => {
  it('lets an exhaustive switch through (standards.md §TypeScript: exhaustive switch)', () => {
    expect(area('circle')).toBe(3);
    expect(area('square')).toBe(4);
  });

  it('throws InvariantError SIM-UNREACHABLE naming the value when a union gains a case that the switch misses', () => {
    const smuggled = 'triangle' as unknown as Shape;
    expect(() => area(smuggled)).toThrow(InvariantError);
    expect(() => area(smuggled)).toThrow(/SIM-UNREACHABLE.*triangle/);
  });
});
