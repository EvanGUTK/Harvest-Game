# STATE.md: session handoff

> Updated at the end of every session by `/handoff`. Newest first. Keep "Now" accurate and short; move finished items to "Done".

## Now

- **Phase:** M0 (Foundations) in progress. LANG-01 (lexer, `countTokens`) is done; LANG-02 (parser) is next.
- **Branch:** `claude/sleepy-gauss-gxgilk`, PR [EvanGUTK/Harvest-Game#1](https://github.com/EvanGUTK/Harvest-Game/pull/1) to `main` is open. New M0 work lands on this branch until the PR merges; after that, `feat/LANG-xx-*` branches from `main`.
- **Blocking decisions:** none for the design. All 28 rows in `docs/00-overview/decisions-needed.md` have assumed defaults and the docs are written against them. D-22 defaults to "Start M0 now". Before M0 code, Evan ticks D-02, D-03, D-04, D-06, D-07, D-17, D-18, D-20 and D-24 (the rows M0 content values depend on) and accepts ADR-0001, 0002 and 0003; all seven ADRs are still `proposed`.
- **Owner inputs:** the single checklist of accounts, credentials, DNS records, OAuth settings, CI secrets and repo settings is [`docs/06-infrastructure/connections.md`](docs/06-infrastructure/connections.md) (36 connections, per-environment variable matrix, console steps, rotation, verification). Nothing there blocks M0 code. Do the **M0 section** (GitHub 2FA, branch protection with the `check` job, secret scanning with push protection, Dependabot) before the first merge to `main`; everything else is M2 or later.

## Next steps (in order)

1. **LANG-02 Parser**: recursive descent per `docs/02-language/language-spec.md`, recovery to the next statement, fix-it diagnostics (`E-MISSING-COLON`, `E-ASSIGN-IN-IF`, `E-SLASH-DIVISION`).
2. **LANG-03 Checker** (features, `lockedNames`, arity), **LANG-04 Compiler** (op-cost table in `interpreter-vm.md` is normative), **LANG-05 VM** (resumable `run`/`resume(value, cost?)`, `line` yields, snapshots).
3. **SIM-01..07**: world with lazy advancement and `ripeAt`, host table (costs from `content`, failed actions cost 5), discrete-event scheduler with the normative tie-break, shared market, PRNG streams, event log + state hash, scoring/awards/idle program.
4. **SIM-08** golden tests + Playwright cross-engine determinism; **CNT-03** three bot programs; **SIM-BAL** balance harness (first question: does the 2-row starter reach ~₵250 solo and ~30 % of Agronomist?).
5. **OPS-01.3** SHA-pin CI actions + licence check (M1), then M0 exit check (`docs/07-roadmap/milestones.md`), `/handoff`, open M1.

## Known gaps / debt

- `packages/*/src/index.ts` are **interface stubs**; `LangEngine` and `Simulation` have no implementation. `packages/protocol` is types only (zod in M3); it covers the M3 subset of the catalogue (spectate/party/friend envelopes arrive with SRV-08/09).
- `packages/db` is an empty placeholder until M2. `tools/` are documented but not created (first: `tools/run`, `tools/balance` in M0). `assets/` is empty apart from the manifest header.
- CI (`ci.yml`, one `check` job) runs audit, typecheck, lint, format check and test; action SHA-pinning and the licence check are OPS-01.3; determinism/bench/asset/e2e/preview-db/smoke/release/backup/engines workflows arrive with the code they test.
- `render.yaml`, `docker-compose.yml`, `.github/CODEOWNERS` exist only as planned items in `connections.md` (CODEOWNERS is committed; the other two land in OPS-02.1 / OPS-08).
- Provisional numbers everywhere are tagged `[SIM-BAL]` or "provisional"; nothing is tuned yet.
- Owner-confirmation items recorded in docs: age-gate boundary rule (month + year, pass at 13 full years) for the lawyer; placement doubling applies to gains only; bot-match 4th place pays ₵7 (floorDiv).

## Done

### Session 3 (2026-10-07, cloud): LANG-01
- `packages/lang/src/lexer/`: hand-written lexer (no regex), Python-style INDENT/DEDENT/NEWLINE with tab = 4, implicit line joining, every diagnostic in the lexical section of the spec (`E-SRC-TOO-BIG`, `E-IDENT-TOO-LONG`, `E-LEADING-ZERO`, `E-INT-TOO-BIG`, `E-UNTERMINATED-STRING`, `E-STRING-TOO-LONG`, `E-BAD-ESCAPE`, `E-UNEXPECTED-CHAR`, `E-MIXED-INDENT` with fix-its), ERROR-token recovery, `countTokens`. 32 tests incl. fast-check properties (never throws, INDENT/DEDENT balance, monotone offsets).
- `src/types.ts` holds the shared source/diagnostic/limit types; `Limits.maxFiles` added; `passWithNoTests` removed.
- PR #1 opened to `main`.

### Session 2 (2026-10-07, cloud): end-to-end plan audit
- Nine-lens audit (deployment trace, connections, cross-doc consistency, vision coverage, M0 spec precision, engineering config, security/ops, UX flow, numbers sanity) → 222 findings → 3 refuted, 204 fixes applied in 15 file-disjoint batches, 249 cross-file follow-ups applied in a second round of 10 batches, 19 architect rulings (RULINGS R1–R19 in the session scratchpad; the decisions themselves live in the docs and `decisions-needed.md` D-23..D-28).
- Normative engine semantics written down: clock arithmetic at host calls, agent tie-break, growth/moisture boundary convention with `ripeAt`, market and liquidation formulas, state hash field order, per-element op costs, type interactions, idle program, token count, spawn semantics.
- Age gate moved to the landing screen before sign-in (month + year, nothing stored but a boolean); Free Farm receipts bound to server-issued sessions with a 16× speed cap; `room.left`, `room.close`, drain/maintenance protocol; CSP and rate-limit tables; PII logging policy; backups/restore; Neon branch topology (`dev` as the synthetic parent of previews); release process with drain; Golf integer formula; ranked RP arithmetic re-derived.
- New: `docs/06-infrastructure/connections.md`; ESLint boundary and test rules; `CODEOWNERS`; pnpm `minimumReleaseAge`; stubs aligned with the docs (`lang`, `sim`, `content`, `protocol`); radish `witherCycles` 3,000 and a profitable 2-row starter program.

### Session 1 (2026-10-07, cloud)
- Research: prior art (The Farmer Was Replaced), hosting (Render free-tier spin-down, ChatGPT Sites runtime), Neon pricing, Better Auth + Resend, CC0 asset sources.
- 52 design docs under `docs/00`–`09` and 7 ADRs under `docs/adr/` (with template and index), archived original concept.
- pnpm workspace, strict TS project references, typed stubs for `lang`, `sim`, `content`, `protocol`, `db`.
- Engineering scaffolding: ESLint (purity + boundary rules), Prettier, Vitest, `pnpm check`, CI, `.claude/` agents, skills, settings, `docs/09-engineering/`.
