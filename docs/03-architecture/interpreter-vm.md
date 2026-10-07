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
// packages/lang/src/index.ts (mirrors the checked-in stub; the stub is the type source of truth)
export interface LangEngine {
  compile(source: SourceFiles, opts: CompileOptions): CompileResult;
  createVM(module: BytecodeModule, limits: Limits): VM;
  restoreVM(snapshot: VMSnapshot): VM;
  readonly values: ValueOps;      // the only way hosts build and inspect Values
}
//   CompileOptions { languageVersion; lockedFeatures: ReadonlySet<Feature>; hostSignatures: readonly HostSignature[];
//                    constants: readonly ConstantDef[]; limits: Limits }
//   CompileResult  { ok: true; module: BytecodeModule; tokenCount; warnings: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] }

interface VM {
  /** Run pure instructions until: a host call needs the world, the program halts,
   *  a runtime error occurs, or `maxCycles` elapse. With `stopAtLine`, also yield at the
   *  next statement boundary (debugger Step). */
  run(maxCycles: number, opts?: { stopAtLine?: boolean }): VMYield;
  /** Provide the result of the pending host call and continue. */
  resume(value: Value): void;
  readonly cycles: number;        // cycles consumed by this VM so far
  snapshot(): VMSnapshot;         // serializable, self-contained (debugger timeline, tests)
}

type VMSnapshot = { readonly __brand: 'VMSnapshot'; readonly languageVersion: string };  // opaque outside lang

type VMYield =
  | { kind: 'host'; fn: HostId; args: readonly Value[]; cost: number; atCycle: number }
  | { kind: 'line'; line: number; atCycle: number }        // only with stopAtLine
  | { kind: 'halt'; atCycle: number }
  | { kind: 'error'; error: Diagnostic; atCycle: number }  // runtime diagnostics use the same shape, R- codes
  | { kind: 'budget'; atCycle: number };
```

`lang` doesn't know what `plant` means. `sim` passes **host signatures** (name, arity, arg types, cost, whether it touches the world) and game constants to `compile`; the compiler bakes each builtin's id, cycle cost and world-touching flag into its `CALL_HOST` operands. A module, and therefore a `VMSnapshot`, is self-contained: `createVM` needs only the module and the limits, and `restoreVM` needs only the snapshot. Per-player cost differences (campaign drone upgrades) are expressed by compiling each player's program with that player's signatures. `sim` handles the `host` yields itself.

**Yield clock arithmetic.** `atCycle` in a `host` yield is the VM's cycle counter **after** the 1-cycle `CALL_HOST` base has been charged (the cycle at which the action starts). `cost` is `host.cost` only, without that base cycle, and `sim` sets `agent.clock = atCycle + host.cost`. The scheduler side of this is in [simulation-engine](simulation-engine.md).

## Lexer

- Hand-written, with no regular expressions (lint-enforced), so tokenisation is deterministic and exactly meterable.
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
- Static warnings: unreachable code, unused variables, and `W-PURE-INFINITE-LOOP`: a `while True` whose body, directly or through any user function it calls (transitively over the static call graph), contains no `break` that exits this loop, `return`, `halt()`, action call or sensor call. The check is transitive on purpose: the recommended starter program's main loop does its work inside `tend()` and `sweep()`, and must not warn.

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

### Op cost table (normative, single source of truth)

World time is cycles, so every implementation must charge exactly these costs. [language-spec](../02-language/language-spec.md) says which operations are legal and [standard-library](../02-language/standard-library.md) lists the fixed cost of each builtin; neither overrides this table. Every op costs **1 cycle** unless a row says otherwise. A **surcharge** is extra cycles on top of that 1, counted in the unit named in the row.

| Op | Cycles |
|---|---|
| `LINE` | 0 |
| `ADD` on `str` + `str`, or `list` + `list` | 1 + len(result) |
| `MUL` repetition (`str` × int, `list` × int, either order) | 1 + len(result) (a count below 1 gives an empty result, so 1) |
| `EQ` / `NE` on `str` | 1 + min(len(a), len(b)) |
| `EQ` / `NE` on `list` or `dict` | 1 + the surcharge defined below |
| `IN` on `list` | 1 + for each element compared, in order, up to and including the first match (all of them if none matches): 1 + that element-vs-needle comparison's surcharge. For ints, bools, `None` and constants that is exactly 1 per element |
| `IN` on `str` | 1 + len(haystack) |
| `IN` on `dict` | 1 |
| `BUILD_LIST n`, `BUILD_DICT n` | 1 + n (`n` elements, or `n` key/value entries) |
| `ITER_INIT` over a `dict` (takes the key snapshot) | 1 + len(dict) |
| `ITER_INIT` over a `range`, `list` or `str` | 1 |
| `ITER_NEXT` (every iterable kind) | 1 per call, including the final call that ends the loop |
| `INDEX_GET`, `INDEX_SET` | 1 |
| `CALL_HOST` | 1 here (the call). The builtin's `host.cost` is added by `sim`: `agent.clock = atCycle + host.cost`. `halt()` has `host.cost` 0, so it costs 1 in total |
| `CALL_METHOD` | 1 here (the call), plus the method's cost from the builtin rows below |
| every other op (`CONST`, `POP`, `DUP`, loads, stores, int `ADD SUB MUL FLOORDIV MOD`, `NEG`, `NOT`, `LT LE GT GE`, `EQ`/`NE` on scalars, jumps, `REPEAT_*`, `CALL`, `RETURN`, `HALT`) | 1 |

**Structural `==` surcharge.** For two `list`s or two `dict`s of different length the surcharge is 0 (the length check is part of the base cycle). Otherwise visit the pairs in order (list: index order; dict: the left operand's insertion order, looking each key up in the right operand) and **stop at the first pair that differs**. Each pair visited costs 1, plus the surcharge of comparing its two members: `min(len, len)` for two `str`s, the same rule recursively for nested `list`/`dict`, and 0 for scalars. A missing key counts as the differing pair.

**Argument-dependent builtins and methods.** These costs are added to the 1-cycle call (`CALL_HOST` or `CALL_METHOD`). Fixed builtin costs stay in the stdlib table; only the costs that depend on the arguments are defined here:

| Call | Cost (on top of the call cycle) |
|---|---|
| `min(lst)`, `max(lst)` (single-list form) | 1 + len(lst) |
| `lst.pop(i)` | 1 + number of elements after index `i` that shift left (a negative `i` is normalised first); `lst.pop()` shifts none, so 1 |
| `str(x)` | 1 + len(result) |
| `int(s)` | 1 + len(s) |
| `print(…)` | 1 + len(printed line) |
| `wait(n)` | `n` (1 ≤ n ≤ 5,000) |
| `goto(x, y)` | `move` cost × wrapped Manhattan distance (see standard-library) |

**Atomic ops.** An op starts only while at least 1 cycle of budget remains, and is then charged in full, surcharge included. A run can therefore end a few cycles past `maxCycles`; `sim` clamps world time to the budget. A failed op (a limit or type error) charges only its base cycle, because limits are checked before any element is copied.

Costs never depend on wall-clock time or on the host machine. Changing any row changes simulation output, so it bumps `RULES_VERSION` (see [standards](../09-engineering/standards.md)).

## VM

- **Value representation:** a tagged union. Small ints are JS numbers checked with `Number.isSafeInteger` after every arithmetic op. Lists, dicts and strings are heap objects counted against `maxHeapCells` (see **Heap accounting**).
- **Type semantics** (`bool` is a subtype of `int`; structural `==` on lists and dicts; ordering only for `int`/`bool` against `int`/`bool` and `str` against `str`, anything else `R-TYPE`) are defined in [language-spec](../02-language/language-spec.md#type-interactions). The VM implements them exactly and raises the runtime codes listed in [errors-and-diagnostics](../02-language/errors-and-diagnostics.md).
- **Heap accounting (normative):** how many cells each kind of value costs is defined once, in [language-spec](../02-language/language-spec.md) §Limits ("Heap cells"). **Reclamation uses reference counts:** a value's cells are released the moment its last reference goes away (an operand-stack slot popped, a local or global overwritten, a frame returned, or the container holding it released or the element removed by `pop`). There is no tracing collector. **Reference cycles are never reclaimed** (`a.append(a)` keeps both counted for the rest of the run); that is documented behaviour, not a bug. An operation that would take the live count above `maxHeapCells` raises `R-OUT-OF-MEMORY` before it allocates, and the live count is part of `VMSnapshot`. So a loop that builds a small list per iteration and drops it never trips the limit, while one that keeps every list does at a fixed, reproducible iteration.
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
- **Limits:** a test per limit that the right error code fires, including `R-OUT-OF-MEMORY` after a dropped-list loop (must pass) and after a kept-list loop (must fire at the same iteration every run).
- **Costs:** one golden test per row of the op-cost table asserts the exact cycle count, including the boundaries (empty list, match at the first and last element, first-pair difference in `==`, count below 1 in `*`).
