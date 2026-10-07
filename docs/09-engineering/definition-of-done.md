# Definition of Done

A task (backlog ID) is done when **all** of these hold. Reviewers check the list; authors tick it in the PR.

- [ ] Behaviour matches the design doc section it implements. If the doc changed, it changed in this PR.
- [ ] `pnpm check` green: typecheck, lint, tests, format.
- [ ] New behaviour has tests at the right level (`docs/09-engineering/testing.md`). Bug fixes have a regression test.
- [ ] No `any`, `@ts-ignore`, skipped tests, bare TODOs, magic numbers, or lint disables.
- [ ] Purity preserved in `lang`/`sim` (lint passes; no new host capabilities without an ADR).
- [ ] Public API changes are reflected in `src/index.ts`, the package README, and the glossary if a term was added.
- [ ] Simulation-affecting change → `RULES_VERSION`/`LANGUAGE_VERSION` bumped, golden hashes regenerated, changelog line added.
- [ ] Protocol change → `PROTOCOL_VERSION` handling per `realtime-protocol.md` §Versioning.
- [ ] Assets added → `MANIFEST.csv` rows with allowed licenses.
- [ ] `STATE.md` updated if this changes "Now" or "Next steps".
- [ ] Commit messages follow `git-workflow.md`.
