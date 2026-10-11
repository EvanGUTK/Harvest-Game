/**
 * What every semantic operation may consult besides its operands: the VM's heap and the module's
 * constant table (names and groups for `str()` and messages).
 * Spec: docs/03-architecture/interpreter-vm.md §VM; docs/02-language/errors-and-diagnostics.md §Runtime.
 * Invariants: read-only except for the heap, which semantic functions use only through `Heap` methods.
 */

import type { ConstantDef } from '../index';
import { InvariantError } from '../invariant';
import type { Heap } from './heap';

/** ConstantDef by id, built once from CompileOptions.constants and baked into the module. */
export type ConstantTable = ReadonlyMap<number, ConstantDef>;

export type OpContext = { readonly heap: Heap; readonly constants: ConstantTable };

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
