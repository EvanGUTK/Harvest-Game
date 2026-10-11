/**
 * The host table the compiler sees: one `HostSignature` per builtin, and the game constants.
 * Design: docs/03-architecture/interpreter-vm.md §Public API (HostSignature), docs/02-language/standard-library.md
 * (the tables), docs/03-architecture/simulation-engine.md §Clock arithmetic.
 * Invariants: built only from the `content` metadata (BUILTINS and CONSTANTS), so no number lives here; the host id
 * of a builtin is its index in BUILTINS (append-only); the baked cost is the static default, and the applied cost
 * (failed action 5, wait n, goto per step) is worked out by `applyHostCall`. `unlock` is only the editor's lock text:
 * the checker's lock reasons come from the campaign's CompileOptions, not from this table.
 */

import { ACTION_COSTS, BUILTINS, CONSTANTS, type BuiltinMeta, type Unlock } from '@harvest/content';
import type { ConstantDef, HostSignature } from '@harvest/lang';

/** The per-drone stat that changes a baked cost: the Rotor upgrade tier's move cost. */
export type SignatureUpgrades = { readonly moveCost: number };

const DEFAULT_UPGRADES: SignatureUpgrades = { moveCost: ACTION_COSTS.move };

/** Builtins whose baked cost is the drone's move cost (`goto` per step of distance). */
const MOVE_COST_BUILTINS: ReadonlySet<string> = new Set(['move', 'goto']);

function chapterText(chapter: number): string {
  return `Ch ${chapter}`;
}

function nodeText(node: string): string {
  return `Skill: ${node}`;
}

/** The lock text the editor shows: "Ch 1", "Skill: till" or "Ch 8 · Skill: sell"; undefined when always open. */
function unlockText(unlock: Unlock): string | undefined {
  if ('always' in unlock) return undefined;
  if ('chapter' in unlock) {
    return unlock.node === undefined
      ? chapterText(unlock.chapter)
      : `${chapterText(unlock.chapter)} · ${nodeText(unlock.node)}`;
  }
  return nodeText(unlock.node);
}

function bakedCost(meta: BuiltinMeta, upgrades: SignatureUpgrades): number {
  return MOVE_COST_BUILTINS.has(meta.name) ? upgrades.moveCost : meta.cost;
}

function toSignature(meta: BuiltinMeta, id: number, upgrades: SignatureUpgrades): HostSignature {
  const unlock = unlockText(meta.unlock);
  return {
    id,
    name: meta.name,
    params: [...meta.params],
    ...(meta.optionalParams === undefined ? {} : { optionalParams: meta.optionalParams }),
    returns: meta.returns,
    cost: bakedCost(meta, upgrades),
    touchesWorld: meta.touchesWorld,
    ...(unlock === undefined ? {} : { unlock }),
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
