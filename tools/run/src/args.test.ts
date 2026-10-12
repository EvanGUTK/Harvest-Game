import { BOTS, MAX_SHOWDOWN_PLAYERS, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { parseCliArgs, USAGE } from './args';

const file = (path: string) => ({ kind: 'file', path }) as const;
const bot = (id: string) => ({ kind: 'bot', id }) as const;

describe('parseCliArgs', () => {
  it('reads the main program as slot 0 and applies the showdown defaults', () => {
    expect(parseCliArgs(['run', 'farm.sprout'])).toEqual({
      ok: true,
      options: {
        players: [file('farm.sprout')],
        seed: 0,
        gridSize: SHOWDOWN_DEFAULTS.gridSize,
        cycleBudget: SHOWDOWN_DEFAULTS.cycleBudget,
        json: false,
      },
    });
  });

  it('reads --seed, --grid, --budget and --json', () => {
    const parsed = parseCliArgs([
      'run',
      'a.sprout',
      '--seed',
      '42',
      '--grid',
      '10',
      '--budget',
      '5000',
      '--json',
    ]);
    expect(parsed).toMatchObject({
      ok: true,
      options: { seed: 42, gridSize: 10, cycleBudget: 5_000, json: true },
    });
  });

  it('puts the --players entries in slots 1 and up, in order', () => {
    const parsed = parseCliArgs(['run', 'a.sprout', '--players', 'b.sprout,c.sprout']);
    expect(parsed).toMatchObject({
      ok: true,
      options: { players: [file('a.sprout'), file('b.sprout'), file('c.sprout')] },
    });
  });

  it('resolves a bot:<id> entry from the BOTS table, for the main program and for --players', () => {
    const parsed = parseCliArgs([
      'run',
      'bot:seedling',
      '--players',
      'bot:grower,mine.sprout,bot:agronomist',
    ]);
    expect(parsed).toMatchObject({
      ok: true,
      options: { players: [bot('seedling'), bot('grower'), file('mine.sprout'), bot('agronomist')] },
    });
  });

  it('accepts every bot id in BOTS', () => {
    for (const b of BOTS) expect(parseCliArgs(['run', `bot:${b.id}`]), b.id).toMatchObject({ ok: true });
  });

  it('rejects an unknown bot id and names the known ones', () => {
    const parsed = parseCliArgs(['run', 'a.sprout', '--players', 'bot:scarecrow']);
    expect(parsed.ok).toBe(false);
    const message = parsed.ok ? '' : parsed.message;
    expect(message).toContain('scarecrow');
    for (const b of BOTS) expect(message).toContain(b.id);
  });

  it('treats any other entry as a path, even one that looks like a bot name', () => {
    expect(parseCliArgs(['run', 'grower'])).toMatchObject({
      ok: true,
      options: { players: [file('grower')] },
    });
  });

  it('accepts the largest uint32 seed and rejects one above it', () => {
    expect(parseCliArgs(['run', 'a.sprout', '--seed', '4294967295'])).toMatchObject({
      ok: true,
      options: { seed: 4_294_967_295 },
    });
    expect(parseCliArgs(['run', 'a.sprout', '--seed', '4294967296'])).toMatchObject({ ok: false });
  });

  it('rejects a seed that is negative, fractional or not a number', () => {
    for (const bad of ['-1', '1.5', 'abc', '']) {
      expect(parseCliArgs(['run', 'a.sprout', '--seed', bad]), bad).toMatchObject({ ok: false });
    }
  });

  it('rejects a grid or budget that is not a positive whole number', () => {
    for (const flag of ['--grid', '--budget']) {
      for (const bad of ['0', '-3', '2.5', 'x']) {
        expect(parseCliArgs(['run', 'a.sprout', flag, bad]), `${flag} ${bad}`).toMatchObject({ ok: false });
      }
    }
  });

  it('needs the run command', () => {
    expect(parseCliArgs([])).toMatchObject({ ok: false });
    expect(parseCliArgs(['simulate', 'a.sprout'])).toMatchObject({ ok: false });
  });

  it('needs exactly one main program', () => {
    expect(parseCliArgs(['run'])).toMatchObject({ ok: false });
    expect(parseCliArgs(['run', 'a.sprout', 'b.sprout'])).toMatchObject({ ok: false });
  });

  it('rejects an unknown flag with a message that names it', () => {
    const parsed = parseCliArgs(['run', 'a.sprout', '--turbo']);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.message).toContain('--turbo');
  });

  it('rejects an empty entry in --players', () => {
    expect(parseCliArgs(['run', 'a.sprout', '--players', 'b.sprout,,c.sprout'])).toMatchObject({ ok: false });
    expect(parseCliArgs(['run', 'a.sprout', '--players', ''])).toMatchObject({ ok: false });
  });

  it('allows at most the showdown maximum of players in all', () => {
    const others = (n: number) => Array.from({ length: n }, (_, i) => `p${i}.sprout`).join(',');
    expect(parseCliArgs(['run', 'a.sprout', '--players', others(MAX_SHOWDOWN_PLAYERS - 1)])).toMatchObject({
      ok: true,
    });
    expect(parseCliArgs(['run', 'a.sprout', '--players', others(MAX_SHOWDOWN_PLAYERS)])).toMatchObject({
      ok: false,
    });
  });

  it('puts the usage text, with the bot ids, in every error message', () => {
    const parsed = parseCliArgs([]);
    expect(parsed.ok ? '' : parsed.message).toContain(USAGE);
    for (const b of BOTS) expect(USAGE).toContain(b.id);
  });
});
