import { describe, expect, it } from 'vitest';
import { CROP_IDS, CROPS } from './index';

describe('CROP_IDS', () => {
  it('lists exactly the crops of CROPS, each once, in CROPS order (simulation-engine.md §State hash)', () => {
    expect([...CROP_IDS]).toEqual(Object.keys(CROPS));
  });

  it('matches the id stored in each crop definition', () => {
    for (const id of CROP_IDS) expect(CROPS[id].id).toBe(id);
  });
});
