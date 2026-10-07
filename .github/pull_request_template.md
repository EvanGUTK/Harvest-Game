## What

Backlog ID: <!-- e.g. LANG-02 --> · Design doc: <!-- path#section -->

<!-- One paragraph: what this changes and why. -->

## Definition of done

See `docs/09-engineering/definition-of-done.md`.

- [ ] Matches the design doc (doc updated in this PR if it changed)
- [ ] `pnpm check` green
- [ ] Tests added at the right level; bug fixes have a regression test
- [ ] No `any` / `@ts-ignore` / skipped tests / TODO/FIXME comments / magic numbers / lint disables
- [ ] Purity preserved in `lang`/`sim`
- [ ] Public API change → `src/index.ts`, package README, glossary updated
- [ ] Versions bumped + golden hashes + changelog if simulation/language/protocol changed
- [ ] Protocol change → `PROTOCOL_VERSION` handled per `realtime-protocol.md` §Versioning
- [ ] `MANIFEST.csv` rows for any new assets
- [ ] `STATE.md` updated if "Now"/"Next steps" changed
- [ ] Commit messages follow `git-workflow.md` (`type(ID): summary`)

## Notes for the reviewer

<!-- Anything non-obvious, trade-offs, follow-ups with backlog IDs. -->
