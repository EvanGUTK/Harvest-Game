import { describe, expect, it } from 'vitest';
import { fnv1a32Ascii, fnv1a32Words } from './fnv1a';

describe('fnv1a32Ascii', () => {
  it('returns the offset basis for the empty string (simulation-engine.md §State hash)', () => {
    expect(fnv1a32Ascii('')).toBe(0x811c9dc5);
  });

  it('matches the published FNV-1a 32-bit vectors', () => {
    expect(fnv1a32Ascii('a')).toBe(0xe40c292c);
    expect(fnv1a32Ascii('foobar')).toBe(0xbf9cf968);
  });

  it('derives the stream ids used by PRNG seeding (simulation-engine.md §PRNG seeding)', () => {
    expect(fnv1a32Ascii('layout')).toBe(3_401_678_079);
    expect(fnv1a32Ascii('weather')).toBe(910_182_291);
    expect(fnv1a32Ascii('player:0')).toBe(3_834_577_498);
    expect(fnv1a32Ascii('player:1')).toBe(3_851_355_117);
  });

  it('rejects a character outside ASCII instead of hashing a truncated byte', () => {
    expect(() => fnv1a32Ascii('café')).toThrow(/ASCII/);
  });
});

describe('fnv1a32Words', () => {
  it('returns the offset basis for no words', () => {
    expect(fnv1a32Words([])).toBe(0x811c9dc5);
  });

  it('writes each word as four little-endian bytes (simulation-engine.md §State hash)', () => {
    // 0x64636261 is the bytes 61 62 63 64 in little-endian order, i.e. the text "abcd".
    expect(fnv1a32Words([0x64636261])).toBe(fnv1a32Ascii('abcd'));
    expect(fnv1a32Words([0x64636261])).toBe(0xce3479bd);
  });

  it('hashes a negative int32 as its uint32 reinterpretation', () => {
    expect(fnv1a32Words([-1])).toBe(fnv1a32Words([0xffffffff]));
    expect(fnv1a32Words([-1])).toBe(0xe3160fb1);
  });

  it('depends on word order and on every word', () => {
    expect(fnv1a32Words([1, 2, 3])).toBe(0x794671b5);
    expect(fnv1a32Words([3, 2, 1])).not.toBe(fnv1a32Words([1, 2, 3]));
    expect(fnv1a32Words([1, 2])).not.toBe(fnv1a32Words([1, 2, 3]));
  });

  it('always returns a uint32', () => {
    const h = fnv1a32Words([0x7fffffff, -0x80000000, 0]);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});
