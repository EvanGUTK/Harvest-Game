import { describe, expect, it } from 'vitest';
import { fnv1a32Ascii } from '@harvest/lang';
import { createSfc32 } from './sfc32';
import { splitmix32 } from './splitmix32';
import { createStreams, randomBelow, seedStream, streamName } from './streams';

// Known answers computed independently (Python), not by this code.
describe('seedStream', () => {
  it('seeds the layout stream as splitmix32(seed ^ streamId) then discards 12 outputs (§PRNG seeding)', () => {
    const rng = seedStream(0, 'layout');
    expect(rng.state()).not.toEqual([3_218_302_362, 762_364_611, 1_446_993_769, 1_046_083_141]);
    expect(Array.from({ length: 4 }, () => rng.next())).toEqual([
      152_262_821, 1_030_517_426, 2_336_920_382, 3_158_874_995,
    ]);
  });

  it('pins the first outputs for several seeds and streams (§PRNG seeding)', () => {
    const first = (seed: number, name: string): number[] => {
      const rng = seedStream(seed, name);
      return Array.from({ length: 4 }, () => rng.next());
    };
    expect(first(0, 'weather')).toEqual([1_500_121_626, 1_689_689_718, 3_684_849_544, 3_161_018_044]);
    expect(first(0, 'player:0')).toEqual([1_244_663_006, 1_614_684_739, 2_815_768_318, 834_614_945]);
    expect(first(1, 'layout')).toEqual([3_584_477_640, 88_174_098, 1_074_923_335, 1_698_232_653]);
    expect(first(1, 'player:1')).toEqual([1_987_220_150, 2_688_747_038, 3_037_027_126, 1_496_612_909]);
    expect(first(12_345, 'layout')).toEqual([413_703_060, 3_159_846_372, 469_903_706, 3_149_871_141]);
    expect(first(12_345, 'player:0')).toEqual([1_694_069_793, 2_822_445_926, 2_189_247_997, 3_715_824_778]);
    expect(first(0xffffffff, 'layout')).toEqual([2_402_264_813, 1_980_454_611, 3_684_294_919, 3_745_042_753]);
    expect(first(0xffffffff, 'player:1')).toEqual([1_910_544_997, 3_414_278_517, 3_245_728_517, 195_389_967]);
  });

  it('discards exactly 12 outputs: the state is 12 draws ahead of the raw splitmix words (§PRNG seeding)', () => {
    const rng = seedStream(0, 'layout');
    const afterSeeding = rng.state();
    const g = splitmix32((0 ^ fnv1a32Ascii('layout')) >>> 0);
    const reference = createSfc32([g.next(), g.next(), g.next(), g.next()]);
    for (let i = 0; i < 12; i += 1) reference.next();
    expect(afterSeeding).toEqual(reference.state());
  });

  it('rejects a seed outside the uint32 range or a non-integer instead of aliasing another seed (§Determinism: seed range)', () => {
    for (const bad of [-1, 2 ** 32, 1.5, Number.NaN]) {
      expect(() => seedStream(bad, 'layout')).toThrow(/SIM-BAD-SEED/);
      expect(() => createStreams(bad, 1)).toThrow(/SIM-BAD-SEED/);
    }
  });

  it('keeps seed ^ streamId a uint32 at the seed range edges (§Determinism: seed range)', () => {
    for (const seed of [0, 0xffffffff]) {
      for (const word of seedStream(seed, 'player:0').state()) {
        expect(Number.isInteger(word)).toBe(true);
        expect(word).toBeGreaterThanOrEqual(0);
        expect(word).toBeLessThanOrEqual(0xffffffff);
      }
    }
  });
});

describe('streamName', () => {
  it('names the fixed streams and the per-slot streams (§PRNG seeding)', () => {
    expect(streamName('layout')).toBe('layout');
    expect(streamName('weather')).toBe('weather');
    expect(streamName({ player: 3 })).toBe('player:3');
  });
});

describe('createStreams', () => {
  it('exposes streams in the fixed order layout, weather, player:0 … player:(nSlots−1) (§State hash, word 5)', () => {
    const streams = createStreams(42, 3);
    expect(streams.ordered.map((s) => s.name)).toEqual([
      'layout',
      'weather',
      'player:0',
      'player:1',
      'player:2',
    ]);
  });

  it('seeds every stream exactly as seedStream does (§PRNG seeding)', () => {
    const streams = createStreams(12_345, 2);
    expect(streams.layout.state()).toEqual(seedStream(12_345, 'layout').state());
    expect(streams.weather.state()).toEqual(seedStream(12_345, 'weather').state());
    expect(streams.player(0).state()).toEqual(seedStream(12_345, 'player:0').state());
    expect(streams.player(1).state()).toEqual(seedStream(12_345, 'player:1').state());
  });

  it('keeps streams independent: drawing from layout does not move player:0 (§PRNG seeding: streams)', () => {
    const a = createStreams(7, 2);
    const b = createStreams(7, 2);
    for (let i = 0; i < 50; i += 1) a.layout.next();
    expect(a.player(0).state()).toEqual(b.player(0).state());
    expect(a.player(1).next()).toBe(b.player(1).next());
  });

  it('draws different sequences for different seeds (§PRNG seeding)', () => {
    expect(createStreams(1, 1).player(0).next()).not.toBe(createStreams(2, 1).player(0).next());
  });

  it('rejects an nSlots that is not a positive integer (§Tie-break: nSlots × MAX_DRONES)', () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(() => createStreams(1, bad)).toThrow(/SIM-BAD-SLOT-COUNT/);
    }
  });

  it('rejects a slot outside 0 … nSlots−1 (§PRNG seeding: player:<slot>)', () => {
    const streams = createStreams(1, 2);
    expect(() => streams.player(2)).toThrow(/SIM-BAD-SLOT:/);
    expect(() => streams.player(-1)).toThrow(/SIM-BAD-SLOT:/);
  });
});

describe('randomBelow', () => {
  it('returns next() % n (simulation-engine.md §PRNG seeding)', () => {
    const reference = seedStream(9, 'player:0');
    const rng = seedStream(9, 'player:0');
    for (let i = 0; i < 20; i += 1) {
      expect(randomBelow(rng, 6)).toBe(reference.next() % 6);
    }
  });

  it('returns 0 for n = 1 and still consumes one draw (§PRNG seeding: random(n), n ≥ 1)', () => {
    const reference = seedStream(9, 'player:0');
    const rng = seedStream(9, 'player:0');
    expect(randomBelow(rng, 1)).toBe(0);
    reference.next();
    expect(rng.state()).toEqual(reference.state());
  });

  it('stays below n over many draws (§PRNG seeding: random(n))', () => {
    const rng = seedStream(3, 'player:0');
    for (let i = 0; i < 500; i += 1) {
      const v = randomBelow(rng, 41);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(41);
    }
  });

  it('rejects n < 1 and non-integer n as invariant violations (§PRNG seeding: n ≥ 1)', () => {
    const rng = seedStream(3, 'player:0');
    expect(() => randomBelow(rng, 0)).toThrow(/SIM-BAD-RANDOM-BOUND/);
    expect(() => randomBelow(rng, -4)).toThrow(/SIM-BAD-RANDOM-BOUND/);
    expect(() => randomBelow(rng, 2.5)).toThrow(/SIM-BAD-RANDOM-BOUND/);
  });
});
