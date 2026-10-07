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
| **Account takeover** | OAuth, verified email, breached-password check, rate-limited codes, session revocation. Accounts link across sign-in methods only when both sides are verified (closes the pre-hijack via an unverified password sign-up, see [auth](auth.md)) |
| **Credential stuffing** | Rate limits, generic errors. Optional Cloudflare Turnstile after 5 failed sign-ins per IP (SRV-02b, M2, feature-flagged off; enable when abuse appears). It needs a Cloudflare account, a Turnstile widget with hostnames `play.<domain>`, `staging.<domain>` and `localhost`, and the env vars `TURNSTILE_SECRET_KEY` (server verify) and `VITE_TURNSTILE_SITE_KEY` (client). When it is enabled, the CSP gains the Turnstile origins (see [HTTP security headers](#http-security-headers)) |
| **Automated sign-ups / OTP floods** (Resend quota burn, sender-reputation damage, throwaway accounts for ranked smurfing, Free Farm farming and report-bombing) | Per-IP caps on sends and new accounts, a per-address resend cooldown, and a 24 h purge of unverified accounts (numbers in [Rate limits](#rate-limits), behaviour in [auth](auth.md)). The same Turnstile flag as above can be switched on for the email flows (send code, create account, reset); Google sign-in never needs it. Gmail dot and plus aliases are not collapsed in v1 (revisit if smurf accounts appear). Bounce and complaint handling is in [auth](auth.md#email-resend) |
| **REST scraping and flooding** (handle search, replay downloads, friend and report spam) | Per-route limits keyed per user when signed in and per IP otherwise (see [Rate limits](#rate-limits)). There is no endpoint that lists users or other players' matches |
| **Room code enumeration** | Rate limit 10 attempts per minute, large keyspace |
| **WebSocket abuse** (floods, malformed frames) | zod validation, per-type rate limits, max frame 32 KB, disconnect on abuse |
| **XSS via names / room titles** | Handles are restricted to `[a-z0-9_]`, React escaping, CSP (`script-src 'self'`, full policy in [HTTP security headers](#http-security-headers)) |
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

## HTTP security headers

Applied to every response, static files included, with `@fastify/helmet` or an equivalent. Without a written policy the first deploy either breaks the app (Vite + R3F + CodeMirror + Blockly + Sentry + WebSockets need specific allowances) or ships without a CSP.

**Content-Security-Policy**

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | |
| `script-src` | `'self'` (plus `https://challenges.cloudflare.com` only while Turnstile is enabled) | No inline scripts. Vite emits hashed bundles. The analytics script is served through a same-origin proxy route ([observability](../06-infrastructure/observability.md)) |
| `worker-src` | `'self' blob:` | The simulation Web Worker |
| `style-src` | `'self' 'unsafe-inline'` | CodeMirror and Blockly inject styles. Revisit with nonces later |
| `img-src` | `'self' data: blob:` | Baked icons and generated textures |
| `font-src` | `'self'` | |
| `connect-src` | `'self' wss://<api-host>`, the Sentry ingest host, `https://plausible.io` | REST, WebSocket, error reports, analytics events. Add `https://challenges.cloudflare.com` only while Turnstile is enabled |
| `frame-src` | `'none'`, or `https://challenges.cloudflare.com` while Turnstile is enabled | The Turnstile widget is an iframe |
| `frame-ancestors` | `'none'` | No embedding |
| `object-src` | `'none'` | |
| `base-uri` | `'self'` | |
| `form-action` | `'self' https://accounts.google.com` | Google sign-in redirect |
| `upgrade-insecure-requests` | present | Omitted in local dev |
| `report-uri` | Sentry's CSP report endpoint | |

**Other headers**

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`. Add `preload` only after launch, once every subdomain serves HTTPS (preload is hard to undo) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `X-Frame-Options` | `DENY` (legacy twin of `frame-ancestors`) |
| `Cache-Control` | `no-store` on `/api/*` unless the route sets its own (replays use `private, max-age=3600`). Hashed static assets use immutable caching |

Rollout: the CSP ships as `Content-Security-Policy-Report-Only` on staging for one release, then is enforced. Locally (`APP_ENV=development`) it stays report-only and HSTS and `upgrade-insecure-requests` are omitted, so `http://localhost` keeps working. The whole allowlist is one constant in `apps/server`, and the Origin allowlist used for CSRF checks (`ALLOWED_ORIGINS`) lives next to it.

**Internal endpoints.** `/metrics` answers only to `Authorization: Bearer $METRICS_TOKEN` ([observability](../06-infrastructure/observability.md)) and is excluded from request logs. `/healthz` and `/readyz` are unauthenticated, because Render's health check can't send a token, so they return only the fields defined in [hosting](../06-infrastructure/hosting.md) and never database error text.

## Rate limits

REST limits use `@fastify/rate-limit`, keyed per user when signed in and per IP otherwise. The server must trust Render's proxy for the client IP: set Fastify's `trustProxy` to the number of Render proxy hops rather than `true`, and verify on staging that `request.ip` is the player's address, not a left-most `X-Forwarded-For` entry the client can pre-fill. Without it every player shares the proxy IP and the IP limits block everyone. A limited request gets `429` with `Retry-After`.

All numbers are provisional. Route paths for features that have no endpoint doc yet are fixed when their SRV item lands; the limits are the contract. Each limit is a named constant in the server's HTTP module so this table and the code can be diffed. WebSocket limits are in [realtime-protocol](realtime-protocol.md).

| Route / action | Limit | Notes |
|---|---|---|
| Global | 300/min per IP, 600/min per user | |
| Email-sending auth routes: send code, create account, reset (`/api/auth/*`) | 10/hour per IP; 3 per 10 min and 1 per 60 s per address | Turnstile when its flag is on. Numbers match [auth](auth.md#email-resend) |
| Password sign-in (`/api/auth/*`) | 20/hour per IP, 10/hour per address | Failures also feed the Turnstile trigger (5 per IP) |
| Code verification | 5 attempts per code, then the code is invalid | Better Auth setting |
| New accounts | 10/day per IP | Shared networks (schools, dorms) may need an allowlist |
| Password set, change, reset | 5/hour per user | HIBP lookup fails closed (see [auth](auth.md#breached-password-check)) |
| `POST /api/ws-ticket` | 10/min per user | |
| `GET /api/campaign` | 30/min per user | |
| `PUT /api/campaign` | 6/min per user, body ≤ 200 KB | Client autosaves every 30 s; 10 files × 16 KB plus state |
| `POST /api/campaign/contracts/:contractId/start`, `POST /api/campaign/free-farm/start` | 20/min per user | |
| `POST /api/campaign/runs` | 1 per 60 s (Free Farm), 10/min (contracts) | Receipt caps are in [saves-and-persistence](saves-and-persistence.md) |
| `POST /api/campaign/unlock` | 20/min per user | |
| `GET /api/matches/:id/replay` | 60/min per user | Signed-in only |
| Room code join | 10/min per user | [rooms-and-lobbies](rooms-and-lobbies.md) |
| Handle search | 30/min per user | Prefix ≥ 3 chars, max 10 results, exact match ranked first. No listing endpoint exists |
| Friend requests | 10/min and 100/day per user | Max 20 pending outgoing ([social](social.md)) |
| Reports | 5/hour and 20/day per user | One report per reporter per target per 24 h ([moderation](../08-legal-safety/moderation.md)) |
| Shop purchase | 10/min per user | `Idempotency-Key` required |
| Profile update (handle, loadout, settings) | 30/min per user | Handle change once per 30 days |
| Data export | 1/day per user | |
| Account deletion | 3/day per user | |
| `POST /api/webhooks/resend` | Exempt from IP limits | Svix signature required |
| `/api/admin/*` | 60/min per admin | |
| `/healthz`, `/readyz`, `/metrics` | Exempt | `/metrics` needs the bearer token |

## Secrets & config

- Secrets live in Render environment groups (one per environment: `harvest-preview`, `harvest-staging`, `harvest-prod`) and in GitHub Actions secrets. Never in the repo. `.env.example` documents names only.
- The single owner checklist of accounts, credentials, DNS records, OAuth settings, CI secrets and repo settings, including which environment each one belongs to and the step-by-step rotation for each secret, is [connections](../06-infrastructure/connections.md). It is not repeated here.
- Preview and staging use their own env groups with their own keys. Nothing is copied from `harvest-prod` (see [environments-and-ci](../06-infrastructure/environments-and-ci.md)).
- GitHub secret scanning and Dependabot are enabled on the repo.

**Rotation policy.** Rotate every secret yearly, and immediately on suspected exposure. Effects worth knowing before you do it:

- `BETTER_AUTH_SECRET` invalidates every session cookie: all players sign in again. Do it in a maintenance window (drain mode) with the banner up, and only on exposure.
- `DATABASE_URL` / `DATABASE_URL_UNPOOLED`: reset the role password in Neon, update the env group, redeploy (about a minute of reconnects).
- `GOOGLE_CLIENT_SECRET`: a Google OAuth client can hold two secrets, so add the new one, deploy, then delete the old one.
- `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`: create a new send-only, domain-scoped key and re-issue the webhook secret in Resend, update the env group, deploy, revoke the old ones.
- `METRICS_TOKEN` lives in the env group and the Grafana scrape config: update both together.
- `SENTRY_DSN` and `VITE_SENTRY_DSN` are not secret (the web DSN ships in the bundle). Rotate them only on abuse.
- Record the date of each rotation (never the value) in connections.

**Account baseline.** Every provider account (GitHub, Render, Neon, Google Cloud, Resend, Cloudflare if Turnstile is used, Sentry, the domain registrar) uses the owner's email, hardware-key or TOTP 2FA, and recovery codes kept in a password manager. No shared logins. Claude and CI get scoped API keys, never account passwords.
