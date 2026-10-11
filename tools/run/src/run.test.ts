import { BOTS, RULES_VERSION, SHOWDOWN_DEFAULTS } from '@harvest/content';
import { DEFAULT_LIMITS, LANGUAGE_VERSION } from '@harvest/lang';
import type {
  BytecodeModule,
  CompileOptions,
  CompileResult,
  ConstantDef,
  HostSignature,
  SourceFiles,
} from '@harvest/lang';
import type { PlayerInput, PlayerResult, SimConfig, SimResult } from '@harvest/sim';
import { describe, expect, it } from 'vitest';
import { main } from './run';
import type { Io } from './run';
import { ENGINE_NOT_WIRED } from './runtime';
import type { Runtime, RuntimeResult } from './runtime';

const SIGNATURES: readonly HostSignature[] = [
  { id: 0, name: 'move', params: ['const'], returns: 'none', cost: 20, touchesWorld: true },
];
const CONSTANTS: readonly ConstantDef[] = [{ name: 'EAST', id: 2, group: 'direction' }];

type Harness = {
  io: Io;
  out: string[];
  err: string[];
  compiled: { source: SourceFiles; options: CompileOptions }[];
  runs: { config: SimConfig; players: readonly PlayerInput[] }[];
  runtime: Runtime;
  loader: () => RuntimeResult;
};

function fakeModule(index: number): BytecodeModule {
  return {
    __brand: 'BytecodeModule',
    languageVersion: LANGUAGE_VERSION,
    tokenCount: index,
  };
}

function playerResult(slot: number, over: Partial<PlayerResult> = {}): PlayerResult {
  return {
    slot,
    score: 100 + slot,
    cyclesLastChange: 30_000,
    logicCycles: 10,
    programTokens: 5,
    cropsHarvested: slot,
    cyclesUsed: 29_000,
    awards: [],
    output: [],
    ...over,
  };
}

/** A fake engine that fails to compile any source containing "BROKEN" and a fake simulation that records its input. */
function harness(
  files: Record<string, string>,
  resultFor: (inputs: readonly PlayerInput[]) => SimResult,
): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const compiled: Harness['compiled'] = [];
  const runs: Harness['runs'] = [];
  const runtime: Runtime = {
    hostSignatures: SIGNATURES,
    constants: CONSTANTS,
    engine: {
      compile(source: SourceFiles, options: CompileOptions): CompileResult {
        compiled.push({ source, options });
        if (source.some((f) => f.text.includes('BROKEN'))) {
          return {
            ok: false,
            diagnostics: [
              {
                code: 'E-MISSING-COLON',
                severity: 'error',
                range: { file: 'main.sprout', line: 2, col: 5, endLine: 2, endCol: 6 },
                message: 'needs a colon',
              },
            ],
          };
        }
        return { ok: true, module: fakeModule(compiled.length), tokenCount: 1, warnings: [] };
      },
    },
    simulation: {
      run(config: SimConfig, players: readonly PlayerInput[]): SimResult {
        runs.push({ config, players });
        return resultFor(players);
      },
    },
  };
  const io: Io = {
    readFile(path: string): string {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
  return { io, out, err, compiled, runs, runtime, loader: () => ({ ok: true, runtime }) };
}

const simpleResult = (players: readonly PlayerInput[]): SimResult => ({
  players: players.map((p) => playerResult(p.slot)),
  finalStateHash: 0xabc,
  events: [],
});

describe('main', () => {
  it('prints the usage and exits 2 on a bad command line, without touching the files or the engine', () => {
    const h = harness({}, simpleResult);
    const code = main([], h.io, () => {
      throw new Error('the runtime must not be loaded');
    });
    expect(code).toBe(2);
    expect(h.err.join('\n')).toContain('usage: sprout run');
    expect(h.out).toEqual([]);
  });

  it('exits 2 and names the file when a program cannot be read, before loading the engine', () => {
    const h = harness({}, simpleResult);
    const code = main(['run', 'nope.sprout'], h.io, () => {
      throw new Error('the runtime must not be loaded');
    });
    expect(code).toBe(2);
    expect(h.err.join('\n')).toContain('cannot read nope.sprout');
  });

  it('exits 70 with the placeholder message while the engine is not wired', () => {
    const h = harness({ 'a.sprout': 'move(EAST)\n' }, simpleResult);
    const code = main(['run', 'a.sprout'], h.io, () => ({ ok: false, message: ENGINE_NOT_WIRED }));
    expect(code).toBe(70);
    expect(h.err.join('\n')).toContain(ENGINE_NOT_WIRED);
    expect(h.out).toEqual([]);
  });

  it('compiles each program as its own one-file main.sprout with the showdown limits and the runtime host tables', () => {
    const h = harness({ 'a.sprout': 'move(EAST)\n', 'b.sprout': 'halt()\n' }, simpleResult);
    main(['run', 'a.sprout', '--players', 'b.sprout'], h.io, h.loader);
    expect(h.compiled.map((c) => c.source)).toEqual([
      [{ name: 'main.sprout', text: 'move(EAST)\n' }],
      [{ name: 'main.sprout', text: 'halt()\n' }],
    ]);
    const options = h.compiled[0]?.options;
    expect(options).toMatchObject({
      languageVersion: LANGUAGE_VERSION,
      hostSignatures: SIGNATURES,
      constants: CONSTANTS,
      limits: DEFAULT_LIMITS,
    });
    expect(options?.lockedFeatures.size).toBe(0);
    expect(options?.lockedNames.size).toBe(0);
  });

  it('runs bots from content without reading the disk', () => {
    const h = harness({ 'a.sprout': 'move(EAST)\n' }, simpleResult);
    main(['run', 'a.sprout', '--players', 'bot:grower'], h.io, h.loader);
    expect(h.compiled[1]?.source[0]?.text).toBe(BOTS.find((b) => b.id === 'grower')?.source);
  });

  it('builds the SimConfig from the showdown defaults and the flags', () => {
    const h = harness({ 'a.sprout': 'move(EAST)\n' }, simpleResult);
    main(['run', 'a.sprout', '--seed', '42', '--grid', '6', '--budget', '9000'], h.io, h.loader);
    expect(h.runs[0]?.config).toEqual({
      rulesVersion: RULES_VERSION,
      languageVersion: LANGUAGE_VERSION,
      seed: 42,
      gridSize: 6,
      cycleBudget: 9_000,
      startCredits: SHOWDOWN_DEFAULTS.startCredits,
      startWater: SHOWDOWN_DEFAULTS.startWater,
      startMoisture: SHOWDOWN_DEFAULTS.startMoisture,
      moistureDecay: true,
      sharedMarket: true,
      randomEnabled: SHOWDOWN_DEFAULTS.randomEnabled,
      spawnEnabled: SHOWDOWN_DEFAULTS.spawnEnabled,
      modifiers: { rocks: false, weather: false },
    });
  });

  it('hands the compiled modules to the simulation in slot order', () => {
    const h = harness({ 'a.sprout': 'a\n', 'b.sprout': 'b\n' }, simpleResult);
    main(['run', 'a.sprout', '--players', 'b.sprout'], h.io, h.loader);
    expect(h.runs[0]?.players).toEqual([
      { slot: 0, module: fakeModule(1) },
      { slot: 1, module: fakeModule(2) },
    ]);
  });

  it('prints the results table, the print output and the footer to stdout and exits 0 on a clean run', () => {
    const h = harness({ 'a.sprout': 'a\n', 'b.sprout': 'b\n' }, (players) => ({
      players: players.map((p) => playerResult(p.slot, { output: [`hello from ${p.slot}`] })),
      finalStateHash: 0xabc,
      events: [{ t: 1000, k: 'hash', h: 1 }],
    }));
    const code = main(['run', 'a.sprout', '--players', 'b.sprout'], h.io, h.loader);
    const stdout = h.out.join('\n');
    expect(code).toBe(0);
    expect(stdout).toContain('place  slot  file');
    expect(stdout).toContain('[slot 0 a.sprout] hello from 0');
    expect(stdout).toContain('[slot 1 b.sprout] hello from 1');
    expect(stdout).toContain('events: 1');
    expect(stdout).toContain('finalStateHash: 0x00000abc');
    expect(h.err).toEqual([]);
  });

  it('runs a program that does not compile as the idle program, prints its diagnostics to stderr and exits 1', () => {
    const h = harness({ 'a.sprout': 'a\n', 'bad.sprout': 'BROKEN\n' }, simpleResult);
    const code = main(['run', 'a.sprout', '--players', 'bad.sprout'], h.io, h.loader);
    expect(code).toBe(1);
    expect(h.runs[0]?.players).toEqual([
      { slot: 0, module: fakeModule(1) },
      { slot: 1, module: null, compileError: { code: 'E-MISSING-COLON', line: 2 } },
    ]);
    expect(h.err.join('\n')).toContain('bad.sprout:2:5: error E-MISSING-COLON: needs a colon');
    expect(h.out.join('\n')).toContain('bad.sprout');
  });

  it('reports a runtime error with its file and line to stderr and exits 1', () => {
    const h = harness({ 'a.sprout': 'a\n' }, (players) => ({
      players: players.map((p) => playerResult(p.slot, { error: { code: 'R-INDEX', line: 7 } })),
      finalStateHash: 1,
      events: [],
    }));
    const code = main(['run', 'a.sprout'], h.io, h.loader);
    expect(code).toBe(1);
    expect(h.err.join('\n')).toContain('a.sprout:7: runtime error R-INDEX (slot 0)');
  });

  it('prints compile warnings of a program that did compile to stderr and still exits 0', () => {
    const h = harness({ 'a.sprout': 'a\n' }, simpleResult);
    const compile = h.runtime.engine.compile.bind(h.runtime.engine);
    h.runtime.engine.compile = (source, options) => {
      const result = compile(source, options);
      return result.ok
        ? {
            ...result,
            warnings: [
              {
                code: 'W-UNUSED-VAR',
                severity: 'warning',
                range: { file: 'main.sprout', line: 1, col: 1, endLine: 1, endCol: 2 },
                message: 'x is never used',
              },
            ],
          }
        : result;
    };
    const code = main(['run', 'a.sprout'], h.io, h.loader);
    expect(code).toBe(0);
    expect(h.err.join('\n')).toContain('a.sprout:1:1: warning W-UNUSED-VAR: x is never used');
  });

  it('with --json prints only the SimResult as JSON on stdout and keeps diagnostics on stderr', () => {
    const sim: SimResult = { players: [playerResult(0), playerResult(1)], finalStateHash: 77, events: [] };
    const h = harness({ 'a.sprout': 'a\n', 'bad.sprout': 'BROKEN\n' }, () => sim);
    const code = main(['run', 'a.sprout', '--players', 'bad.sprout', '--json'], h.io, h.loader);
    expect(code).toBe(1);
    expect(h.out).toHaveLength(1);
    expect(JSON.parse(h.out[0] ?? '')).toEqual(sim);
    expect(h.err.join('\n')).toContain('E-MISSING-COLON');
  });
});
