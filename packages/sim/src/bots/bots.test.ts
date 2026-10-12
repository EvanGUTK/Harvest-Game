import { BOTS, SHOWDOWN_DEFAULTS, STARTER_PROGRAM } from '@harvest/content';
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

describe('STARTER_PROGRAM (standard-library.md §Example: a complete starter showdown program)', () => {
  it('tokenizes without diagnostics', () => {
    const lexed = tokenize({ name: 'main.sprout', text: STARTER_PROGRAM }, DEFAULT_LIMITS);
    expect(lexed.diagnostics).toEqual([]);
    expect(lexed.tokens.some((t) => t.kind === 'ERROR')).toBe(false);
  });

  it('parses without diagnostics', () => {
    expect(parse(filesOf(STARTER_PROGRAM), DEFAULT_LIMITS).diagnostics).toEqual([]);
  });

  it('fits the source size limit of one showdown file', () => {
    expect(utf8Length(STARTER_PROGRAM)).toBeLessThanOrEqual(DEFAULT_LIMITS.maxSourceBytes);
  });

  it('farms the 2 bottom rows of radishes, then refills and sells (the lines the doc describes)', () => {
    expect(STARTER_PROGRAM).toContain('for y in range(2):');
    expect(STARTER_PROGRAM).toContain('plant(RADISH)');
    expect(STARTER_PROGRAM).toContain('refill()');
    expect(STARTER_PROGRAM).toContain('sell(RADISH, inventory(RADISH))');
  });

  it('uses nothing a showdown does not allow: no spawn, no random', () => {
    expect(STARTER_PROGRAM).not.toMatch(/\bspawn\s*\(/);
    expect(STARTER_PROGRAM).not.toMatch(/\brandom\s*\(/);
  });
});
