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
// packages/lang/src/index.ts. The checked-in stub is the type source of truth.

export const LANGUAGE_VERSION: string;       // '0.1.0'
export const DEFAULT_LIMITS: Limits;         // the numbers in language-spec §Limits

export interface LangEngine {
  compile(source: SourceFiles, opts: CompileOptions): CompileResult;
  createVM(module: BytecodeModule, limits: Limits): VM;
  restoreVM(snapshot: VMSnapshot): VM;
  readonly values: ValueOps;      // the only way hosts build and inspect Values
}
export function countTokens(source: SourceFiles): number;   // the one token counter (see scoring-and-judging)
export function tokenize(file: SourceFile, limits?: Limits): LexResult;   // editor highlighting fallback, tests, parser input
//   LexResult { tokens: readonly Token[]; diagnostics: readonly Diagnostic[] }
//   Token { kind: TokenKind; text; value?; file; line; col; offset; length }  (kinds: NAME KEYWORD INT STRING OP NEWLINE INDENT DEDENT EOF ERROR)
export const KEYWORDS: ReadonlySet<string>; export const OPERATORS: readonly string[]; export function isCountedToken(kind): boolean;
export function utf8Length(text: string): number;   // maxSourceBytes is measured in UTF-8 bytes without TextEncoder

type SourceFile = { name: string; text: string };
type SourceFiles = readonly SourceFile[];

type CompileOptions = {
  languageVersion: string;
  hostSignatures: readonly HostSignature[];   // per player: host costs are baked from these
  constants: readonly ConstantDef[];
  lockedFeatures: ReadonlySet<Feature>;       // syntax gating (the gating map in curriculum.md)
  lockedNames: ReadonlySet<string>;           // builtin and constant gating by name
  limits: Limits;
};

type CompileResult =
  | { ok: true; module: BytecodeModule; tokenCount: number; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

type HostSignature = {
  id: HostId; name: string;
  params: readonly ValueKind[]; optionalParams?: number;
  returns: ValueKind | 'any';
  cost: number;           // extra cycles on top of the 1-cycle CALL_HOST; the default baked into the bytecode
  touchesWorld: boolean;  // true: the scheduler advances the world to t before applying the call; every CALL_HOST yields regardless, and only `random` is false
  unlock?: { chapter?: number; node?: string };   // campaign gating as fields (chapter that teaches it, skill node that sells it); the editor builds its 🔒 text from them, the checker gates through lockedNames
};
type ConstantDef = { name: string; id: number; group: string };   // e.g. { name: 'RADISH', id: 10, group: 'crop' }
type ValueKind = 'int' | 'bool' | 'none' | 'str' | 'list' | 'dict' | 'function' | 'const';

interface ValueOps {              // Value is opaque outside lang
  int(n: number): Value;  bool(b: boolean): Value;  str(s: string): Value;  constant(id: number): Value;
  readonly none: Value;
  kindOf(v: Value): ValueKind;
  asInt(v: Value): number;  asBool(v: Value): boolean;  asStr(v: Value): string;  asConstantId(v: Value): number;
}

interface VM {
  /** Run instructions until: a host call, the program halts, a runtime error occurs,
   *  or `maxCycles` elapse. EVERY CALL_HOST yields `host` (lang has no host table, so it can
   *  compute no builtin, `random` included); `touchesWorld` only tells the scheduler whether to
   *  advance the world to the call's cycle first. With `stopAtLine`, also yield at the
   *  next statement boundary (debugger Step).
   *  A pure instruction executes only while `remaining >= 1`. A CALL_HOST yields `host` whenever
   *  `remaining >= 1`, regardless of `host.cost`; at `remaining = 0` the VM yields `budget`. */
  run(maxCycles: number, opts?: { stopAtLine?: boolean }): VMYield;
  /** Provide the result of the pending host call and continue. `cost` is the host cost the
   *  scheduler actually applied; when omitted, `yield.cost` is charged. It is charged to
   *  the VM cycle counter, so the counter equals `agent.clock` when the VM runs again. */
  resume(value: Value, cost?: number): void;
  /** The counterpart of `resume` for a host call that failed inside the host (R-BAD-ARG for
   *  wait(0), goto(9, 9), plant(5); R-TYPE for a non-int sell count). The applied cost (default:
   *  the baked cost) is charged; the next run() yields `{ kind: 'error' }` with the pending
   *  CALL_HOST's source range, and the drone is finished like any runtime error. */
  raise(error: { code: string; message: string }, cost?: number): void;
  readonly cycles: number;        // cycles consumed by this VM so far
  readonly output: readonly string[];  // the first maxPrintLines lines print wrote
  readonly droppedLines: number;  // lines dropped after those (the Output panel's notice)
  snapshot(): VMSnapshot;         // serializable, self-contained (debugger timeline, tests)
}

type VMSnapshot = { readonly __brand: 'VMSnapshot'; readonly languageVersion: string };  // opaque outside lang

type VMYield =
  // atCycle: the clock after argument evaluation and after the 1-cycle CALL_HOST base.
  // cost: the baked host.cost only; it excludes the base cycle.
  | { kind: 'host'; fn: HostId; args: readonly Value[]; cost: number; atCycle: number }
  | { kind: 'line'; file: string; line: number; atCycle: number }   // only with stopAtLine
  | { kind: 'halt'; atCycle: number }
  | { kind: 'error'; error: Diagnostic; atCycle: number }  // runtime diagnostics use the same shape, R- codes
  | { kind: 'budget'; atCycle: number };
```

`Feature` (the syntax gating union), `Limits` (with `DEFAULT_LIMITS`), `Diagnostic` and `Span` are as in the stub; their values are owned by [curriculum](../02-language/curriculum.md#feature-gating-map-normative), [language-spec](../02-language/language-spec.md#limits-hard-enforced-by-the-compilervm) and [errors-and-diagnostics](../02-language/errors-and-diagnostics.md).

`lang` doesn't know what `plant` means. `sim` passes **host signatures** (name, arity, arg types, cost, whether the world must be advanced before the call) and game constants to `compile`; the compiler bakes each builtin's id, cycle cost and world-touching flag into its `CALL_HOST` operands. A module, and therefore a `VMSnapshot`, is self-contained: `createVM` needs only the module and the limits, and `restoreVM` needs only the snapshot. Host costs are therefore fixed at compile time, and per-player cost differences (campaign drone upgrades) are expressed by compiling each player's program with that player's own `hostSignatures`. `sim` handles the `host` yields itself.

`HostSignature.cost` is the static default. Some calls cost something else on the day: `wait(n)` costs `n`, `goto` costs `move` cost × wrapped distance, and a failed `plant`, `harvest`, `till`, `water` or `refill` costs 5. `sim` works the real cost out from the arguments and the world and passes it to `resume(value, cost)`; `lang` never sees the farm.

**Yield clock arithmetic.** `atCycle` in a `host` yield is the VM's cycle counter **after** the 1-cycle `CALL_HOST` base has been charged (the cycle at which the action starts). `cost` is `host.cost` only, without that base cycle, and `sim` sets `agent.clock = atCycle + the applied cost`. The scheduler side of this is in [simulation-engine](simulation-engine.md#clock-arithmetic-normative).

## Lexer

- Hand-written, with no regular expressions (lint-enforced), so tokenisation is deterministic and exactly meterable.
- Produces `INDENT`/`DEDENT`/`NEWLINE` tokens Python-style, using an indentation stack.
- Implicit line joining inside `()`, `[]`, `{}`.
- Every token carries `{line, col, offset, length}` for diagnostics.
- Error recovery: an unknown character becomes an `ERROR` token. The lexer continues, so the editor can show multiple errors.
- Division of labour with the parser: the lexer reports only lexical problems (`E-SRC-TOO-BIG`, `E-IDENT-TOO-LONG`, `E-LEADING-ZERO`, `E-INT-TOO-BIG`, `E-UNTERMINATED-STRING`, `E-STRING-TOO-LONG`, `E-BAD-ESCAPE`, `E-UNEXPECTED-CHAR`, and `E-MIXED-INDENT` for a dedent to a level no enclosing block used). An unexpected `INDENT` (a block body indented without a `:` line), `E-BAD-INDENT`, `E-SLASH-DIVISION` (the lexer emits `/` and `/=` as operators), juxtaposed tokens such as `12abc`, `1.5` (`INT . INT`) or `**` (`* *`), and an unclosed bracket at EOF are the parser's to report.
- Tabs: a tab always counts as 4 columns of indentation, even after spaces (`" \t"` is width 5); the spec's "tab = 4" is literal, not Python's tab stops. Column numbers count UTF-16 code units, so a tab is one column.

## Parser

- Hand-written **recursive descent**, which gives the best error messages and is easy to maintain.
- Error recovery: on a bad statement, skip to the next `NEWLINE` at the same indent and keep parsing.
- AST nodes are plain objects with `type` and `span`. A node counter enforces the `AST nodes ≤ 5,000` limit.
- The editor uses a separate **Lezer** grammar for highlighting, folding and auto-indent. The two are kept in sync by a shared test corpus (`packages/lang/__corpus__/*.sprout`).

## Checker

- Resolves names (local / global / builtin), checks arity against `hostSignatures`.
- Rejects `lockedFeatures` (syntax, e.g. `while` before Chapter 4) and references to `lockedNames` (builtins and constants, e.g. `sell` before Chapter 8) with `E-LOCKED-FEATURE`, which takes precedence over `E-UNKNOWN-NAME`. The `Feature` list is the gating map in [curriculum](../02-language/curriculum.md#feature-gating-map-normative).
- Multi-file programs: the compiler merges every file into one program (one global namespace) that runs every file except `main.sprout` in tab order, then `main.sprout` last, as in [language-spec](../02-language/language-spec.md#files). The checker reports `E-DUPLICATE-DEF` (the same function name in two files), `E-TOO-MANY-FILES` (over the limit) and the warning `W-USE-BEFORE-DEF` (a top-level call above its `def`).
- Static warnings: unreachable code, unused variables, and `W-PURE-INFINITE-LOOP`: a `while True` whose body, directly or through any user function it calls (transitively over the static call graph), contains no `break` that exits this loop, `return`, `halt()`, action call or sensor call. The check is transitive on purpose: the recommended starter program's main loop does its work inside `tend()` and `sweep()`, and must not warn.

## Bytecode

Stack machine, compact `Int32Array` code with a constant pool.

| Group | Ops |
|---|---|
| Stack | `CONST k`, `POP`, `DUP`, `SWAP`, `ROT3` (top three `a b c` become `c a b`), `DUP2` (duplicates the top two) |
| Vars | `LOAD_LOCAL i`, `STORE_LOCAL i`, `LOAD_GLOBAL i`, `STORE_GLOBAL i` |
| Arith | `ADD SUB MUL FLOORDIV MOD NEG` |
| Compare/logic | `EQ NE LT LE GT GE IN NOT` (`and`/`or` compile to jumps) |
| Control | `JUMP a`, `JUMP_IF_FALSE a`, `JUMP_IF_TRUE_KEEP a`, `JUMP_IF_FALSE_KEEP a` |
| Loops | `ITER_INIT k` (`k = 0`: the iterable is on the stack; `k = 1..3`: that many `range` arguments, so `range` is lazy and never a value), `ITER_NEXT a`, `REPEAT_INIT`, `REPEAT_NEXT a` |
| Calls | `CALL argc`, `CALL_HOST id argc cost touchesWorld`, `CALL_INTRINSIC id argc`, `RETURN`, `HALT` |
| Data | `BUILD_LIST n`, `BUILD_DICT n`, `INDEX_GET`, `INDEX_SET`, `CALL_METHOD m argc` |
| Debug | `LINE s` (0 cycles; marks statement boundaries for step/breakpoints/cost lens; `s` indexes the module's statement table of file, line and span) |

**Module layout.** One `Int32Array` holds the code: an opcode word followed by its operand words. Function 0 is the module body (every file's top level, in run order); each other function records its name, arity, local-slot count, entry pc and file. The constant pool holds ints, strings (pinned literals, no heap cells), `True`/`False`/`None`, function indices and game constant ids. Globals are numbered in the scope resolver's slot order. Debug tables stay off the hot path: the statement table for `LINE`, a span per instruction that can fail, and the plain variable names of operands where a message can name them. A `VMSnapshot` carries the module, so it is self-contained.

**Compilation rules the VM relies on** (the player-facing behaviour is in [language-spec](../02-language/language-spec.md)):

- `ITER_INIT` over a `list` iterates **by index** and re-reads the length on every `ITER_NEXT`, so appended elements are visited and popped ones shrink the loop. Over a `str` it yields 1-unit strings. Over a `dict` it copies the key list when the loop starts ([Iteration](../02-language/language-spec.md#iteration)).
- `and` / `or` compile to `JUMP_IF_FALSE_KEEP` / `JUMP_IF_TRUE_KEEP`, which leave the deciding operand on the stack, so they return an operand, not a bool. `NOT` always yields a bool. Only `0`, `None`, `""`, `[]`, `{}` and `False` are falsy ([Truthiness](../02-language/language-spec.md#truthiness-and-and--or)).
- `def` compiles to a function constant plus `STORE_GLOBAL`, executed in program order, so calling a function before its `def` has run is `R-UNBOUND-GLOBAL`.
- A name assigned anywhere in a `def` body (and not declared `global`) is a local slot for the whole body. Reading an empty slot is `R-UNBOUND-LOCAL` ([Scoping](../02-language/language-spec.md#scoping)).
- A chained comparison evaluates each middle operand once: `a < b < c` is `a, b, DUP, ROT3, LT, JUMP_IF_FALSE_KEEP Lf, c, LT, JUMP Le; Lf: SWAP, POP; Le:`. `JUMP_IF_FALSE_KEEP` pops the `True` itself when it does not jump, so the true path needs no `POP`.
- `a[i] op= v` evaluates `a` and `i` once: `a, i, DUP2, INDEX_GET, v, op, INDEX_SET`. `x op= v` is `LOAD x, v, op, STORE x`.
- `x not in y` is `IN` then `NOT`: 2 base cycles plus the `IN` surcharge.
- Language intrinsics (`len`, `abs`, `min`, `max`, `str`, `int`, `print`) compile to `CALL_INTRINSIC`, which never yields. Host builtins compile to `CALL_HOST` with the baked `cost` and `touchesWorld` operands, and every `CALL_HOST` yields, `halt()` included.

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
| `ITER_INIT 0` over a `dict` (takes the key snapshot) | 1 + len(dict) |
| `ITER_INIT 0` over a `list` or `str`; `ITER_INIT 1..3` over a `range` | 1. For `range` this is the stdlib's "1 for the call": there is no separate call cycle. Non-int `range` arguments or a step of 0 are `R-BAD-ARG` here |
| `ITER_NEXT` (every iterable kind) | 1 per call, including the final call that ends the loop |
| `INDEX_GET`, `INDEX_SET` | 1 |
| `CALL_HOST` | 1 here (the call). The builtin's `host.cost` is added by `sim`: `agent.clock = atCycle + the applied cost` (see [Clock arithmetic](simulation-engine.md#clock-arithmetic-normative)). `halt()` has `host.cost` 0, so it costs 1 in total |
| `CALL_INTRINSIC` | 1 here (the call), plus the intrinsic's cost from the stdlib and the builtin rows below (`len(x)` is 2 in total). It never yields |
| `CALL_METHOD` | 1 here (the call), plus the method's cost from the builtin rows below |
| every other op (`CONST`, `POP`, `DUP`, `SWAP`, `ROT3`, `DUP2`, loads, stores, int `ADD SUB MUL FLOORDIV MOD`, `NEG`, `NOT`, `LT LE GT GE`, `EQ`/`NE` on scalars, jumps, `REPEAT_*`, `CALL`, `RETURN`, `HALT`) | 1 |

**Structural `==` surcharge.** For two `list`s or two `dict`s of different length the surcharge is 0 (the length check is part of the base cycle). Otherwise visit the pairs in order (list: index order; dict: the left operand's insertion order, looking each key up in the right operand) and **stop at the first pair that differs**. Each pair visited costs 1, plus the surcharge of comparing its two members: `min(len, len)` for two `str`s, the same rule recursively for nested `list`/`dict`, and 0 for scalars. A missing key counts as the differing pair.

**Loop exits.** `ITER_NEXT` and `REPEAT_NEXT` pop their own iterator or counter when the loop ends normally. `break` in a `for` or `repeat` loop is `JUMP` + `POP` (2 cycles); in a `while` loop it is `JUMP` (1). `continue` is `JUMP` (1). `RETURN` discards the whole frame, iterators included, at no extra cost.

**Argument-dependent builtins and methods.** These costs are added to the 1-cycle call (`CALL_HOST`, `CALL_INTRINSIC` or `CALL_METHOD`). Fixed builtin costs stay in the stdlib table; only the costs that depend on the arguments are defined here:

| Call | Cost (on top of the call cycle) |
|---|---|
| `min(lst)`, `max(lst)` (single-list form) | 1 + len(lst) |
| `lst.pop(i)` | 1 + number of elements after index `i` that shift left (a negative `i` is normalised first); `lst.pop()` shifts none, so 1 |
| `str(x)` | 1 + len(result) |
| `int(s)` | 1 + len(s); `int(x)` for an int or bool: 1 |
| `print(…)` | 1 + len(printed line) |
| `wait(n)` | `n` (1 ≤ n ≤ 5,000) |
| `goto(x, y)` | `move` cost × wrapped Manhattan distance (see standard-library) |

`wait` and `goto` are the rows where the real cost differs from the static `HostSignature.cost` baked into the module: `sim` computes it from the arguments and passes it to `resume(value, cost)` ([Public API](#public-api)). [standard-library](../02-language/standard-library.md) points here for these costs.

**Atomic ops.** An op starts only while at least 1 cycle of budget remains, and is then charged in full, surcharge included. A run can therefore end a few cycles past `maxCycles`; `sim` clamps world time to the budget. A failed op (a limit or type error) charges only its base cycle, because limits are checked before any element is copied.

Costs never depend on wall-clock time or on the host machine. Changing any row changes simulation output, so it bumps `RULES_VERSION` (see [standards](../09-engineering/standards.md)).

## VM

- **Value representation:** a tagged union. Small ints are JS numbers checked with `Number.isSafeInteger` after every arithmetic op. Lists, dicts and strings are heap objects counted against `maxHeapCells` (see **Heap accounting**).
- **Type semantics** (`bool` is a subtype of `int`; structural `==` on lists and dicts; ordering only for `int`/`bool` against `int`/`bool` and `str` against `str`, anything else `R-TYPE`) are defined in [language-spec](../02-language/language-spec.md#type-interactions). The VM implements them exactly and raises the runtime codes listed in [errors-and-diagnostics](../02-language/errors-and-diagnostics.md).
- **Heap accounting (normative):** how many cells each kind of value costs is defined once, in [language-spec](../02-language/language-spec.md) §Limits ("Heap cells"). **Reclamation uses reference counts:** a value's cells are released the moment its last reference goes away (an operand-stack slot popped, a local or global overwritten, a frame returned, or the container holding it released or the element removed by `pop`). There is no tracing collector. **Reference cycles are never reclaimed** (`a.append(a)` keeps both counted for the rest of the run); that is documented behaviour, not a bug. An operation that would take the live count above `maxHeapCells` raises `R-OUT-OF-MEMORY` before it allocates, and the live count is part of `VMSnapshot`. So a loop that builds a small list per iteration and drops it never trips the limit, while one that keeps every list does at a fixed, reproducible iteration.
- **Frames:** `{ fnIndex, ip, base, locals[] }`. Max depth 64.
- **Resumable:** the VM is an explicit loop over `ip`, never JS recursion, so it can stop at any instruction and resume later. This enables lockstep scheduling across players, the step debugger, budget cut-off, and running inside a Worker with cooperative time-slicing (the client runs `vm.run(50_000)` per frame chunk).
- **Determinism rules:** no `Math.random`, `Date`, `performance`, float math, or iteration over JS objects with unspecified order (dicts use `Map`, which preserves insertion order).
- **Snapshots.** `snapshot()` returns a plain, JSON-serialisable record headed by a format word (`sprout-vm-snapshot`), a format version and a kind (`single` in M0). It carries the module, the limits and the whole machine: stack (loop iterators included), frames, globals, printed output, the pending host call if any, and every reachable heap object written once by id, so shared objects and cycles come back as one object. The live-cell count is stored as a number because leaked cycles still count. `restoreVM` checks the format word, version and kind, validates the module, and rebuilds a machine whose next snapshot is identical and whose run continues exactly as the original's would.
- **Second drone (planned, M2; backlog LANG-05.6).** `LangEngine.spawnVM(parent: VM, fn: Value): VM` will create a VM over the same module with its own frames and stack that **shares the parent's globals and heap** (one program, one namespace; [standard-library](../02-language/standard-library.md) §Second drone: one heap and one set of limits per player). It starts with a zero-argument call to `fn` and halts when that call returns. A snapshot is then taken per program (the parent and its spawned child as one unit) so a shared heap is never duplicated; the snapshot format carries a kind/version word so that per-program snapshots can be added without breaking M0 ones. Not implemented in M0: `spawn` is campaign-only (D-24), showdowns compile it as `E-LOCKED-FEATURE`, and the host table rejects it.

## Performance target

| Metric | Target |
|---|---|
| Compile 16 KB source | < 10 ms |
| VM throughput (Node, M1-class CPU) | ≥ 30M ops/s |
| Full 8-player × 30k-cycle showdown | < 100 ms server CPU (CI ceiling; expected ≈ 10 ms, since the cycle budget caps it at 240,000 costed instructions; the 2 s worker kill switch is a ~20× backstop) |

These are verified by a benchmark suite in CI (`pnpm bench`). If a regression of more than 20 % appears, the build fails.

## Testing

- **Lexer/parser:** snapshot tests of AST for the corpus. Fuzz with random token streams to make sure nothing throws, only diagnostics.
- **Compiler/VM:** a differential test against CPython for the Python-compatible subset. A generator produces random pure programs, runs them in CPython in CI, and compares outputs. This catches semantic drift such as `%` with negatives or chained comparisons. The subset is:
  - **Included:** int arithmetic and comparisons; `bool`; `str` with `+ * == in len`; `list` with `+ * == in len append pop index`; `dict` with `get`, `[]`, `in`, `len` and `for` (no mutation inside the loop); `range`; `if` / `while` / `for` / `def` / `return` / `break` / `continue` / `global`; `print`.
  - **Excluded:** `repeat`, game constants, host calls, `x += list` aliasing (Sprout builds a new list, Python extends in place), dict mutation during iteration (Sprout allows it, Python raises), and non-ASCII strings. The generator emits ASCII only because Sprout counts UTF-16 units and CPython counts code points.
- **Limits:** a test per limit that the right error code fires, including `R-OUT-OF-MEMORY` after a dropped-list loop (must pass) and after a kept-list loop (must fire at the same iteration every run).
- **Costs:** one golden test per row of the op-cost table asserts the exact cycle count, including the boundaries (empty list, match at the first and last element, first-pair difference in `==`, count below 1 in `*`).
