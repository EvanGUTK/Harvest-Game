# Hosting

## Your options, evaluated

| Option | Fit | Verdict |
|---|---|---|
| **Render** (web service + static site) | Long-running Node processes, WebSockets, custom domains, env groups, preview environments | ✅ **Game server and web client** |
| **Neon** (serverless Postgres) | Managed Postgres, branching, pooled connections, scale-to-zero | ✅ **Database** |
| **ChatGPT Sites** | OpenAI's site builder/host (public beta July 2026). Runs on a Cloudflare Workers-based edge runtime with D1 (SQLite) and R2 storage. Aimed at internal tools, dashboards and prototypes. Paid ChatGPT plans only, and not available in the EEA/UK/Switzerland | ❌ **Not for the game.** An edge-function runtime has no long-lived authoritative room process for WebSockets, the DB is D1 rather than Postgres, the code would be generated and managed inside ChatGPT rather than this repo, and region restrictions would block some players. *Could* host a throwaway marketing or devlog page, but a Render static site does that too, so there's no need |

## Recommended topology

### Option A: single service (simplest, recommended for M1–M5)

```
Render Web Service "harvest" (Node)
 ├─ serves built apps/web as static files (Fastify static, immutable cache headers)
 ├─ /api/*   REST + Better Auth
 └─ /ws      WebSocket
        │
        └── Neon Postgres (pooled URL)
```

- One origin, so there are no CORS or cookie headaches and only one thing to deploy.
- Custom domain such as `play.<yourdomain>`.

### Option B: split (when traffic justifies it)

```
Render Static Site "harvest-web"  → play.<domain>   (Render's global CDN)
Render Web Service "harvest-api"  → api.<domain>    (REST + WS)
```

Same registrable domain, so cookies stay first-party (see [auth](../03-architecture/auth.md)).

## Render specifics

- **Don't use the free instance for the game server.** Free web services spin down after 15 minutes without HTTP requests or inbound WebSocket messages, and take about a minute to spin up. Since Feb 2026, inbound WebSocket messages do count as activity, but a cold start still means the first player of the day waits a minute and in-memory rooms vanish on spin-down. Use the free tier for **preview environments** and a paid always-on instance for production.
- Health check path: `/healthz` (DB ping + event loop lag).
- **Graceful deploys:** on `SIGTERM`, stop accepting new rooms and queue entries, broadcast "server updating, finish your match", then wait for active rooms (max 20 min, so set Render's shutdown delay to match) and exit.
- Render Key Value (Redis-compatible) is added only at scale-out (see system-overview).

## Neon specifics

- Branches: `main` (prod), `staging`, and `preview/pr-<n>` created by CI.
- Pooled connection for app traffic, direct for migrations.
- Free plan (per project): 100 CU-hours/month, 0.5 GB storage, 5 GB egress. That's fine for dev and early prod. Move to a paid plan before launch for more storage and point-in-time-restore window.

## Domains & email

- Buy a domain (any registrar), point `play.` (and `api.` if option B) at Render, and `mail.` DNS records (SPF/DKIM/DMARC) at Resend.
- Google OAuth consent screen: production redirect URIs for the domain plus `localhost` for dev.
