# ADR-0001: TypeScript everywhere (no Wasm engine in v1)

- **Status:** accepted (2026-10-11)
- **Date:** 2026-10-07

## Context
The simulation must run identically in the browser (instant test runs) and on the server (official results). The question was raised whether JS/TS is a hurdle and whether the engine should be WebAssembly.

## Decision
Write client, server, interpreter (`packages/lang`) and simulation (`packages/sim`) in strict TypeScript. The same packages are imported by `apps/web` and `apps/server`.

## Consequences
- One language, one toolchain, trivially shared code. Debugging happens in one set of devtools.
- Performance is well above need: integer-only work on small grids, with an expected showdown execution of < 100 ms.
- Determinism must be *enforced* (integer-only, no ambient randomness, lint rules, cross-engine golden tests). This is required in any language.
- `lang` is isolated behind `compile` / `createVM` / `run` / `resume`, so a Rust→Wasm VM could replace it later without touching other packages.

## Alternatives considered
- **Rust → Wasm engine:** faster, but solves a problem we don't have, and adds a second toolchain plus JS↔Wasm glue for every host call.
- **Pyodide (CPython in Wasm) for real Python:** see ADR-0002.
