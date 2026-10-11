import { CROPS, type CropId } from '@harvest/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { advanceTile, advanceTileDetailed, type AdvanceRules } from './advance';
import type { Soil, Tile } from '../types';

const DECAY: AdvanceRules = { moistureDecay: true };
const NO_DECAY: AdvanceRules = { moistureDecay: false };
const DECAY_EVERY = 50;
const CROP_KINDS: readonly CropId[] = ['radish', 'corn', 'melon'];

function bare(moisture: number, lastUpdated = 0): Tile {
  return { soil: 'grass', moisture, lastUpdated, crop: null };
}

function growing(
  kind: CropId,
  moisture: number,
  lastUpdated: number,
  growth = 0,
  plantedAt = lastUpdated,
): Tile {
  return {
    soil: 'grass',
    moisture,
    lastUpdated,
    crop: { kind, plantedAt, growth, ripeAt: null, withered: false },
  };
}

/** The cycle-by-cycle definition from simulation-engine.md §Lazy world advancement, with no shortcuts. */
function slowAdvanceDetailed(tile: Tile, t: number, rules: AdvanceRules): { tile: Tile; dryPaused: boolean } {
  let dryPaused = false;
  let moisture = tile.moisture;
  const crop = tile.crop === null ? null : { ...tile.crop };
  for (let c = tile.lastUpdated + 1; c <= t; c += 1) {
    if (rules.moistureDecay && c % DECAY_EVERY === 0) moisture = Math.max(0, moisture - 1);
    if (crop !== null && crop.ripeAt === null && moisture < CROPS[crop.kind].minMoisture) dryPaused = true;
    if (crop !== null && !crop.withered && moisture >= CROPS[crop.kind].minMoisture) {
      crop.growth = Math.min(CROPS[crop.kind].growCycles, crop.growth + 1);
      if (crop.growth >= CROPS[crop.kind].growCycles && crop.ripeAt === null) crop.ripeAt = c;
    }
    if (crop?.ripeAt != null && c >= crop.ripeAt + CROPS[crop.kind].witherCycles) crop.withered = true;
  }
  return { tile: { soil: tile.soil, moisture, lastUpdated: t, crop }, dryPaused };
}

function slowAdvance(tile: Tile, t: number, rules: AdvanceRules): Tile {
  return slowAdvanceDetailed(tile, t, rules).tile;
}

describe('advanceTile', () => {
  it('is a no-op when t equals lastUpdated (simulation-engine.md §Lazy world advancement)', () => {
    const tile = growing('radish', 20, 120, 7);
    expect(advanceTile(tile, 120, DECAY)).toEqual(tile);
  });

  it('rejects a non-integer cycle with or without moisture decay (SIM-BAD-CYCLE), so a config flag cannot decide between throwing and corrupting state', () => {
    for (const rules of [DECAY, NO_DECAY]) {
      for (const bad of [10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => advanceTile(growing('radish', 6, 0, 1), bad, rules)).toThrow(/SIM-BAD-CYCLE/);
      }
    }
  });

  it('refuses to move time backwards', () => {
    expect(() => advanceTile(bare(10, 100), 99, DECAY)).toThrow(/SIM-TIME-BACKWARDS/);
  });

  it('does not mutate the tile it is given', () => {
    const tile = growing('radish', 20, 0);
    const copy = JSON.parse(JSON.stringify(tile)) as Tile;
    advanceTile(tile, 400, DECAY);
    expect(tile).toEqual(copy);
  });

  it('decrements moisture once per multiple of 50 in (last, t], never below 0', () => {
    expect(advanceTile(bare(10, 0), 49, DECAY).moisture).toBe(10);
    expect(advanceTile(bare(10, 0), 50, DECAY).moisture).toBe(9);
    expect(advanceTile(bare(10, 49), 50, DECAY).moisture).toBe(9);
    expect(advanceTile(bare(10, 50), 99, DECAY).moisture).toBe(10);
    expect(advanceTile(bare(10, 50), 100, DECAY).moisture).toBe(9);
    expect(advanceTile(bare(3, 0), 1_000, DECAY).moisture).toBe(0);
  });

  it('stamps lastUpdated with t and leaves soil alone', () => {
    const tile: Tile = { soil: 'tilled', moisture: 5, lastUpdated: 10, crop: null };
    expect(advanceTile(tile, 49, DECAY)).toEqual({
      soil: 'tilled',
      moisture: 5,
      lastUpdated: 49,
      crop: null,
    });
  });

  it('applies the moisture decrement at a multiple of 50 before that cycle counts for growth', () => {
    // Moisture 1 from cycle 0: cycles 1..49 grow (49), cycle 50 drops moisture to 0 first, so it does not grow.
    const advanced = advanceTile(growing('radish', 1, 0), 50, DECAY);
    expect(advanced.crop?.growth).toBe(49);
    expect(advanced.moisture).toBe(0);
  });

  it('counts plantedAt itself as zero growth: a crop planted at t has growth 0 until t + 1', () => {
    expect(advanceTile(growing('radish', 50, 100, 0, 100), 100, DECAY).crop?.growth).toBe(0);
    expect(advanceTile(growing('radish', 50, 100, 0, 100), 101, DECAY).crop?.growth).toBe(1);
  });

  it('stores ripeAt as the first cycle at which growth reached growCycles', () => {
    const before = advanceTile(growing('radish', 90, 100), 399, DECAY);
    expect(before.crop?.growth).toBe(299);
    expect(before.crop?.ripeAt).toBeNull();
    const ripe = advanceTile(growing('radish', 90, 100), 400, DECAY);
    expect(ripe.crop?.growth).toBe(CROPS.radish.growCycles);
    expect(ripe.crop?.ripeAt).toBe(400);
    expect(advanceTile(growing('radish', 90, 100), 2_000, DECAY).crop?.ripeAt).toBe(400);
  });

  it('keeps ripeAt from an earlier advance when time moves on', () => {
    const ripe = advanceTile(growing('radish', 90, 100), 500, DECAY);
    expect(advanceTile(ripe, 900, DECAY).crop?.ripeAt).toBe(400);
  });

  it('withers exactly at ripeAt + witherCycles: one cycle earlier it is still ripe (wither boundary)', () => {
    const ripeAt = 400;
    const wither = CROPS.radish.witherCycles;
    const tile = growing('radish', 100, 100);
    const stillRipe = advanceTile(tile, ripeAt + wither - 1, NO_DECAY);
    expect(stillRipe.crop?.ripeAt).toBe(ripeAt);
    expect(stillRipe.crop?.withered).toBe(false);
    expect(advanceTile(tile, ripeAt + wither, NO_DECAY).crop?.withered).toBe(true);
  });

  it('withers by world cycles even when the tile is dry (wither never pauses with moisture)', () => {
    const ripe = { ...advanceTile(growing('radish', 100, 0), 300, NO_DECAY), moisture: 0 };
    expect(ripe.crop?.ripeAt).toBe(300);
    expect(advanceTile(ripe, 300 + CROPS.radish.witherCycles, DECAY).crop?.withered).toBe(true);
  });

  it('does not grow a withered crop and keeps its growth at growCycles', () => {
    const withered = advanceTile(
      growing('corn', 100, 0),
      CROPS.corn.growCycles + CROPS.corn.witherCycles,
      NO_DECAY,
    );
    expect(withered.crop?.withered).toBe(true);
    expect(advanceTile(withered, withered.lastUpdated + 500, NO_DECAY).crop?.growth).toBe(
      CROPS.corn.growCycles,
    );
  });

  it('pauses growth below minMoisture and resumes when the tile is watered (growth is cumulative)', () => {
    const dry = advanceTile(growing('radish', 0, 0), 500, DECAY);
    expect(dry.crop?.growth).toBe(0);
    const watered = advanceTile({ ...dry, moisture: 100 }, 520, DECAY);
    expect(watered.crop?.growth).toBe(20);
  });

  it('needs moisture 30 for a melon (minMoisture 30, crops-and-economy.md §Crop roster)', () => {
    // Moisture 30 at cycle 0 keeps growing until the decrement at cycle 50 takes it to 29.
    expect(advanceTile(growing('melon', 30, 0), 49, DECAY).crop?.growth).toBe(49);
    expect(advanceTile(growing('melon', 30, 0), 50, DECAY).crop?.growth).toBe(49);
    expect(advanceTile(growing('melon', 30, 0), 500, DECAY).crop?.growth).toBe(49);
    expect(advanceTile(growing('melon', 29, 0), 100, DECAY).crop?.growth).toBe(0);
    expect(advanceTile(growing('melon', 31, 0), 100, DECAY).crop?.growth).toBe(99);
  });

  it('never decrements moisture with the no-decay switch, so a crop grows to ripe unwatered', () => {
    const advanced = advanceTile(growing('radish', 100, 0), 10_000, NO_DECAY);
    expect(advanced.moisture).toBe(100);
    expect(advanced.crop?.ripeAt).toBe(CROPS.radish.growCycles);
    expect(advanceTile(bare(7), 10_000, NO_DECAY).moisture).toBe(7);
  });

  describe('against the cycle-by-cycle reference', () => {
    const tiles = fc
      .record({
        kind: fc.constantFrom(...CROP_KINDS),
        moisture: fc.integer({ min: 0, max: 100 }),
        lastUpdated: fc.integer({ min: 0, max: 30_000 }),
        phase: fc.double({ min: 0, max: 1, noNaN: true }),
        ripeBefore: fc.boolean(),
        hasCrop: fc.boolean(),
        soil: fc.constantFrom<Soil[]>('grass', 'tilled', 'rock'),
      })
      .map(({ kind, moisture, lastUpdated, phase, ripeBefore, hasCrop, soil }): Tile => {
        if (!hasCrop) return { soil, moisture, lastUpdated, crop: null };
        const def = CROPS[kind];
        if (!ripeBefore) {
          const growth = Math.min(def.growCycles - 1, Math.floor(phase * def.growCycles));
          return {
            soil,
            moisture,
            lastUpdated,
            crop: { kind, plantedAt: 0, growth, ripeAt: null, withered: false },
          };
        }
        const ripeAt = Math.floor(phase * lastUpdated);
        const withered = lastUpdated >= ripeAt + def.witherCycles;
        return {
          soil,
          moisture,
          lastUpdated,
          crop: { kind, plantedAt: 0, growth: def.growCycles, ripeAt, withered },
        };
      });
    const deltas = fc.integer({ min: 0, max: 7_000 });
    const rulesArb = fc.constantFrom(DECAY, NO_DECAY);

    it('matches the O(1) formula for random (moisture, growth, last, t, crop)', () => {
      fc.assert(
        fc.property(tiles, deltas, rulesArb, (tile, delta, rules) => {
          const t = tile.lastUpdated + delta;
          expect(advanceTile(tile, t, rules)).toEqual(slowAdvance(tile, t, rules));
        }),
        { numRuns: 2_000 },
      );
    });

    it('reports a dry pause exactly like the cycle-by-cycle reference', () => {
      fc.assert(
        fc.property(tiles, deltas, rulesArb, (tile, delta, rules) => {
          const t = tile.lastUpdated + delta;
          expect(advanceTileDetailed(tile, t, rules)).toEqual(slowAdvanceDetailed(tile, t, rules));
        }),
        { numRuns: 2_000 },
      );
    });

    it('reports the same dry pause whether time is advanced in steps or at once (the flag is outcome-neutral)', () => {
      fc.assert(
        fc.property(
          tiles,
          fc.array(fc.integer({ min: 0, max: 1_500 }), { minLength: 1, maxLength: 8 }),
          rulesArb,
          (tile, steps, rules) => {
            let stepped = tile;
            let steppedPaused = false;
            let t = tile.lastUpdated;
            for (const step of steps) {
              t += step;
              const advanced = advanceTileDetailed(stepped, t, rules);
              stepped = advanced.tile;
              steppedPaused ||= advanced.dryPaused;
            }
            expect(steppedPaused).toBe(advanceTileDetailed(tile, t, rules).dryPaused);
          },
        ),
        { numRuns: 2_000 },
      );
    });

    it('is compositional: advancing in steps equals advancing at once (simulation-engine.md §Lazy world advancement)', () => {
      fc.assert(
        fc.property(
          tiles,
          fc.array(fc.integer({ min: 0, max: 1_500 }), { minLength: 1, maxLength: 8 }),
          rulesArb,
          (tile, steps, rules) => {
            let stepped = tile;
            let t = tile.lastUpdated;
            for (const step of steps) {
              t += step;
              stepped = advanceTile(stepped, t, rules);
            }
            expect(stepped).toEqual(advanceTile(tile, t, rules));
          },
        ),
        { numRuns: 2_000 },
      );
    });
  });
});

describe('advanceTileDetailed dry pause (everDryPaused, scoring Never Thirsty)', () => {
  it('counts a gap of exactly one cycle: moisture 1 at cycle 0 is dry at cycle 50', () => {
    expect(advanceTileDetailed(growing('radish', 1, 0), 49, DECAY).dryPaused).toBe(false);
    expect(advanceTileDetailed(growing('radish', 1, 0), 50, DECAY).dryPaused).toBe(true);
  });

  it('counts a dry tile from the first cycle after the previous touch', () => {
    expect(advanceTileDetailed(growing('radish', 0, 10), 10, DECAY).dryPaused).toBe(false);
    expect(advanceTileDetailed(growing('radish', 0, 10), 11, DECAY).dryPaused).toBe(true);
  });

  it('counts a melon below its 30 minimum as dry although the tile still holds moisture', () => {
    expect(advanceTileDetailed(growing('melon', 29, 0), 1, DECAY).dryPaused).toBe(true);
    expect(advanceTileDetailed(growing('melon', 31, 0), 99, DECAY).dryPaused).toBe(false);
    expect(advanceTileDetailed(growing('melon', 31, 0), 100, DECAY).dryPaused).toBe(true);
  });

  it('does not count a gap that starts only after ripeAt', () => {
    // Moisture 1: the radish grows for 49 cycles then pauses, so give it enough moisture to ripen first.
    const ripening = growing('radish', 10, 0);
    const advanced = advanceTileDetailed(ripening, 2_000, DECAY);
    expect(advanced.tile.crop?.ripeAt).toBe(CROPS.radish.growCycles);
    expect(advanced.tile.moisture).toBe(0);
    expect(advanced.dryPaused).toBe(false);
  });

  it('does not count a gap in a later advance once the crop is ripe', () => {
    const ripe = advanceTileDetailed(growing('radish', 100, 0), 400, DECAY).tile;
    expect(advanceTileDetailed({ ...ripe, moisture: 0 }, 3_000, DECAY).dryPaused).toBe(false);
  });

  it('does not count the dry cycle right after a crop ripens on its last moist cycle (ripeAt = stop − 1)', () => {
    // Moisture 6, growth 1 at cycle 0: the 299 remaining growing cycles run 1..299, so it ripens at 299, and cycle
    // 300 (the first dry one) comes after ripeAt.
    const ripeOnLastMoistCycle = advanceTileDetailed(growing('radish', 6, 0, 1), 300, DECAY);
    expect(ripeOnLastMoistCycle.tile.crop?.ripeAt).toBe(299);
    expect(ripeOnLastMoistCycle.dryPaused).toBe(false);
  });

  it('does not count a gap that starts 50 cycles after the crop ripened (moisture 7, ripe at 300, dry from 350)', () => {
    const ripened = advanceTileDetailed(growing('radish', 7, 0), 400, DECAY);
    expect(ripened.tile.crop?.ripeAt).toBe(300);
    expect(ripened.dryPaused).toBe(false);
  });

  it('counts the dry cycle when the crop is one growing cycle short of ripe (moisture 6, growth 0)', () => {
    // Moisture 6 is dry from cycle 300, the very cycle that would have ripened it: growth stops at 299.
    const short = advanceTileDetailed(growing('radish', 6, 0), 300, DECAY);
    expect(short.tile.crop?.growth).toBe(299);
    expect(short.dryPaused).toBe(true);
  });

  it('never reports a pause for an empty tile or with the no-decay switch on moist soil', () => {
    expect(advanceTileDetailed(bare(0), 500, DECAY).dryPaused).toBe(false);
    expect(advanceTileDetailed(growing('radish', 100, 0), 20_000, NO_DECAY).dryPaused).toBe(false);
  });

  it('counts a permanently dry tile under the no-decay switch', () => {
    expect(advanceTileDetailed(growing('radish', 0, 0), 1, NO_DECAY).dryPaused).toBe(true);
  });
});
