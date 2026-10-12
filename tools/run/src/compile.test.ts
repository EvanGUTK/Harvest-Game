import { DEFAULT_LIMITS, LANGUAGE_VERSION } from '@harvest/lang';
import type { BytecodeModule, CompileOptions, CompileResult, Diagnostic, SourceFiles } from '@harvest/lang';
import { describe, expect, it } from 'vitest';
import { compileProgram } from './compile';
import type { Runtime } from './runtime';

const FILES: SourceFiles = [{ name: 'main.sprout', text: 'move(EAST)\n' }];
const MODULE: BytecodeModule = {
  __brand: 'BytecodeModule',
  languageVersion: LANGUAGE_VERSION,
  tokenCount: 3,
};

function diagnostic(over: Partial<Diagnostic> = {}): Diagnostic {
  return {
    code: 'E-MISSING-COLON',
    severity: 'error',
    range: { file: 'main.sprout', line: 4, col: 1, endLine: 4, endCol: 2 },
    message: 'needs a colon',
    ...over,
  };
}

function runtimeReturning(result: CompileResult, seen: CompileOptions[] = []): Runtime {
  return {
    hostSignatures: [
      { id: 0, name: 'move', params: ['const'], returns: 'none', cost: 20, touchesWorld: true },
    ],
    constants: [{ name: 'EAST', id: 2, group: 'direction' }],
    engine: {
      compile(_source, options) {
        seen.push(options);
        return result;
      },
    },
    simulation: {
      run() {
        throw new Error('compileProgram must not run a simulation');
      },
    },
  };
}

describe('compileProgram', () => {
  it('turns a successful compile into the player input for that slot and carries the warnings', () => {
    const warning = diagnostic({ severity: 'warning', code: 'W-UNUSED-VAR' });
    const compiled = compileProgram(
      runtimeReturning({ ok: true, module: MODULE, tokenCount: 3, warnings: [warning] }),
      2,
      FILES,
    );
    expect(compiled).toEqual({ input: { slot: 2, module: MODULE }, compiled: true, diagnostics: [warning] });
  });

  it('turns a failed compile into the idle program with the first diagnostic as compileError', () => {
    const first = diagnostic();
    const second = diagnostic({
      code: 'E-UNKNOWN-NAME',
      range: { file: 'main.sprout', line: 9, col: 1, endLine: 9, endCol: 2 },
    });
    const compiled = compileProgram(runtimeReturning({ ok: false, diagnostics: [first, second] }), 1, FILES);
    expect(compiled).toEqual({
      input: { slot: 1, module: null, compileError: { code: 'E-MISSING-COLON', line: 4 } },
      compiled: false,
      diagnostics: [first, second],
    });
  });

  it('plays a failed compile with no diagnostics as the idle program without a compileError', () => {
    const compiled = compileProgram(runtimeReturning({ ok: false, diagnostics: [] }), 0, FILES);
    expect(compiled.input).toEqual({ slot: 0, module: null });
    expect(compiled.compiled).toBe(false);
  });

  it('compiles with the showdown limits, nothing locked and the runtime host tables', () => {
    const seen: CompileOptions[] = [];
    const runtime = runtimeReturning({ ok: true, module: MODULE, tokenCount: 3, warnings: [] }, seen);
    compileProgram(runtime, 0, FILES);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      languageVersion: LANGUAGE_VERSION,
      hostSignatures: runtime.hostSignatures,
      constants: runtime.constants,
      limits: DEFAULT_LIMITS,
    });
    expect(seen[0]?.lockedFeatures.size).toBe(0);
    expect(seen[0]?.lockedNames.size).toBe(0);
  });
});
