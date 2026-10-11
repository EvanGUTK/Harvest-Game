# Handoff: 2026-10-07 cloud session → home PC

Read this first, then `STATE.md`. This file is a one-off note for resuming at home; `STATE.md` stays the living handoff.

## Where everything is

- **Branch:** `claude/sleepy-gauss-gxgilk`, pushed. **PR to `main`:** https://github.com/EvanGUTK/Harvest-Game/pull/1 (open, not merged).
- **Working tree:** clean. Every commit passed `pnpm check` (the last ones through the committed pre-commit hook).

## First five minutes at home

```sh
git clone https://github.com/EvanGUTK/Harvest-Game.git && cd Harvest-Game
git checkout claude/sleepy-gauss-gxgilk
pnpm install          # also installs the pre-commit hook (core.hooksPath .githooks)
pnpm check            # typecheck + lint + format + 47 tests, should be green
```

Then open Claude Code in the repo. The SessionStart hook prints `STATE.md` → Now + Next steps automatically.

## What this session produced

1. **Architecture and design** (60 docs under `docs/`, 7 ADRs), audited end to end: 222 findings, all real ones fixed. The engine semantics are now written precisely enough to implement without guessing.
2. **Owner checklist:** `docs/06-infrastructure/connections.md`: every account, credential, DNS record, OAuth setting and CI secret, with when (milestone) and how (console steps). Only the **M0 section** (GitHub repo settings) is needed before merging to `main`.
3. **Engineering pipeline:** pnpm workspace, strict TS, ESLint with engine-purity and dependency-boundary rules, Prettier, Vitest, CI, Dependabot, CODEOWNERS, pre-commit hook, `.claude/` agents and skills (`/task`, `/adr`, `/handoff`).
4. **LANG-01 lexer** (`packages/lang/src/lexer/`). Scope note: you asked for architecture only; the lexer was built after "let's start LANG-01" was read as "start coding". You chose to keep it. It is reviewed, spec-conformant and green, and it is the first M0 task regardless.

## Your decisions before M0 continues

In `docs/00-overview/decisions-needed.md`, tick or change: **D-02, D-03, D-04, D-06, D-07, D-17, D-18, D-20, D-24** (the rows M0 content values depend on; all have recommended defaults the docs already assume). Accept **ADR-0001, 0002, 0003** (`docs/adr/`) or say what to change. Then merge PR #1, or keep working on the branch.

## Next task

`/task LANG-02` (parser). Input: the lexer's token stream. Spec: `docs/02-language/language-spec.md` §Grammar and `docs/03-architecture/interpreter-vm.md` §Parser. Deliver the `__corpus__` snapshot tests with it (deferred from LANG-01).

## Known wrinkles

- `pnpm add <pkg>` can fail under `minimumReleaseAge: 10080` while any locked transitive dependency is under a week old. `pnpm install` with the frozen lockfile is fine. For a one-off: `pnpm add -Dw <pkg> --config.minimumReleaseAge=0`.
- All numbers in `packages/content` are provisional until the balance harness (SIM-BAL) runs.
