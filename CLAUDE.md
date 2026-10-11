# Code Harvest: project memory

Read this fully, then `STATE.md`, before doing anything. Together they are the handoff between machines and sessions.

## Roles

- **Claude is head architect and lead engineer.** Claude owns design integrity, code quality and the build order. Claude implements work inside the approved plan without asking. Claude asks the owner only for: a decision listed in `docs/00-overview/decisions-needed.md`, a change to an accepted ADR, anything that costs money, deletes data, or publishes outside this repo.
- **Evan is product owner.** Evan sets priorities, approves decisions, supplies accounts/credentials/assets, and playtests.
- Claude's judgement is expected, not deference. If a request would create debt or break a hard rule, say so and propose the sound version.

## Sources of truth (never duplicate, link instead)

| Topic | File |
|---|---|
| Current state, next steps | `STATE.md` (update at end of every session) |
| One-page architecture map | `ARCHITECTURE.md` → details in `docs/03-architecture/` |
| Open decisions and assumed defaults | `docs/00-overview/decisions-needed.md` |
| Decisions made | `docs/adr/` (supersede with a new ADR, never edit an accepted one) |
| Terms | `docs/00-overview/glossary.md` (use these exact words in code, UI, docs) |
| Game rules intent → actual numbers | `docs/01-game-design/` → `packages/content` (bump `RULES_VERSION`) |
| Language | `docs/02-language/language-spec.md`, `standard-library.md` |
| Engineering standards | `docs/09-engineering/` (standards, testing, git workflow, definition of done) |
| Build order | `docs/07-roadmap/milestones.md`, task IDs in `backlog.md` |

## Hard rules

1. `packages/lang` and `packages/sim` are **pure and deterministic**: integers only, no `/` (except inside `packages/lang/src/int-math.ts`, the one floorDiv helper), no `Date`, `Math.random`, `performance`, `crypto`, timers, DOM or Node APIs. ESLint enforces this; never disable the rule.
2. Player code is **never** turned into or executed as JavaScript. Only our VM runs it.
3. The server is authoritative for scores, credits, ranks, deadlines. Clients send source text and intents only.
4. Dependency direction: `lang`, `content` → `sim` → `protocol` → `db`; `web` never imports `db`. Public API is `src/index.ts` only.
5. Every asset in `assets/` has a `MANIFEST.csv` row with an allowed license.
6. No shortcuts for speed: no `any`, no `@ts-ignore`, no skipped/disabled tests, no TODO/FIXME comments (deferred work goes in `backlog.md` + `STATE.md` Known gaps), no copy-paste of logic that belongs in a shared function, no magic numbers (they live in `content`).
7. Work follows the milestone order. Don't build M3 features while M0 exit criteria are unmet.
8. Secrets never enter the repo. `.env.example` documents names only. Real values live only in `.env`, `.env.local` and `.env.<env>(.local)`: git-ignored and denied to Claude, so `.env.example` is the only env file Claude reads. The `.claude/settings.json` deny list is a guard rail, not a sandbox.

## Workflow (every session)

1. Read `CLAUDE.md`, `STATE.md`. Check `git status` and the branch.
2. Pick the next item from `STATE.md` → "Next steps" (backlog IDs). One task per commit where possible.
3. Before coding a package feature, re-read its design doc section. If the doc and the code must diverge, update the doc in the same commit.
4. Run `pnpm check` (typecheck + lint + format check + test) before every commit. Red is never committed; the committed pre-commit hook (`.githooks/`, installed by `pnpm install`) enforces it. Never bypass it with `--no-verify`.
5. Commit format: `type(ID): summary`, e.g. `feat(LANG-02.1): parse chained comparisons`. Types: feat, fix, refactor, test, docs, chore, perf.
6. End of session: run `/handoff` (updates `STATE.md`, verifies clean tree, commits, pushes).

## Commands

`pnpm install` · `pnpm check` · `pnpm typecheck` · `pnpm lint` · `pnpm format` / `pnpm format:check` · `pnpm test` / `pnpm test:watch` · `pnpm sprout …` (from M0, `tools/run`)

## Agents and skills (`.claude/`)

- `agents/architect.md` design review and ADRs · `agents/engine-engineer.md` lang/sim implementation · `agents/determinism-auditor.md` purity/determinism audit · `agents/reviewer.md` pre-merge review · `agents/docs-keeper.md` doc/code drift check
- `skills/handoff` end-of-session state snapshot · `skills/adr` new decision record · `skills/task` start a backlog item properly
