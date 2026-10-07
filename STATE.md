# STATE.md: session handoff

> Updated at the end of every session by `/handoff`. Newest first. Keep "Now" accurate and short; move finished items to "Done".

## Now

- **Phase:** Architecture complete. Engineering scaffolding complete. **M0 (Foundations) is ready to start.**
- **Branch:** `claude/sleepy-gauss-gxgilk` (all work so far). Main is empty apart from the initial commit. Merge to `main` when Evan has reviewed the docs.
- **Blocking decisions:** none for the design: all 28 items in `docs/00-overview/decisions-needed.md` have assumed defaults, and the docs are written against those defaults. D-22 defaults to "Start M0 now" pending the owner's tick. **Before M0 code:** the owner accepts ADR-0001, 0002 and 0003 (all seven ADRs are still `proposed`) and ticks D-02, D-03, D-04, D-06, D-07, D-17, D-18 and D-20, the rows that M0 content values depend on.
- **Owner inputs:** the single checklist of accounts, credentials, DNS records, OAuth settings, CI secrets and repo settings is [`docs/06-infrastructure/connections.md`](docs/06-infrastructure/connections.md). No account or credential blocks M0 code, but set the GitHub repo settings (branch protection on `main` with the `ci` workflow's `check` job required, secret scanning, Dependabot) before the first merge to `main`. The rest is needed by M2, or later where the checklist says so. Buy the domain only after the D-01 trademark and domain availability check (or use a neutral technical domain).

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
- CI (`ci.yml`, one `check` job) runs a production-dependency audit, typecheck, lint, format check and test only; determinism/bench/asset workflows arrive with the code they test.

## Done

### Session 1 (2026-10-07, cloud)
- Research: prior art (The Farmer Was Replaced), hosting (Render free-tier spin-down, ChatGPT Sites runtime), Neon pricing, Better Auth + Resend, CC0 asset sources.
- 51 design docs under `docs/00`–`09` (design, language, architecture, art/audio, UX, infra including the owner connections inventory, roadmap, legal, engineering, plus the archived original concept) and 7 ADRs under `docs/adr/` (with template and index).
- pnpm workspace, strict TS project references, typed stubs for `lang`, `sim`, `content`, `protocol`, `db`.
- Engineering scaffolding: ESLint (purity + boundary rules), Prettier, Vitest, `pnpm check`, CI, `.claude/` agents, skills, settings, `docs/09-engineering/`.
