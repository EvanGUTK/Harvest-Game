import { describe, expect, it } from 'vitest';
import { CROP_IDS, CROPS } from './index';

describe('CROP_IDS', () => {
  // Completeness is typed: CropId derives from CROP_IDS and CROPS is Record<CropId, CropDef>, so a crop
  // missing from either side fails to compile. The runtime checks cover what the types cannot.
  it('lists each crop once (simulation-engine.md §State hash)', () => {
    expect(new Set(CROP_IDS).size).toBe(CROP_IDS.length);
  });

  it('matches the id stored in each crop definition', () => {
    for (const id of CROP_IDS) expect(CROPS[id].id).toBe(id);
  });
});
