# STATE.md: session handoff

> Updated at the end of every session by `/handoff`. Newest first. Keep "Now" accurate and short; move finished items to "Done".

## Now

- **Phase:** M0 (Foundations) in progress. LANG-01 (lexer, `countTokens`) is done. PR #1 merged to `main` on 2026-10-11; every change now lands through a `<type>/<ID>-<slug>` branch and a reviewed PR to `main`.
- **Decisions:** Evan accepted the recommended defaults for D-02, D-03, D-04, D-06, D-07, D-17, D-18, D-20, D-22 and D-24, and ADR-0001, 0002 and 0003 (2026-10-11; see the Status column in `docs/00-overview/decisions-needed.md`). The other rows keep their assumed defaults and are decided at the milestone that needs them.
- **Team:** M0 is built by several Claude Code sessions, one per git worktree under `../worktrees/`, coordinated by a chief session that owns this file and every merge to `main`; a reviewer session approves every PR before it merges. Protocol and briefs live in `../team/`, outside the repo. Engineers: `lang-parser` (LANG-02, then LANG-03), `lang-vm` (integer math, LANG-05 values, LANG-04, LANG-05 VM), `sim-world` (SIM-05, SIM-01, SIM-06), `sim-market` (SIM-04, SIM-07).
- **Owner inputs:** the checklist is [`docs/06-infrastructure/connections.md`](docs/06-infrastructure/connections.md). Nothing there blocks M0 code. Do the **M0 section** (OPS-00: GitHub 2FA, branch protection with the `check` job, secret scanning with push protection, Dependabot) soon: `main` is unprotected today, so the review-before-merge rule is enforced only by the team protocol.

## Next steps (in order)

1. **LANG-05.1 Integer math** (`floorDiv`, `floorMod` exported from `lang`; lang-vm): unblocks every `sim` formula.
2. **LANG-02 Parser** (lang-parser): AST types first (the contract the compiler builds against), then statements, recovery and fix-its, then corpus snapshots (LANG-06.1).
3. **LANG-05.1/05.2 value model and heap** (lang-vm), then **LANG-04 bytecode + compiler** against the merged AST, then **LANG-05.3 to 05.5 VM** (resumable `run`/`resume(value, cost?)`, `line` yields, snapshots, cost goldens per op-table row).
4. **LANG-03 Checker** (lang-parser, after LANG-02): features, `lockedNames`, arity, warnings incl. the transitive `W-PURE-INFINITE-LOOP`.
5. **SIM-05 PRNG + layout, SIM-01 world and tiles, SIM-06 state hash** (sim-world); **SIM-04 market, SIM-07 scoring and awards** (sim-market).
6. **SIM-02 host table, SIM-03 scheduler** (assigned once SIM-01 and the VM yield contract exist), then **SIM-08** golden + Playwright cross-engine determinism, **CNT-03** bots, **SIM-BAL** harness, `tools/run`.
7. **OPS-01.3** SHA-pin CI actions + licence check (M1), M0 exit check (`docs/07-roadmap/milestones.md`), `/handoff`, open M1.

## Known gaps / debt

- Architect rulings of 2026-10-11, each written into the doc section it affects by the PR that implements it:
  - `/` is allowed only inside `packages/lang/src/int-math.ts`, the floorDiv/floorMod helper (owner-approved; ESLint override, CLAUDE.md rule 1, standards.md §Purity).
  - FNV-1a 32 lives in `lang` (`packages/lang/src/hash/fnv1a.ts`), shared by the sim state hash and the lang goldens.
  - splitmix32 and sfc32 are pinned to the bryc JS reference variants; constants recorded in `simulation-engine.md` §PRNG seeding with known-answer tests.
  - `SimConfig.sharedMarket = false` (campaign) means no pressure dynamics at all (prices stay at base); `true` means one market for the match, and a player's own sales move it even in a solo test run.
  - A `def` is legal only at the top level of a file; a `def` inside any block is `E-NESTED-DEF`.
  - New limit `maxExpressionDepth = 64` (reported as `E-TOO-DEEP`); new parser codes `E-UNEXPECTED-TOKEN`, `E-UNCLOSED-BRACKET`, `E-NO-FLOAT`, `E-NO-POWER`, `E-BAD-TARGET`; `E-BAD-INDENT` also covers an unexpected INDENT. The catalogue gains the rows with the code that emits them.
  - Name resolution is one shared module, `packages/lang/src/scope/` (owner: lang-parser); the compiler consumes its `ScopeInfo`.
  - Clean Code award: `n` counts every slot including idle players and "place" is the shared placement. Never Thirsty: growth paused for lack of moisture below the crop's minimum while unripe, tracked by a per-farm `everDryPaused` flag that is not hashed.
  - `BASIS_POINTS = 10_000` and `CROP_IDS` (in `CROPS` order) are added to `packages/content`.
- Architect ruling (2026-10-11): the layout rock roll is `next() % 10_000 < WORLD.rockDensityBp` (basis points, straight from `content`) instead of the doc's `% 100` and `< 8`; sim-world updates `simulation-engine.md` §PRNG seeding in the SIM-05 commit. No golden hash existed yet, so nothing changes retroactively.
- `HANDOFF.md` was deleted on 2026-10-11: its instructions (check out the PR branch) were obsolete once PR #1 merged. `STATE.md` is the only handoff.
- `packages/*/src/index.ts` are **interface stubs**; `LangEngine` and `Simulation` have no implementation. `packages/protocol` is types only (zod in M3); it covers the M3 subset of the catalogue (spectate/party/friend envelopes arrive with SRV-08/09).
- `packages/db` is an empty placeholder until M2. `tools/` are documented but not created (first: `tools/run`, `tools/balance` in M0). `assets/` is empty apart from the manifest header.
- CI (`ci.yml`, one `check` job) runs audit, typecheck, lint, format check and test; action SHA-pinning and the licence check are OPS-01.3; determinism/bench/asset/e2e/preview-db/smoke/release/backup/engines workflows arrive with the code they test.
- `render.yaml`, `docker-compose.yml`, `.github/CODEOWNERS` exist only as planned items in `connections.md` (CODEOWNERS is committed; the other two land in OPS-02.1 / OPS-08).
- `minimumReleaseAge: 10080` makes `pnpm add` fail while any transitive dependency's locked version is under a week old; `fast-check` was added with `--config.minimumReleaseAge=0` for that one call. CI with the frozen lockfile is unaffected. Lexer corpus snapshot tests (`__corpus__`) are deferred to LANG-02, which needs the corpus for the parser anyway.
- Provisional numbers everywhere are tagged `[SIM-BAL]` or "provisional"; nothing is tuned yet.
- Owner-confirmation items recorded in docs: age-gate boundary rule (month + year, pass at 13 full years) for the lawyer; placement doubling applies to gains only; bot-match 4th place pays ₵7 (floorDiv).

## Done

### Session 4 (2026-10-11, home, chief session)
- Merged PR #1 to `main` with a merge commit (`c1eb8af`). On Evan's decision, accepted D-02, D-03, D-04, D-06, D-07, D-17, D-18, D-20, D-22, D-24 and ADR-0001, 0002, 0003; `decisions-needed.md` gained a Status column.
- Set up the multi-session build: five worktrees under `../worktrees/` (`lang-parser`, `lang-vm`, `sim-world`, `sim-market`, `reviewer`) with dependencies and the pre-commit hook installed; team protocol and per-agent briefs in `../team/` (outside the repo); every PR is reviewed before the chief merges it.
- Deleted the obsolete `HANDOFF.md`.

### Session 3 (2026-10-07, cloud): LANG-01
- `packages/lang/src/lexer/`: hand-written lexer (no regex), reviewed by the `reviewer` agent (one real bug found and fixed: indentation after a mid-line bracket close), Python-style INDENT/DEDENT/NEWLINE with tab = 4, implicit line joining, every diagnostic in the lexical section of the spec (`E-SRC-TOO-BIG`, `E-IDENT-TOO-LONG`, `E-LEADING-ZERO`, `E-INT-TOO-BIG`, `E-UNTERMINATED-STRING`, `E-STRING-TOO-LONG`, `E-BAD-ESCAPE`, `E-UNEXPECTED-CHAR`, `E-MIXED-INDENT` with fix-its), ERROR-token recovery, `countTokens`. 47 tests incl. alphabet-driven fast-check properties (never throws, exact text slices, no overlap, line/col from offset, INDENT/DEDENT only at line start).
- `src/types.ts` holds the shared source/diagnostic/limit types; `Limits.maxFiles` added (owner: LANG-03); `passWithNoTests` removed; committed pre-commit hook runs `pnpm check`.
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
