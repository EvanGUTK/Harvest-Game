# ADR-0004: Host on Render + Neon (not ChatGPT Sites)

- **Status:** proposed
- **Date:** 2026-10-07

## Context
Available accounts: Neon, Render, ChatGPT (Sites), and an S3-compatible object store for encrypted nightly backups (default Cloudflare R2, see D-27). The game needs long-lived WebSocket connections and in-memory authoritative rooms, plus Postgres.

## Decision
Use a **Render web service** (paid, always-on in prod) serving the client, REST and WebSockets from one origin, with **Neon Postgres** via the pooled connection. Free Render instances only for PR previews.

## Consequences
- Simple deploys, first-party cookies, no CORS.
- One process holds rooms in memory, and Render allows at most 300 s after SIGTERM (`maxShutdownDelaySeconds`; verify the current limit at account creation and record it here), so prod releases drain via an admin endpoint before triggering the deploy (see [hosting](../06-infrastructure/hosting.md)). Rooms outliving the window are abandoned. Scale-out needs Redis later.

## Alternatives considered
- **ChatGPT Sites:** a Cloudflare Workers-based edge runtime with D1/R2, aimed at internal tools and prototypes. It has no long-lived authoritative process for game rooms, its DB is not Postgres, code is managed inside ChatGPT rather than this repo, and it isn't available in the EEA/UK/CH.
- **Render free tier for prod:** spins down after 15 minutes idle, with about a 1-minute cold start and in-memory rooms lost.
