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
- **LANG-03 Checker**
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
  - LANG-06.3 Differential vs CPython (nightly)
  - LANG-06.4 Benchmarks

## SIM: Farm simulation [M0]
- SIM-01 World/tile model, lazy advancement (moisture, growth, wither)
- SIM-02 Host table: actions + sensors with costs from `content`
- SIM-03 Discrete-event scheduler (multi-agent, tie-break rotation)
- SIM-04 Shared market (pressure, decay, liquidation)
- SIM-05 PRNG (sfc32 + splitmix32), seed streams, layout generator
- SIM-06 Event log + state hash every 1,000 cycles
- SIM-07 Scoring, tiebreakers, awards
- SIM-08 Golden tests + cross-engine determinism (Playwright)
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
- WEB-06 Campaign map, contract screen, skill tree UI, Free Farm [M2]
- WEB-07 Net layer: WS client, reconnect, clock sync [M3]
- WEB-08 Lobby, coding phase, finale v1, results, replay viewer [M3]
- WEB-09 Friends panel, parties, room browser, share links [M4]
- WEB-10 Queue pill, match-found modal, ranked UI, leaderboard [M5]
- WEB-11 Locker, shop, profile [M6]
- WEB-12 Blocks mode (Blockly) [M7]
- WEB-13 Accessibility pass, reduce motion, colorblind modes [M7]

## SRV: Server
- SRV-01 Fastify app, health (`/healthz` liveness only, `/readyz` DB check; see hosting.md), config, logging [M2]
- SRV-02 Better Auth integration (Google, email OTP, password), rate limits [M2]
- SRV-03 Campaign API, run-receipt verification, unlock endpoint [M2]
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
- DB-02 Campaign tables, receipts, contract attempts
- DB-03 Match tables, ledger, cosmetics
- DB-04 Ranked tables, penalties
- DB-05 Social + reports
- DB-06 Reconciliation job, retention jobs (account deletion, incl. the deletion log used by restores; see hosting.md)
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
- OPS-01 CI workflows (ci, determinism, assets, bench, e2e) [M0→M3]
  - OPS-01.1 Root `build` script (`pnpm -r build`): web + tools in M1, server + db in M2; add a build step to `ci.yml`
- OPS-02 Render services + Neon branches (`dev` is the parent of preview and staging, synthetic seed data only) + preview envs [M2]
  - OPS-02.1 `render.yaml` Blueprint (staging + prod services, previews) + env groups; see hosting.md [M2]
- OPS-03 Domain, Resend DNS, Google OAuth app (consent screen in Testing mode); see hosting.md and connections.md [M2]
- OPS-04 Sentry, metrics, alerts [M3→M8]
- OPS-05 Load tests [M8]
- OPS-06 Backups (`backup.yml`, R2 bucket, Launch plan + 7-day PITR) [M2], restore drill [M8]; see hosting.md
- OPS-07 Keep `.env.example` in sync with every variable in connections.md, with comments on which env sets each [M2]

## LEGAL / SAFETY [M2→M8]
- LEG-01 Age gate + terms acceptance [M2]
- LEG-02a Draft `/privacy` and `/terms` pages (text from privacy-and-age.md, marked draft pending lawyer review; linked from the sign-in screen and set as the Google consent-screen URLs) [M2]
- LEG-02b Lawyer-reviewed policies, data export/deletion endpoints, publish the Google consent screen [M8]
- LEG-03 Handle profanity filter, report flow, moderator tools [M4/M8]
- LEG-04 Asset license manifest + credits screen [M1→]
