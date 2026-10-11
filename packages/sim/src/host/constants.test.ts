import { CONSTANTS, CROP_IDS, CROPS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import {
  constantIdOfCrop,
  constantIdOfSoil,
  constantName,
  cropOfConstantId,
  directionOfConstantId,
} from './constants';

// standard-library.md §Constants: directions NORTH/SOUTH/EAST/WEST, crops, soils GRASS/TILLED/ROCK.
describe('constant lookups', () => {
  it('maps every crop to its constant id and back, in CROP_IDS order', () => {
    for (const crop of CROP_IDS) {
      const id = constantIdOfCrop(crop);
      expect(constantName(id)).toBe(CROPS[crop].constant);
      expect(cropOfConstantId(id)).toBe(crop);
    }
    expect(constantIdOfCrop('radish')).toBe(10);
    expect(constantIdOfCrop('melon')).toBe(12);
  });

  it('maps direction ids to directions and rejects ids of other groups', () => {
    expect(directionOfConstantId(0)).toBe('north');
    expect(directionOfConstantId(1)).toBe('south');
    expect(directionOfConstantId(2)).toBe('east');
    expect(directionOfConstantId(3)).toBe('west');
    expect(directionOfConstantId(10)).toBeUndefined();
    expect(cropOfConstantId(0)).toBeUndefined();
    expect(cropOfConstantId(999)).toBeUndefined();
  });

  it('maps each soil to its constant id', () => {
    expect(constantName(constantIdOfSoil('grass'))).toBe('GRASS');
    expect(constantName(constantIdOfSoil('tilled'))).toBe('TILLED');
    expect(constantName(constantIdOfSoil('rock'))).toBe('ROCK');
  });

  it('names an unknown constant id as undefined and every known id by its constant', () => {
    expect(constantName(999)).toBeUndefined();
    for (const c of CONSTANTS) expect(constantName(c.id)).toBe(c.name);
  });
});
