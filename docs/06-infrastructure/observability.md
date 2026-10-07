# Observability

| Signal | Tool | What |
|---|---|---|
| Errors (client + server) | Sentry | Exceptions, unhandled rejections, release tagging, source maps |
| Logs | pino JSON → Render log stream | Request logs, room lifecycle, matchmaking decisions (sampled). Allowed fields: see [What may be logged](#what-may-be-logged-pii-policy) |
| Metrics | `prom-client` in the server exposes `/metrics` (Prometheus format), protected by a bearer token (`METRICS_TOKEN`); scraped by the Grafana Cloud free tier **Metrics Endpoint** integration (optional; Sentry and pino cover M2–M7, enable at OPS-04) | See below |
| Product analytics | Plausible Cloud (cookieless, EU-hosted, no cookie banner; proposed default, to be confirmed as a decision in [decisions-needed](../00-overview/decisions-needed.md)) | Funnel as named custom events: `signed_up` (onboarding finished) → `tutorial_completed` → `chapter_1_completed` → `first_showdown_played` |

Every account, token, DNS record and environment variable named on this page is listed once in the owner checklist, [connections](connections.md).

## Setup (OPS-04)

- **Sentry.** Two projects: `harvest-server` (node) and `harvest-web` (browser), plus one auth token with `project:releases` and `org:read` scopes. Runtime DSNs: `SENTRY_DSN` (server) and `VITE_SENTRY_DSN` (web; public, baked into the Vite build). Source maps are uploaded during `pnpm build`, which runs on Render (see [hosting](hosting.md)), so `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB` and `SENTRY_PROJECT_SERVER` are **build-time secrets in the Render env group**, not GitHub Actions secrets. The release id is Render's `RENDER_GIT_COMMIT` (locally it falls back to `git rev-parse HEAD`). Sampling: 100 % of errors, ≤ 10 % of traces, to stay on the free tier ([cost-estimate](cost-estimate.md)). The browser SDK needs a `connect-src` entry for the Sentry ingest host, or the SDK `tunnel` option; the CSP lives in [security-anti-cheat](../03-architecture/security-anti-cheat.md).
- **Metrics.** Grafana Cloud pulls from a public URL only when it is authenticated, so `/metrics` answers 404 unless the request carries `Authorization: Bearer <METRICS_TOKEN>`. This also keeps queue sizes and socket counts private on the shared player origin. The owner creates a Grafana Cloud stack, adds a Metrics Endpoint scrape job for `https://play.<domain>/metrics` with that bearer token (the integration scrapes every 60 s), and adds `METRICS_TOKEN` to the Render env group. If the integration is unavailable on the free plan when OPS-04 starts, fall back to pushing from the server with Prometheus `remote_write` (or a Grafana Alloy private service under hosting Option B). Verify at OPS-04.
- **Analytics.** The Plausible script is loaded through a same-origin proxy route on the Fastify server, so the CSP stays `script-src 'self'` and only `connect-src` gains `https://plausible.io`. The public build variable is `VITE_PLAUSIBLE_DOMAIN` (`play.<domain>`). Events carry no user id, handle or email.

## Key metrics

- **Realtime:** connected sockets, messages/s by type, event-loop lag p99, reconnect rate
- **Matchmaking:** queue size by mode and rank, wait p50/p90, ready-check success rate, decline rate
- **Execution:** showdown execution ms p50/p99, compile failures at lock, runtime-error rate
- **Economy:** credits minted/spent per day, ledger reconciliation status, receipt mismatch rate, receipt rejection rate (by code: `RECEIPT_REJECTED`, `RECEIPT_ALREADY_USED`, `FREE_FARM_SESSION_STALE`)
- **Campaign:** completion rate per contract, median attempts, the most common error codes per chapter (drives lesson rewrites)
- **Email and auth:** `email_sent`, `email_bounced`, `email_complained`, `hibp_unavailable`, count of `428 TERMS_OUTDATED` responses

## What may be logged (PII policy)

Logs go to Render and errors go to Sentry, both third parties, so what they receive is fixed here.

- **Allowed fields:** `userId` (uuid), a hash of the session id, `roomId`, `matchId`, `receiptId`, message type, counts, durations and error codes.
- **Never logged:** email, handle, cookies, `Authorization`, OTP codes, passwords, WebSocket tickets, program source, `report.note`, and request or response bodies. (The birth year typed on the landing screen never reaches the server at all.) IP addresses appear only in rate-limit and abuse log lines, kept ≤ 30 days (see [privacy-and-age](../08-legal-safety/privacy-and-age.md)).
- **pino redaction (paths):** `req.headers.cookie`, `req.headers.authorization`, `req.headers["x-forwarded-for"]`, `req.query.ticket`, `*.email`, `*.password`, `*.otp`, `*.code`, `*.source`, `*.note`, with the censor string `[redacted]`. The request serializer logs the URL path with the query string stripped for `/ws` and `/api/auth/*`. The `/ws?ticket=` URL therefore never appears in our logs, and the ticket is single-use with a 30 s TTL ([realtime-protocol](../03-architecture/realtime-protocol.md)), so even Render's own access log can't replay it. Log level is `info` in production, never `debug`.
- **Anomaly logs** (receipt mismatch, ledger drift) store ids only. The program source is already kept in `run_receipt`.
- **Sentry:** `sendDefaultPii: false`. `beforeSend` drops `request.cookies` and `request.headers`, removes any `source` or `email` key, and truncates breadcrumbs. IP addresses are not collected (the project's "Prevent Storing of IP Addresses" scrubbing option is on), matching the data table in [privacy-and-age](../08-legal-safety/privacy-and-age.md). Session replay is off (if it is ever enabled it must mask all text). Release = `RENDER_GIT_COMMIT`; environment = `staging` or `prod`.
- **Retention:** Render's log retention is set by Render's plan. If it ever exceeds 30 days, add a log drain with 30-day retention (for example Better Stack or Grafana Loki free tier) and shorten the Render retention.

## Alerts

Event-loop lag p99 > 200 ms for 5 min · execution p99 > 1 s · ready-check success < 60 % · ledger reconciliation failure · receipt mismatch > 1 % of receipts in an hour · 5xx > 1 % · email complaint rate > 0.1 % per day · daily email sends > 70 % of the Resend plan cap. Event-loop lag is alerted from `/metrics` (it is deliberately not part of Render's `/healthz` check, see [hosting](hosting.md)).

## Alert routing and on-call (solo-developer baseline)

- **External uptime:** an uptime monitor (Better Stack or UptimeRobot free tier) checks `/healthz` (process up) and, for prod only, `/readyz` (DB reachable) every minute. Two consecutive failures push and SMS the owner. The process-down case can't alert through `/metrics`, which is why this check is external. Staging and previews are not monitored, so Neon can autosuspend them. Set up the uptime monitor skeleton in M2 and finish it in M8.
- **Sentry:** alerts for a new issue in prod, or > 50 events in 5 min, by email and push (Sentry mobile app).
- **Grafana Cloud:** alert rules for the thresholds above go to the same contact point (the owner's email; Slack later if wanted). **Page-level:** ledger drift and receipt-mismatch spikes. Everything else is next-morning.
- **Severity:** **S1** players can't sign in or play (respond within 30 min, status update hourly) · **S2** one mode degraded (same day) · **S3** cosmetic (backlog).

## Maintenance and status

- **Maintenance mode is the drain state** from [hosting](hosting.md) (`POST /api/admin/drain`, undone by `/undrain`; SRV-14). It refuses new rooms, joins and queue entries with `error{code:'MAINTENANCE'}` and shows the screen-flow maintenance banner. It is used for deploys and equally for manual maintenance such as a Neon or Resend outage. There is no separate flag system.
- **Status page (optional, M8):** a free hosted status page at `status.<domain>`, linked from the sign-in screen's error states.

## Runbooks

One short section per failure in `docs/06-infrastructure/runbooks.md` (not yet written; skeleton in M2, complete in M8): database unreachable (Neon suspended or quota) · Resend outage or quota hit (email codes and sign-up are down, Google and existing password sign-ins still work) · Google OAuth error (redirect URI or consent screen) · WebSocket flood from one network (turn on Cloudflare proxying) · ledger drift · receipt-mismatch spike · leaked secret (rotate it in the owning account, update the Render env group, redeploy; every secret is listed in [connections](connections.md)) · restore from backup (OPS-06 drill).

## Security incidents

- `/.well-known/security.txt` publishes `Contact: mailto:security@<domain>` and a policy page. Reports get a reply within 3 days.
- **Personal-data breach:** contain, assess, and record. Under GDPR, notify the lead supervisory authority within **72 hours** of becoming aware unless the breach is unlikely to put players at risk, and notify affected players without undue delay when the risk is high. Not legal advice; confirm with the lawyer reviewing [privacy-and-age](../08-legal-safety/privacy-and-age.md). The notification template lives in the runbooks.
- Every incident gets `docs/06-infrastructure/incidents/YYYY-MM-DD.md` with timeline, impact, root cause and actions (with backlog ids), created when the first incident happens.
