# Environments & CI

Only `ci.yml` exists today. Every other workflow below is added with the code it tests (see `STATE.md`). Every account, credential, DNS record, OAuth setting, CI secret and repo setting these workflows depend on is listed once, in the owner checklist [connections](connections.md). Rows below name the secrets a workflow reads, not how to obtain them.

## Environments

| Env | Web + server | DB | Purpose |
|---|---|---|---|
| **local** | `pnpm dev`: Vite on `:5173` plus the server on `:3000` with watch, one origin through a Vite proxy (see [Local setup](#local-setup)) | Neon `dev` branch (schema + synthetic seed only; or a personal child `dev/<name>`), or local Postgres via Docker | Daily dev. Email codes print to the console |
| **preview** | Render preview environment per PR (free instances OK) | Neon branch `preview/<branch-slug>` (parent `dev`, synthetic data) | Review features with real URLs. Google sign-in is unavailable (the hostname is dynamic); sign-in is by email test OTP only (see [Test sign-in](#test-sign-in-local-preview-and-staging-only)) |
| **staging** | Render (paid, smallest), auto-deploys `main` | Neon `staging` branch (parent `dev`, synthetic data) | Load tests, release candidates, smoke e2e |
| **prod** | Render (paid), deploys only through `release.yml` | Neon `main` | Players |

**Until the closed beta** (from the M2 deploy), a single `staging` Render service is the only deployed environment and doubles as the test prod. The separate `prod` service is created when the first external testers join (closed beta). Before then, "Promote to prod" in [Release process](#release-process) has nothing to promote to.

`APP_ENV` (`development` \| `preview` \| `staging` \| `production`) names the environment to the server. `render.yaml` sets it on every service (`previewValue: preview` for previews); `.env.example` sets `development`.

### Neon branches

| Branch | Forked from | Data | Lifecycle |
|---|---|---|---|
| `main` | n/a | Real player data | Prod. Protected. Never the parent of another branch, except a private restore-drill branch deleted the same day |
| `dev` | `main` while it is still empty (M2 setup), then maintained independently | Synthetic only (`pnpm db:seed`) | Parent of `staging`, `ci`, previews and personal branches. Default for local `pnpm dev` |
| `staging` | `dev` | Synthetic only, plus the e2e seed accounts | Receives every migration before prod does (Pre-Deploy on each `main` deploy) |
| `ci` | `dev` | Empty schema | Integration tests. Reset and migrated at job start |
| `dev/<name>` | `dev` | Synthetic | Optional, one per developer |
| `preview/<branch-slug>` | `dev` | Synthetic plus the e2e seed accounts | Created by `preview-db.yml`, deleted when the PR closes |

- **Previews and staging never contain player data.** No preview or staging branch is ever forked from `main`.
- **Branch budget.** Neon's Free plan caps branches per project at 10 (provisional: verify on Neon's pricing page), and branch compute counts toward the 100 CU-hours/month. Four long-lived branches (`main`, `dev`, `staging`, `ci`) leave about six for previews and personal branches. The weekly prune job in `preview-db.yml` keeps stale previews from exhausting the cap.
- **Slug.** `<branch-slug>` is the PR's git branch lowercased, every run of characters outside `[a-z0-9]` replaced by `-`, truncated to 40 characters. One shared helper in `tools/` computes it for both the workflow and the preview start script.

### Previews are isolated from staging and prod

- Render previews copy the base service's env vars, so a preview would otherwise inherit staging's `DATABASE_URL` and secrets. Therefore every secret and database variable in `render.yaml` has an explicit `previewValue`: a placeholder (database URLs) or a preview-only value. A misconfigured preview fails fast instead of writing to staging.
- Previews carry no Google client and no Resend key. Google redirect URIs cannot be wildcards, and per-PR URLs are not known in advance, so Google sign-in does not work in a preview. Reviewers and Playwright sign in with the test OTP.
- Previews run on Render free instances, which have no Pre-Deploy Command, so migrations for a preview are applied by `preview-db.yml`, not by Render.

### Handing the Neon branch to a preview

1. `preview-db.yml` creates `preview/<branch-slug>` (see CI table) and migrates and seeds it.
2. The preview service holds `NEON_API_KEY` and `NEON_PROJECT_ID` (project-scoped where Neon's plan allows it; treat as sensitive). When Render's built-in `IS_PULL_REQUEST=true`, the server's start script resolves the pooled and direct connection strings of `preview/<branch-slug>` from the Neon API (`neonctl connection-string`), taking the git branch from Render's `RENDER_GIT_BRANCH` (Render exposes the branch, not the PR number).
3. The start script waits up to 5 minutes for the branch to exist and for its migration journal to contain every migration in the build (CI creates and migrates the branch while Render builds), then exits non-zero. It never falls back to the inherited URL, and the server refuses to start in a preview if the resolved branch does not exist.

**Fallback** (if boot-time resolution is rejected in OPS-02): `preview-db.yml` finds the preview service with the Render API (`GET /v1/services?name=harvest-pr-<n>`), sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` with `PUT /v1/services/{id}/env-vars` (Render has no PATCH on this route), then triggers `POST /v1/services/{id}/deploys`. It must tolerate the service not existing yet (poll). This needs no extra secret beyond `RENDER_API_KEY`, which `e2e.yml` and `release.yml` already use.

## Local setup

- `pnpm dev` starts Vite on `:5173` and the server on `:3000` (`PORT`, the variable Render also sets). Vite's `server.proxy` forwards `/api` and `/ws` (`ws: true`) to `:3000`, so the browser sees **one origin**, exactly as in prod (hosting option A, ADR-0004). No CORS configuration exists anywhere. Better Auth's trusted origin in dev is `http://localhost:5173`. `VITE_API_URL` and `VITE_WS_URL` are set only for the split topology (hosting option B); under option A the client is same-origin in every environment.
- **DB, pick one.**
  - (a) `docker compose up -d db` from a root `docker-compose.yml`: Postgres at the same major version as the Neon project (pinned in the compose file), host port `5433` to avoid clashing with a system Postgres, `DATABASE_URL=postgres://harvest:harvest@localhost:5433/harvest`, and `DATABASE_URL_UNPOOLED` set to the same value.
  - (b) Neon `dev`, or a personal child created with `neonctl branches create --parent dev --name dev/<name>`, with the pooled URL in `DATABASE_URL` and the direct URL in `DATABASE_URL_UNPOOLED`.
- `cp .env.example .env`, then `pnpm db:migrate` (Drizzle, uses `DATABASE_URL_UNPOOLED`) and `pnpm db:seed`. The seed creates synthetic users with completed onboarding (handle, Terms accepted, `birth_year_confirmed_13plus`) and a handful of finished matches and ledger rows for the results, replay and profile screens. Contracts, crops, the skill tree and bot programs are **not** seeded: they live in `packages/content` and are referenced by id (`contract_id`, `bot_id` in [data-model](../03-architecture/data-model.md)).
- Email codes and Google sign-in in dev: see [auth](../03-architecture/auth.md) §Email (console logging) and [hosting](hosting.md) §Domains & email (localhost redirect URI).

## CI (GitHub Actions)

| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | `pull_request`; push to `main` | install (`--frozen-lockfile`, pnpm cache) → `pnpm typecheck` → `pnpm lint` (incl. purity rules for `lang`/`sim`) → `pnpm format:check` → `pnpm test`. A `build` step (the root `pnpm build`, the script Render also runs, see [hosting](hosting.md)) is added with the first app (M1). It also runs `pnpm audit --prod --audit-level=high` and a production-dependency licence check (fail on GPL, AGPL or unknown, per [standards](../09-engineering/standards.md)), and every action is pinned to a full commit SHA. From M2 a separate `integration` job runs the server integration tests against the Neon `ci` branch (`DATABASE_URL_CI`, a direct URL; `concurrency: ci-db` queues runs so they never clobber each other; schema reset, then `migrate`, at job start) |
| `engines.yml` | `workflow_dispatch`, run by a `LANGUAGE_VERSION` or `RULES_VERSION` **major** bump PR | See [Release process](#release-process) step 6. Builds the retired major's engine bundle and commits it |
| `determinism.yml` | PR touching `packages/{lang,sim,content}` | `pnpm exec playwright install --with-deps chromium firefox webkit` (cache `~/.cache/ms-playwright` keyed on the Playwright version in the lockfile), then golden tests in Node + Playwright (Chromium, Firefox, WebKit), then compare state hashes. No external account |
| `differential.yml` | nightly | random-program differential tests vs CPython. `actions/setup-python` with `python-version: '3.12'` pinned; bump deliberately and re-run the full corpus, since `%`, `//` and comparison semantics are what is compared. No external account |
| `assets.yml` | PR touching `assets/` | license-manifest check, voxel bake, size budget check |
| `bench.yml` | PR touching `packages/{lang,sim}` | `pnpm bench` (`vitest bench --run`; script added with LANG-06.4): VM throughput + showdown execution time, fail on > 20 % regression |
| `preview-db.yml` | `workflow_call` (from `e2e.yml`); `pull_request` closed; weekly schedule | **Open / push (via `e2e.yml`):** `neondatabase/create-branch-action` creates `preview/<branch-slug>` from `dev` if it does not exist; runs `pnpm --filter @harvest/db migrate` against the branch's **direct** URL (`DATABASE_URL_UNPOOLED`); on first creation also runs `pnpm db:seed` and `pnpm db:seed:e2e`. Fails if the branch's migration journal holds migrations the PR lacks (rebase the PR). **Close:** `neondatabase/delete-branch-action` deletes the branch. **Weekly:** deletes any `preview/*` branch whose PR is closed or has had no push for 7 days (the next push recreates it). Secrets: `NEON_API_KEY`, `NEON_PROJECT_ID` |
| `e2e.yml` | `pull_request` | Job `db` calls `preview-db.yml`. Job `e2e` (`needs: db`) finds the PR's preview service through the Render API (`GET /v1/services?name=harvest-pr-<n>`; name pattern to confirm in OPS-02), polls `GET /v1/services/{id}/deploys` until the deploy for the PR head SHA is `live`, exports its URL as `E2E_BASE_URL`, installs the Playwright browsers as in `determinism.yml`, then runs Playwright: landing age gate → sign-in (test OTP) → onboarding → campaign contract 1-1 → 2-browser showdown in a custom room. Timeout 15 min. Secrets: `RENDER_API_KEY`, `AUTH_TEST_OTP_SECRET` |
| `smoke.yml` | push to `main` | Polls staging `/healthz` until its `commit` equals the pushed SHA (the server reports Render's `RENDER_GIT_COMMIT`), requires `GET /readyz` to return 200, then runs the smoke subset (sign-in by test OTP as seed account `e2e-1@e2e.test`, campaign contract 1-1) against the repository variable `STAGING_URL`, then publishes the commit status `smoke-staging` on that SHA. A SHA that staging skipped never gets the status and cannot be promoted. Timeout 15 min. Secret: `AUTH_TEST_OTP_SECRET` |
| `release.yml` | `workflow_dispatch`, input `sha` | See [Release process](#release-process). Secrets: `RENDER_API_KEY`, `RENDER_PROD_SERVICE_ID`, and the CI credential for `/api/admin/drain` (SRV-14, listed in [connections](connections.md)) |
| `backup.yml` | nightly (from M2, once prod data exists) | `pg_dump` of `main` over the direct URL as the read-only role `backup_ro` → `age` encrypt → upload to R2 → `pg_restore --list` verify. Details in [hosting](hosting.md#backups--restore); secret names in [connections](connections.md) |

## Secrets

Where each kind of secret lives (the owner checklist of every account, credential and setting is [connections](connections.md)):

- **Runtime secrets** live in Render environment groups (`harvest-preview`, `harvest-staging`, `harvest-prod`). The variable names are listed once, in `.env.example`.
- **CI-only secrets** live in GitHub Actions and never in `.env` or a Render env group: `NEON_API_KEY`, `NEON_PROJECT_ID`, `RENDER_API_KEY`, `RENDER_PROD_SERVICE_ID` (stored in the `production` Environment, which the manual approval in [Release process](#release-process) step 3 also needs; see connections), `DATABASE_URL_CI`, `AUTH_TEST_OTP_SECRET`, the `backup.yml` secrets and the `/api/admin/drain` credential; plus the repository variable `STAGING_URL`. Only `NEON_API_KEY` and `NEON_PROJECT_ID` (previews, for boot-time branch resolution) and `AUTH_TEST_OTP_SECRET` (staging and previews) are also set in Render.
- **Build-time secrets** for Sentry source-map upload (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_SERVER`) are variables in the Render env group, not GitHub Actions secrets, because the production build runs on Render ([hosting](hosting.md)).
- **Public build variables** are baked into the browser bundle and are not secret: `VITE_SENTRY_DSN`, `VITE_PLAUSIBLE_DOMAIN` (and the optional `VITE_API_URL`, `VITE_WS_URL`, `VITE_TURNSTILE_SITE_KEY`). `METRICS_TOKEN` is a runtime secret.

## Test sign-in (local, preview and staging only)

Better Auth's `emailOTP` has no built-in test code, so the server adds one, bounded as follows.

- When `AUTH_TEST_OTP_SECRET` is set and `APP_ENV` is `development`, `preview` or `staging`, the `sendVerificationOTP` hook skips Resend for addresses ending in `@e2e.test` (no mail is sent, no Resend quota used). The accepted code is the first 4 bytes of `HMAC-SHA256(AUTH_TEST_OTP_SECRET, email)` read as a big-endian uint32, mod 1,000,000, zero-padded to 6 digits. Playwright computes the same value.
- The server **refuses to boot** if `AUTH_TEST_OTP_SECRET` is set and `APP_ENV` is `production` or unset. The secret is never configured on prod.
- Test sign-ins keep the normal code TTL and attempt limit but are exempt from the per-IP send limit (every CI sign-in comes from one IP).
- Turnstile (SRV-02b) is off in previews, local and the e2e runs. `RESEND_WEBHOOK_SECRET` is set in staging and prod only.
- The test OTP replaces only email delivery. The landing-screen 13+ gate and onboarding are untouched: Playwright answers the birth-year picker like a player (a year that makes them 13+). `pnpm db:seed:e2e` seeds `e2e-1@e2e.test` … `e2e-12@e2e.test` (the 12 accounts the M5 exit check needs) already onboarded, with `birth_year_confirmed_13plus` true and the current Terms version accepted, so only the dedicated first-sign-in test walks the handle and Terms steps. The command runs after migrations on the `preview/<branch-slug>` branch and once on `staging`.

## Release process

1. **Merge to `main`** (merge commits, per [git-workflow](../09-engineering/git-workflow.md)). Render auto-deploys **staging**: this is Render-native, not a GitHub Actions step. It needs the Render GitHub App connected to the repo and a `render.yaml` Blueprint at the repo root: staging `autoDeploy: true`, branch `main`; prod `autoDeploy: false`, branch `main`; PR previews `previews: generation: automatic`. Staging's Pre-Deploy Command applies migrations first (step 4). Then `GET /readyz` on staging must return 200 before the smoke e2e starts.
2. **Smoke.** `smoke.yml` verifies that staging is serving exactly the merged SHA, runs the smoke e2e, and records the result as the `smoke-staging` commit status on that SHA.
3. **Promote to prod** (applies once the prod service exists, closed beta onward). `release.yml` (`workflow_dispatch`, input `sha`, defaulting to the newest `main` SHA with a green `smoke-staging`) runs in GitHub Environment `production` (required reviewer: the repo owner). It refuses a SHA that lacks the green status or is not an ancestor of `main`. **Drain:** the workflow calls `POST /api/admin/drain` and polls `/healthz` until `roomsActive == 0` (max 20 min), as described in [hosting](hosting.md#render-specifics). It then calls `POST /v1/services/{RENDER_PROD_SERVICE_ID}/deploys` with `{ "commitId": "<sha>" }`, which pins the smoke-tested commit (a plain deploy hook would redeploy whatever the tracked branch points at), and polls `GET /v1/services/{id}/deploys/{deployId}` until `live`, failing on `build_failed`, `update_failed` or `canceled`. If the deploy fails or the release is cancelled, it calls `POST /api/admin/undrain`. The server's `SIGTERM` handler plus Render's shutdown delay ([hosting](hosting.md)) cover anything still running when the new deploy goes live. On success it tags the SHA `v<yyyymmdd>.<n>`. **Rollback** is `release.yml` with a previous tag's SHA, supported one release back (a contract migration may have removed what older code reads).
   - *Approval-gate caveat.* Required reviewers on GitHub Environments need a public repo, or GitHub Pro/Team for a private one. If the repo is private on Free, the gate is the `workflow_dispatch` itself (only people with write access can run it); record which applies in [connections](connections.md).
4. **Migrations.** Generated with `drizzle-kit generate` into `packages/db/migrations/` and committed with the PR. Applied by `pnpm --filter @harvest/db migrate` (root alias `pnpm db:migrate`): a small script calling Drizzle's `migrate()` against `DATABASE_URL_UNPOOLED` (direct host). The app uses the pooled `DATABASE_URL` and **never migrates on boot**. Where it runs:
   - **Staging and prod:** Render's **Pre-Deploy Command**. It runs once per deploy before the new instance takes traffic while the old instance keeps serving. If it fails, Render aborts the deploy and the old instance stays up. So every migration in a release is **expand-only** (add nullable column, table or index, backfill). **Contract** migrations (drop, rename, `NOT NULL`) ship in a later release, once no deployed code reads the old shape.
   - **Preview:** `preview-db.yml` (free instances have no Pre-Deploy Command).
   - **CI integration tests:** at job start. **Local:** `pnpm db:migrate`.
5. **Versions.** A release that bumps `RULES_VERSION`, `LANGUAGE_VERSION` or `PROTOCOL_VERSION` already carries its line in `docs/07-roadmap/changelog.md`, added in the same commit as the bump ([standards](../09-engineering/standards.md)). A `RULES_VERSION` bump also needs an in-game patch note. `release.yml` adds no changelog entries; unversioned surfaces are not logged there.
6. **Retiring an engine.** On a `LANGUAGE_VERSION` or `RULES_VERSION` **major** bump, the bump PR also runs `engines.yml` (`workflow_dispatch`). It checks out the tag `engine-v<lang>.<rules>` of the previous major, builds `lang` + `sim` into a single ESM bundle `apps/web/public/engines/v<lang>.<rules>.js` (about 50 KB; the bundle pins the sim and rules versions it shipped with) and commits it. These files are git-tracked and immutable, an explicit exception to the "build outputs are gitignored" rule. The replay endpoint returns `410 ENGINE_RETIRED` for a match whose `languageVersion`/`rulesVersion` matches no bundled engine, and the client shows "This replay is from a retired engine" (see [saves-and-persistence](../03-architecture/saves-and-persistence.md)). The changelog row for the bump links the `engines.yml` run.
