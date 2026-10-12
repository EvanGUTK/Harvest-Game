/**
 * Turns the programs named on the command line into source text: files from disk, bots from content.
 * Design: docs/02-language/language-spec.md §Files (a program is files, one named main.sprout).
 * Invariants: an unreadable file is a value, not an exception; each program is a single file named main.sprout
 * (showdown v1), labelled with what the user typed so messages can point back at it.
 */

import { BOTS } from '@harvest/content';
import type { SourceFiles } from '@harvest/lang';
import type { PlayerSpec } from './args';

const MAIN_FILE = 'main.sprout';

/** One program ready to compile, in the slot its position on the command line gives it. */
export type LoadedProgram = {
  slot: number;
  /** What the user typed: the path, or `bot:<id>`. */
  label: string;
  files: SourceFiles;
};

export type LoadResult = { ok: true; programs: readonly LoadedProgram[] } | { ok: false; message: string };

function single(text: string): SourceFiles {
  return [{ name: MAIN_FILE, text }];
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadOne(slot: number, spec: PlayerSpec, readFile: (path: string) => string): LoadedProgram | string {
  if (spec.kind === 'bot') {
    const bot = BOTS.find((b) => b.id === spec.id);
    return bot === undefined
      ? `unknown bot "${spec.id}"`
      : { slot, label: `bot:${spec.id}`, files: single(bot.source) };
  }
  try {
    return { slot, label: spec.path, files: single(readFile(spec.path)) };
  } catch (error) {
    return `cannot read ${spec.path}: ${reasonOf(error)}`;
  }
}

/** Loads every program in order; the first failure ends the load. */
export function loadPrograms(specs: readonly PlayerSpec[], readFile: (path: string) => string): LoadResult {
  const programs: LoadedProgram[] = [];
  for (const [slot, spec] of specs.entries()) {
    const loaded = loadOne(slot, spec, readFile);
    if (typeof loaded === 'string') return { ok: false, message: loaded };
    programs.push(loaded);
  }
  return { ok: true, programs };
}
