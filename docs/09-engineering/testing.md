# Testing Policy

## Levels

| Level | Tool | Where | Must cover |
|---|---|---|---|
| Unit | Vitest | beside source | every exported function with behaviour; every diagnostic code; every limit |
| Golden | Vitest + `__golden__/` | `lang`, `sim` | program + seed → expected final state hash and event count |
| Cross-engine determinism | Playwright (Chromium, Firefox, WebKit) + Node | `sim` | golden hashes identical in all four engines |
| Differential | nightly CI | `lang` | random Python-subset programs vs CPython output |
| Property/fuzz | Vitest + fast-check | `lang` | lexer/parser never throw; compile(valid) ok |
| Integration | Vitest | `server` | room phase machine, matchmaker windows, ledger transactions (against a Neon branch) |
| E2E | Playwright | `web` | sign-in, contract 1-1, two-browser showdown |
| Benchmark | Vitest bench | `lang`, `sim` | VM ops/s, showdown ms; CI fails on >20 % regression |

## Rules

- A bug fix starts with a failing test that reproduces it.
- No test is ever skipped, `.only`-ed, or deleted to go green. Fix the code or fix the test with a justification in the commit.
- Tests assert behaviour, not implementation. Testing a private helper directly is a smell; export it only if it's a real unit.
- Golden hashes change only with a `RULES_VERSION` or `LANGUAGE_VERSION` bump, in the same commit, with the reason.
- Coverage is a signal, not a target. The target is: every design-doc rule has at least one test naming it (`it('wraps at east edge (farm-simulation.md §Grid)')`).

## Naming

`describe('<unit>')` → `it('<does X when Y>')`. Use glossary terms.
