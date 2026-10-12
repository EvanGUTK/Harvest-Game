import { describe, expect, it } from 'vitest';
import { createLangEngine } from './engine';
import { InvariantError } from './invariant';
import { TEST_CONSTANTS, TEST_HOSTS } from './test-support/compile';
import { DEFAULT_LIMITS, type CompileOptions, type SourceFiles, type VM, type VMYield } from './types';
import { LANGUAGE_VERSION } from './version';

const engine = createLangEngine();

const options: CompileOptions = {
  languageVersion: LANGUAGE_VERSION,
  hostSignatures: TEST_HOSTS,
  constants: TEST_CONSTANTS,
  lockedFeatures: new Map(),
  lockedNames: new Map(),
  limits: DEFAULT_LIMITS,
};

const source = (text: string): SourceFiles => [{ name: 'main.sprout', text }];

const start = (text: string): VM => {
  const result = engine.compile(source(text), options);
  if (!result.ok) throw new Error(`does not compile: ${result.diagnostics.map((d) => d.code).join(', ')}`);
  return engine.createVM(result.module, DEFAULT_LIMITS);
};

/** Runs to the end, answering every host call with True at its baked cost. */
const finish = (vm: VM): VMYield[] => {
  const yields: VMYield[] = [];
  for (let i = 0; i < 100; i += 1) {
    const y = vm.run(100_000);
    yields.push(y);
    if (y.kind !== 'host') return yields;
    vm.resume(engine.values.bool(true));
  }
  return yields;
};

describe('LangEngine (interpreter-vm.md §Public API)', () => {
  it('compiles Sprout source and runs it to the end', () => {
    const vm = start('total = 0\nfor i in range(4):\n    total += i\nprint("total", total)\n');
    expect(finish(vm).at(-1)?.kind).toBe('halt');
    expect(vm.output).toEqual(['total 6']);
  });

  it('yields host calls with their baked cost and resumes them', () => {
    const vm = start('ok = plant(RADISH)\nprint(ok)\n');
    const y = vm.run(100_000);
    expect(y).toMatchObject({ kind: 'host', fn: 2, cost: 30 });
    if (y.kind !== 'host') throw new Error('expected a host yield');
    expect(y.args.map((a) => engine.values.asConstantId(a))).toEqual([10]);
    vm.resume(engine.values.bool(true));
    expect(vm.run(100_000).kind).toBe('halt');
    expect(vm.output).toEqual(['True']);
  });

  it('returns compile errors as diagnostics, never throws for user errors', () => {
    const result = engine.compile(source('x = = 1\n'), options);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected diagnostics');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every((d) => d.code.startsWith('E-') || d.code.startsWith('W-'))).toBe(true);
  });

  it('reports a runtime error at its source range', () => {
    const y = finish(start('x = 1\ny = x // 0\n')).at(-1);
    expect(y).toMatchObject({
      kind: 'error',
      error: { code: 'R-DIV-ZERO', range: { file: 'main.sprout', line: 2 } },
    });
  });

  it('stamps the module with countTokens of its source', () => {
    const text = 'x = 1\nprint(x)\n';
    const result = engine.compile(source(text), options);
    if (!result.ok) throw new Error('does not compile');
    expect(result.tokenCount).toBe(engine.countTokens(source(text)));
    expect(result.module.tokenCount).toBe(result.tokenCount);
  });

  it('restores a snapshot that continues exactly like the original', () => {
    const vm = start('for i in range(3):\n    plant(RADISH)\nprint("done")\n');
    vm.run(100_000);
    const copy = engine.restoreVM(JSON.parse(JSON.stringify(vm.snapshot())) as ReturnType<VM['snapshot']>);
    vm.resume(engine.values.bool(true));
    copy.resume(engine.values.bool(true));
    expect(finish(copy)).toEqual(finish(vm));
    expect(copy.output).toEqual(vm.output);
  });

  it('refuses a module from another language version as a host bug', () => {
    const result = engine.compile(source('x = 1\n'), options);
    if (!result.ok) throw new Error('does not compile');
    const foreign = { ...result.module, languageVersion: '0.0.9' };
    expect(() => engine.createVM(foreign, DEFAULT_LIMITS)).toThrow(InvariantError);
  });
});
