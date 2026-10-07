---
name: handoff
description: End-of-session handoff. Updates STATE.md (Now, Next steps, Known gaps, Done), verifies pnpm check and a clean tree, commits and pushes. Run before closing any session or switching machines.
---

# /handoff

1. Run `git status --short` and `git log --oneline -15`. Note every commit since the last "Session N" entry in `STATE.md`.
2. Run `pnpm check`. If red, fix or revert before continuing; never hand off red.
3. Edit `STATE.md`:
   - **Now:** phase, branch, blocking decisions, owner inputs needed. Keep it under 8 lines.
   - **Next steps:** ordered backlog IDs with one line each. Remove finished ones.
   - **Known gaps / debt:** add anything you consciously deferred, with a backlog ID.
   - **Done:** add a `### Session N (date, machine)` block summarising this session's commits in 3–8 bullets.
4. If any design doc changed meaning, confirm the matching ADR or `decisions-needed.md` row was updated.
5. Commit: `docs(state): handoff session N` with a body naming what the next session should start with.
6. `git push -u origin <branch>`. Report the branch, the last commit hash and the first next step in one short message.
