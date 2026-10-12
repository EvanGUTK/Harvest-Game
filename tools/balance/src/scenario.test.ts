import { MAX_SHOWDOWN_PLAYERS, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { applyToConfig } from './overrides';
import {
  collectVariantData,
  createProgramCache,
  HOARD_LOBBY,
  runLobby,
  STARTER_LOBBY,
  soloId,
  eightId,
} from './scenario';
import type { Lobby } from './scenario';
import { PASS_PROGRAM, cropFarmer, referencePrograms } from './strategies';
import type { Program } from './strategies';
import { BROKEN_MARKER, fakeRuntime } from './testing';

/** `count` copies of `value`. */
function repeat(count: number, value: string): string[] {
  return Array.from({ length: count }, () => value);
}

const programOf = (id: string, source: string): Program => ({ id, title: id, source });
const A = programOf('a', 'move(EAST)\n');
const B = programOf('b', 'halt()\n');
const VARIANT = { name: 'default', overrides: {} };

describe('createProgramCache', () => {
  it('compiles each program once however many slots and runs use it, and gives each slot its own input', () => {
    const fake = fakeRuntime();
    const cache = createProgramCache(fake.runtime);
    const first = cache(A, 0);
    const second = cache(A, 3);
    expect(fake.compiles).toHaveLength(1);
    expect(first.input.slot).toBe(0);
    expect(second.input.slot).toBe(3);
    expect(second.input.module).toBe(first.input.module);
  });

  it('compiles different sources separately', () => {
    const fake = fakeRuntime();
    const cache = createProgramCache(fake.runtime);
    cache(A, 0);
    cache(B, 1);
    expect(fake.compiles).toHaveLength(2);
  });

  it('reports a program that does not compile as the idle program for any slot', () => {
    const fake = fakeRuntime();
    const cache = createProgramCache(fake.runtime);
    const broken = cache(programOf('x', BROKEN_MARKER), 2);
    expect(broken.compiled).toBe(false);
    expect(broken.input).toEqual({
      slot: 2,
      module: null,
      compileError: { code: 'E-MISSING-COLON', line: 2 },
    });
  });
});

describe('runLobby', () => {
  const lobby: Lobby = { id: 'pair', programs: [A, B] };

  it('runs one match with the showdown config for the seed, one player per program in slot order', () => {
    const fake = fakeRuntime();
    runLobby(fake.runtime, createProgramCache(fake.runtime), lobby, 5, VARIANT);
    expect(fake.runs).toHaveLength(1);
    expect(fake.runs[0]?.config).toMatchObject({
      seed: 5,
      gridSize: SHOWDOWN_DEFAULTS.gridSize,
      cycleBudget: SHOWDOWN_DEFAULTS.cycleBudget,
    });
    expect(fake.runs[0]?.players.map((p) => p.slot)).toEqual([0, 1]);
  });

  it('applies the variant’s overrides to the config', () => {
    const fake = fakeRuntime();
    const variant = { name: 'small', overrides: { gridSize: 6, cycleBudget: 9_000 } };
    runLobby(fake.runtime, createProgramCache(fake.runtime), lobby, 1, variant);
    expect(fake.runs[0]?.config).toMatchObject({ gridSize: 6, cycleBudget: 9_000 });
    expect(fake.runs[0]?.config).toEqual(
      applyToConfig(fake.runs[0]?.config ?? ({} as never), variant.overrides),
    );
  });

  it('records the scores by slot, with the lobby, seed and variant', () => {
    const fake = fakeRuntime();
    const record = runLobby(fake.runtime, createProgramCache(fake.runtime), lobby, 5, VARIANT);
    expect(record).toMatchObject({ lobbyId: 'pair', seed: 5, variant: 'default' });
    expect(record.scores).toEqual([100 + A.source.length + 5, 100 + B.source.length + 5]);
  });

  it('turns the sell events into sell lots and ignores every other event', () => {
    const fake = fakeRuntime();
    const record = runLobby(fake.runtime, createProgramCache(fake.runtime), lobby, 0, VARIANT);
    expect(record.lots).toEqual([
      { slot: 0, crop: 'radish', n: 1, price: 4 },
      { slot: 1, crop: 'radish', n: 2, price: 4 },
    ]);
  });

  it('lists the slots that played as the idle program because they did not compile', () => {
    const fake = fakeRuntime();
    const bad = programOf('bad', BROKEN_MARKER);
    const record = runLobby(
      fake.runtime,
      createProgramCache(fake.runtime),
      { id: 'x', programs: [A, bad] },
      0,
      VARIANT,
    );
    expect(record.failedCompiles).toEqual([1]);
    expect(record.scores[1]).toBe(0);
  });

  it('lists a runtime error with its slot, code and line', () => {
    const fake = fakeRuntime();
    const original = fake.runtime.simulation.run.bind(fake.runtime.simulation);
    fake.runtime.simulation.run = (config, players) => {
      const result = original(config, players);
      return {
        ...result,
        players: result.players.map((p) =>
          p.slot === 1 ? { ...p, error: { code: 'R-INDEX', line: 7 } } : p,
        ),
      };
    };
    const record = runLobby(fake.runtime, createProgramCache(fake.runtime), lobby, 0, VARIANT);
    expect(record.runtimeErrors).toEqual([{ slot: 1, code: 'R-INDEX', line: 7 }]);
  });
});

describe('lobby layouts the criteria rely on', () => {
  it('puts the starter in slot 0 against seven Agronomists', () => {
    expect(STARTER_LOBBY.programs.map((p) => p.id)).toEqual(['starter', ...repeat(7, 'agronomist')]);
    expect(STARTER_LOBBY.programs).toHaveLength(MAX_SHOWDOWN_PLAYERS);
  });

  it('puts four steady radish farmers in slots 0 to 3 and four hoard-and-dump radish farmers in slots 4 to 7', () => {
    const ids = HOARD_LOBBY.programs.map((p) => p.id);
    expect(ids.slice(0, 4)).toEqual(repeat(4, 'radish-steady'));
    expect(ids.slice(4)).toEqual(repeat(4, 'radish-dump-5000'));
  });
});

describe('collectVariantData', () => {
  const seeds = [0, 1, 2];

  it('runs every lobby once per seed: solo and eight-copy lobbies, the starter lobby and the hoard lobby', () => {
    const fake = fakeRuntime();
    const data = collectVariantData(fake.runtime, VARIANT, seeds);
    const programs = [
      PASS_PROGRAM,
      ...referencePrograms(),
      cropFarmer('radish', { kind: 'steady' }),
      cropFarmer('corn', { kind: 'steady' }),
      cropFarmer('melon', { kind: 'steady' }),
    ];
    const eightPrograms = programs.filter((p) => p.id !== 'pass');
    const lobbies = programs.length + eightPrograms.length + 2;
    expect(fake.runs).toHaveLength(lobbies * seeds.length);
    expect(data.variant).toBe('default');
    expect(data.seeds).toEqual(seeds);
  });

  it('keeps one record per seed, in seed order, under each lobby id', () => {
    const fake = fakeRuntime();
    const data = collectVariantData(fake.runtime, VARIANT, seeds);
    for (const id of [
      soloId('starter'),
      soloId('pass'),
      eightId('grower'),
      STARTER_LOBBY.id,
      HOARD_LOBBY.id,
    ]) {
      expect(
        data.records.get(id)?.map((r) => r.seed),
        id,
      ).toEqual(seeds);
    }
  });

  it('runs the solo lobbies with one player and the eight-copy lobbies with eight', () => {
    const fake = fakeRuntime();
    const data = collectVariantData(fake.runtime, VARIANT, [0]);
    expect(data.records.get(soloId('grower'))?.[0]?.scores).toHaveLength(1);
    expect(data.records.get(eightId('grower'))?.[0]?.scores).toHaveLength(8);
  });

  it('compiles every distinct program once for the whole variant', () => {
    const fake = fakeRuntime();
    collectVariantData(fake.runtime, VARIANT, seeds);
    const distinct = new Set(fake.compiles.map((files) => files.map((f) => f.text).join('\n')));
    expect(fake.compiles).toHaveLength(distinct.size);
  });
});
