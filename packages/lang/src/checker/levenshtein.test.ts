import { describe, expect, it } from 'vitest';
import { boundedDistance } from './levenshtein';

describe('boundedDistance (E-UNKNOWN-NAME: Levenshtein ≤ 2 suggestions)', () => {
  const table: readonly (readonly [string, string, number])[] = [
    ['harvest', 'harvest', 0],
    ['harvset', 'harvest', 2],
    ['plnt', 'plant', 1],
    ['plaant', 'plant', 1],
    ['moev', 'move', 2],
    ['', 'ab', 2],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
  ];
  for (const [a, b, distance] of table) {
    it(`measures ${JSON.stringify(a)} → ${JSON.stringify(b)} as ${String(distance)} (capped at 3)`, () => {
      expect(boundedDistance(a, b, 2)).toBe(Math.min(distance, 3));
      expect(boundedDistance(b, a, 2)).toBe(Math.min(distance, 3));
    });
  }

  it('gives up early on very different lengths', () => {
    expect(boundedDistance('a', 'abcdefgh', 2)).toBe(3);
  });
});
