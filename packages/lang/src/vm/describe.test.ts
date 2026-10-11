import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../types';
import { InvariantError } from '../invariant';
import { kindNoun } from './describe';
import { Heap } from './heap';
import { constantTable } from './op-context';
import { constValue, fnValue, literalStr } from './value';

describe('kindNoun (errors-and-diagnostics.md §Runtime R-TYPE, chief ruling 2026-10-11)', () => {
  const constants = constantTable([
    { name: 'RADISH', id: 10, group: 'crop' },
    { name: 'TILLED', id: 21, group: 'soil' },
  ]);

  it('names every kind with the approved noun, constants by their group', () => {
    const heap = new Heap(DEFAULT_LIMITS);
    expect(kindNoun(5, constants)).toBe('a number');
    expect(kindNoun(true, constants)).toBe('a number');
    expect(kindNoun(literalStr('a'), constants)).toBe('text');
    expect(kindNoun(null, constants)).toBe('None');
    expect(kindNoun(fnValue(0), constants)).toBe('a function');
    expect(kindNoun(heap.allocDict(), constants)).toBe('a dict');
    expect(kindNoun(constValue(10), constants)).toBe('a crop');
    expect(kindNoun(constValue(21), constants)).toBe('a soil');
    const list = heap.allocList([]);
    expect(list.ok && kindNoun(list.value, constants)).toBe('a list');
  });

  it('throws LANG-VALUE-UNKNOWN-CONST for a constant id the module does not define', () => {
    expect(() => kindNoun(constValue(99), constants)).toThrow(InvariantError);
  });
});
