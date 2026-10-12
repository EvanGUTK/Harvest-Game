# Testing Policy

## Levels

| Level | Tool | Where | Must cover |
|---|---|---|---|
| Unit | Vitest | beside source | every exported function with behaviour; every diagnostic code; every limit |
| Golden | Vitest + `__golden__/` | `lang`, `sim` | program + seed → expected hash. `lang` goldens: FNV-1a over `str()` of every global plus the print output. `sim` goldens: `finalStateHash` plus the event count (see simulation-engine.md §State hash) |
| Cross-engine determinism | Playwright (Chromium, Firefox, WebKit) + Node | `sim` | golden hashes identical in all four engines (browsers installed with `pnpm exec playwright install --with-deps chromium firefox webkit`) |
| Differential | nightly CI | `lang` | random Python-subset programs vs CPython output (pinned CPython 3.12) |
| Property/fuzz | Vitest + fast-check | `lang` | lexer/parser never throw; compile(valid) ok |
| Integration | Vitest | `server` | room phase machine, matchmaker windows, ledger transactions (against the Neon `ci` branch via `DATABASE_URL_CI`; runs are serialised by the `ci-db` concurrency group) |
| E2E | Playwright | `web` | sign-in (test OTP, see [environments-and-ci](../06-infrastructure/environments-and-ci.md)), landing age gate, contract 1-1, two-browser showdown; seed accounts from `pnpm db:seed:e2e` |
| Benchmark | Vitest bench | `lang`, `sim` | VM ops/s, showdown ms; CI fails on >20 % regression |

## Rules

- A bug fix starts with a failing test that reproduces it.
- No test is ever skipped, `.only`-ed, or deleted to go green. Fix the code or fix the test with a justification in the commit.
- Tests assert behaviour, not implementation. Testing a private helper directly is a smell; export it only if it's a real unit.
- Golden hashes change only with a `RULES_VERSION` or `LANGUAGE_VERSION` bump, in the same commit, with the reason.
- Engine tests and benches in `lang` and `sim` (`*.test.ts`, `*.bench.ts`) obey the same global and property purity bans as the engine, because they run unchanged in Node, Chromium, Firefox and WebKit: no Node APIs, no `process`, no `Date`, no `Math.random`. They may use regex, `/` and `**` in assertions (`eslint.config.js` already behaves this way).
- Golden fixtures are TypeScript modules under `__golden__/` (`export const cases = [...]`), never files read at runtime.
- Vitest projects are the package directories (`packages/*`, `apps/*`; `tools/*` is added with the first tool package). `passWithNoTests` exists only for the empty skeleton and is removed in LANG-01.
- Coverage is a signal, not a target. The target is: every design-doc rule has at least one test naming it (`it('wraps at east edge (farm-simulation.md §Grid)')`).

## Sim goldens: scripted scenarios (SIM-08)

A `sim` golden has two kinds. The **program** kind (program + seed → hashes) needs the scheduler and arrives in slice 2. The **scripted** kind needs only the world, market and hash primitives and is what exists today: a scenario is a seed, the match settings (grid, budget, starting credits, water and moisture range, `moistureDecay`, `sharedMarket`), an optional `market` object that shadows `content`'s market numbers for that scenario (the rules variant), and a list of **timed host calls** per slot: `move`, `plant`, `harvest`, `till`, `water`, `refill`, `sell`. A call is `{ t, slot, call, … }` where `t` is its start cycle; tile calls apply where that slot's drone stands (it starts on the well `(0,0)` and only `move` changes it).

The driver (`packages/sim/src/golden/scripted.ts`) plays the calls in time order with the normative tie-break ([simulation-engine.md §Tie-break](../03-architecture/simulation-engine.md)), emits a hash for every multiple of 1,000 before any call at or after it, advances to the budget, liquidates, and hashes again. A call may not start before its slot's previous call has finished (`SIM-BAD-SCRIPT`). Drones are `running` during the script and `halted` in the final hash; there is one drone per slot.

A scripted golden is `{ hashes, finalStateHash, eventCount }`: `hashes` are the `hash` events in order (when the budget is a multiple of 1,000 the last is the final hash), and `eventCount` is fixed at 0 because the scripted kind runs without the scheduler's event log; slice 2 fills it from the real engine.

Files, in `packages/sim/src/__golden__/`: `cases.ts` (`export const cases = [...]`, the scenarios, hand-written) and `expected.ts` (the goldens keyed by case name, **generated**). `pnpm test` compares a fresh run of every case with `expected.ts` and fails on any difference; it never rewrites it. To change a golden on purpose (a `RULES_VERSION` bump, with the reason in the commit), run `pnpm golden:update`, review the diff of `expected.ts` and commit it.

## Naming

`describe('<unit>')` → `it('<does X when Y>')`. Use glossary terms.
