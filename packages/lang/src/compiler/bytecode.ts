/**
 * The bytecode module: what the compiler produces and the VM runs, behind the opaque BytecodeModule.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (module layout, chief ruling 2026-10-11).
 * Invariants: function 0 is the module body; functions are contiguous and cover the whole code array;
 * the pool holds only literals the program can name; debug tables are never read on the hot path;
 * a module is immutable once built, so a VM and its snapshots can share it.
 */

import type { BytecodeModule, ConstantDef, Span } from '../types';
import { InvariantError, assertNever } from '../invariant';

export type PoolEntry =
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'str'; readonly text: string }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'none' }
  | { readonly kind: 'fn'; readonly index: number }
  | { readonly kind: 'const'; readonly id: number };

export type FunctionInfo = {
  readonly name: string;
  readonly arity: number;
  /** Parameters first, then every other local in first-binding order (ScopeInfo). */
  readonly localNames: readonly string[];
  /** First pc of the function and the pc just past its last instruction. */
  readonly entry: number;
  readonly end: number;
  readonly file: string;
  /** The deepest the function's own operand stack gets (computed by measureMaxStack); validated. */
  readonly maxStack: number;
};

/** One row per statement boundary; `LINE s` points here. */
export type StatementInfo = { readonly file: string; readonly line: number; readonly span: Span };

/** Plain variable names of an instruction's operands (null where an operand is not a plain name). */
export type OperandNames = readonly (string | null)[];

export type ModuleData = {
  readonly languageVersion: string;
  readonly tokenCount: number;
  readonly code: Int32Array;
  readonly pool: readonly PoolEntry[];
  readonly functions: readonly FunctionInfo[];
  /** Global names in slot order (the scope resolver's order). */
  readonly globals: readonly string[];
  readonly constantDefs: readonly ConstantDef[];
  readonly statements: readonly StatementInfo[];
  /** Source range of every instruction that can fail, by pc. */
  readonly opSpans: ReadonlyMap<number, Span>;
  /** Operand names for messages ("`x` is `5`", the R-KEY receiver), by pc. */
  readonly operandNames: ReadonlyMap<number, OperandNames>;
};

type ModuleImpl = {
  readonly languageVersion: string;
  readonly tokenCount: number;
  readonly data: ModuleData;
};

/** The single place module data becomes the opaque public brand. */
export function toBytecodeModule(data: ModuleData): BytecodeModule {
  const impl: ModuleImpl = { languageVersion: data.languageVersion, tokenCount: data.tokenCount, data };
  return impl as unknown as BytecodeModule;
}

/** The single place a public BytecodeModule is read back; anything not built by toBytecodeModule throws. */
export function moduleData(module: BytecodeModule): ModuleData {
  const impl = module as unknown as Partial<ModuleImpl>;
  if (impl.data === undefined) throw new InvariantError('LANG-FOREIGN-MODULE', 'not a module built by lang');
  return impl.data;
}

/** Collects pool entries, giving equal literals one index. */
export class ConstantPool {
  private readonly entries: PoolEntry[] = [];
  private readonly indexByKey = new Map<string, number>();

  add(entry: PoolEntry): number {
    const key = poolKey(entry);
    const known = this.indexByKey.get(key);
    if (known !== undefined) return known;
    const index = this.entries.length;
    this.entries.push(entry);
    this.indexByKey.set(key, index);
    return index;
  }

  build(): readonly PoolEntry[] {
    return [...this.entries];
  }
}

function poolKey(entry: PoolEntry): string {
  switch (entry.kind) {
    case 'int':
      return `i${String(entry.value)}`;
    case 'str':
      return `s${entry.text}`;
    case 'bool':
      return entry.value ? 'b1' : 'b0';
    case 'none':
      return 'n';
    case 'fn':
      return `f${String(entry.index)}`;
    case 'const':
      return `c${String(entry.id)}`;
    default:
      return assertNever(entry);
  }
}
