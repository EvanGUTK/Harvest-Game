# Git Workflow

## Branches

- `main`: always green, always deployable to staging. Protected on GitHub: a PR is required, the `check` status check from `ci.yml` (plus `determinism` once it exists) must pass, one approving review is required, and force-push and deletion are blocked (see [standards](standards.md) Dependencies for the repo settings). These are repository settings the owner switches on (they are not created by any file in the repo), together with Dependabot alerts and security updates and secret scanning; see the owner checklist in [connections](../06-infrastructure/connections.md) (backlog item OPS-00). The `production` GitHub Environment used by `release.yml` is described in [environments-and-ci](../06-infrastructure/environments-and-ci.md).
- Work branches: `<type>/<ID>-<slug>`, e.g. `feat/LANG-01-lexer`, `docs/adr-0008-redis`. Claude cloud sessions use their assigned `claude/*` branch and open a PR from it.
- Short-lived. Merge within days, not weeks. Bring a branch up to date with `git merge origin/main`; **never rebase**. Branches are pushed at every handoff, and force-push is denied in `.claude/settings.json`, so a rebase would be both a rewrite of pushed history and impossible to push. Merge commits keep the per-task history (see Pull requests).
- Releases: staging deploys every merge to `main`; prod is promoted by running `release.yml` with a SHA that has a green `smoke-staging` status (see [environments-and-ci](../06-infrastructure/environments-and-ci.md)). Released SHAs are tagged `v<yyyymmdd>.<n>`.

## Commits

`type(ID): imperative summary` ≤ 72 chars, blank line, then **why** (not what; the diff shows what).

Types: `feat` `fix` `refactor` `test` `docs` `chore` `perf`. ID is a backlog ID or `ADR-000N`. Docs-only commits may use `docs(area)`.

One logical change per commit. `pnpm check` green before every commit, no exceptions.

Every commit that bumps `LANGUAGE_VERSION` or `RULES_VERSION` is tagged `engine-v<lang>.<rules>` on `main`, so `engines.yml` can rebuild any previous major.

## Pull requests

- Template in `.github/pull_request_template.md`. Fill every section or write "n/a" with a reason.
- Link the backlog ID and the design doc section.
- Reviewer (human or `reviewer` agent) checks the [definition of done](definition-of-done.md).
- Squash-merge is **not** used (we want the per-task history). Use merge commits.

## Cross-machine handoff

- Never leave a session with uncommitted work. Run `/handoff`.
- `STATE.md` is updated in the final commit of every session.
- On a new machine: `git clone`, `pnpm install`, `pnpm check`, read `CLAUDE.md` then `STATE.md`.
- `.gitignore` excludes `node_modules`, `dist`, `.env*`, build outputs and `apps/web/public/assets/`. Claude Code honours `.gitignore` for context, so nothing else is needed to keep local sessions lean. The exception is `apps/web/public/engines/` (archived engine bundles): it is committed, not gitignored.
