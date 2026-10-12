import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type VMSnapshot, type VMYield } from '../types';
import { InvariantError } from '../invariant';
import { toBytecodeModule } from '../compiler/bytecode';
import { Op } from '../compiler/opcodes';
import { assemble } from '../test-support/assemble';
import { Machine, restoreMachine } from './machine';
import { SNAPSHOT_FORMAT_VERSION, type SnapshotJson } from './snapshot';
import { valueOps } from './value';

/**
 * Module body:  xs = ['ab', 'ab'] (one shared heap string); d = {1: xs}; a dropped list that contains
 * itself (a leaked cycle, still counted); f(3); halt.
 * def f(n): for x in xs: host(1)   (each round yields to the host while the iterator is live)
 */
const program = () =>
  assemble({
    globals: ['xs', 'd'],
    statements: [
      { file: 'main.sprout', line: 1, span: { file: 'main.sprout', line: 1, col: 1, endLine: 1, endCol: 5 } },
    ],
    functions: [
      {
        name: '<module>',
        body: (e, pool) => {
          e.emit(Op.LINE, 0);
          e.emit(Op.CONST, pool.add({ kind: 'str', text: 'a' }));
          e.emit(Op.CONST, pool.add({ kind: 'str', text: 'b' }));
          e.emit(Op.ADD);
          e.emit(Op.DUP);
          e.emit(Op.BUILD_LIST, 2);
          e.emit(Op.STORE_GLOBAL, 0);
          e.emit(Op.CONST, pool.add({ kind: 'int', value: 1 }));
          e.emit(Op.LOAD_GLOBAL, 0);
          e.emit(Op.BUILD_DICT, 1);
          e.emit(Op.STORE_GLOBAL, 1);
          e.emit(Op.BUILD_LIST, 0);
          e.emit(Op.DUP);
          e.emit(Op.DUP);
          e.emit(Op.CALL_METHOD, 0, 1);
          e.emit(Op.POP);
          e.emit(Op.POP);
          e.emit(Op.CONST, pool.add({ kind: 'fn', index: 1 }));
          e.emit(Op.CONST, pool.add({ kind: 'int', value: 3 }));
          e.emit(Op.CALL, 1);
          e.emit(Op.POP);
          e.emit(Op.HALT);
        },
      },
      {
        name: 'f',
        arity: 1,
        locals: ['n', 'x'],
        body: (e, pool) => {
          e.emit(Op.LOAD_GLOBAL, 0);
          e.emit(Op.ITER_INIT, 0);
          const top = e.newLabel();
          const out = e.newLabel();
          e.mark(top);
          e.emitJump(Op.ITER_NEXT, out);
          e.emit(Op.STORE_LOCAL, 1);
          e.emit(Op.CONST, pool.add({ kind: 'int', value: 1 }));
          e.emit(Op.CALL_HOST, 9, 1, 10, 1);
          e.emit(Op.LOAD_LOCAL, 1);
          e.emit(Op.CALL_INTRINSIC, 6, 2);
          e.emit(Op.POP);
          e.emitJump(Op.JUMP, top);
          e.mark(out);
          e.emit(Op.CONST, pool.add({ kind: 'none' }));
          e.emit(Op.RETURN);
        },
      },
    ],
  });

const start = () => new Machine(toBytecodeModule(program()), DEFAULT_LIMITS);

/** Serialises to text and back, as a snapshot crossing a Worker or the network would. */
const viaJson = (s: VMSnapshot): VMSnapshot => JSON.parse(JSON.stringify(s)) as VMSnapshot;

/** Runs to the end, answering every host call with its round number and an applied cost of 4. */
const finish = (machine: Machine): VMYield[] => {
  const yields: VMYield[] = [];
  for (let round = 0; round < 10; round += 1) {
    const y = machine.run(1_000);
    yields.push(y);
    if (y.kind !== 'host') return yields;
    machine.resume(valueOps.int(round), 4);
  }
  return yields;
};

describe('VM snapshots (interpreter-vm.md §Public API: serializable, self-contained)', () => {
  it('round-trips through JSON to an identical snapshot, mid-call with a live iterator and a pending host call', () => {
    const machine = start();
    expect(machine.run(1_000).kind).toBe('host');
    const first = viaJson(machine.snapshot());
    const restored = restoreMachine(first);
    expect(viaJson(restored.snapshot())).toEqual(first);
  });

  it('continues exactly like the original: same yields, output, cycles and live cells', () => {
    const original = start();
    original.run(1_000);
    const copy = restoreMachine(viaJson(original.snapshot()));
    original.resume(valueOps.int(100), 4);
    copy.resume(valueOps.int(100), 4);
    expect(finish(copy)).toEqual(finish(original));
    expect(copy.output).toEqual(original.output);
    expect(copy.output).toEqual(['100 ab', '0 ab']);
    expect(copy.cycles).toBe(original.cycles);
    expect(copy.liveCells).toBe(original.liveCells);
  });

  it('keeps a shared object shared and keeps reference counts and the live count, leaked cycle included', () => {
    const machine = start();
    machine.run(1_000);
    const json = viaJson(machine.snapshot()) as unknown as SnapshotJson;
    const strings = json.heap.objects.filter((o) => o.t === 'str');
    expect(strings).toHaveLength(1);
    // 'ab' is held twice by xs, and once by local x.
    expect(strings[0]).toMatchObject({ text: 'ab', rc: 3 });
    // xs (2 slots) + 'ab' (1) + d (1 entry) + the leaked self-containing list (1), unreachable but counted.
    expect(json.heap.liveCells).toBe(5);
    expect(restoreMachine(json as unknown as VMSnapshot).liveCells).toBe(5);
  });

  it('carries the module, limits and language version, so restoring needs nothing else', () => {
    const machine = new Machine(toBytecodeModule(program()), { ...DEFAULT_LIMITS, maxPrintLines: 1 });
    machine.run(1_000);
    const json = viaJson(machine.snapshot()) as unknown as SnapshotJson;
    expect(json).toMatchObject({
      format: 'sprout-vm-snapshot',
      formatVersion: 1,
      kind: 'single',
      languageVersion: '0.1.0',
    });
    expect(json.limits.maxPrintLines).toBe(1);
    const copy = restoreMachine(json as unknown as VMSnapshot);
    copy.resume(valueOps.int(0), 4); // the snapshot was taken while a host call was pending
    finish(copy);
    expect(copy.output).toHaveLength(1);
    expect(copy.droppedLines).toBe(1);
  });

  it('keeps a finished machine finished', () => {
    const machine = start();
    finish(machine);
    const copy = restoreMachine(viaJson(machine.snapshot()));
    expect(copy.run(1_000)).toEqual(machine.run(1_000));
  });

  it('refuses a snapshot with another format word, version or kind (chief ruling V8: room for M2)', () => {
    const machine = start();
    machine.run(1_000);
    const json = viaJson(machine.snapshot()) as unknown as SnapshotJson;
    const tamper = (patch: Partial<Record<keyof SnapshotJson, unknown>>) => () =>
      restoreMachine({ ...json, ...patch } as unknown as VMSnapshot);
    expect(tamper({ format: 'something-else' })).toThrow(InvariantError);
    expect(tamper({ formatVersion: SNAPSHOT_FORMAT_VERSION + 1 })).toThrow(InvariantError);
    expect(tamper({ kind: 'program' })).toThrow(InvariantError);
  });

  it('refuses a snapshot from another language version as a host bug (LANG-VERSION-MISMATCH)', () => {
    const machine = start();
    machine.run(1_000);
    const json = viaJson(machine.snapshot()) as unknown as SnapshotJson;
    let thrown: unknown;
    try {
      restoreMachine({ ...json, languageVersion: '0.0.9' } as unknown as VMSnapshot);
    } catch (e) {
      thrown = e;
    }
    expect(thrown instanceof InvariantError && thrown.code).toBe('LANG-VERSION-MISMATCH');
  });

  /** Two statements of two cycles each, the second in helpers.sprout (statement 0 is main.sprout:1). */
  const twoStatements = () =>
    new Machine(
      toBytecodeModule(
        assemble({
          statements: [
            {
              file: 'main.sprout',
              line: 1,
              span: { file: 'main.sprout', line: 1, col: 1, endLine: 1, endCol: 2 },
            },
            {
              file: 'helpers.sprout',
              line: 2,
              span: { file: 'helpers.sprout', line: 2, col: 1, endLine: 2, endCol: 2 },
            },
          ],
          functions: [
            {
              name: '<module>',
              body: (e, pool) => {
                for (const statement of [0, 1]) {
                  e.emit(Op.LINE, statement);
                  e.emit(Op.CONST, pool.add({ kind: 'int', value: 1 }));
                  e.emit(Op.POP);
                }
                e.emit(Op.HALT);
              },
            },
          ],
        }),
      ),
      DEFAULT_LIMITS,
    );

  it('does not yield the same line twice after restoring a snapshot taken at a line yield', () => {
    const machine = twoStatements();
    expect(machine.run(100, { stopAtLine: true })).toMatchObject({ kind: 'line', line: 2 });
    const copy = restoreMachine(viaJson(machine.snapshot()));
    expect(copy.run(100, { stopAtLine: true })).toEqual({ kind: 'halt', atCycle: 5 });
  });

  it('stops at the LINE a budget yield left at ip, after restoring a snapshot taken there', () => {
    const machine = twoStatements();
    expect(machine.run(2, { stopAtLine: true })).toEqual({ kind: 'budget', atCycle: 2 });
    const copy = restoreMachine(viaJson(machine.snapshot()));
    expect(copy.run(100, { stopAtLine: true })).toEqual({
      kind: 'line',
      file: 'helpers.sprout',
      line: 2,
      atCycle: 2,
    });
  });

  it('validates the module it carries before running it', () => {
    const machine = start();
    machine.run(1_000);
    const json = viaJson(machine.snapshot()) as unknown as SnapshotJson;
    const damaged = {
      ...json,
      module: { ...json.module, code: json.module.code.map((w, i) => (i === 0 ? 99 : w)) },
    };
    expect(() => restoreMachine(damaged as unknown as VMSnapshot)).toThrow(InvariantError);
  });
});
