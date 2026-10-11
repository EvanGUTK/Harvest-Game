import { describe, expect, it } from 'vitest';
import { MAX_DRONES as fromIndex } from './index';
import { MAX_DRONES as fromTypes } from './types';

describe('types module', () => {
  it('re-exports MAX_DRONES from the package entry point unchanged (simulation-engine.md §Tie-break)', () => {
    expect(fromIndex).toBe(fromTypes);
    expect(fromIndex).toBe(2);
  });
});
