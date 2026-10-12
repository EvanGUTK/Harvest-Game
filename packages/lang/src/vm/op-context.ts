/**
 * What every semantic operation may consult besides its operands: the VM's heap and the module's
 * constant table (names and groups for `str()` and messages).
 * Spec: docs/03-architecture/interpreter-vm.md §VM; docs/02-language/errors-and-diagnostics.md §Runtime.
 * Invariants: read-only except for the heap, which semantic functions use only through `Heap` methods.
 */

import type { ConstantDef, Limits } from '../types';
import { InvariantError } from '../invariant';
import { Heap, type HeapCounters } from './heap';

/** ConstantDef by id, built once from CompileOptions.constants and baked into the module. */
export type ConstantTable = ReadonlyMap<number, ConstantDef>;

export type OpContext = {
  readonly heap: Heap;
  readonly limits: Limits;
  readonly constants: ConstantTable;
  /** User function names by function-table index, for `<function tend>` (chief ruling 2026-10-11). */
  readonly functionNames: readonly string[];
};

/** One context per VM: a fresh heap plus the module's read-only tables. */
export function createOpContext(
  limits: Limits,
  constants: readonly ConstantDef[],
  functionNames: readonly string[],
  counters?: HeapCounters,
): OpContext {
  return { heap: new Heap(limits, counters), limits, constants: constantTable(constants), functionNames };
}

export function constantTable(defs: readonly ConstantDef[]): ConstantTable {
  return new Map(defs.map((d) => [d.id, d]));
}

/** The ConstantDef of a constant the module produced; an unknown id means a host or compiler bug. */
export function constantDef(constants: ConstantTable, id: number): ConstantDef {
  const def = constants.get(id);
  if (def === undefined)
    throw new InvariantError('LANG-VALUE-UNKNOWN-CONST', `no constant with id ${String(id)}`);
  return def;
}

/** The def name of a user function; an index outside the table means a compiler bug. */
export function functionName(ctx: OpContext, index: number): string {
  const name = ctx.functionNames[index];
  if (name === undefined)
    throw new InvariantError('LANG-VALUE-UNKNOWN-FUNCTION', `no function with index ${String(index)}`);
  return name;
}
