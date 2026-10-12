/**
 * `sprout run`: loads the programs, compiles each, runs one showdown and prints the outcome.
 * Design: docs/07-roadmap/milestones.md M0 (`tools/run`), docs/03-architecture/simulation-engine.md §Public API.
 * Invariants: all effects go through `Io` and the injected runtime loader, so the whole flow is testable with
 * fakes; a program that fails to compile still plays as the idle program (as on the server); the exit code is
 * 0 for a clean run, 1 when any player had a compile or runtime error, 2 for a usage or file error, 70 when the
 * engine is not wired.
 */

import { RULES_VERSION, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { DEFAULT_LIMITS, LANGUAGE_VERSION } from '@harvest/lang';
import type { CompileResult, Diagnostic } from '@harvest/lang';
import type { PlayerInput, SimConfig, SimResult } from '@harvest/sim';
import { parseCliArgs } from './args';
import type { RunOptions } from './args';
import {
  formatDiagnostics,
  formatFooter,
  formatOutput,
  formatResultsTable,
  formatRuntimeErrors,
} from './format';
import type { Participant } from './format';
import type { Runtime, RuntimeResult } from './runtime';
import { loadPrograms } from './sources';
import type { LoadedProgram } from './sources';

export type Io = {
  readFile(path: string): string;
  stdout(text: string): void;
  stderr(text: string): void;
};

export const EXIT_OK = 0;
export const EXIT_PLAYER_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_ENGINE_NOT_WIRED = 70;

type Compiled = { input: PlayerInput; participant: Participant; diagnostics: readonly Diagnostic[] };

function compileOne(runtime: Runtime, program: LoadedProgram): Compiled {
  const result: CompileResult = runtime.engine.compile(program.files, {
    languageVersion: LANGUAGE_VERSION,
    hostSignatures: runtime.hostSignatures,
    constants: runtime.constants,
    lockedFeatures: new Set(),
    lockedNames: new Set(),
    limits: DEFAULT_LIMITS,
  });
  const participant = { slot: program.slot, file: program.label, compiled: result.ok };
  if (result.ok) {
    return {
      input: { slot: program.slot, module: result.module },
      participant,
      diagnostics: result.warnings,
    };
  }
  const first = result.diagnostics[0];
  const input: PlayerInput =
    first === undefined
      ? { slot: program.slot, module: null }
      : { slot: program.slot, module: null, compileError: { code: first.code, line: first.range.line } };
  return { input, participant, diagnostics: result.diagnostics };
}

function configOf(options: RunOptions): SimConfig {
  return {
    rulesVersion: RULES_VERSION,
    languageVersion: LANGUAGE_VERSION,
    seed: options.seed,
    gridSize: options.gridSize,
    cycleBudget: options.cycleBudget,
    startCredits: SHOWDOWN_DEFAULTS.startCredits,
    startWater: SHOWDOWN_DEFAULTS.startWater,
    startMoisture: SHOWDOWN_DEFAULTS.startMoisture,
    moistureDecay: true,
    sharedMarket: true,
    randomEnabled: SHOWDOWN_DEFAULTS.randomEnabled,
    spawnEnabled: SHOWDOWN_DEFAULTS.spawnEnabled,
    modifiers: { rocks: false, weather: false },
  };
}

function report(io: Io, options: RunOptions, compiled: readonly Compiled[], sim: SimResult): void {
  const participants = compiled.map((c) => c.participant);
  const errors = [
    ...compiled.flatMap((c) => formatDiagnostics(c.participant.file, c.diagnostics)),
    ...formatRuntimeErrors(participants, sim.players),
  ];
  if (errors.length > 0) io.stderr(errors.join('\n'));
  if (options.json) {
    io.stdout(JSON.stringify(sim));
    return;
  }
  io.stdout(formatResultsTable(participants, sim.players));
  const output = formatOutput(participants, sim.players);
  if (output.length > 0) io.stdout(['', ...output].join('\n'));
  io.stdout(['', ...formatFooter(sim)].join('\n'));
}

function hadPlayerError(compiled: readonly Compiled[], sim: SimResult): boolean {
  return compiled.some((c) => !c.participant.compiled) || sim.players.some((p) => p.error !== undefined);
}

/** Runs the CLI; returns the process exit code. `argv` is the command line without node and the script path. */
export function main(argv: readonly string[], io: Io, loadRuntime: () => RuntimeResult): number {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    io.stderr(parsed.message);
    return EXIT_USAGE;
  }
  const loaded = loadPrograms(parsed.options.players, (path) => io.readFile(path));
  if (!loaded.ok) {
    io.stderr(loaded.message);
    return EXIT_USAGE;
  }
  const engine = loadRuntime();
  if (!engine.ok) {
    io.stderr(engine.message);
    return EXIT_ENGINE_NOT_WIRED;
  }
  const compiled = loaded.programs.map((program) => compileOne(engine.runtime, program));
  const sim = engine.runtime.simulation.run(
    configOf(parsed.options),
    compiled.map((c) => c.input),
  );
  report(io, parsed.options, compiled, sim);
  return hadPlayerError(compiled, sim) ? EXIT_PLAYER_ERROR : EXIT_OK;
}
