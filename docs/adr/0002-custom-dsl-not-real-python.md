# ADR-0002: Custom Python-style DSL ("Sprout") instead of real Python

- **Status:** accepted (2026-10-11)
- **Date:** 2026-10-07

## Context
Players should feel they're learning Python. Running real Python in the browser is possible (Pyodide, MicroPython-Wasm).

## Decision
Implement **Sprout**, a small Python-shaped language with our own lexer, parser, compiler and step-metered bytecode VM.

## Consequences
- **Exact metering:** every instruction has a documented cycle cost. That's essential for the "time is cycles" mechanic and for fair scoring.
- **Determinism:** no floats, no hash randomisation, no GC timing effects.
- **Security:** there is nothing to escape from. The only capabilities are host functions we define.
- **Size:** about 50 KB instead of 10 MB+ for Pyodide.
- **Pedagogy:** we control error messages and can gate features per chapter.
- Cost: we must build and maintain a language (scoped small, with a differential test vs CPython to keep semantics honest).
- Players don't get the full Python stdlib. That's acceptable, and a "Graduation" export bridges to real Python.

## Alternatives considered
- **Pyodide:** large download, hard to meter per instruction, slow startup, nondeterminism risks.
- **Skulpt / Brython:** Python-to-JS transpilers. Metering and sandboxing are harder, and edge semantics differ anyway.
- **Blocks only:** fails the "teaches you to code" goal for older players.
