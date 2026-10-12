/**
 * Runs the scenario matrix: programs x seeds x one rule variant, each as a lobby on one runtime.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness (bots x seeds x rule tweaks).
 * Invariants: a program is compiled once per variant however many lobbies use it; lobbies are plain lists of
 * programs in slot order; a record keeps only what metrics and criteria need (scores by slot, sell lots, the slots
 * that did not compile, runtime errors); nothing here knows the engine beyond the injected runtime.
 */

import { MAX_SHOWDOWN_PLAYERS, SHOWDOWN_DEFAULTS } from '@harvest/content';
import type { CropId } from '@harvest/content';
import { compileProgram } from '@harvest/tool-run/compile';
import type { CompiledProgram } from '@harvest/tool-run/compile';
import { showdownConfig } from '@harvest/tool-run/config';
import type { Runtime } from '@harvest/tool-run/runtime';
import { applyToConfig } from './overrides';
import type { Variant } from './overrides';
import { cropFarmer, DUMP_WINDOW_CYCLES, PASS_PROGRAM, referencePrograms } from './strategies';
import type { Program } from './strategies';

/** The programs of one match in slot order. */
export type Lobby = { id: string; programs: readonly Program[] };

/** One `sell` call that sold something: who, which crop, how many, at what single lot price. */
export type SellLot = { slot: number; crop: CropId; n: number; price: number };

export type SlotError = { slot: number; code: string; line: number };

export type RunRecord = {
  lobbyId: string;
  seed: number;
  variant: string;
  /** Final score per slot. */
  scores: readonly number[];
  lots: readonly SellLot[];
  /** Slots whose program did not compile and played as the idle program. */
  failedCompiles: readonly number[];
  runtimeErrors: readonly SlotError[];
};

/** Every record of one variant, grouped by lobby id and ordered by seed. */
export type VariantData = {
  variant: string;
  seeds: readonly number[];
  records: ReadonlyMap<string, readonly RunRecord[]>;
};

export type ProgramCache = (program: Program, slot: number) => CompiledProgram;

const STEADY = { kind: 'steady' } as const;
const DUMP = { kind: 'dump', windowCycles: DUMP_WINDOW_CYCLES } as const;
const STEADY_FARMS: readonly Program[] = [
  cropFarmer('radish', STEADY),
  cropFarmer('corn', STEADY),
  cropFarmer('melon', STEADY),
];
const HOARD_GROUP_SIZE = MAX_SHOWDOWN_PLAYERS / 2;

export const soloId = (programId: string): string => `solo:${programId}`;
export const eightId = (programId: string): string => `eight:${programId}`;

function reference(id: string): Program {
  const found = referencePrograms().find((p) => p.id === id);
  if (found === undefined) throw new Error(`no reference program "${id}"`);
  return found;
}

function copies(program: Program, count: number): Program[] {
  return Array.from({ length: count }, () => program);
}

/** The starter in slot 0 against seven Agronomists: the starter criterion's 8-player lobby. */
export const STARTER_LOBBY: Lobby = {
  id: 'starter-lobby',
  programs: [reference('starter'), ...copies(reference('agronomist'), MAX_SHOWDOWN_PLAYERS - 1)],
};

/** Four steady and four hoard-and-dump radish farmers sharing one market. */
export const HOARD_LOBBY: Lobby = {
  id: 'hoard-lobby',
  programs: [
    ...copies(cropFarmer('radish', STEADY), HOARD_GROUP_SIZE),
    ...copies(cropFarmer('radish', DUMP), HOARD_GROUP_SIZE),
  ],
};

/** Compiles each distinct source once and hands out an input for any slot. */
export function createProgramCache(runtime: Runtime): ProgramCache {
  const compiled = new Map<string, CompiledProgram>();
  return (program, slot) => {
    let entry = compiled.get(program.source);
    if (entry === undefined) {
      entry = compileProgram(runtime, 0, [{ name: 'main.sprout', text: program.source }]);
      compiled.set(program.source, entry);
    }
    return { ...entry, input: { ...entry.input, slot } };
  };
}

/** Runs one lobby on one seed under one variant. */
export function runLobby(
  runtime: Runtime,
  cache: ProgramCache,
  lobby: Lobby,
  seed: number,
  variant: Variant,
): RunRecord {
  const programs = lobby.programs.map((program, slot) => cache(program, slot));
  const config = applyToConfig(
    showdownConfig({
      seed,
      gridSize: SHOWDOWN_DEFAULTS.gridSize,
      cycleBudget: SHOWDOWN_DEFAULTS.cycleBudget,
    }),
    variant.overrides,
  );
  const result = runtime.simulation.run(
    config,
    programs.map((p) => p.input),
  );
  const players = [...result.players].sort((a, b) => a.slot - b.slot);
  return {
    lobbyId: lobby.id,
    seed,
    variant: variant.name,
    scores: players.map((p) => p.score),
    lots: result.events.flatMap((e) =>
      e.k === 'sell' ? [{ slot: e.slot, crop: e.crop, n: e.n, price: e.price }] : [],
    ),
    failedCompiles: programs.flatMap((p, slot) => (p.compiled ? [] : [slot])),
    runtimeErrors: players.flatMap((p) => (p.error === undefined ? [] : [{ slot: p.slot, ...p.error }])),
  };
}

function lobbiesOf(): Lobby[] {
  const solo = [PASS_PROGRAM, ...referencePrograms(), ...STEADY_FARMS];
  const eight = solo.filter((p) => p.id !== PASS_PROGRAM.id);
  return [
    ...solo.map((p) => ({ id: soloId(p.id), programs: [p] })),
    ...eight.map((p) => ({ id: eightId(p.id), programs: copies(p, MAX_SHOWDOWN_PLAYERS) })),
    STARTER_LOBBY,
    HOARD_LOBBY,
  ];
}

/** Runs every lobby of the matrix on every seed under one variant. */
export function collectVariantData(
  runtime: Runtime,
  variant: Variant,
  seeds: readonly number[],
): VariantData {
  const cache = createProgramCache(runtime);
  const records = new Map<string, readonly RunRecord[]>();
  for (const lobby of lobbiesOf()) {
    records.set(
      lobby.id,
      seeds.map((seed) => runLobby(runtime, cache, lobby, seed, variant)),
    );
  }
  return { variant: variant.name, seeds, records };
}
