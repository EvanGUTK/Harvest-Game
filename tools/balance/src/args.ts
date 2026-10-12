/**
 * Command-line parsing for `balance`: how many seeds, which rule variants, text or JSON.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness (bots x seeds x rule tweaks).
 * Invariants: a bad command line is a value with the usage text, never an exception; the default variant always runs
 * first and cannot be redefined; variant names are unique.
 */

import { parseArgs } from 'node:util';
import { DEFAULT_VARIANT, parseVariant } from './overrides';
import type { Variant } from './overrides';

export const DEFAULT_SEED_COUNT = 10;
/** A cap that keeps one run from taking hours: each seed runs about twenty lobbies per variant. */
export const MAX_SEED_COUNT = 1_000;

export type BalanceOptions = {
  /** Seeds 0 to seedCount − 1. */
  seedCount: number;
  /** The default variant first, then each --variant in order. */
  variants: readonly Variant[];
  json: boolean;
};

export type ParsedArgs = { ok: true; options: BalanceOptions } | { ok: false; message: string };

export const USAGE = [
  `usage: balance [--seeds N] [--variant name:key=value,key=value]... [--json]`,
  `  --seeds N     seeds 0 to N-1 (default ${DEFAULT_SEED_COUNT}, at most ${MAX_SEED_COUNT})`,
  '  --variant     an extra rule variant, e.g. tight:market.priceFloorBp=3000,gridSize=6 (repeatable)',
  '  --json        print the report as JSON',
].join('\n');

const DIGITS = /^\d+$/;

function fail(message: string): ParsedArgs {
  return { ok: false, message: `${message}\n${USAGE}` };
}

function readSeedCount(text: string | undefined): number | null {
  if (text === undefined) return DEFAULT_SEED_COUNT;
  if (!DIGITS.test(text)) return null;
  const count = Number(text);
  return count >= 1 && count <= MAX_SEED_COUNT ? count : null;
}

function readVariants(texts: readonly string[]): Variant[] | string {
  const variants: Variant[] = [DEFAULT_VARIANT];
  for (const text of texts) {
    const parsed = parseVariant(text);
    if (!parsed.ok) return parsed.message;
    if (variants.some((v) => v.name === parsed.variant.name)) {
      return `variant name "${parsed.variant.name}" is used twice (the default variant is always run first)`;
    }
    variants.push(parsed.variant);
  }
  return variants;
}

/** Parses `argv` (without the node binary and the script path). */
export function parseBalanceArgs(argv: readonly string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        seeds: { type: 'string' },
        variant: { type: 'string', multiple: true },
        json: { type: 'boolean' },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'could not read the command line');
  }
  if (parsed.positionals.length > 0) return fail(`unexpected argument "${parsed.positionals[0] ?? ''}"`);
  const seedCount = readSeedCount(parsed.values.seeds);
  if (seedCount === null) return fail(`--seeds must be a whole number from 1 to ${MAX_SEED_COUNT}`);
  const variants = readVariants(parsed.values.variant ?? []);
  if (typeof variants === 'string') return fail(variants);
  return { ok: true, options: { seedCount, variants, json: parsed.values.json === true } };
}
