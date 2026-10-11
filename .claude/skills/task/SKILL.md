---
name: task
description: Start a backlog item properly. Given an ID like LANG-02, loads the matching design-doc sections, confirms milestone order, creates the branch, and lays out the test-first plan before any code is written.
---

# /task <BACKLOG-ID>

1. Find the ID in `docs/07-roadmap/backlog.md`. Confirm its milestone is the current one in `STATE.md`; if not, stop and say which exit criteria are unmet.
2. Read the design doc sections that define the behaviour (the backlog epic names them; for LANG use `docs/02-language/*` + `interpreter-vm.md`; for SIM use `farm-simulation.md`, `crops-and-economy.md`, `simulation-engine.md`).
3. Branch: on a local machine create `<type>/<ID>-<slug>` from `main` (unless you are already on that task's branch). In a Claude cloud session stay on the assigned `claude/*` branch, because it is the PR branch, and put the ID in every commit message instead (`type(ID): …`).
4. Write the plan as a short list: files to create, public API additions to `src/index.ts`, the tests to write first (each naming the spec rule), and any `content` values needed.
5. Only then implement, test-first. Finish with `pnpm check` and a `type(ID): …` commit.
