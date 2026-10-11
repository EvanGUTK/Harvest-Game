# ADR-0007: Plain `ws` + zod-typed protocol (not Colyseus/Socket.IO)

- **Status:** proposed
- **Date:** 2026-10-07

## Context
Real-time needs are turn-based and low-frequency: queue, ready checks, phases, drafts every 10 s, event-log delivery, presence.

## Decision
Use Fastify + `ws` with a small versioned JSON protocol whose schemas live in `packages/protocol` (zod) and are shared by client and server.

## Consequences
- Full control, minimal dependencies, one schema source for types and validation.
- We implement reconnect, heartbeat and room routing ourselves (about a few hundred lines).

## Alternatives considered
- **Colyseus:** rooms, reconnection and lobby listing for free, but built around high-frequency state sync we don't need, and we'd still build matchmaking. Revisit if room code becomes unwieldy.
- **Socket.IO:** extra protocol and fallback layers unnecessary in modern browsers.
