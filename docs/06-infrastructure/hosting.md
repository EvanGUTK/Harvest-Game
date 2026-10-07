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
- **Health checks.** Render's health check path is `/healthz` = **liveness only**. It returns 200 with `{ uptime, eventLoopLagMs, roomsActive }` whenever the process is up. It never touches the DB (so Neon can autosuspend idle previews and staging) and never fails on event-loop lag: a failed health check makes Render restart the instance, which would destroy every in-memory room. Lag is alerted via `/metrics` (see [observability](observability.md)). A separate `/readyz` (`select 1` on the pooled connection) is **not** configured as Render's health check; the release workflow calls it once after a deploy, and `e2e.yml` uses it as its "preview env ready" gate.
- **Graceful deploys.** Render gives a process at most **300 s** between `SIGTERM` and `SIGKILL` (`maxShutdownDelaySeconds: 300` in `render.yaml`; the default is 30 s; verify the current limit when the accounts are created and record it in ADR-0004). A showdown (10:00 coding phase plus a finale of up to 120 s; custom rooms allow up to 15:00 of coding) is longer than that, so draining happens *before* the deploy, not during it:
  1. The prod release workflow calls `POST /api/admin/drain` (admin role, see [data-model](../03-architecture/data-model.md) and [auth](../03-architecture/auth.md); part of SRV-14, which also defines the CI credential, listed in [connections](connections.md)). The server stops accepting new rooms, room joins and queue entries (refused with `error{code:'MAINTENANCE'}`), closes rooms still in **Lobby** immediately, shows the maintenance banner ([screen-flow](../05-ux/screen-flow.md)), and reports `roomsActive` (rooms in coding, locking, executing or finale) on `/healthz`.
  2. The workflow polls `/healthz` until `roomsActive == 0` or 20 min elapse, then fires the Render deploy hook.
  3. On `SIGTERM` the server closes sockets with `error{code:'SERVER_RESTARTING'}` and exits well inside the 300 s window. Any room still alive at that point is abandoned without rewards or persistence (a documented edge case; players see the maintenance banner).
  4. `POST /api/admin/undrain` reverts step 1 if a release is cancelled.

  Staging deploys (automatic on merge to `main`) skip the drain and simply kill in-flight staging rooms. Rooms are never snapshotted or restored across deploys in v1 (see [rooms-and-lobbies](../03-architecture/rooms-and-lobbies.md)).
- Render Key Value (Redis-compatible) is added only at scale-out (see system-overview).

## Render service definition (`render.yaml`, Blueprint)

Option A (single service) is declared as code in a root `render.yaml`: **two web services from the same repo**, one per long-lived environment, matching the release process in [environments-and-ci](environments-and-ci.md). Exact paths are fixed when OPS-02.1 is built.

| Setting | `harvest-staging` | `harvest-prod` |
|---|---|---|
| Type / runtime | web service, `node` | web service, `node` |
| Plan | smallest paid instance (see [cost-estimate](cost-estimate.md)) | smallest paid instance; upgrade before launch |
| Branch / deploy trigger | `main`, `autoDeploy: true` (merge to `main` deploys staging) | `main`, `autoDeploy: false`; the release workflow fires the deploy hook after manual approval |
| Build command | `pnpm install --frozen-lockfile && pnpm build` | same |
| Start command | `node apps/server/dist/main.js` | same |
| Pre-deploy command | `pnpm --filter @harvest/db migrate` on the **direct** (unpooled) Neon URL; expand-phase migrations run before traffic switches | same |
| Health check path | `/healthz` | `/healthz` |
| `maxShutdownDelaySeconds` | 300 (Render's maximum) | 300 |
| Env group | `harvest-staging` | `harvest-prod` |
| PR previews | `generation: automatic`, free instance type, cloned from the staging service | off |

Notes:

- `pnpm build` is the root script `pnpm -r build`. It bakes assets (`tools/voxel-bake`, `tools/audio-build` → `apps/web/public/assets`), builds `apps/web` and builds `apps/server`. **Render builds from source in its own build step, not in GitHub Actions**, so the asset bake must be part of this command or the deployed app has no assets. CI (`ci.yml`) runs the same script.
- Node version comes from `.nvmrc` (22). pnpm is selected from the `packageManager` field in `package.json` (Render enables Corepack for it, so no `corepack enable` step).
- One Render env group per environment (`harvest-preview`, `harvest-staging`, `harvest-prod`). Variable names must match `.env.example`; the full list is in [connections](connections.md).
- Render does not run `preDeployCommand` on free preview instances. Preview databases therefore get their migrations when CI creates the `preview/pr-<n>` Neon branch ([data-model](../03-architecture/data-model.md)), and `e2e.yml` waits for the preview's `/readyz` before running.

## Regions

Provisional default: Render region **Ohio (US East)** and Neon project region **AWS us-east-2 (Ohio)**, so DB round-trips stay around 1 ms. A Render service in another region talking to a Neon project in `us-east-1` or elsewhere adds tens of milliseconds to every receipt verification and auth check. If EU players dominate later, move both together. Record the chosen regions in `STATE.md` and [connections](connections.md) when the accounts are created.

## Neon specifics

- Branches: `main` (prod), `dev`, `staging`, and `preview/pr-<n>` created by CI.
- **Branch parents and data isolation.** `staging` and `preview/pr-<n>` are created from `dev`, **never from `main`**. `dev` holds only the migrated schema plus synthetic seed data from `packages/db/seed` (fake accounts, bot programs, a handful of finished matches), and is rebuilt from an empty schema plus seed whenever migrations change. Production data never leaves `main`. CI must pass `--parent dev` explicitly, because Neon's default parent is the project's default branch, i.e. `main`. A branch is a copy-on-write clone, so branching from `main` would put every user's email, Google account id and programs behind a preview URL and defeat the minimisation and 30-day hard-delete promises in [privacy-and-age](../08-legal-safety/privacy-and-age.md). If a prod-shaped dataset is ever needed (M8 load test, OPS-05), create a short-lived branch from `main`, run the anonymisation script (DB-07) and delete the branch within 24 h; it never gets a public Render URL.
- Pooled connection for app traffic, direct for migrations and for `pg_dump`.
- Free plan (per project): 100 CU-hours/month, 0.5 GB storage, 5 GB egress. That's fine for dev and early prod. Move to a paid plan before launch for more storage and a longer point-in-time-restore window (see Backups & restore). Health checks must not query the DB, or autosuspend never happens and the CU-hours quota burns down on idle branches.

## Backups & restore

Targets (provisional): **RPO** minutes for incidents inside the PITR window (restore to any timestamp), at most 24 h if Neon itself is lost (nightly off-provider dump). **RTO** 2 hours.

- **PITR (Neon instant restore):** branch history gives point-in-time restore. The window depends on plan: on the Free plan it is only hours (6 h at the time of writing), Launch up to 7 days, Scale 14, Business 30. Verify on Neon's pricing page at sign-up. Before the closed beta move the project to **Launch** and set the `main` branch restore window to **7 days** (fits the existing Neon line in [cost-estimate](cost-estimate.md)).
- **Logical backups (`backup.yml`, nightly, starting when prod data first exists, M2):** `pg_dump --format=custom` of `main` from a GitHub Actions cron, over the **direct (unpooled)** connection (`pg_dump` cannot run through the pooler) and a dedicated read-only Postgres role `backup_ro` (created in a migration). The dump is encrypted with `age` (public key as a GitHub Actions secret, private key only in the owner's password manager) and uploaded to an owner-controlled S3-compatible bucket (default **Cloudflare R2**: free tier, zero egress; alternative Backblaze B2). Retention is **30 days** only, with a bucket lifecycle rule, so deleted accounts also leave backups inside the 30-day promise in [privacy-and-age](../08-legal-safety/privacy-and-age.md). Each run is verified with `pg_restore --list`. Secret names and the bucket account are listed in [connections](connections.md).
- **Restore runbook:**
  1. Create a Neon branch from `main` at timestamp T (or `pg_restore` the latest dump into a fresh branch if T is outside the window).
  2. Point **staging** at it, then run `/readyz` and the smoke e2e.
  3. Swap the prod `DATABASE_URL` in the Render env group to the new branch (Neon keeps the old one as `main_old_<ts>`).
  4. Run the DB-06 ledger reconciliation (`sum(ledger) = wallet_credits`) before reopening queues.
  5. **Re-apply privacy deletions.** Any account hard-deleted between T and now is resurrected by the restore, so re-run the DB-06 deletion job against the soft-delete timestamps. The deletion job also appends opaque user ids and timestamps (no emails or handles) to a deletion log in the backup bucket, kept 30 days, so this is possible even when the restore predates the deletions.
  6. Post a patch note saying that credits earned between T and the restore were lost and how comp will be handled.
- **Bad migration:** record the timestamp before each prod migration in the release log; rolling back is a PITR restore to that timestamp (runbook above).
- **Drill:** once per quarter, restore the newest dump into `staging`, run row counts and the ledger reconciliation, and record the date and duration in `STATE.md` (OPS-06). The first drill is an M8 exit criterion.
- **Render holds no state.** Rooms and queues are in memory and lost on restart (accepted; see [rooms-and-lobbies](../03-architecture/rooms-and-lobbies.md)).

## Domains & email

The owner checklist of every account, credential, DNS record, OAuth setting, CI secret and repo setting lives in [connections](connections.md). This section holds the how-to detail for the domain, email and Google sign-in.

- **Domain:** buy one at any registrar. Point `play.<domain>` (and `api.<domain>` if option B) and `staging.<domain>` at Render using the CNAME targets Render shows.
- **Resend:** add a sending subdomain `mail.<domain>` in the Resend dashboard, then create the records it shows at your DNS host (an MX and a TXT/SPF record on `mail`, a DKIM TXT under `_domainkey`, and a `_dmarc` TXT, starting with `p=none`). Copy the values from Resend's domain page rather than from this doc, since they are account-specific. Verify the domain in Resend, then set `EMAIL_FROM="Code Harvest <login@mail.<domain>>"`. Resend's free plan allows 1 verified domain, 3,000 emails/month and **100/day** (HTTP 429 above that; verify current limits). Every sign-in code, verification and reset is one email, so upgrade to Pro (about $20/mo, 50k emails) before any beta-invite wave that could exceed 100 emails in a day.
- **Google OAuth app (OPS-03, M2):**
  - Create a Google Cloud project (`code-harvest`, working title per D-01) with an OAuth consent screen of type **External**, app name Code Harvest, and scopes `openid email profile` only. These are non-sensitive scopes, so no Google verification review is needed to publish.
  - Authorised redirect URIs must match exactly (no wildcards). Better Auth's callback path is `/api/auth/callback/google`, so register `https://play.<domain>/api/auth/callback/google`, `https://staging.<domain>/api/auth/callback/google` and `http://localhost:<server dev port>/api/auth/callback/google`. Under option B the callback is served by whichever host runs Better Auth (`api.<domain>`).
  - Keep the consent screen in **Testing** (at most 100 listed test-user emails: us, friends, M5 test accounts) through M2 to M7. Testing does not need a privacy-policy URL, but publishing does. Publish before the closed beta (M8), once the homepage and privacy-policy URLs are set on the consent screen and the domain is verified in Google Search Console (LEG-02a provides the draft pages in M2; LEG-02b publishes). Our sign-in screen links the terms regardless.
  - Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the Render env group.
  - **Preview environments cannot offer Google sign-in**: `*-pr-<n>.onrender.com` hostnames change per PR and cannot be pre-registered. Previews run without `GOOGLE_CLIENT_ID`, hide the Google button and use the email-code flow (which is what `e2e.yml` already does).
