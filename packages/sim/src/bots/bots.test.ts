import { BOTS, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { DEFAULT_LIMITS, countTokens, parse, tokenize, utf8Length } from '@harvest/lang';
import type { SourceFiles } from '@harvest/lang';
import { describe, expect, it } from 'vitest';

function filesOf(source: string): SourceFiles {
  return [{ name: 'main.sprout', text: source }];
}

describe('BOTS (multiplayer-modes.md §Bots)', () => {
  it('lists Seedling, Grower and Agronomist in difficulty order', () => {
    expect(BOTS.map((b) => b.id)).toEqual(['seedling', 'grower', 'agronomist']);
    expect(BOTS.map((b) => b.title)).toEqual(['Seedling', 'Grower', 'Agronomist']);
  });

  for (const bot of BOTS) {
    describe(bot.title, () => {
      it('tokenizes without diagnostics', () => {
        const lexed = tokenize({ name: 'main.sprout', text: bot.source }, DEFAULT_LIMITS);
        expect(lexed.diagnostics).toEqual([]);
        expect(lexed.tokens.some((t) => t.kind === 'ERROR')).toBe(false);
      });

      it('parses without diagnostics (language-spec.md §Grammar)', () => {
        expect(parse(filesOf(bot.source), DEFAULT_LIMITS).diagnostics).toEqual([]);
      });

      it('fits the source size limit of one showdown file', () => {
        expect(utf8Length(bot.source)).toBeLessThanOrEqual(DEFAULT_LIMITS.maxSourceBytes);
      });

      it('opens with a header comment that states its strategy', () => {
        expect(bot.source.startsWith('# ')).toBe(true);
        expect(bot.source.split('\n').slice(0, 6).join('\n')).toMatch(/Strategy/);
        expect(bot.strategy.length).toBeGreaterThan(0);
      });

      it('uses nothing a showdown does not allow: no spawn (D-24), no random (ranked, D-18)', () => {
        expect(bot.source).not.toMatch(/\bspawn\s*\(/);
        expect(bot.source).not.toMatch(/\brandom\s*\(/);
        expect(SHOWDOWN_DEFAULTS.spawnEnabled).toBe(false);
      });

      it('counts a positive number of tokens, the figure the tiebreakers use', () => {
        expect(countTokens(filesOf(bot.source))).toBeGreaterThan(0);
      });
    });
  }

  it('gets longer with difficulty: Seedling < Grower < Agronomist by token count', () => {
    const counts = BOTS.map((b) => countTokens(filesOf(b.source)));
    expect(counts[0]).toBeLessThan(counts[1] ?? 0);
    expect(counts[1]).toBeLessThan(counts[2] ?? 0);
  });
});
