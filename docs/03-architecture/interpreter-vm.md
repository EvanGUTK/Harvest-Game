# Sprout Interpreter & VM (`packages/lang`)

## Pipeline

```
source ──► Lexer ──► tokens (with INDENT/DEDENT) ──► Parser ──► AST
      ──► Checker (names, arity, locked features, limits, warnings)
      ──► Compiler ──► Bytecode module ──► VM (step-metered, resumable)
```

Every stage is a pure function, apart from the VM's own state. No stage ever calls `eval`, `Function` or `import()`, and **player code never becomes JavaScript**.

## Public API

```ts
// packages/lang/src/index.ts (target shape)
export function compile(source: SourceFiles, opts: CompileOptions): CompileResult;
//   CompileOptions { languageVersion; lockedFeatures: Set<Feature>; hostSignatures: HostSig[]; limits }
//   CompileResult  { ok: true; module: BytecodeModule; warnings } | { ok: false; diagnostics }

export function createVM(module: BytecodeModule, host: HostTable, limits: VMLimits): VM;

interface VM {
  /** Run pure instructions until: a host call needs the world, the program halts,
   *  a runtime error occurs, or `maxCycles` elapse. */
  run(maxCycles: number): VMYield;
  /** Provide the result of the pending host call and continue. */
  resume(value: Value): void;
  readonly cycles: number;        // cycles consumed by this VM so far
  snapshot(): VMSnapshot;         // serializable (debugger timeline, tests)
  static restore(s: VMSnapshot): VM;
}

type VMYield =
  | { kind: 'host'; fn: HostId; args: Value[]; cost: number; atCycle: number }
  | { kind: 'halt'; atCycle: number }
  | { kind: 'error'; error: RuntimeDiagnostic; atCycle: number }
  | { kind: 'budget'; atCycle: number };
```

`lang` doesn't know what `plant` means. `sim` registers a **host table** (name, arity, arg types, cost, whether it touches the world) and handles the yields.

## Lexer

- Produces `INDENT`/`DEDENT`/`NEWLINE` tokens Python-style, using an indentation stack.
- Implicit line joining inside `()`, `[]`, `{}`.
- Every token carries `{line, col, offset, length}` for diagnostics.
- Error recovery: an unknown character becomes an `ERROR` token. The lexer continues, so the editor can show multiple errors.

## Parser

- Hand-written **recursive descent**, which gives the best error messages and is easy to maintain.
- Error recovery: on a bad statement, skip to the next `NEWLINE` at the same indent and keep parsing.
- AST nodes are plain objects with `type` and `span`. A node counter enforces the `AST nodes ≤ 5,000` limit.
- The editor uses a separate **Lezer** grammar for highlighting, folding and auto-indent. The two are kept in sync by a shared test corpus (`packages/lang/__corpus__/*.sprout`).

## Checker

- Resolves names (local / global / builtin), checks arity against `hostSignatures`.
- Rejects `lockedFeatures` (e.g. `while` before Chapter 4) with `E-LOCKED-FEATURE`.
- Static warnings: unreachable code, unused variables, `while True` without `break`/`halt`/action (a pure infinite loop).

## Bytecode

Stack machine, compact `Int32Array` code with a constant pool.

| Group | Ops |
|---|---|
| Stack | `CONST k`, `POP`, `DUP` |
| Vars | `LOAD_LOCAL i`, `STORE_LOCAL i`, `LOAD_GLOBAL i`, `STORE_GLOBAL i` |
| Arith | `ADD SUB MUL FLOORDIV MOD NEG` |
| Compare/logic | `EQ NE LT LE GT GE IN NOT` (`and`/`or` compile to jumps) |
| Control | `JUMP a`, `JUMP_IF_FALSE a`, `JUMP_IF_TRUE_KEEP a`, `JUMP_IF_FALSE_KEEP a` |
| Loops | `ITER_INIT`, `ITER_NEXT a` (range is lazy), `REPEAT_INIT`, `REPEAT_NEXT a` |
| Calls | `CALL argc`, `CALL_HOST id argc`, `RETURN`, `HALT` |
| Data | `BUILD_LIST n`, `BUILD_DICT n`, `INDEX_GET`, `INDEX_SET`, `CALL_METHOD m argc` |
| Debug | `LINE n` (0 cycles; marks statement boundaries for step/breakpoints/cost lens) |

- **1 cycle per op**, except `LINE` (0) and `CALL_HOST`, which costs `1 + host.cost`.
- `ITER_NEXT` over `range` costs 1 per iteration. Over a list it also costs 1.

## VM

- **Value representation:** a tagged union. Small ints are JS numbers checked with `Number.isSafeInteger` after every arithmetic op. Lists and dicts are heap objects with a cell count for the memory limit.
- **Frames:** `{ fnIndex, ip, base, locals[] }`. Max depth 64.
- **Resumable:** the VM is an explicit loop over `ip`, never JS recursion, so it can stop at any instruction and resume later. This enables lockstep scheduling across players, the step debugger, budget cut-off, and running inside a Worker with cooperative time-slicing (the client runs `vm.run(50_000)` per frame chunk).
- **Determinism rules:** no `Math.random`, `Date`, `performance`, float math, or iteration over JS objects with unspecified order (dicts use `Map`, which preserves insertion order).

## Performance target

| Metric | Target |
|---|---|
| Compile 16 KB source | < 10 ms |
| VM throughput (Node, M1-class CPU) | ≥ 30M ops/s |
| Full 8-player × 30k-cycle showdown | < 100 ms server CPU |

These are verified by a benchmark suite in CI (`pnpm bench`). If a regression of more than 20 % appears, the build fails.

## Testing

- **Lexer/parser:** snapshot tests of AST for the corpus. Fuzz with random token streams to make sure nothing throws, only diagnostics.
- **Compiler/VM:** a differential test against CPython for the Python-compatible subset. A generator produces random pure programs (ints, lists, loops, functions), runs them in CPython in CI, and compares outputs. This catches semantic drift such as `%` with negatives or chained comparisons.
- **Limits:** a test per limit that the right error code fires.
