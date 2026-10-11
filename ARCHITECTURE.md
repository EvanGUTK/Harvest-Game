# Architecture at a glance

One page. Details live in `docs/03-architecture/`; this file only orients you.

## What the system is

A browser game where players write **Sprout** (a small Python-style language) to control a farm drone. The **same deterministic engine** (`packages/lang` interpreter + `packages/sim` world) runs in the browser for instant feedback and on the server for official results. Multiplayer is a timed coding showdown; the server locks programs, simulates all farms in lockstep against a shared market, and streams an event log back for the finale animation.

```
Browser (apps/web)                      Render web service (apps/server)            Neon
┌──────────────────────────┐            ┌─────────────────────────────────┐        ┌──────────┐
│ React UI · CodeMirror    │ ─REST────▶ │ Fastify: /api, Better Auth      │ ─SQL─▶ │ Postgres │
│ three.js/R3F renderer    │ ◀─WSS────▶ │ ws: rooms, queue, presence      │        │ (Drizzle)│
│ Worker: lang + sim       │            │ execution: lang + sim (worker)  │        └──────────┘
└──────────────────────────┘            └─────────────────────────────────┘
                                                   │ Resend (email codes) · Google (OAuth)
```

## Packages and the one rule about them

```
lang ──┐
       ├──▶ sim ──▶ protocol ──▶ db
content┘      │         │          │
              ▼         ▼          ▼
            web       web/server  server
```
`lang` and `content` depend on nothing. `web` never imports `db`. Public surface is each package's `src/index.ts`.

## Where to read next

| Question | Doc |
|---|---|
| How does a showdown flow end to end? | `docs/03-architecture/system-overview.md` |
| Why TypeScript, not Wasm or real Python? | `docs/adr/0001`, `docs/adr/0002`, `docs/03-architecture/tech-stack.md` |
| How is the interpreter built and metered? | `docs/03-architecture/interpreter-vm.md` |
| How do 8 drones interleave deterministically? | `docs/03-architecture/simulation-engine.md` |
| What messages cross the WebSocket? | `docs/03-architecture/realtime-protocol.md` |
| How does Find Match work? | `docs/03-architecture/matchmaking.md` |
| Tables? | `docs/03-architecture/data-model.md` |
| Auth? | `docs/03-architecture/auth.md`, `docs/adr/0006` |
| Where is it hosted and why? | `docs/06-infrastructure/hosting.md`, `docs/adr/0004` |
| What gets built when? | `docs/07-roadmap/milestones.md`, `docs/07-roadmap/backlog.md` |
| Current state? | `STATE.md` |
