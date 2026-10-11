/**
 * Test support: hand-assembles bytecode modules, so the VM can be tested before the compiler exists
 * and compiler output can be compared with an expected listing. Not used by production code.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (module layout).
 * Invariants: functions are laid out in the order given, contiguously from pc 0, and the result is
 * checked with assertValidModule, so a malformed test module fails at construction.
 */

import type { ConstantDef, Span } from '../types';
import { ConstantPool, type FunctionInfo, type ModuleData, type StatementInfo } from '../compiler/bytecode';
import { Emitter } from '../compiler/emitter';
import { assertValidModule } from '../compiler/validate';
import { LANGUAGE_VERSION } from '../version';

export type AssemblyFunction = {
  readonly name: string;
  readonly arity?: number;
  readonly locals?: readonly string[];
  readonly file?: string;
  /** Emits the body; `e` and `pool` are shared by all functions of the module. */
  readonly body: (e: Emitter, pool: ConstantPool) => void;
};

export type Assembly = {
  readonly functions: readonly AssemblyFunction[];
  readonly globals?: readonly string[];
  readonly constantDefs?: readonly ConstantDef[];
  readonly statements?: readonly StatementInfo[];
  readonly opSpans?: ReadonlyMap<number, Span>;
  readonly tokenCount?: number;
};

const DEFAULT_FILE = 'main.sprout';

export function assemble(assembly: Assembly): ModuleData {
  const e = new Emitter();
  const pool = new ConstantPool();
  const functions: FunctionInfo[] = assembly.functions.map((fn) => {
    const entry = e.pc;
    fn.body(e, pool);
    return {
      name: fn.name,
      arity: fn.arity ?? 0,
      localNames: fn.locals ?? [],
      entry,
      end: e.pc,
      file: fn.file ?? DEFAULT_FILE,
    };
  });
  const data: ModuleData = {
    languageVersion: LANGUAGE_VERSION,
    tokenCount: assembly.tokenCount ?? 0,
    code: e.finish(),
    pool: pool.build(),
    functions,
    globals: assembly.globals ?? [],
    constantDefs: assembly.constantDefs ?? [],
    statements: assembly.statements ?? [],
    opSpans: assembly.opSpans ?? new Map(),
    operandNames: new Map(),
  };
  assertValidModule(data);
  return data;
}
