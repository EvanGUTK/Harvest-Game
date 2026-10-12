import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED_COUNT, MAX_SEED_COUNT, parseBalanceArgs, USAGE } from './args';
import { DEFAULT_VARIANT } from './overrides';

describe('parseBalanceArgs', () => {
  it('defaults to 10 seeds, the default variant alone and text output', () => {
    expect(DEFAULT_SEED_COUNT).toBe(10);
    expect(parseBalanceArgs([])).toEqual({
      ok: true,
      options: { seedCount: 10, variants: [DEFAULT_VARIANT], json: false },
    });
  });

  it('reads --seeds and --json', () => {
    expect(parseBalanceArgs(['--seeds', '3', '--json'])).toMatchObject({
      ok: true,
      options: { seedCount: 3, json: true },
    });
  });

  it('adds each --variant after the default one, in order', () => {
    const parsed = parseBalanceArgs([
      '--variant',
      'tight:market.priceFloorBp=3000',
      '--variant',
      'small:gridSize=6',
    ]);
    expect(parsed.ok && parsed.options.variants.map((v) => v.name)).toEqual(['default', 'tight', 'small']);
    expect(parsed.ok && parsed.options.variants[1]?.overrides).toEqual({ market: { priceFloorBp: 3_000 } });
  });

  it('rejects a seed count that is zero, fractional, negative or above the maximum', () => {
    for (const bad of ['0', '-1', '2.5', 'x', String(MAX_SEED_COUNT + 1)]) {
      expect(parseBalanceArgs(['--seeds', bad]), bad).toMatchObject({ ok: false });
    }
    expect(parseBalanceArgs(['--seeds', String(MAX_SEED_COUNT)])).toMatchObject({ ok: true });
  });

  it('rejects a bad variant with the parser’s message', () => {
    const parsed = parseBalanceArgs(['--variant', 'x:turbo=1']);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.message).toContain('turbo');
  });

  it('rejects two variants with the same name, and a variant named default', () => {
    expect(parseBalanceArgs(['--variant', 'a:gridSize=6', '--variant', 'a:gridSize=7'])).toMatchObject({
      ok: false,
    });
    expect(parseBalanceArgs(['--variant', 'default:gridSize=6'])).toMatchObject({ ok: false });
  });

  it('rejects an unknown flag, naming it', () => {
    const parsed = parseBalanceArgs(['--turbo']);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.message).toContain('--turbo');
  });

  it('rejects stray words', () => {
    expect(parseBalanceArgs(['run'])).toMatchObject({ ok: false });
  });

  it('puts the usage text in every error message', () => {
    const parsed = parseBalanceArgs(['--seeds', '0']);
    expect(parsed.ok ? '' : parsed.message).toContain(USAGE);
  });
});
