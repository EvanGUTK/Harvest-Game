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

## Naming

`describe('<unit>')` → `it('<does X when Y>')`. Use glossary terms.
