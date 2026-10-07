# Working on Code Harvest

## Current phase
**Architecture/design.** Don't build features ahead of the milestone plan in `docs/07-roadmap/milestones.md`. Defaults in `docs/00-overview/decisions-needed.md` are assumed unless the owner changes them.

## Sources of truth
- Game rules and numbers: `docs/01-game-design/*` (design intent) → `packages/content` (actual values; bump `RULES_VERSION` on change)
- Language: `docs/02-language/language-spec.md`
- Architecture decisions: `docs/adr/` (supersede, don't edit accepted ADRs)
- Terms: `docs/00-overview/glossary.md` (use these words in code, UI and docs)

## Hard rules
- `packages/lang` and `packages/sim` are **pure and deterministic**: integers only, no `Date`, `Math.random`, `performance`, DOM or Node APIs.
- Player code is **never** converted to or executed as JavaScript.
- The server is authoritative for scores, credits, ranks and deadlines.
- Every asset in `assets/` needs a `MANIFEST.csv` row with an allowed license.
- Use backlog IDs in branch names and commits, e.g. `feat(LANG-02.1): parse chained comparisons`.

## Commands
- `pnpm install`
- `pnpm typecheck`
