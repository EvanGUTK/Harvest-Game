# ADR-0003: Deterministic, server-authoritative, discrete-event simulation

- **Status:** proposed
- **Date:** 2026-10-07

## Context
Multiplayer results must be fair and reproducible. Players need instant local feedback while coding. Network latency must not affect outcomes.

## Decision
- The simulation is a **pure, deterministic function** of (programs, seed, rules version, language version).
- Official multiplayer results are computed **only on the server** after programs lock. Clients run the same code for private test runs.
- Multiple drones interleave through a **discrete-event scheduler**: the agent with the earliest pending world-touch runs next, with tie-break by slot rotated by time.
- Replays store **inputs**, not outputs.
- Single-player credits are granted only after server re-simulation of a **run receipt**.

## Consequences
- Network latency is irrelevant to scoring, so "latency" is reinterpreted as cycle efficiency.
- Replays are tiny and exact. Desync bugs are detectable via state hashes.
- Every rules change must bump `rules_version`, and old versions must stay runnable for replays.

## Alternatives considered
- **Real-time execution with live state sync:** latency-sensitive, expensive, unfair.
- **Client-reported scores:** trivially cheatable.
