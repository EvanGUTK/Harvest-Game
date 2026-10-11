# Architecture Decision Records

One file per significant decision. Copy `0000-template.md`. Never edit an accepted ADR's decision. Supersede it with a new one instead.

An ADR moves from `proposed` to `accepted` when the owner approves the matching row in [decisions-needed](../00-overview/decisions-needed.md) or approves the milestone that implements it. Update the Status line in the ADR file and the table below in the same commit.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-typescript-everywhere.md) | TypeScript everywhere, no Wasm engine in v1 | proposed |
| [0002](0002-custom-dsl-not-real-python.md) | Custom Python-style DSL "Sprout" instead of real Python | proposed |
| [0003](0003-deterministic-server-authoritative-sim.md) | Deterministic, server-authoritative, discrete-event simulation | proposed |
| [0004](0004-hosting-render-neon.md) | Render + Neon, not ChatGPT Sites | proposed |
| [0005](0005-visible-rank-matchmaking.md) | Matchmaking on visible rank only | proposed |
| [0006](0006-auth-better-auth.md) | Better Auth with Google OAuth, email OTP (Resend), password | proposed |
| [0007](0007-ws-custom-protocol.md) | Plain `ws` + zod protocol | proposed |
