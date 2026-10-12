/**
 * What the CLI needs from the engine: a compiler, a simulation and the host definitions.
 * Design: docs/03-architecture/simulation-engine.md §Public API, docs/03-architecture/interpreter-vm.md §Public API.
 * Invariants: `main` only sees this interface, so tests inject fakes; `loadRuntime` is the one place the real
 * engine is wired in.
 */

import type { ConstantDef, HostSignature, LangEngine } from '@harvest/lang';
import type { Simulation } from '@harvest/sim';

export type Runtime = {
  engine: Pick<LangEngine, 'compile'>;
  simulation: Pick<Simulation, 'run'>;
  hostSignatures: readonly HostSignature[];
  constants: readonly ConstantDef[];
};

export type RuntimeResult = { ok: true; runtime: Runtime } | { ok: false; message: string };

export const ENGINE_NOT_WIRED = 'the engine is not wired yet (LANG-04/05, SIM-02/03)';

/** The real engine. It does not exist yet: the compiler, the VM and the scheduler are still being built. */
export function loadRuntime(): RuntimeResult {
  return { ok: false, message: ENGINE_NOT_WIRED };
}
