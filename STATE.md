# STATE.md: session handoff

> Updated at the end of every session by `/handoff`. Newest first. Keep "Now" accurate and short; move finished items to "Done".

## Now

- **Phase:** Architecture complete. Engineering scaffolding complete. **M0 (Foundations) is ready to start.**
- **Branch:** `claude/sleepy-gauss-gxgilk` (all work so far). Main is empty apart from the initial commit. Merge to `main` when Evan has reviewed the docs.
- **Blocking decisions:** none. All 22 items in `docs/00-overview/decisions-needed.md` have assumed defaults; the docs are written against those defaults.
- **Owner inputs still needed (not blocking M0):** domain name; Google OAuth app; Resend account verified domain; Neon project; Render workspace. All needed by M2.

## Next steps (in order)

1. **LANG-01 Lexer** in `packages/lang/src/lexer/`: tokens with spans, INDENT/DEDENT stack, implicit line joining, error tokens. Tests: corpus snapshots + fuzz (never throws).
2. **LANG-02 Parser**: recursive descent per `docs/02-language/language-spec.md` grammar, recovery to next statement, fix-it diagnostics (`E-MISSING-COLON`, `E-ASSIGN-IN-IF`, `E-SLASH-DIVISION`).
3. **LANG-03 Checker**, **LANG-04 Compiler**, **LANG-05 VM** (resumable `run`/`resume`, host yields).
4. **SIM-01..07** world, host table, scheduler, market, PRNG, event log, scoring.
5. **SIM-08** golden tests + Playwright cross-engine determinism; **CNT-03** three bot programs; **SIM-BAL** balance harness.
6. M0 exit check (see `docs/07-roadmap/milestones.md`), then `/handoff` and open M1.

## Known gaps / debt

- `packages/*/src/index.ts` are **interface stubs** with brand types; `LangEngine` and `Simulation` have no implementation.
- `packages/protocol` has TypeScript types only; zod schemas arrive in M3 (SRV-04).
- `packages/db` is an empty placeholder until M2.
- `tools/` are documented but not created (first: `tools/run`, `tools/balance` in M0).
- `assets/` is empty apart from the manifest header.
- CI runs typecheck + lint + test only; determinism/bench/asset workflows arrive with the code they test.

## Done

### Session 1 (2026-10-07, cloud)
- Research: prior art (The Farmer Was Replaced), hosting (Render free-tier spin-down, ChatGPT Sites runtime), Neon pricing, Better Auth + Resend, CC0 asset sources.
- 55 docs under `docs/` covering design, language, architecture, art/audio, UX, infra, roadmap, legal, 7 ADRs, archived original concept.
- pnpm workspace, strict TS project references, typed stubs for `lang`, `sim`, `content`, `protocol`, `db`.
- Engineering scaffolding: ESLint (purity + boundary rules), Prettier, Vitest, `pnpm check`, CI, `.claude/` agents, skills, settings, `docs/09-engineering/`.
