/**
 * The engine seam of the balance harness: a factory that builds a runtime for one variant's rule overrides.
 * Design: docs/03-architecture/simulation-engine.md §Public API, §Balance harness (rule tweaks for one run only).
 * Invariants: `main` only sees this interface, so tests inject fakes; `loadRuntimeFactory` is the one place the real
 * engine is wired in, and it also builds the `Rules` from content plus the overrides once sim accepts them.
 */

import { ENGINE_NOT_WIRED } from '@harvest/tool-run/runtime';
import type { RuntimeResult } from '@harvest/tool-run/runtime';
import type { RulesOverrides } from './overrides';

/** Builds a runtime whose rules are content's plus these overrides (content itself never changes). */
export type RuntimeFactory = (overrides: RulesOverrides) => RuntimeResult;

export type FactoryResult = { ok: true; factory: RuntimeFactory } | { ok: false; message: string };

/** The real engine. It does not exist yet: the compiler, the VM and the scheduler are still being built. */
export function loadRuntimeFactory(): FactoryResult {
  return { ok: false, message: ENGINE_NOT_WIRED };
}
