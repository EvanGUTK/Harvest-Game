/**
 * Command-line parsing for `sprout run`: the programs to run and the match settings.
 * Design: docs/07-roadmap/milestones.md M0 (`tools/run`), docs/03-architecture/simulation-engine.md §Public API.
 * Invariants: a bad command line is a value (`ok: false` plus a message with the usage text), never an exception;
 * every program, the main one included, is a file path or a `bot:<id>` taken from content's BOTS table.
 */

import { parseArgs } from 'node:util';
import { BOTS, MAX_SHOWDOWN_PLAYERS, SHOWDOWN_DEFAULTS } from '@harvest/content';

/** One program of the run: a bot from content, or a Sprout file on disk. */
export type PlayerSpec = { kind: 'bot'; id: string } | { kind: 'file'; path: string };

export type RunOptions = {
  /** Slot 0 is the main program, then the `--players` entries in order. */
  players: readonly PlayerSpec[];
  seed: number;
  gridSize: number;
  cycleBudget: number;
  json: boolean;
};

export type ParsedArgs = { ok: true; options: RunOptions } | { ok: false; message: string };

const BOT_PREFIX = 'bot:';
const MAX_SEED = 4_294_967_295;
const DIGITS = /^\d+$/;

const BOT_IDS: readonly string[] = BOTS.map((b) => b.id);

export const USAGE = [
  'usage: sprout run <program> [--players a,b,...] [--seed N] [--grid N] [--budget N] [--json]',
  `  <program> and every --players entry is a file path or bot:<id> (bot ids: ${BOT_IDS.join(', ')})`,
].join('\n');

function fail(message: string): ParsedArgs {
  return { ok: false, message: `${message}\n${USAGE}` };
}

function parseWholeNumber(text: string, min: number, max: number): number | null {
  if (!DIGITS.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
}

function parsePlayer(entry: string): PlayerSpec | string {
  if (entry === '') return 'an empty program name';
  if (!entry.startsWith(BOT_PREFIX)) return { kind: 'file', path: entry };
  const id = entry.slice(BOT_PREFIX.length);
  return BOT_IDS.includes(id)
    ? { kind: 'bot', id }
    : `unknown bot "${id}" (known bots: ${BOT_IDS.join(', ')})`;
}

function numberOption(text: string | undefined, fallback: number, min: number, max: number): number | null {
  return text === undefined ? fallback : parseWholeNumber(text, min, max);
}

/** Parses `argv` (without the node binary and the script path). */
export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        players: { type: 'string' },
        seed: { type: 'string' },
        grid: { type: 'string' },
        budget: { type: 'string' },
        json: { type: 'boolean' },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'could not read the command line');
  }
  const [command, ...programs] = parsed.positionals;
  if (command !== 'run') return fail('the first word must be "run"');
  if (programs.length !== 1) return fail('give exactly one program to run');
  const entries = [
    programs[0] ?? '',
    ...(parsed.values.players === undefined ? [] : parsed.values.players.split(',')),
  ];
  const players: PlayerSpec[] = [];
  for (const entry of entries) {
    const spec = parsePlayer(entry);
    if (typeof spec === 'string') return fail(spec);
    players.push(spec);
  }
  if (players.length > MAX_SHOWDOWN_PLAYERS)
    return fail(`a showdown has at most ${MAX_SHOWDOWN_PLAYERS} players`);
  const seed = numberOption(parsed.values.seed, 0, 0, MAX_SEED);
  const gridSize = numberOption(parsed.values.grid, SHOWDOWN_DEFAULTS.gridSize, 1, Number.MAX_SAFE_INTEGER);
  const cycleBudget = numberOption(
    parsed.values.budget,
    SHOWDOWN_DEFAULTS.cycleBudget,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (seed === null) return fail(`--seed must be a whole number from 0 to ${MAX_SEED}`);
  if (gridSize === null) return fail('--grid must be a positive whole number');
  if (cycleBudget === null) return fail('--budget must be a positive whole number');
  return { ok: true, options: { players, seed, gridSize, cycleBudget, json: parsed.values.json === true } };
}
