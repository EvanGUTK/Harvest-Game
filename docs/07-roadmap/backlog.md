# Backlog: Epic → Feature → Task tree

IDs are stable. Use them in branch names and commits (`feat(LANG-03): …`). The milestone is in brackets.

## LANG: Sprout language [M0]
- **LANG-01 Lexer**
  - LANG-01.1 Token types, spans, number literals with `_`
  - LANG-01.2 INDENT/DEDENT stack, tabs = 4, mixed-indent diagnostic
  - LANG-01.3 Implicit line joining in brackets
  - LANG-01.4 Error tokens + recovery
- **LANG-02 Parser**
  - LANG-02.1 Expressions (precedence climbing per grammar), chained comparisons
  - LANG-02.2 Statements: assign, aug-assign, if/elif/else, while, for, repeat, def, return, break, continue, pass, global
  - LANG-02.3 Error recovery to next statement. Diagnostics with fix-its (missing colon, `=` vs `==`, `/`)
  - LANG-02.4 AST node limit, nesting limit
- **LANG-03 Checker** (also owns `Limits.maxFiles` / `E-TOO-MANY-FILES` and the file run order)
  - LANG-03.1 Scope resolution (local/global/builtin), `global` handling
  - LANG-03.2 Host-signature arity/type hints
  - LANG-03.3 Locked-feature gating
  - LANG-03.4 Warnings: unreachable, unused, pure infinite loop
  - LANG-03.5 "Did you mean" suggestions (Levenshtein)
- **LANG-04 Compiler**
  - LANG-04.1 Bytecode format + constant pool
  - LANG-04.2 Control flow, short-circuit, loops (`ITER`, `REPEAT`)
  - LANG-04.3 Functions, frames, `LINE` markers
- **LANG-05 VM**
  - LANG-05.1 Value model, safe-integer checks, Python floor div/mod
  - LANG-05.2 Lists/dicts with heap accounting
  - LANG-05.3 Resumable `run(maxCycles)` / `resume(value)` host yields
  - LANG-05.4 Snapshot/restore
  - LANG-05.5 Runtime diagnostics
- **LANG-06 Tests**
  - LANG-06.1 Corpus + AST snapshots
  - LANG-06.2 Fuzzing (no throws)
  - LANG-06.3 Differential vs CPython (nightly); adds `differential.yml` with pinned CPython 3.12
  - LANG-06.4 Benchmarks; adds the root `bench` script + `bench.yml`
- **LANG-07** `toPython()` AST pretty-printer for the Chapter 10 Graduation screen [M7, post-MVP]

## SIM: Farm simulation [M0]
- SIM-01 World/tile model, lazy advancement (moisture, growth, wither)
- SIM-02 Host table: actions + sensors with costs from `content`, including `goto` (derived cost), `wait` (cost = n via `costOf`) and `is_withered`; the outcome matrix in [standard-library](../02-language/standard-library.md) is the acceptance test
- SIM-03 Discrete-event scheduler (multi-agent, tie-break rotation)
- SIM-04 Shared market (pressure, decay, liquidation)
- SIM-05 PRNG (sfc32 + splitmix32), seed streams, layout generator
- SIM-06 Event log + state hash every 1,000 cycles
- SIM-07 Scoring, tiebreakers, awards
- SIM-08 Golden tests + cross-engine determinism (Playwright); adds the `test:determinism` script (`playwright test -c packages/sim/playwright.config.ts`) + `determinism.yml`
- **SIM-BAL** Balance harness CLI + report

## CONTENT [M0→M7]
- CNT-01 Crops v1 (radish, corn, melon)
- CNT-02 Stdlib metadata (costs, unlocks, docs, examples)
- CNT-03 Bots: Seedling, Grower, Agronomist
- CNT-04 Contracts Ch1–5 [M2], Ch6–10 [M7]
- CNT-05 Skill tree nodes [M2]
- CNT-06 Lesson cards [M2/M7]
- CNT-07 Cosmetics catalogue [M6]
- CNT-08 Quick-chat lines + emotes [M4]

## WEB: Client
- WEB-01 App shell, routing, design system, theming [M1]
- WEB-02 Editor: CodeMirror, Lezer grammar, diagnostics, autocomplete, hover docs, cost lens [M1]
- WEB-03 Worker runner, run controls, debugger (step, breakpoints, variables, timeline) [M1]
- WEB-04 Renderer: farm, crops (instanced), drone, moisture, lighting, effects [M1]
- WEB-05 Auth screens, onboarding [M2]
- WEB-06 Campaign map, contract screen, skill tree UI, Free Farm incl. session handling (server-issued session, one active per user, receipts with `sequence`) [M2]
- WEB-07 Net layer: WS client, reconnect, clock sync [M3]
- WEB-08 Lobby, coding phase, finale v1, results, replay viewer [M3]
- WEB-09 Friends panel, parties, room browser, share links [M4]
- WEB-10 Queue pill, match-found modal, ranked UI, leaderboard [M5]
- WEB-11 Locker, shop, profile [M6]
- WEB-12 Blocks mode (Blockly) [M7]
- WEB-13 Accessibility pass, reduce motion, colorblind modes [M7]
- WEB-14 Settings screen [M2, grows with each system]
- WEB-15 Spectate screen [M6, with SRV-13]
- WEB-16 Ranked hub and leaderboard route [M5, part of WEB-10]
- WEB-17 Graduation screen (uses LANG-07) and What's new modal [M7]
- WEB-18 "My snippets" library in the editor (save campaign functions, insert them in showdowns) [post-MVP, unscheduled; see editor-ux.md]

## SRV: Server
- SRV-01 Fastify app, health (`/healthz` liveness only, `/readyz` DB check; see hosting.md), config, logging [M2]
- SRV-02 Better Auth integration (Google, email OTP, password), rate limits [M2]
  - SRV-02a Account linking only when both sides are verified, 24 h purge of unverified and profile-less users, `haveIBeenPwned` plugin, Resend bounce/complaint webhook + `email_suppression` [M2]
  - SRV-02b Optional Cloudflare Turnstile on repeated sign-in failures and email-send routes, behind a flag [M2]
- SRV-03 Campaign API, run-receipt verification, unlock endpoint, contract and Free Farm start endpoints (`POST /api/campaign/contracts/:contractId/start`, `POST /api/campaign/free-farm/start`: server-issued attempt and session seeds) [M2]
- SRV-04 WS gateway: tickets, heartbeat, routing, validation, rate limits [M3]
- SRV-05 Rooms + phase machine + timers + reconnect snapshots [M3]
- SRV-06 Execution worker pool + timeout [M3]
- SRV-07 Rewards + ledger + match persistence transaction [M3]
- SRV-08 Social: friends, presence, blocks, parties [M4]
- SRV-09 Room directory + browser subscriptions [M4]
- SRV-10 Matchmaker: queues, windows, ready checks, cooldowns [M5]
- SRV-11 Ranked: RP engine, seasons, leaderboard [M5]
- SRV-12 Shop + cosmetics endpoints [M6]
- SRV-13 Spectate stream [M6]
- SRV-14 Graceful drain (`POST /api/admin/drain` and `/undrain`, `roomsActive` on `/healthz`, `MAINTENANCE` refusals, `SIGTERM` handler with `SERVER_RESTARTING`, release-workflow drain step), admin/moderation endpoints [M8]

## DB [M2→]
- DB-01 Drizzle setup, Better Auth tables, profile
  - DB-01.1 `migrate` script, `drizzle.config`, Render Pre-Deploy wiring, e2e seed (`db:seed:e2e`) [M2]
- DB-02 Campaign tables, receipts, contract attempts
- DB-03 Match tables, ledger, cosmetics
- DB-04 Ranked tables, penalties
- DB-05 Social + reports
- DB-06 Reconciliation job, retention jobs (see privacy-and-age.md for the periods): account deletion incl. the deletion log used by restores (see hosting.md); on hard-delete set `match_player.user_id` to null and blank comment text in the user's `match_program.source`; purge unverified and profile-less users 24 h after creation; purge expired `verification` rows hourly; clear `run_receipt.source` after 90 days; delete `contract_attempt` after 12 months, `queue_penalty` after 30 days, `report` 12 months after resolution and `email_suppression` after 12 months (provisional)
- DB-07 Anonymisation script for short-lived prod clones (load tests) [M8]

## ART [M1→M7]
- ART-01 Procedural crop generators (3 crops × 4 stages + withered)
- ART-02 voxel-bake tool (greedy mesh, AO, glTF, icons)
- ART-03 Placeholder drone/silo/well from CC0 packs
- ART-04 Commission hero drone set (4 bodies)
- ART-05 Farmhouse hub, market stall, silo skins
- ART-06 Farmer avatar base + cosmetics
- ART-07 Backdrops: Valley (MVP default, see art-direction asset list) [M1]; Mesa, Pine ridge, Rice terraces, Autumn orchard, Night market [M7]
- ART-08 Particle set, finale props (money tower, podium, confetti)

## AUD [M3→M7]
- AUD-01 sfxr preset library (UI + farming)
- AUD-02 Audio build tool (loudness, ogg/m4a, sprites)
- AUD-03 Music director (stems, bar-synced layers)
- AUD-04 Commission/license music
- AUD-05 Match-found sting + timer SFX

## OPS
- **OPS-00** GitHub repo settings [M0, owner]: branch protection on `main` (require a PR, require the `check` status check from `ci.yml`, no force-push, no deletion); Dependabot alerts + security updates (`.github/dependabot.yml` only covers version updates); secret scanning + push protection. The repo is private, so the last one needs the paid GitHub Secret Protection add-on (a cost decision for Evan), a public repo, or a free substitute (a gitleaks step in `ci.yml`, with security-anti-cheat.md updated to match). Owner checklist: [connections](../06-infrastructure/connections.md). Record completion in STATE.md
- OPS-01 CI workflows (ci, determinism, differential, assets, bench, e2e, preview-db, smoke, release) [M0→M3]
  - OPS-01.1 Root `build` script (`pnpm -r build`): web + tools in M1, server + db in M2; add a build step to `ci.yml`
  - OPS-01.2 `engines.yml` (retired-engine bundle build on a `LANGUAGE_VERSION` / `RULES_VERSION` major bump; see environments-and-ci.md) [M8]
  - OPS-01.3 Supply chain in `ci.yml`: pin every action to a full commit SHA (with a `# vX.Y.Z` comment) and add a production-dependency licence check (fail on GPL/AGPL/unknown) [M1]
- OPS-02 Render services (GitHub App connection, staging + prod with Pre-Deploy migrate), the `production` GitHub Environment, Neon branches (`dev` is the parent of preview and staging, synthetic seed data only; plus `staging` and `ci`) + API keys, preview envs [M2]; owner prerequisites: see [connections](../06-infrastructure/connections.md)
  - OPS-02.1 `render.yaml` Blueprint (staging + prod services, previews) + env groups; see hosting.md [M2]
  - OPS-02.2 `preview-db.yml` (create/migrate/seed/delete the Neon branch `preview/<branch-slug>`, weekly prune) [M2]
  - OPS-02.3 Preview boot-time Neon branch resolution (`IS_PULL_REQUEST`, `RENDER_GIT_BRANCH`) [M2]
  - OPS-02.4 `smoke.yml` + `release.yml` (SHA-pinned deploy, `smoke-staging` status, `/healthz` commit) [M2]
- OPS-03 Domain (after the D-01 trademark and domain availability check), DNS, mail aliases (`support@`, `dmarc@`, `security@`, `privacy@`; DMARC progression `p=none` → `quarantine` → `reject`), Resend DNS, Google OAuth app (consent screen in Testing mode) [M2]; see hosting.md and [connections](../06-infrastructure/connections.md)
- OPS-04 Sentry (2 projects, DSNs, release tagging, source maps in the Render build), `prom-client` `/metrics` + `METRICS_TOKEN`, Grafana Cloud stack + Metrics Endpoint scrape job, alert rules + email contact point, log redaction (observability PII policy) [M3→M8]; owner prerequisites: see [connections](../06-infrastructure/connections.md)
- OPS-05 Load tests [M8]
- OPS-06 Backups (`backup.yml`, R2 bucket, Launch plan + 7-day PITR) [M2], restore drill [M8]; see hosting.md
- OPS-07 Keep `.env.example` in sync with every variable in connections.md, with comments on which env sets each [M2]
- OPS-08 Local dev loop: Vite proxy, `docker-compose` Postgres, `db:migrate` / `db:seed` / `db:seed:e2e` scripts, `.env.example` [M2, with SRV-01 / DB-01]
- OPS-09 Analytics (Plausible Cloud, D-25): account, same-origin script proxy, funnel events `signed_up` → `tutorial_completed` → `chapter_1_completed` → `first_showdown_played` [M8]
- OPS-10 External uptime monitor + runbooks skeleton [M2]; status page, `security.txt`, complete runbooks, incident template [M8]

## LEGAL / SAFETY [M2→M8]
- LEG-01 Pre-auth age gate on the landing screen (client-side, 24 h under-13 flag) + versioned Terms/Privacy acceptance in onboarding (`consent_event`, `428 TERMS_OUTDATED` re-accept) [M2]
- LEG-02a Draft `/privacy` and `/terms` pages (text from privacy-and-age.md, marked draft pending lawyer review; linked from the sign-in screen and set as the Google consent-screen URLs) [M2]
- LEG-02b Lawyer-reviewed policies, data export/deletion endpoints, publish the Google consent screen [M8]
- LEG-03 Handle profanity filter, report flow, moderator tools [M4/M8]
- LEG-04 Asset license manifest + credits screen [M1→]
