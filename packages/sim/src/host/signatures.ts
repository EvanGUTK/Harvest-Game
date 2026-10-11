/**
 * The host table the compiler sees: one `HostSignature` per builtin, and the game constants.
 * Design: docs/03-architecture/interpreter-vm.md §Public API (HostSignature), docs/02-language/standard-library.md
 * (the tables), docs/03-architecture/simulation-engine.md §Clock arithmetic.
 * Invariants: built only from the `content` metadata (BUILTINS and CONSTANTS), so no number lives here; the host id
 * of a builtin is its index in BUILTINS (append-only); the baked cost is the static default, and the applied cost
 * (failed action 5, wait n, goto per step) is worked out by `applyHostCall`. `unlock` passes the
 * content fields through (the editor builds its lock text from them); the checker's lock reasons come from the
 * campaign's CompileOptions, not from this table.
 */

import { ACTION_COSTS, BUILTINS, CONSTANTS, type BuiltinMeta, type ParamKind } from '@harvest/content';
import type { ConstantDef, HostSignature, ValueKind } from '@harvest/lang';
import { assertNever } from '../invariant';

/** The per-drone stat that changes a baked cost: the Rotor upgrade tier's move cost. */
export type SignatureUpgrades = { readonly moveCost: number };

const DEFAULT_UPGRADES: SignatureUpgrades = { moveCost: ACTION_COSTS.move };

/** Builtins whose baked cost is the drone's move cost (`goto` per step of distance). */
const MOVE_COST_BUILTINS: ReadonlySet<string> = new Set(['move', 'goto']);

/** The VM only knows a constant as `const`; the group (`const:crop`, …) is the host's to check when it decodes. */
function paramKind(kind: ParamKind): ValueKind {
  switch (kind) {
    case 'int':
    case 'bool':
    case 'str':
    case 'function':
      return kind;
    case 'const:direction':
    case 'const:crop':
    case 'const:soil':
      return 'const';
    default:
      return assertNever(kind);
  }
}

function returnKind(kind: BuiltinMeta['returns']): ValueKind | 'any' {
  return kind === 'none' || kind === 'any' ? kind : paramKind(kind);
}

function bakedCost(meta: BuiltinMeta, upgrades: SignatureUpgrades): number {
  return MOVE_COST_BUILTINS.has(meta.name) ? upgrades.moveCost : meta.cost;
}

function toSignature(meta: BuiltinMeta, id: number, upgrades: SignatureUpgrades): HostSignature {
  return {
    id,
    name: meta.name,
    params: meta.params.map(paramKind),
    ...(meta.optionalParams === undefined ? {} : { optionalParams: meta.optionalParams }),
    returns: returnKind(meta.returns),
    cost: bakedCost(meta, upgrades),
    touchesWorld: meta.touchesWorld,
    unlock: { ...meta.unlock },
  };
}

/** One signature per builtin, id = index in BUILTINS, costs baked for a drone with these upgrades. */
export function hostSignatures(upgrades: SignatureUpgrades = DEFAULT_UPGRADES): readonly HostSignature[] {
  return BUILTINS.map((meta, id) => toSignature(meta, id, upgrades));
}

/** The game constants visible to programs, with their stable ids. */
export function constantDefs(): readonly ConstantDef[] {
  return CONSTANTS.map((c) => ({ name: c.name, id: c.id, group: c.group }));
}
