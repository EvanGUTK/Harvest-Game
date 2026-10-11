import { ACTION_COSTS, CROPS, WORLD } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRONE_STATS,
  harvest,
  move,
  plant,
  refill,
  till,
  water,
  type ActionContext,
} from './actions';
import type { Farm } from './farm';
import type { Tile } from '../types';

const SIZE = 3;
const CTX: ActionContext = {
  gridSize: SIZE,
  t: 1_000,
  rules: { moistureDecay: true },
  drone: DEFAULT_DRONE_STATS,
};
const AT = [1, 2] as const; // index 2 × 3 + 1 = 7
const AT_INDEX = 7;

function grass(moisture = 50, lastUpdated = 1_000): Tile {
  return { soil: 'grass', moisture, lastUpdated, crop: null };
}

function tileWith(soil: Tile['soil'], crop: Tile['crop'], moisture = 100, lastUpdated = 1_000): Tile {
  return { soil, moisture, lastUpdated, crop };
}

function farmWith(tile: Tile, overrides: Partial<Farm> = {}): Farm {
  const tiles = Array.from({ length: SIZE * SIZE }, (_, i) => (i === AT_INDEX ? tile : grass()));
  return {
    credits: 100,
    silo: { radish: 0, corn: 0, melon: 0 },
    water: 60,
    tiles,
    everDryPaused: false,
    ...overrides,
  };
}

function atTile(farm: Farm): Tile {
  const tile = farm.tiles[AT_INDEX];
  if (tile === undefined) throw new Error('missing tile');
  return tile;
}

const unripe = (kind: 'radish' | 'corn' | 'melon' = 'radish', growth = 10): Tile['crop'] => ({
  kind,
  plantedAt: 900,
  growth,
  ripeAt: null,
  withered: false,
});
const ripe = (kind: 'radish' | 'corn' | 'melon' = 'radish', ripeAt = 950): Tile['crop'] => ({
  kind,
  plantedAt: 500,
  growth: CROPS[kind].growCycles,
  ripeAt,
  withered: false,
});
const withered = (kind: 'radish' | 'corn' | 'melon' = 'radish'): Tile['crop'] => ({
  kind,
  plantedAt: 0,
  growth: CROPS[kind].growCycles,
  ripeAt: 300,
  withered: true,
});

describe('plant (standard-library.md §Outcome matrix)', () => {
  it('plants on empty grass: True, 30 cycles, seed cost deducted, growth 0 at plantedAt = t', () => {
    const out = plant(farmWith(grass()), AT, 'radish', CTX);
    expect(out).toMatchObject({ ok: true, cost: ACTION_COSTS.plant });
    expect(out.farm.credits).toBe(100 - CROPS.radish.seedCost);
    expect(atTile(out.farm).crop).toEqual({
      kind: 'radish',
      plantedAt: 1_000,
      growth: 0,
      ripeAt: null,
      withered: false,
    });
    expect(out.event).toEqual({ k: 'plant', at: AT, crop: 'radish', ok: true });
  });

  it('keeps the soil: a radish on tilled soil leaves it tilled', () => {
    const out = plant(farmWith(tileWith('tilled', null)), AT, 'radish', CTX);
    expect(out.ok).toBe(true);
    expect(atTile(out.farm).soil).toBe('tilled');
  });

  it('plants corn and melon on tilled soil', () => {
    expect(plant(farmWith(tileWith('tilled', null)), AT, 'corn', CTX).ok).toBe(true);
    expect(plant(farmWith(tileWith('tilled', null)), AT, 'melon', CTX).ok).toBe(true);
  });

  it('fails with cost 5 and no change on a tile holding an unripe crop', () => {
    const farm = farmWith(tileWith('grass', unripe()));
    const out = plant(farm, AT, 'radish', CTX);
    expect(out).toMatchObject({ ok: false, cost: ACTION_COSTS.plantFailed });
    expect(out.farm.credits).toBe(100);
    expect(atTile(out.farm).crop).toEqual(unripe());
    expect(out.event).toEqual({ k: 'plant', at: AT, crop: 'radish', ok: false });
  });

  it('fails on a ripe crop', () => {
    expect(plant(farmWith(tileWith('grass', ripe())), AT, 'radish', CTX).ok).toBe(false);
  });

  it('fails on rock', () => {
    const out = plant(farmWith(tileWith('rock', null)), AT, 'radish', CTX);
    expect(out).toMatchObject({ ok: false, cost: ACTION_COSTS.plantFailed });
  });

  it('fails for corn and melon on grass (they need tilled soil)', () => {
    expect(plant(farmWith(grass()), AT, 'corn', CTX).ok).toBe(false);
    expect(plant(farmWith(grass()), AT, 'melon', CTX).ok).toBe(false);
  });

  it('fails when credits are below the seed cost, and succeeds at exactly the seed cost', () => {
    const poor = farmWith(tileWith('tilled', null), { credits: CROPS.melon.seedCost - 1 });
    expect(plant(poor, AT, 'melon', CTX)).toMatchObject({ ok: false, cost: ACTION_COSTS.plantFailed });
    const exact = farmWith(tileWith('tilled', null), { credits: CROPS.melon.seedCost });
    const out = plant(exact, AT, 'melon', CTX);
    expect(out.ok).toBe(true);
    expect(out.farm.credits).toBe(0);
  });

  it('replaces a withered crop and charges the seed', () => {
    const out = plant(farmWith(tileWith('grass', withered())), AT, 'radish', CTX);
    expect(out).toMatchObject({ ok: true, cost: ACTION_COSTS.plant });
    expect(atTile(out.farm).crop).toEqual({
      kind: 'radish',
      plantedAt: 1_000,
      growth: 0,
      ripeAt: null,
      withered: false,
    });
  });

  it('checks the credits row before replacing a withered crop: broke means False and the wither stays', () => {
    const farm = farmWith(tileWith('grass', withered()), { credits: 0 });
    const out = plant(farm, AT, 'radish', CTX);
    expect(out.ok).toBe(false);
    expect(atTile(out.farm).crop?.withered).toBe(true);
  });

  it('catches a stored ripe crop up to t before checking it: past ripeAt + witherCycles it has withered and is replaced', () => {
    const storedRipe = tileWith('grass', ripe('radish', 400), 100, 400);
    const out = plant(farmWith(storedRipe), AT, 'radish', {
      ...CTX,
      t: 400 + CROPS.radish.witherCycles,
      rules: { moistureDecay: false },
    });
    expect(out).toMatchObject({ ok: true, cost: ACTION_COSTS.plant });
    expect(atTile(out.farm).crop).toMatchObject({
      kind: 'radish',
      plantedAt: 400 + CROPS.radish.witherCycles,
      ripeAt: null,
    });
  });

  it('stamps the planted tile with t and leaves its moisture decayed to t (empty grass, moisture 50 at cycle 0)', () => {
    const out = plant(farmWith(grass(50, 0)), AT, 'radish', CTX);
    expect(atTile(out.farm).lastUpdated).toBe(1_000);
    expect(atTile(out.farm).moisture).toBe(30);
  });

  it('advances the tile to t first, so a crop that ripened while the drone was away blocks the plant', () => {
    // Planted at 100 with plenty of moisture: ripe at 400 < t = 1_000 even though it is stored unripe.
    const stale = tileWith(
      'grass',
      { kind: 'radish', plantedAt: 100, growth: 0, ripeAt: null, withered: false },
      100,
      100,
    );
    expect(plant(farmWith(stale), AT, 'radish', CTX).ok).toBe(false);
  });
});

describe('harvest (standard-library.md §Outcome matrix)', () => {
  it('on an empty tile: False, cost 5, crop null in the event', () => {
    const out = harvest(farmWith(grass()), AT, CTX);
    expect(out).toMatchObject({ ok: false, cost: ACTION_COSTS.harvestEmpty });
    expect(out.event).toEqual({ k: 'harvest', at: AT, crop: null, ok: false });
  });

  it('a ripe crop: True, +1 to the silo, tile cleared, 30 cycles', () => {
    const out = harvest(farmWith(tileWith('grass', ripe('corn'))), AT, CTX);
    expect(out).toMatchObject({ ok: true, cost: ACTION_COSTS.harvest });
    expect(out.farm.silo).toEqual({ radish: 0, corn: 1, melon: 0 });
    expect(atTile(out.farm).crop).toBeNull();
    expect(out.event).toEqual({ k: 'harvest', at: AT, crop: 'corn', ok: true });
  });

  it('reverts tilled soil to grass after a successful harvest', () => {
    const out = harvest(farmWith(tileWith('tilled', ripe('corn'))), AT, CTX);
    expect(atTile(out.farm).soil).toBe('grass');
  });

  it('an unripe crop: False, cost 30, crop destroyed, nothing in the silo, tilled soil stays tilled', () => {
    const out = harvest(farmWith(tileWith('tilled', unripe('corn'))), AT, CTX);
    expect(out).toMatchObject({ ok: false, cost: ACTION_COSTS.harvest });
    expect(atTile(out.farm).crop).toBeNull();
    expect(atTile(out.farm).soil).toBe('tilled');
    expect(out.farm.silo).toEqual({ radish: 0, corn: 0, melon: 0 });
    expect(out.event).toEqual({ k: 'harvest', at: AT, crop: 'corn', ok: false });
  });

  it('a withered crop: False, cost 30, cleared, 0 yield, tilled soil reverts to grass', () => {
    const out = harvest(farmWith(tileWith('tilled', withered('corn'))), AT, CTX);
    expect(out).toMatchObject({ ok: false, cost: ACTION_COSTS.harvest });
    expect(atTile(out.farm).crop).toBeNull();
    expect(atTile(out.farm).soil).toBe('grass');
    expect(out.farm.silo).toEqual({ radish: 0, corn: 0, melon: 0 });
  });

  it('pays at ripeAt + witherCycles − 1 and yields 0 at ripeAt + witherCycles (wither boundary)', () => {
    const ripeAt = 400;
    const wither = CROPS.radish.witherCycles;
    const stale = tileWith(
      'grass',
      { kind: 'radish', plantedAt: 100, growth: 0, ripeAt: null, withered: false },
      100,
      100,
    );
    const early = harvest(farmWith(stale), AT, {
      ...CTX,
      t: ripeAt + wither - 1,
      rules: { moistureDecay: false },
    });
    expect(early.ok).toBe(true);
    const late = harvest(farmWith(stale), AT, {
      ...CTX,
      t: ripeAt + wither,
      rules: { moistureDecay: false },
    });
    expect(late.ok).toBe(false);
    expect(late.farm.silo.radish).toBe(0);
  });
});

describe('till (standard-library.md §Outcome matrix)', () => {
  it('turns bare grass into tilled soil: True, 30 cycles', () => {
    const out = till(farmWith(grass()), AT, CTX);
    expect(out).toMatchObject({ ok: true, cost: ACTION_COSTS.till });
    expect(atTile(out.farm).soil).toBe('tilled');
    expect(out.event).toEqual({ k: 'till', at: AT, ok: true });
  });

  it('fails with cost 5 on rock, on tilled soil and on a tile with a crop (even a withered one)', () => {
    for (const tile of [
      tileWith('rock', null),
      tileWith('tilled', null),
      tileWith('grass', unripe()),
      tileWith('grass', withered()),
    ]) {
      const out = till(farmWith(tile), AT, CTX);
      expect(out).toMatchObject({ ok: false, cost: ACTION_COSTS.tillFailed });
      expect(atTile(out.farm).soil).toBe(tile.soil);
    }
  });
});

describe('water (standard-library.md §Outcome matrix)', () => {
  it('adds 40 moisture and uses one water unit: True, 25 cycles', () => {
    const out = water(farmWith(grass(10)), AT, CTX);
    expect(out).toMatchObject({ ok: true, cost: ACTION_COSTS.water });
    expect(atTile(out.farm).moisture).toBe(50);
    expect(out.farm.water).toBe(59);
    expect(out.event).toEqual({ k: 'water', at: AT, ok: true });
  });

  it('applies the water to the moisture advanced to t, not the stored one', () => {
    // Stored moisture 10 at cycle 0; by cycle 1_000 it has dropped to 0 (20 decrements), so water gives 40.
    const out = water(farmWith(grass(10, 0)), AT, CTX);
    expect(atTile(out.farm).moisture).toBe(WORLD.waterAmount);
  });

  it('caps moisture at 100 and still costs a unit at 100', () => {
    expect(atTile(water(farmWith(grass(80)), AT, CTX).farm).moisture).toBe(100);
    const full = water(farmWith(grass(100)), AT, CTX);
    expect(full.ok).toBe(true);
    expect(full.farm.water).toBe(59);
  });

  it('works on rock, on tilled soil and on a crop tile', () => {
    for (const tile of [
      tileWith('rock', null, 0),
      tileWith('tilled', null, 0),
      tileWith('grass', unripe(), 0),
    ]) {
      expect(water(farmWith(tile), AT, CTX).ok).toBe(true);
    }
  });

  it('uses the drone Sprayer amount when upgraded', () => {
    const out = water(farmWith(grass(10)), AT, {
      ...CTX,
      drone: { ...DEFAULT_DRONE_STATS, waterAmount: 60 },
    });
    expect(atTile(out.farm).moisture).toBe(70);
  });

  it('fails with cost 5 and changes nothing when the tank is empty', () => {
    const out = water(farmWith(grass(10), { water: 0 }), AT, CTX);
    expect(out).toMatchObject({ ok: false, cost: ACTION_COSTS.waterFailed });
    expect(atTile(out.farm).moisture).toBe(10);
    expect(out.farm.water).toBe(0);
  });
});

describe('refill (standard-library.md §Outcome matrix)', () => {
  it('on the well tile restores the tank to capacity: True, 60 cycles, even if already full', () => {
    const [wx, wy] = WORLD.wellTile;
    const low = refill(farmWith(grass(), { water: 3 }), [wx, wy]);
    expect(low).toMatchObject({ ok: true, cost: ACTION_COSTS.refill });
    expect(low.farm.water).toBe(WORLD.waterCapacity);
    expect(low.event).toEqual({ k: 'refill', at: [wx, wy], ok: true });
    const full = refill(farmWith(grass(), { water: WORLD.waterCapacity }), [wx, wy]);
    expect(full).toMatchObject({ ok: true, cost: ACTION_COSTS.refill });
  });

  it('fails on the tiles beside the well, on its row and on its column', () => {
    for (const pos of [
      [1, 0],
      [0, 1],
      [2, 2],
    ] as const) {
      expect(refill(farmWith(grass(), { water: 3 }), pos)).toMatchObject({
        ok: false,
        cost: ACTION_COSTS.refillFailed,
      });
    }
  });

  it('anywhere else fails with cost 5 and leaves the tank alone', () => {
    const out = refill(farmWith(grass(), { water: 3 }), AT);
    expect(out).toMatchObject({ ok: false, cost: ACTION_COSTS.refillFailed });
    expect(out.farm.water).toBe(3);
  });
});

describe('move (farm-simulation.md §Grid: edges wrap)', () => {
  it('moves one tile: north is +y, east is +x', () => {
    expect(move([1, 1], 'north', CTX).to).toEqual([1, 2]);
    expect(move([1, 1], 'south', CTX).to).toEqual([1, 0]);
    expect(move([1, 1], 'east', CTX).to).toEqual([2, 1]);
    expect(move([1, 1], 'west', CTX).to).toEqual([0, 1]);
  });

  it('wraps at every edge', () => {
    expect(move([2, 0], 'east', CTX).to).toEqual([0, 0]);
    expect(move([0, 0], 'west', CTX).to).toEqual([2, 0]);
    expect(move([0, 2], 'north', CTX).to).toEqual([0, 0]);
    expect(move([0, 0], 'south', CTX).to).toEqual([0, 2]);
  });

  it('always succeeds at the drone move cost and describes the move event', () => {
    const out = move([0, 0], 'east', CTX);
    expect(out.cost).toBe(ACTION_COSTS.move);
    expect(out.event).toEqual({ k: 'move', to: [1, 0] });
    expect(move([0, 0], 'east', { ...CTX, drone: { ...DEFAULT_DRONE_STATS, moveCost: 9 } }).cost).toBe(9);
  });
});

describe('actions are pure', () => {
  it('never mutate the farm they are given', () => {
    const farm = farmWith(tileWith('tilled', ripe('corn')));
    const snapshot = JSON.parse(JSON.stringify(farm)) as Farm;
    harvest(farm, AT, CTX);
    plant(farm, AT, 'corn', CTX);
    till(farm, AT, CTX);
    water(farm, AT, CTX);
    expect(farm).toEqual(snapshot);
  });

  it('raise everDryPaused when the touched tile paused dry on an unripe crop', () => {
    const dry = farmWith(
      tileWith('grass', { kind: 'radish', plantedAt: 0, growth: 0, ripeAt: null, withered: false }, 0, 0),
    );
    expect(till(dry, AT, CTX).farm.everDryPaused).toBe(true);
  });
});
