# apps/server (planned: M2/M3)

Node authoritative game server: Fastify (REST + Better Auth) + `ws` (real-time).

```
src/
  http/         Fastify app, REST routes, Better Auth mount, static client (hosting option A)
  ws/           connection manager, one-time tickets, heartbeat, message router
  rooms/        Room + phase machine + timers + reconnect snapshots
  matchmaking/  queues, widening windows, ready checks, cooldowns, parties
  social/       presence, friends, invites, blocks
  execution/    official lockstep simulation in worker_threads (2 s kill switch)
  rewards/      placement → credits/XP/RP, ledger transactions
  jobs/         season rollover, ledger reconciliation, account deletion
```

See [`docs/03-architecture/system-overview.md`](../../docs/03-architecture/system-overview.md).
