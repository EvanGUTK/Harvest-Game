# Code Harvest

A browser game where you program a farm drone in **Sprout**, a small Python-style language. You can play a single-player campaign that teaches programming one concept at a time, or compete in timed multiplayer showdowns where everyone writes code for the same farm and the most profitable, most efficient program wins.

> **Status: architecture and design phase.** This repository currently holds the design docs, architecture decisions and an empty workspace skeleton. The milestone plan says when game code gets built: [`docs/07-roadmap/milestones.md`](docs/07-roadmap/milestones.md).

## Read in this order

| # | Doc | What it settles |
|---|-----|-----------------|
| 1 | [Vision & pillars](docs/00-overview/vision.md) | What the game is, who it's for, what makes it different |
| 2 | [Decisions needed](docs/00-overview/decisions-needed.md) | Open questions, each with a recommended default |
| 3 | [Core loop](docs/01-game-design/core-loop.md) | Single-player and multiplayer loops |
| 4 | [Farm simulation](docs/01-game-design/farm-simulation.md) | Grid, tiles, crops, time = cycles |
| 5 | [Sprout language spec](docs/02-language/language-spec.md) | The language players write |
| 6 | [System overview](docs/03-architecture/system-overview.md) | How the pieces fit together |
| 7 | [Tech stack](docs/03-architecture/tech-stack.md) | TypeScript vs. Wasm, libraries, hosting |
| 8 | [Milestones](docs/07-roadmap/milestones.md) | Build order, from M0 to launch |

## Full doc tree

```
docs/
├── 00-overview/
│   ├── vision.md                 pillars, audience, prior art, differentiation
│   ├── original-concept.md       your original notes (archived)
│   ├── glossary.md               every game & tech term, one definition each
│   └── decisions-needed.md       open questions + recommended defaults
├── 01-game-design/
│   ├── core-loop.md              SP + MP loops, session lengths
│   ├── farm-simulation.md        grid, tiles, moisture, growth, cycle clock
│   ├── crops-and-economy.md      crops, prices, seeds, shared market, currencies
│   ├── campaign-and-skill-tree.md chapters, contracts, unlock tree, curriculum
│   ├── multiplayer-modes.md      showdown flow, casual, ranked, custom rooms
│   ├── scoring-and-judging.md    how a showdown is won, tiebreaks, awards
│   ├── ranked-ladder.md          Iron→Diamond, RP, placements, seasons
│   └── cosmetics-and-progression.md drone parts, badges, backdrops, levels
├── 02-language/
│   ├── language-spec.md          Sprout grammar, types, semantics, limits
│   ├── standard-library.md       every builtin + cycle cost
│   ├── errors-and-diagnostics.md error catalogue, friendly messages
│   └── curriculum.md             concept → chapter → unlock mapping
├── 03-architecture/
│   ├── system-overview.md        components, diagrams, data flow
│   ├── tech-stack.md             choices + rejected alternatives (incl. Wasm)
│   ├── monorepo-layout.md        packages, dependency rules
│   ├── interpreter-vm.md         lexer → parser → compiler → bytecode VM
│   ├── simulation-engine.md      determinism, lockstep, event log, replay
│   ├── realtime-protocol.md      WebSocket messages, versioning, reconnects
│   ├── matchmaking.md            queue, ready-check, widening, parties
│   ├── rooms-and-lobbies.md      room lifecycle, browser, room codes
│   ├── social.md                 friends, presence, invites, blocking
│   ├── auth.md                   OAuth, email OTP, password, sessions, WS tickets
│   ├── data-model.md             Postgres schema (Drizzle), ledger
│   ├── saves-and-persistence.md  campaign saves, run receipts, replays
│   ├── security-anti-cheat.md    sandboxing, limits, validation, abuse
│   └── rendering.md              three.js voxel renderer, perf budget
├── 04-art-audio/
│   ├── art-direction.md          "grounded voxel" style guide
│   ├── asset-pipeline.md         MagicaVoxel → glTF, audio pipeline
│   ├── asset-sourcing.md         where to get/generate art, music, sfx; licenses
│   └── audio-design.md           adaptive music, SFX list
├── 05-ux/
│   ├── screen-flow.md            every screen + navigation map
│   ├── editor-ux.md              code editor, blocks mode, run/step/debug
│   └── accessibility.md
├── 06-infrastructure/
│   ├── hosting.md                Render + Neon (+ why not ChatGPT Sites)
│   ├── environments-and-ci.md    dev/staging/prod, GitHub Actions
│   ├── observability.md          logs, metrics, error tracking
│   └── cost-estimate.md
├── 07-roadmap/
│   ├── milestones.md             M0 … M8 with exit criteria
│   └── backlog.md                epic → feature → task tree with IDs
├── 08-legal-safety/
│   ├── privacy-and-age.md        COPPA/GDPR, age gate, data deletion
│   └── moderation.md             names, chat, reports
└── adr/                          Architecture Decision Records (one per decision)
```

## Workspace layout (planned code)

```
apps/web         React + three.js client (Vite)
apps/server      Node authoritative game server (Fastify + ws)
packages/lang    Sprout lexer, parser, compiler, bytecode VM (pure TS, no DOM/Node APIs)
packages/sim     Deterministic farm simulation (pure TS)
packages/protocol Shared message schemas (zod) + types
packages/content Crops, commands, skill tree, cosmetics as data
packages/db      Drizzle schema + migrations for Neon Postgres
assets/          Source art & audio + MANIFEST (every file has a license row)
tools/           Build scripts (voxel baking, asset manifest check)
```

The workspace uses pnpm (`pnpm install`). There is no runnable game yet.
