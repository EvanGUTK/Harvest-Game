# Security & Anti-Cheat

## Threat model

| Threat | Mitigation |
|---|---|
| **Player code escapes the sandbox** | Player code is never JS. It is parsed into our AST and run by our VM, which only has host functions we define. No `eval`, `Function`, `import()`, or reflection exists in Sprout |
| **Resource exhaustion** (infinite loops, memory bombs, huge source) | Hard limits: source size, AST nodes, nesting, call depth, heap cells, collection size, cycle budget (see language-spec). The VM runs in bounded slices. Official executions run in a `worker_thread` with a wall-clock kill switch (2 s) as a backstop |
| **Fake scores in multiplayer** | The server runs the official simulation. Clients only submit source text |
| **Fake single-player credits** | Run receipts are re-simulated server-side, with rate caps |
| **Seeing rivals' code during coding** | Drafts are only sent to the server and never broadcast. The server sends no rival code until `results` |
| **Timer manipulation** | Server owns deadlines. Drafts arriving after lock are ignored |
| **Win trading / boosting in ranked** | Ranked only via queue, no parties in ranked v1, no code-joinable ranked rooms. Flag repeated co-occurrence of the same players with suspicious placement patterns |
| **Program plagiarism in ranked** (two accounts submit identical code) | Store the source hash. A post-match job flags identical or near-identical (normalised AST hash) programs across colluding accounts for review |
| **Account takeover** | OAuth, verified email, breached-password check, rate-limited codes, session revocation |
| **Credential stuffing** | Rate limits, generic errors, optional captcha (Cloudflare Turnstile) after N failures |
| **Room code enumeration** | Rate limit 10 attempts per minute, large keyspace |
| **WebSocket abuse** (floods, malformed frames) | zod validation, per-type rate limits, max frame 32 KB, disconnect on abuse |
| **XSS via names / room titles** | Handles are restricted to `[a-z0-9_]`, React escaping, CSP (`script-src 'self'`) |
| **Injection** | Drizzle parameterised queries only. No raw SQL string building |
| **Economy exploits** | Append-only ledger with idempotency keys, nightly reconciliation, atomic transactions |

## Execution sandbox detail

Official execution path:

```
lock → for each program: compile (limits) → if error: idle program
     → worker_thread.run(lockstepSim(programs, seed, rules)) with 2 s timeout
     → result + event log + final state hash
```

The worker has no access to the DB or network. It receives plain data and returns plain data.

## Secrets & config

- Secrets live in Render environment groups (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`). Never in the repo.
- `.env.example` documents the names only.
- GitHub secret scanning and Dependabot are enabled on the repo.
