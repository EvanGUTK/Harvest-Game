/**
 * Fakes for the harness tests: a compiler and a simulation that record what they were given and answer
 * deterministically, so scenario, metric and criteria code is tested without the real engine.
 * Invariants: used by tests only; scores are a pure function of the program, the seed and the slot.
 */

import { LANGUAGE_VERSION } from '@harvest/lang';
import type { BytecodeModule, CompileResult, Diagnostic, SourceFiles } from '@harvest/lang';
import type { PlayerInput, PlayerResult, SimConfig, SimEvent, SimResult } from '@harvest/sim';
import type { Runtime } from '@harvest/tool-run/runtime';

/** The text that makes the fake compiler fail. */
export const BROKEN_MARKER = 'BROKEN';

export type FakeRuntime = {
  runtime: Runtime;
  compiles: SourceFiles[];
  runs: { config: SimConfig; players: readonly PlayerInput[] }[];
};

export type ScoreRule = (input: { slot: number; seed: number; tokens: number; players: number }) => number;

/** Defaults: ₵100 plus the program's token count plus the seed; an idle program scores 0. */
const DEFAULT_SCORE: ScoreRule = ({ seed, tokens }) => 100 + tokens + seed;

function moduleWith(tokens: number): BytecodeModule {
  return { __brand: 'BytecodeModule', languageVersion: LANGUAGE_VERSION, tokenCount: tokens };
}

function failure(): Diagnostic {
  return {
    code: 'E-MISSING-COLON',
    severity: 'error',
    range: { file: 'main.sprout', line: 2, col: 1, endLine: 2, endCol: 2 },
    message: 'needs a colon',
  };
}

/** One radish sell lot per player that has a program, so event handling can be tested. */
function sellEvents(players: readonly PlayerInput[]): SimEvent[] {
  return players.flatMap((p) =>
    p.module === null
      ? []
      : [
          {
            t: 100,
            slot: p.slot,
            drone: 0,
            k: 'sell',
            crop: 'radish',
            n: p.slot + 1,
            price: 4,
            credits: 0,
          } as const,
        ],
  );
}

export function fakeRuntime(score: ScoreRule = DEFAULT_SCORE): FakeRuntime {
  const compiles: SourceFiles[] = [];
  const runs: FakeRuntime['runs'] = [];
  const runtime: Runtime = {
    hostSignatures: [],
    constants: [],
    engine: {
      compile(source: SourceFiles): CompileResult {
        compiles.push(source);
        const text = source.map((f) => f.text).join('\n');
        if (text.includes(BROKEN_MARKER)) return { ok: false, diagnostics: [failure()] };
        return { ok: true, module: moduleWith(text.length), tokenCount: text.length, warnings: [] };
      },
    },
    simulation: {
      run(config: SimConfig, players: readonly PlayerInput[]): SimResult {
        runs.push({ config, players });
        const results: PlayerResult[] = players.map((p) => ({
          slot: p.slot,
          score:
            p.module === null
              ? 0
              : score({
                  slot: p.slot,
                  seed: config.seed,
                  tokens: p.module.tokenCount,
                  players: players.length,
                }),
          cyclesLastChange: config.cycleBudget,
          logicCycles: 0,
          programTokens: p.module?.tokenCount ?? 0,
          cropsHarvested: 0,
          cyclesUsed: config.cycleBudget,
          awards: [],
          output: [],
        }));
        return { players: results, finalStateHash: 0, events: sellEvents(players) };
      },
    },
  };
  return { runtime, compiles, runs };
}
