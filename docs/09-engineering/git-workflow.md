# Git Workflow

## Branches

- `main`: always green, always deployable to staging. Protected: PR required, CI must pass.
- Work branches: `<type>/<ID>-<slug>`, e.g. `feat/LANG-01-lexer`, `docs/adr-0008-redis`. Claude cloud sessions use their assigned `claude/*` branch and open a PR from it.
- Short-lived. Merge within days, not weeks. Rebase onto `main` before opening the PR; after that, merge commits only (never rewrite a pushed shared branch).

## Commits

`type(ID): imperative summary` ≤ 72 chars, blank line, then **why** (not what; the diff shows what).

Types: `feat` `fix` `refactor` `test` `docs` `chore` `perf`. ID is a backlog ID or `ADR-000N`. Docs-only commits may use `docs(area)`.

One logical change per commit. `pnpm check` green before every commit, no exceptions.

## Pull requests

- Template in `.github/pull_request_template.md`. Fill every section or write "n/a" with a reason.
- Link the backlog ID and the design doc section.
- Reviewer (human or `reviewer` agent) checks the [definition of done](definition-of-done.md).
- Squash-merge is **not** used (we want the per-task history). Use merge commits.

## Cross-machine handoff

- Never leave a session with uncommitted work. Run `/handoff`.
- `STATE.md` is updated in the final commit of every session.
- On a new machine: `git clone`, `pnpm install`, `pnpm check`, read `CLAUDE.md` then `STATE.md`.
- `.gitignore` excludes `node_modules`, `dist`, `.env*`, build outputs and `apps/web/public/assets/`. Claude Code honours `.gitignore` for context, so nothing else is needed to keep local sessions lean.
