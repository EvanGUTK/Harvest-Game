# Connections: the owner checklist

This file is the single list of every external connection Code Harvest needs, from local development to public launch: accounts, credentials, DNS records, OAuth settings, GitHub Actions secrets and repository settings. Other docs link here instead of repeating a table.

**Who uses it.** Evan sets up every account and pastes every credential; Claude cannot create accounts, buy domains or read dashboards. Claude and CI only ever receive scoped API keys, never account passwords ([security-anti-cheat](../03-architecture/security-anti-cheat.md) §Account baseline).

**Rules.**

- Every variable in `.env.example` and every account named in any doc appears here once. If you add a variable or an account anywhere else, add it here in the same PR (backlog OPS-07).
- Variable names come from `.env.example`. This file never introduces a name that `.env.example` or a doc does not already use, with one exception: the `backup.yml` secrets, whose naming [hosting](hosting.md) §Backups & restore delegates to this file.
- Values never appear in the repo. Record *that* something was set and *when* it was last rotated, never what it is.
- Where two docs disagree, this file follows [environments-and-ci](environments-and-ci.md) and [hosting](hosting.md), and the disagreement is listed in [Doc mismatches to fix](#doc-mismatches-to-fix).

Environment names used below: **local** (`pnpm dev`), **preview** (Render PR preview), **staging**, **prod**. Render env groups are `harvest-preview`, `harvest-staging`, `harvest-prod` (one per environment, nothing copied between them).

## Setup order by milestone

Tick items here as they are done. Each item names the doc that defines it.

### M0: before the first merge to `main`

Nothing blocks M0 code. These are repository settings, so they are one-time and free.

- [ ] GitHub 2FA (hardware key or TOTP) on the owner account; recovery codes in the password manager ([security-anti-cheat](../03-architecture/security-anti-cheat.md) §Account baseline)
- [ ] Branch protection on `main`: a PR is required, the `check` job from `ci.yml` is a required status check (add `determinism` once `determinism.yml` exists), 1 approving review, force pushes and deletion blocked ([git-workflow](../09-engineering/git-workflow.md), [standards](../09-engineering/standards.md) §Repo protection). See [Console steps: GitHub](#github-branch-protection-security-settings-secrets)
- [ ] Secret scanning with push protection on ([standards](../09-engineering/standards.md)). On a private repo on the Free plan this is not available: record the fallback decision (a `gitleaks` step in `ci.yml`) under [Record here](#record-here-when-accounts-are-created)
- [ ] Dependabot alerts and Dependabot security updates on. Version updates already come from `.github/dependabot.yml`
- [ ] Add `.github/CODEOWNERS` naming `@evanggoodman` for `/packages/db`, `/apps/server/src/http` and `/.github` ([standards](../09-engineering/standards.md))
- [ ] Record whether the repo is public, or private on Pro/Team, or private on Free. It decides whether the `production` Environment's required reviewer works ([environments-and-ci](environments-and-ci.md) §Release process) and whether secret scanning is available

### M1: Playground

No accounts. Install MagicaVoxel (free) and download the OFL fonts into `assets/fonts/` with their licence files ([asset-sourcing](../04-art-audio/asset-sourcing.md), [asset-pipeline](../04-art-audio/asset-pipeline.md)).

### M2: Accounts, campaign, first deploy (OPS-02, OPS-03, OPS-06, OPS-07, LEG-02a)

Do the domain first: it is baked into Resend DNS, the Google redirect URIs, `BETTER_AUTH_URL`, `PUBLIC_URL`, `EMAIL_FROM` and the cookie domain ([decisions-needed](../00-overview/decisions-needed.md) D-01).

- [ ] **Domain.** Run the D-01 name and trademark check, then buy the domain at any registrar with 2FA on. DNS records: `play.<domain>` and `staging.<domain>` CNAME to the targets Render shows ([hosting](hosting.md) §Domains & email)
- [ ] **Mail aliases** `support@`, `dmarc@`, `security@`, `privacy@` at the registrar or a mailbox provider, forwarding to the owner ([auth](../03-architecture/auth.md) §Email). `dmarc@` is needed by the first DMARC record
- [ ] **Render workspace.** Region Ohio (US East). Connect the Render GitHub App to the repo, apply the root `render.yaml` Blueprint (services `harvest-staging`, `harvest-prod`, automatic PR previews), create env groups `harvest-preview`, `harvest-staging`, `harvest-prod`, add the custom domains, health check path `/healthz`, verify the `maxShutdownDelaySeconds` limit and record it in ADR-0004 ([hosting](hosting.md) §Render service definition, §Regions)
- [ ] **Render API key** → GitHub Actions secret `RENDER_API_KEY` ([environments-and-ci](environments-and-ci.md) §CI). Account-wide key: treat as sensitive
- [ ] **Neon project** in AWS us-east-2 (Ohio). Branches `dev` (from `main` while `main` is still empty), then `staging` and `ci` with `--parent dev`. Pooled URL → `DATABASE_URL`, direct URL → `DATABASE_URL_UNPOOLED` in `harvest-staging`; `ci` direct URL → GitHub secret `DATABASE_URL_CI`. Verify the Free-plan branch cap (10, provisional) ([environments-and-ci](environments-and-ci.md) §Neon branches, [hosting](hosting.md) §Neon specifics)
- [ ] **Neon API key** (project-scoped where the plan allows) + project id → GitHub secrets `NEON_API_KEY`, `NEON_PROJECT_ID`, and the same two in `harvest-preview` only ([environments-and-ci](environments-and-ci.md) §Handing the Neon branch to a preview)
- [ ] **Google Cloud** project `code-harvest`: External consent screen in **Testing**, scopes `openid email profile`, one web OAuth client with the localhost, staging and prod origins and redirect URIs; `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `harvest-staging` and `harvest-prod` (and local `.env` if wanted). No Google in previews ([hosting](hosting.md) §Domains & email, [auth](../03-architecture/auth.md))
- [ ] **Resend**: account, sending domain `mail.<domain>`, DNS records copied from Resend's domain page, domain verified, one send-only domain-scoped API key per environment (`RESEND_API_KEY`, staging and prod only), `EMAIL_FROM="Code Harvest <login@mail.<domain>>"`, DMARC starting at `p=none; rua=mailto:dmarc@<domain>`, webhook for `email.bounced` and `email.complained` per environment with `RESEND_WEBHOOK_SECRET` ([hosting](hosting.md) §Domains & email, [auth](../03-architecture/auth.md) §Email)
- [ ] **Generated secrets**: `BETTER_AUTH_SECRET` (`openssl rand -base64 32`, one per environment, previews share one in `harvest-preview`) and `AUTH_TEST_OTP_SECRET` (one value, set in the GitHub secret, `harvest-staging` and `harvest-preview`, **never** `harvest-prod`). Set `BETTER_AUTH_URL`, `PUBLIC_URL` and `ALLOWED_ORIGINS` per environment ([environments-and-ci](environments-and-ci.md) §Test sign-in, `.env.example`)
- [ ] **GitHub repository variable** `STAGING_URL` = `https://staging.<domain>` ([environments-and-ci](environments-and-ci.md) §CI, `smoke.yml`)
- [ ] **Backups (OPS-06)**: Cloudflare R2 bucket with a 30-day lifecycle rule (alternative Backblaze B2), `age` keypair (private key only in the password manager), Neon role `backup_ro` (created by a migration), GitHub secrets listed in the inventory. Starts the night prod data first exists ([hosting](hosting.md) §Backups & restore)
- [ ] **Uptime monitor skeleton** (Better Stack or UptimeRobot free tier) on `/healthz` ([observability](observability.md) §Alert routing)
- [ ] **Draft `/privacy` and `/terms` pages** (LEG-02a) so the consent screen has URLs to point at in M8
- [ ] **OPS-07**: confirm `.env.example` and the [variable matrix](#per-environment-variable-matrix) below match
- [ ] Record the Render and Neon regions here and in `STATE.md` ([hosting](hosting.md) §Regions)

### M3–M5: showdown, social, matchmaking

- [ ] **Sentry (OPS-04, from M3)**: org, projects `harvest-server` and `harvest-web`, DSNs → `SENTRY_DSN` and `VITE_SENTRY_DSN`, auth token with `project:releases` and `org:read` → `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_SERVER` as build-time secrets in `harvest-staging` and `harvest-prod` ([observability](observability.md) §Setup). Alerts: new prod issue, > 50 events in 5 min
- [ ] `preview-db.yml`, `e2e.yml` and `smoke.yml` arrive with the code they test (OPS-01, M2–M3); the secrets they read were set in M2. Confirm the preview service name pattern (`harvest-pr-<n>`, to confirm in OPS-02) matches what Render created
- [ ] Google consent screen: add the real email addresses of friends and testers as test users (≤ 100). The twelve `e2e-*@e2e.test` accounts use the test OTP, not Google
- [ ] Add `determinism` to the required status checks once `determinism.yml` exists

### M6–M8: launch hardening

- [ ] **Prod service and release gate**: `harvest-prod` live with its env group and `play.<domain>`; GitHub Environment `production` with the owner as required reviewer (or the `workflow_dispatch` itself as the gate on private Free); Environment secret `RENDER_PROD_SERVICE_ID`; first `release.yml` run ([environments-and-ci](environments-and-ci.md) §Release process). [cost-estimate](cost-estimate.md) defers the separate prod service to the first external testers; [hosting](hosting.md) declares it in `render.yaml` at M2. See mismatch 4
- [ ] **Neon → Launch plan**, `main` restore window 7 days, before the closed beta ([hosting](hosting.md) §Backups & restore)
- [ ] **Resend → Pro** before any invite wave that could exceed 100 emails in a day; DMARC `p=quarantine` after two weeks at `p=none`, `p=reject` before launch ([cost-estimate](cost-estimate.md), [auth](../03-architecture/auth.md) §Email)
- [ ] **Google consent screen → Production** (LEG-02b): homepage, privacy and terms URLs set, domain verified in Google Search Console, lawyer-reviewed pages live ([hosting](hosting.md) §Domains & email)
- [ ] **Grafana Cloud** (Optional, OPS-04): stack, Metrics Endpoint scrape job for `https://play.<domain>/metrics` with bearer `METRICS_TOKEN`, alert rules to the owner's email ([observability](observability.md) §Setup, §Alerts)
- [ ] **Plausible Cloud**: account, site `play.<domain>`, `VITE_PLAUSIBLE_DOMAIN` in `harvest-prod` only, CSP `connect-src` gains `https://plausible.io` ([observability](observability.md) §Setup). Pending the decision row, see mismatch 7
- [ ] **Uptime monitor finished**: `/healthz` and prod `/readyz` every minute, two failures → push and SMS ([observability](observability.md))
- [ ] **Status page** (Optional) at `status.<domain>`, CNAME at the registrar ([observability](observability.md) §Maintenance and status)
- [ ] **Cloudflare Turnstile** (Optional): only when the SRV-02b flag is switched on ([security-anti-cheat](../03-architecture/security-anti-cheat.md) §Threat model)
- [ ] `security@<domain>` live and published in `/.well-known/security.txt` ([observability](observability.md) §Security incidents)
- [ ] Lawyer review of the privacy policy and terms; controller name and postal address in the policy; the processors list matches this inventory ([privacy-and-age](../08-legal-safety/privacy-and-age.md))
- [ ] First restore drill into `staging`, date and duration recorded in `STATE.md` (OPS-06)
- [ ] M8 load test: a short-lived Neon branch from `main`, anonymised with DB-07, deleted within 24 h, never given a public URL ([hosting](hosting.md) §Neon specifics)

## Inventory

One row per connection. "Where it lives" says where the credential is stored, not where the account is. Items the docs leave optional are marked **Optional**; items with no account are marked **no account**.

| # | Connection | Kind | Purpose | Needed by | Who sets up | Env vars / secrets | Where it lives | Doc |
|---|---|---|---|---|---|---|---|---|
| 1 | GitHub repository settings | Repo settings | Branch protection on `main` (PR, `check`, later `determinism`, no force push or deletion; the one-review rule waits for a second maintainer, since an author cannot approve their own PR), secret scanning + push protection, Dependabot alerts + security updates, `.github/CODEOWNERS` | M0 | Evan | none | GitHub → Settings | [git-workflow](../09-engineering/git-workflow.md), [standards](../09-engineering/standards.md) |
| 2 | GitHub Actions secrets and variables | CI credentials | What the workflows read: `NEON_API_KEY` (project-scoped where allowed, never an account key), `NEON_PROJECT_ID`, `RENDER_API_KEY` (account-wide, sensitive), `DATABASE_URL_CI` (direct URL of Neon branch `ci`), `AUTH_TEST_OTP_SECRET` (same value as Render staging and preview), `ADMIN_DRAIN_TOKEN` (release.yml → `/api/admin/drain`; same value in the `harvest-prod` env group), `RENDER_PROD_SERVICE_ID` (in the `production` Environment); repository variable `STAGING_URL` | M2 (set); first read by `preview-db.yml`, `e2e.yml` and `smoke.yml` as they land (OPS-01, M2–M3) | Evan | as listed | GitHub → Settings → Secrets and variables → Actions | [environments-and-ci](environments-and-ci.md) §CI |
| 3 | GitHub Environment `production` | Release gate | Required reviewer = repo owner; holds `RENDER_PROD_SERVICE_ID` for `release.yml`. On a private Free repo the reviewer rule is unavailable and `workflow_dispatch` is the gate | M8 (first prod release) | Evan | `RENDER_PROD_SERVICE_ID` | GitHub → Settings → Environments | [environments-and-ci](environments-and-ci.md) §Release process |
| 4 | Render workspace + GitHub App | Hosting account | Owns the services; the GitHub App gives Render read access to the repo for Blueprint deploys and previews. Region Ohio (US East) | M2 | Evan | none | Render dashboard | [hosting](hosting.md) |
| 5 | Render service `harvest-staging` | Web service (paid, smallest) | Auto-deploys `main`; Pre-Deploy `pnpm db:migrate` on the direct URL; health check `/healthz`; custom domain `staging.<domain>`; `maxShutdownDelaySeconds: 300` | M2 | Evan (Blueprint) | env group `harvest-staging` (see matrix) | Render | [hosting](hosting.md) §Render service definition |
| 6 | Render service `harvest-prod` | Web service (paid; Standard before launch) | `autoDeploy: false`; deployed by `release.yml` via the Render API; custom domain `play.<domain>` | M2 per hosting.md, closed beta per cost-estimate.md (mismatch 4) | Evan (Blueprint) | env group `harvest-prod` | Render | [hosting](hosting.md), [cost-estimate](cost-estimate.md) |
| 7 | Render PR previews | Free web service per PR | `previews: generation: automatic`, cloned from `harvest-staging`; no Pre-Deploy Command, so migrations come from `preview-db.yml`; every secret and DB variable has an explicit `previewValue`. Name pattern `harvest-pr-<n>` to confirm in OPS-02 | M2–M3 (with `preview-db.yml` and `e2e.yml`) | Evan (Blueprint) | env group `harvest-preview`; Render-set `IS_PULL_REQUEST`, `RENDER_GIT_BRANCH` | Render | [environments-and-ci](environments-and-ci.md) §Previews are isolated |
| 8 | Render API key | Credential | `e2e.yml` finds the preview service and polls deploys; `release.yml` creates the prod deploy; `preview-db.yml` fallback sets preview env vars | M3 | Evan | `RENDER_API_KEY` | GitHub Actions secret only (never in an env group) | [environments-and-ci](environments-and-ci.md) §CI |
| 9 | Neon project | Database account | One project, region AWS us-east-2 (Ohio). Free plan until the closed beta, then Launch with a 7-day restore window on `main`. Health checks never touch the DB so idle branches autosuspend | M2 | Evan | none | Neon console | [hosting](hosting.md) §Neon specifics, §Backups & restore |
| 10 | Neon branches | Database branches | `main` (prod, protected), `dev` (synthetic seed, parent of everything else), `staging`, `ci` (empty schema, reset per job), optional `dev/<name>`, `preview/<branch-slug>` (created and deleted by `preview-db.yml`). Pooled URL → `DATABASE_URL`, direct URL → `DATABASE_URL_UNPOOLED`. Never branch from `main` for previews or staging | M2 | Evan (long-lived), CI (previews) | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` per env; `DATABASE_URL_CI` | Render env groups; GitHub secret for `ci`; local `.env` | [environments-and-ci](environments-and-ci.md) §Neon branches |
| 11 | Neon API key + project id | Credential | `preview-db.yml` creates, migrates and deletes preview branches; the preview service resolves its branch's connection strings at boot | M3 | Evan | `NEON_API_KEY`, `NEON_PROJECT_ID` | GitHub Actions secrets **and** `harvest-preview` (nowhere else) | [environments-and-ci](environments-and-ci.md) §Handing the Neon branch to a preview |
| 12 | Domain registrar | Domain + DNS | `<domain>` with 2FA (DNSSEC if offered, Optional). Records: `play` and `staging` CNAME → Render targets; Resend records on `mail` (MX, SPF TXT, DKIM TXT under `_domainkey`, `_dmarc` TXT); Google Search Console TXT (M8); `status` CNAME (Optional, M8); `api` only under hosting option B | M2 | Evan | none (the domain appears in `PUBLIC_URL`, `BETTER_AUTH_URL`, `ALLOWED_ORIGINS`, `EMAIL_FROM`, `VITE_PLAUSIBLE_DOMAIN`) | Registrar | [hosting](hosting.md) §Domains & email, D-01 |
| 13 | Inbound mail aliases | Mailboxes | `support@` (Reply-To), `dmarc@` (DMARC reports), `security@` (security.txt), `privacy@` (privacy policy contact), forwarding to the owner. Resend is send-only, so these live at the registrar or a mailbox provider | M2 (`dmarc@`), M8 (the rest public) | Evan | none | Registrar or mailbox provider | [auth](../03-architecture/auth.md) §Email, [observability](observability.md) §Security incidents |
| 14 | Google Cloud project `code-harvest` | OAuth provider | External consent screen (Testing until M8, then Production), scopes `openid email profile`, one web OAuth client with localhost, staging and prod origins and redirect URIs. Previews have no Google | M2 | Evan | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `harvest-staging`, `harvest-prod`, local `.env` (optional) | [hosting](hosting.md) §Domains & email, [auth](../03-architecture/auth.md) |
| 15 | Google Search Console | Domain verification | Required before the consent screen can be published | M8 (LEG-02b) | Evan | none (a DNS TXT record) | Same Google account | [hosting](hosting.md) §Domains & email |
| 16 | Resend | Transactional email | Sending domain `mail.<domain>` verified; send-only, domain-scoped API key per environment; `From: Code Harvest <login@mail.<domain>>`. Free plan (100/day) until the first invite wave, then Pro | M2; Pro before M8 invites | Evan | `RESEND_API_KEY`, `EMAIL_FROM` | `harvest-staging`, `harvest-prod` (never previews or local) | [hosting](hosting.md) §Domains & email, [cost-estimate](cost-estimate.md) |
| 17 | Resend webhook | Webhook (Svix) | `POST https://<host>/api/webhooks/resend` for `email.bounced` and `email.complained`, one endpoint per environment (`staging.<domain>`, `play.<domain>`) | M2 | Evan | `RESEND_WEBHOOK_SECRET` | `harvest-staging`, `harvest-prod` | [auth](../03-architecture/auth.md) §Email |
| 18 | Better Auth secret and origin | Generated secret | `openssl rand -base64 32`, one per environment; `BETTER_AUTH_URL` and `PUBLIC_URL` are the environment's origin; `ALLOWED_ORIGINS` is the Origin allowlist for mutating routes and the WebSocket upgrade | M2 | Evan | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PUBLIC_URL`, `ALLOWED_ORIGINS` | All three env groups; local `.env` | `.env.example`, [auth](../03-architecture/auth.md) |
| 19 | Test OTP secret | Generated secret | Derived sign-in codes for `@e2e.test` addresses in local, preview and staging. The server refuses to boot with it set in production | M2 | Evan | `AUTH_TEST_OTP_SECRET` | GitHub Actions secret, `harvest-staging`, `harvest-preview` (same value), optional local `.env` | [environments-and-ci](environments-and-ci.md) §Test sign-in |
| 20 | Sentry | Error tracking | Org with projects `harvest-server` (node) and `harvest-web` (browser); auth token scopes `project:releases`, `org:read`; source maps uploaded during `pnpm build` on Render; release = `RENDER_GIT_COMMIT`; `sendDefaultPii: false` | M3 (OPS-04) | Evan | `SENTRY_DSN`, `VITE_SENTRY_DSN` (public), `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_SERVER` | `harvest-staging`, `harvest-prod` (build-time secrets in the env group, not GitHub) | [observability](observability.md) §Setup |
| 21 | Grafana Cloud **Optional** | Metrics | Free-tier stack; Metrics Endpoint scrape job for `https://play.<domain>/metrics` every 60 s with `Authorization: Bearer <METRICS_TOKEN>`; alert rules. Fallback: `remote_write` from the server | M8 (OPS-04; Sentry and pino cover M2–M7) | Evan | `METRICS_TOKEN` | `harvest-prod` (and `harvest-staging` if you want to scrape staging); Grafana scrape config | [observability](observability.md) §Setup |
| 22 | Plausible Cloud | Product analytics (cookieless, EU) | Site `play.<domain>`; script served through a same-origin proxy; funnel events only, no user id. Recommended default pending a decision row (mismatch 7) | M8 | Evan | `VITE_PLAUSIBLE_DOMAIN` (public) | `harvest-prod` | [observability](observability.md) §Setup, [privacy-and-age](../08-legal-safety/privacy-and-age.md) |
| 23 | PostHog EU, cookieless **Optional alternative** | Product analytics | Named as the alternative processor in the privacy doc. Not set up unless the decision row picks it; would need its own public variable (none exists in `.env.example`) | never, unless chosen | Evan | none | n/a | [privacy-and-age](../08-legal-safety/privacy-and-age.md) |
| 24 | Cloudflare account + Turnstile widget **Optional** | Captcha | Only when the SRV-02b flag is switched on (sign-in floods, OTP floods). Widget hostnames `play.<domain>`, `staging.<domain>`, `localhost`. Previews leave it off. CSP gains `https://challenges.cloudflare.com` | when abuse appears (code lands M2, flag off) | Evan | `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY` (public) | `harvest-staging`, `harvest-prod`, local `.env` | [security-anti-cheat](../03-architecture/security-anti-cheat.md) §Threat model |
| 25 | Have I Been Pwned Pwned Passwords **no account** | Public API | Better Auth `haveIBeenPwned` plugin calls `https://api.pwnedpasswords.com/range/{prefix}`; no key, no env var; needs outbound HTTPS (Render allows it). Fails closed | M2 | nobody | none | n/a | [auth](../03-architecture/auth.md) §Breached-password check |
| 26 | Uptime monitor | External monitoring | Better Stack or UptimeRobot free tier: `/healthz` (process up) and prod `/readyz` (DB reachable) every minute; two failures → push + SMS. Staging and previews unmonitored | M2 skeleton, M8 complete | Evan | none | Monitor's dashboard | [observability](observability.md) §Alert routing |
| 27 | Status page **Optional** | Hosted status page | Free hosted page at `status.<domain>`, linked from sign-in error states | M8 | Evan | none (CNAME) | Status provider | [observability](observability.md) §Maintenance and status |
| 28 | Backup bucket + keys | Object storage (S3-compatible) | Exactly as hosting.md: nightly `pg_dump --format=custom` of `main` from a GitHub Actions cron (`backup.yml`) over the direct connection as read-only role `backup_ro`, encrypted with `age` (public key as a GitHub Actions secret, private key only in the password manager), uploaded to an owner-controlled bucket, default **Cloudflare R2** (alternative Backblaze B2), 30-day lifecycle rule, verified with `pg_restore --list`. The DB-06 deletion log also lives in this bucket | M2 (the night prod data first exists) | Evan | GitHub secrets, named here: `DATABASE_URL_BACKUP_RO` (direct URL as `backup_ro`), `BACKUP_AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | GitHub Actions secrets (`backup.yml`); `R2_*` also in the `harvest-prod` env group for the server's deletion-log writer; age private key in the password manager | [hosting](hosting.md) §Backups & restore |
| 29 | Log drain **Optional** | Log storage | Only if Render's log retention exceeds 30 days: Better Stack or Grafana Loki free tier with 30-day retention | only if needed | Evan | none | Render → Log streams | [observability](observability.md) §What may be logged |
| 30 | Local development **no account** | Workstation | `pnpm dev` (Vite `:5173` proxying `/api` and `/ws` to `:3000`), DB from `docker compose up -d db` (Postgres on `:5433`) or the Neon `dev` branch, codes printed to the console, Google and Resend and Sentry not needed | M2 | each developer | `.env` from `.env.example` | local `.env` (gitignored) | [environments-and-ci](environments-and-ci.md) §Local setup |
| 31 | Playwright browsers in CI **no account** | CI tooling | `pnpm exec playwright install --with-deps chromium firefox webkit`, cached on the Playwright version | M0 (`determinism.yml`), M3 (`e2e.yml`) | CI | none | n/a | [environments-and-ci](environments-and-ci.md) §CI |
| 32 | CPython 3.12 in CI **no account** | CI tooling | `actions/setup-python` pinned to `3.12` for `differential.yml`; bump deliberately | M0 | CI | none | n/a | [environments-and-ci](environments-and-ci.md) §CI |
| 33 | MagicaVoxel **no account** | Asset tool | Free; authoring tool for all `.vox` models; output is ours | M1 | Evan | none | n/a | [asset-sourcing](../04-art-audio/asset-sourcing.md) |
| 34 | Fonts (OFL) **no account** | Assets | Inter or Atkinson Hyperlegible, JetBrains Mono, OpenDyslexic Mono; self-hosted under `assets/fonts/` with licence files | M1 | Evan | none | repo | [asset-sourcing](../04-art-audio/asset-sourcing.md), [accessibility](../05-ux/accessibility.md) |
| 35 | CC0 asset sources and commissions **no account** | Assets | Kenney, OpenGameArt (CC0, no account to download); commissioned models and music in M7 are purchases recorded in the asset manifest, not connections the code needs | M1, M7 | Evan | none | `assets/` manifest | [asset-sourcing](../04-art-audio/asset-sourcing.md), [cost-estimate](cost-estimate.md) §Asset budget |
| 36 | Password manager vault | Owner tooling | 2FA recovery codes for every provider, the `age` private key, nothing else from this file | M0 | Evan | none | Owner's password manager | [security-anti-cheat](../03-architecture/security-anti-cheat.md) §Account baseline |

Set by Render, never configured by us: `PORT`, `IS_PULL_REQUEST`, `RENDER_GIT_BRANCH`, `RENDER_GIT_COMMIT`. Computed inside workflows, never stored: `E2E_BASE_URL` (`e2e.yml`).

**Not needed in v1.** Render Key Value (Redis) arrives only at scale-out ([hosting](hosting.md)). No object storage for event logs or replays: an S3-compatible store would need a new ADR and a row here first ([saves-and-persistence](../03-architecture/saves-and-persistence.md)). No GitHub OAuth, no passkeys ([auth](../03-architecture/auth.md)). Cloudflare DNS proxying, mentioned by the WebSocket-flood runbook in [observability](observability.md), would mean moving DNS to Cloudflare; decide if the flood happens.

### Record here when accounts are created

Docs ask for these facts to be recorded in this file. Fill them in; never record a credential value.

| Fact | Value | Source |
|---|---|---|
| Render region | — (default Ohio, US East) | [hosting](hosting.md) §Regions |
| Neon project region | — (default AWS us-east-2) | [hosting](hosting.md) §Regions |
| Render `maxShutdownDelaySeconds` limit verified | — (expected 300) | [hosting](hosting.md) §Render specifics, ADR-0004 |
| Repo visibility and GitHub plan; release gate variant (Environment reviewer or `workflow_dispatch`) | — | [environments-and-ci](environments-and-ci.md) §Release process |
| Secret scanning available? If not, `gitleaks` in `ci.yml` | — | [standards](../09-engineering/standards.md) |
| Neon branch cap on the current plan | — (provisional 10) | [environments-and-ci](environments-and-ci.md) §Neon branches |
| Neon restore window on `main` | — (7 days on Launch before beta) | [hosting](hosting.md) §Backups & restore |
| Resend plan and daily cap | — (Free 100/day; Pro before invites) | [cost-estimate](cost-estimate.md) |
| Google consent screen state | — (Testing until LEG-02b) | [hosting](hosting.md) §Domains & email |
| Preview service name pattern | — (`harvest-pr-<n>` to confirm) | [environments-and-ci](environments-and-ci.md) §CI |
| Backup bucket provider and name | — (default Cloudflare R2) | [hosting](hosting.md) §Backups & restore |
| Last restore drill (date, duration) | — | OPS-06, `STATE.md` |

## Per-environment variable matrix

Rows are every variable in `.env.example`, in its order. Values: **real** (a genuine credential or URL for that environment), **placeholder** (a value that is syntactically valid but never used), **test** (a generated secret used only by test sign-in), **unset** (absent; the code treats absence as "feature off"), **Render-set** (provided by the platform). Preview values are the `previewValue` in `render.yaml`; previews must never inherit a staging value for any secret or database variable.

| Variable | local (`.env`) | preview (`harvest-preview` / `previewValue`) | staging (`harvest-staging`) | prod (`harvest-prod`) |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `production` | `production` | `production` |
| `APP_ENV` | `development` | `preview` | `staging` | `production` |
| `PORT` | `3000` | Render-set | Render-set | Render-set |
| `PUBLIC_URL` | `http://localhost:5173` | per-PR URL, not known in advance (mismatch 10) | `https://staging.<domain>` | `https://play.<domain>` |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | per-PR URL (mismatch 10) | `https://staging.<domain>` | `https://play.<domain>` |
| `DATABASE_URL` | real: Docker `postgres://harvest:harvest@localhost:5433/harvest` or Neon `dev` pooled | placeholder; the start script resolves the pooled URL of `preview/<branch-slug>` from the Neon API at boot (or `preview-db.yml` sets it, fallback) | real: Neon `staging` pooled | real: Neon `main` pooled |
| `DATABASE_URL_UNPOOLED` | real: same as `DATABASE_URL` for Docker, Neon `dev` direct otherwise | placeholder, resolved at boot as above | real: Neon `staging` direct (Pre-Deploy migrations) | real: Neon `main` direct (Pre-Deploy migrations) |
| `BETTER_AUTH_SECRET` | real (any 32-byte value) | real, preview-only, shared by all previews | real, staging-only | real, prod-only |
| `BETTER_AUTH_URL` | `http://localhost:5173` | per-PR URL (mismatch 10) | `https://staging.<domain>` | `https://play.<domain>` |
| `GOOGLE_CLIENT_ID` | real (optional; unset hides the Google button) | unset | real | real |
| `GOOGLE_CLIENT_SECRET` | real (optional) | unset | real | real |
| `RESEND_API_KEY` | unset (codes print to the console) | unset (test OTP only) | real, staging key | real, prod key |
| `RESEND_WEBHOOK_SECRET` | unset | unset | real, staging webhook | real, prod webhook |
| `EMAIL_FROM` | placeholder `Code Harvest <login@mail.example.com>` | placeholder | `Code Harvest <login@mail.<domain>>` | `Code Harvest <login@mail.<domain>>` |
| `AUTH_TEST_OTP_SECRET` | test (optional, to run e2e locally) | test (same value as GitHub and staging) | test (same value) | **unset, always** (server refuses to boot otherwise) |
| `SENTRY_DSN` | unset | unset | real, `harvest-server` DSN | real, `harvest-server` DSN |
| `METRICS_TOKEN` | unset (optional) | unset | real (optional; only if staging is scraped) | real |
| `SENTRY_AUTH_TOKEN` | unset | unset (build must tolerate it) | real, build-time | real, build-time |
| `SENTRY_ORG` | unset | unset | real | real |
| `SENTRY_PROJECT_WEB` | unset | unset | `harvest-web` | `harvest-web` |
| `SENTRY_PROJECT_SERVER` | unset | unset | `harvest-server` | `harvest-server` |
| `NEON_API_KEY` | unset | real (boot-time branch resolution) | unset | unset |
| `NEON_PROJECT_ID` | unset | real | unset | unset |
| `DATABASE_URL_CI` | unset (optional, to run integration tests by hand) | unset | unset | unset (GitHub Actions secret only) |
| `TURNSTILE_SECRET_KEY` | unset (real only while testing the flag) | unset | unset until the SRV-02b flag is on, then real | same |
| `VITE_API_URL` | unset (option A) | unset | unset | unset (option B only) |
| `VITE_WS_URL` | unset (option A) | unset | unset | unset (option B only) |
| `VITE_SENTRY_DSN` | unset | unset | real, `harvest-web` DSN (public) | real (public) |
| `VITE_PLAUSIBLE_DOMAIN` | unset | unset | unset | `play.<domain>` from M8 |
| `VITE_TURNSTILE_SITE_KEY` | unset | unset | unset until the flag is on, then real (public) | same |
| `ADMIN_DRAIN_TOKEN` | unset | unset | unset | **real** (same value as the GitHub Actions secret) |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | unset | unset | unset | **real** (deletion-log writer; same bucket as `backup.yml`) |

GitHub Actions secrets that are not environment variables (`NEON_API_KEY`, `NEON_PROJECT_ID`, `RENDER_API_KEY`, `RENDER_PROD_SERVICE_ID`, `DATABASE_URL_CI`, `AUTH_TEST_OTP_SECRET`, the `backup.yml` secrets) and the repository variable `STAGING_URL` are in inventory rows 2, 3 and 28.

## Console steps

Click-paths change; when a dashboard disagrees with this section, follow the dashboard and fix this file.

### Google OAuth client and consent screen

1. [console.cloud.google.com](https://console.cloud.google.com) → project picker → **New project** → name `code-harvest` (working title, D-01).
2. **APIs & Services → OAuth consent screen** (Google now labels this *Google Auth Platform → Branding / Audience*): User type **External**; app name **Code Harvest**; support email and developer contact = the owner's email; scopes `openid`, `email`, `profile` only (non-sensitive, so no verification review); **Audience: Testing**; add test users (real addresses, ≤ 100).
3. **Credentials → Create credentials → OAuth client ID** → type **Web application** → name `code-harvest-web`.
   - Authorized JavaScript origins: `http://localhost:5173`, `https://staging.<domain>`, `https://play.<domain>`.
   - Authorized redirect URIs (exact, no wildcards; Better Auth's callback path is `/api/auth/callback/google`): `http://localhost:5173/api/auth/callback/google`, `https://staging.<domain>/api/auth/callback/google`, `https://play.<domain>/api/auth/callback/google`. Under hosting option B the callback host is whichever host runs Better Auth (`api.<domain>`).
   - Local uses `:5173` because Vite proxies `/api` to the server and the browser sees one origin ([environments-and-ci](environments-and-ci.md) §Local setup). Previews get no URI: per-PR hostnames cannot be pre-registered.
4. Copy the client id and secret into `harvest-staging` and `harvest-prod` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), and into local `.env` if you want Google locally. The Blueprint gives both an empty `previewValue`.
5. **M8 (LEG-02b):** Branding → application home page `https://play.<domain>`, privacy policy `https://play.<domain>/privacy`, terms `https://play.<domain>/terms`; verify `<domain>` in Google Search Console (DNS TXT record at the registrar); Audience → **Publish app**. Testing mode caps at 100 users, so this must happen before the closed beta.

### Resend domain and DNS

1. [resend.com](https://resend.com) → **Domains → Add domain** → `mail.<domain>` → pick the region closest to Render (US East).
2. Resend shows the records. **Copy the values from Resend's page, not from here**; they are account-specific. The shapes, as hosting.md describes them: an MX and a TXT (SPF) record on the sending subdomain (Resend may show them under `send.mail` rather than `mail`), a DKIM TXT under `resend._domainkey.mail`, and a `_dmarc` TXT. Create them at the registrar's DNS panel.
3. DMARC: start with `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` (the `dmarc@` alias must exist first). After two weeks of clean reports move to `p=quarantine`, then `p=reject` before launch ([auth](../03-architecture/auth.md) §Email).
4. Back in Resend → **Verify**. Wait for every record to show verified.
5. **API Keys → Create**: permission **Sending access**, domain `mail.<domain>`, one key per environment named `harvest-staging` and `harvest-prod` → `RESEND_API_KEY` in the matching env group. Set `EMAIL_FROM="Code Harvest <login@mail.<domain>>"` in both.
6. **Webhooks → Add endpoint**: URL `https://staging.<domain>/api/webhooks/resend`, events `email.bounced`, `email.complained` → copy the signing secret → `RESEND_WEBHOOK_SECRET` in `harvest-staging`. Repeat for `https://play.<domain>/api/webhooks/resend` → `harvest-prod`.
7. Before any invite wave: **Billing → Pro** ([cost-estimate](cost-estimate.md)).

### Neon project and branches (`neonctl`)

Install with `pnpm dlx neonctl` or `npm i -g neonctl`; check flags against `neonctl --help`, the CLI changes. Pass `--project-id <id>` if the account has more than one project.

```sh
neonctl auth
neonctl projects create --name code-harvest --region-id aws-us-east-2
# M2, while main is still empty: dev is forked from main once, then maintained independently
neonctl branches create --name dev --parent main
# everything else is forked from dev, never from main
neonctl branches create --name staging --parent dev
neonctl branches create --name ci --parent dev
neonctl branches create --name dev/<name> --parent dev        # optional personal branch
# connection strings: pooled for the app, direct for migrations
neonctl connection-string staging --pooled                    # -> DATABASE_URL        (harvest-staging)
neonctl connection-string staging                             # -> DATABASE_URL_UNPOOLED (harvest-staging)
neonctl connection-string main --pooled                       # -> DATABASE_URL        (harvest-prod)
neonctl connection-string main                                # -> DATABASE_URL_UNPOOLED (harvest-prod)
neonctl connection-string ci                                  # -> DATABASE_URL_CI     (GitHub secret, direct)
neonctl branches list
```

- `preview/<branch-slug>` branches are created by `preview-db.yml` with `neondatabase/create-branch-action`, parent `dev`, and deleted on PR close; never create them by hand. CI must pass `--parent dev` explicitly because Neon's default parent is the project's default branch, `main`.
- API key: console → **Account** (or Organization) **settings → API keys → Create**, project-scoped to `code-harvest` if the plan offers it → `NEON_API_KEY`. Project id: **Project settings → General** → `NEON_PROJECT_ID`. Both go to GitHub Actions secrets and to `harvest-preview`.
- Backups: the `backup_ro` role is created by a migration; set its password in console → **Roles** → reset password, then `neonctl connection-string main --role-name backup_ro` → `DATABASE_URL_BACKUP_RO`.
- Before the closed beta: console → **Billing → Launch**, then **Project settings → Storage → Restore window** = 7 days.

### Render Blueprint, env groups and the `previewValue` rule

1. Render dashboard → **New → Blueprint** → connect the GitHub repo (this installs the Render GitHub App; grant it only this repo) → Render reads the root `render.yaml` and creates `harvest-staging` and `harvest-prod`.
2. **Env Groups → New environment group** three times: `harvest-preview`, `harvest-staging`, `harvest-prod`. Paste the values from the matrix above. Link `harvest-staging` to `harvest-staging` and `harvest-prod` to `harvest-prod`.
3. **`previewValue` rule** ([environments-and-ci](environments-and-ci.md) §Previews are isolated): Render previews copy the base service's variables, so every secret and database variable the staging service sees must carry an explicit `previewValue` in `render.yaml`: a placeholder for `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, empty for `GOOGLE_*`, `RESEND_*`, `SENTRY_*`, and the preview-only values for `BETTER_AUTH_SECRET`, `AUTH_TEST_OTP_SECRET`, `NEON_API_KEY`, `NEON_PROJECT_ID`, plus `APP_ENV: preview`. Render's Blueprint spec supports `previewValue` on service-level `envVars`; when writing OPS-02.1 check whether it is also honoured for variables that come `fromGroup`, and if not, declare the secrets at service level (`sync: false`, value entered once in the dashboard) rather than in the group. A misconfigured preview must fail fast, never write to staging.
4. Each service → **Settings**: Health Check Path `/healthz`; **Custom Domains → Add** `staging.<domain>` / `play.<domain>`, create the CNAME Render shows at the registrar, wait for the certificate. Pre-Deploy Command `pnpm db:migrate` is in `render.yaml`.
5. **Account Settings → API Keys → Create** → `RENDER_API_KEY` (GitHub Actions secret only). The prod service id is the `srv-…` segment in the service's dashboard URL → `RENDER_PROD_SERVICE_ID` (GitHub Environment `production`).
6. Verify `maxShutdownDelaySeconds` is accepted at 300 (Render's documented maximum) and record it in ADR-0004.

### GitHub: branch protection, security settings, secrets

1. **Settings → Rules → Rulesets → New branch ruleset**: name `main`, enforcement **Active**, target the default branch. Rules: **Restrict deletions**, **Block force pushes**, **Require a pull request before merging** (required approvals 1), **Require status checks to pass** → add `check` (from `ci.yml`), later `determinism`. Bypass list: **Repository admin**, because a solo owner cannot approve their own PR; remove the bypass when a second maintainer exists.
2. **Settings → Code security**: Secret scanning **on**, Push protection **on**, Dependabot alerts **on**, Dependabot security updates **on**. If the repo is private on Free and secret scanning is unavailable, record the `gitleaks` decision under [Record here](#record-here-when-accounts-are-created).
3. Commit `.github/CODEOWNERS` (contents in [standards](../09-engineering/standards.md) §Repo protection).
4. **Settings → Secrets and variables → Actions**: repository secrets `NEON_API_KEY`, `NEON_PROJECT_ID`, `RENDER_API_KEY`, `DATABASE_URL_CI`, `AUTH_TEST_OTP_SECRET`, and (M2, OPS-06) `DATABASE_URL_BACKUP_RO`, `BACKUP_AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; repository variable `STAGING_URL`.
5. **Settings → Environments → New environment** `production` → **Required reviewers** → the owner → environment secret `RENDER_PROD_SERVICE_ID`.

Equivalent with the `gh` CLI (prompts for each value):

```sh
gh secret set NEON_API_KEY
gh secret set NEON_PROJECT_ID
gh secret set RENDER_API_KEY
gh secret set DATABASE_URL_CI
gh secret set AUTH_TEST_OTP_SECRET
gh secret set RENDER_PROD_SERVICE_ID --env production
gh variable set STAGING_URL --body "https://staging.<domain>"
```

### Generated secrets

```sh
openssl rand -base64 32    # BETTER_AUTH_SECRET (one per environment), AUTH_TEST_OTP_SECRET, METRICS_TOKEN
age-keygen -o harvest-backup.key    # prints the public key -> BACKUP_AGE_PUBLIC_KEY; move the file into the password manager and delete it from disk
```

## Rotation

Policy ([security-anti-cheat](../03-architecture/security-anti-cheat.md) §Rotation policy): rotate every secret yearly and immediately on suspected exposure. "Update" always means: change the value in the owning account, update the Render env group or GitHub secret, redeploy. Record the date (never the value) in the last column.

| Secret | Lives in | How to rotate | What breaks until it is updated | Cadence | Last rotated |
|---|---|---|---|---|---|
| `BETTER_AUTH_SECRET` | env groups | Generate a new value, enter drain mode with the maintenance banner up, update the group, redeploy | Every session cookie is invalid: all players sign in again. Rotate **only on exposure** | On exposure | — |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | env groups | Neon console → Roles → reset the app role's password on that branch → new connection strings → update both variables → redeploy (Pre-Deploy uses the direct URL) | About a minute of reconnects; a stale URL fails `/readyz` and migrations. Branch roles are independent: `DATABASE_URL_CI` and `DATABASE_URL_BACKUP_RO` are rotated separately | Yearly | — |
| `DATABASE_URL_CI` | GitHub secret | Reset the role password on the `ci` branch → update the secret | The `integration` job fails to connect | Yearly | — |
| `GOOGLE_CLIENT_SECRET` | env groups | Google Cloud → Credentials → the client → **Add secret** → update groups → deploy → delete the old secret (a client holds two) | Google sign-in fails (`invalid_client`); email flows unaffected | Yearly | — |
| `RESEND_API_KEY` | env groups | Resend → API Keys → create a new send-only, domain-scoped key → update → deploy → revoke the old key | Email codes, sign-up and reset fail; Google and existing password sign-ins work | Yearly | — |
| `RESEND_WEBHOOK_SECRET` | env groups | Resend → Webhooks → the endpoint → roll the signing secret → update → deploy | Bounce and complaint events are rejected (bad signature); Svix retries for a while, suppression lags | Yearly | — |
| `AUTH_TEST_OTP_SECRET` | GitHub secret, `harvest-staging`, `harvest-preview` | Generate; update all three places together; redeploy staging (previews pick it up on their next deploy) | `smoke.yml` and `e2e.yml` sign-ins fail (code mismatch). Prod unaffected (never set) | Yearly | — |
| `NEON_API_KEY` | GitHub secret, `harvest-preview` | Neon → API keys → create → update both places → revoke the old key | `preview-db.yml` fails; preview services cannot resolve their branch and exit non-zero | Yearly | — |
| `RENDER_API_KEY` | GitHub secret | Render → Account Settings → API Keys → create → update → revoke | `e2e.yml` cannot find previews; `release.yml` cannot deploy prod | Yearly | — |
| `RENDER_PROD_SERVICE_ID` | GitHub Environment `production` | Not a secret; changes only if the prod service is recreated | `release.yml` deploys the wrong or no service | n/a | — |
| `SENTRY_AUTH_TOKEN` | env groups (build-time) | Sentry → Settings → Auth Tokens → create (`project:releases`, `org:read`) → update → revoke | Source-map upload fails: builds fail or ship without readable stack traces, depending on the plugin's settings; runtime unaffected | Yearly | — |
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | env groups | Not secret (the web DSN ships in the bundle). Sentry → project → Client Keys → create, disable the old → update → redeploy (web needs a rebuild) | Errors stop arriving until the new key is deployed | On abuse only | — |
| `METRICS_TOKEN` | `harvest-prod`, Grafana scrape job | Generate; update the env group **and** the Grafana scrape job together; redeploy | Grafana scrapes get 404; metric alerts go to no-data | Yearly | — |
| `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY` | env groups | Cloudflare → Turnstile → the widget → rotate the secret key → update → redeploy | While the flag is on, captcha verification fails and the email flows are blocked | Yearly (while enabled) | — |
| `DATABASE_URL_BACKUP_RO` | GitHub secret | Reset `backup_ro`'s password on `main` → update the secret | `backup.yml` fails; no new dumps (PITR still works) | Yearly | — |
| `BACKUP_AGE_PUBLIC_KEY` + private key | GitHub secret; password manager | `age-keygen` a new pair; update the secret; **keep the old private key** until every dump encrypted with it has expired (30 days) | Nothing breaks; dumps are simply encrypted to the new key from the next run | On exposure | — |
| `ADMIN_DRAIN_TOKEN` | GitHub secret + `harvest-prod` env group | Generate 32 random bytes, update both places, redeploy prod | `release.yml` cannot drain; deploy without drain or wait for the redeploy | Yearly, and on exposure | — |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | GitHub secrets + `harvest-prod` env group | Cloudflare → R2 → Manage API tokens → create a token scoped to the bucket → update → revoke | `backup.yml` upload fails; the deletion log cannot be written | Yearly | — |
| `GOOGLE_CLIENT_ID`, `NEON_PROJECT_ID`, `SENTRY_ORG`, `SENTRY_PROJECT_*`, `EMAIL_FROM`, `VITE_PLAUSIBLE_DOMAIN`, `STAGING_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET` | various | Identifiers, not secrets. No rotation | n/a | n/a | — |
| Account passwords and 2FA | password manager | Per provider's account settings; refresh recovery codes | n/a | On exposure | — |

The leaked-secret runbook in [observability](observability.md) §Runbooks is: rotate in the owning account, update the env group or GitHub secret, redeploy, then fill the date here.

## Verification

| Connection | How you know it works |
|---|---|
| GitHub branch protection | A direct `git push origin main` is refused; a PR shows `check` as a required check and cannot merge while it is red |
| Secret scanning / push protection | Settings → Code security shows both enabled. There is no safe test secret: never commit a real one to check it |
| Dependabot | Settings → Code security shows alerts enabled; a Dependabot PR appears within the week |
| GitHub Actions secrets | `preview-db.yml` creates a `preview/<branch-slug>` branch on a test PR; `e2e.yml` reaches the preview; `smoke.yml` posts the `smoke-staging` status on a `main` SHA |
| `production` Environment | `release.yml` pauses for approval, then the Render dashboard shows a deploy for the given SHA on `harvest-prod` |
| Render staging | Merge to `main` → `https://staging.<domain>/healthz` returns 200 with `uptime`, `eventLoopLagMs`, `roomsActive`, and `commit` equals the merged SHA; `/readyz` returns 200 |
| Render prod | `https://play.<domain>/healthz` and `/readyz` return 200 after a release; the certificate is valid |
| Render previews | A PR gets a `harvest-pr-<n>` URL; its `/readyz` returns 200 only after `preview-db.yml` has migrated the branch; the preview refuses to boot when the branch is missing |
| Neon branches | `neonctl branches list` shows `main`, `dev`, `staging`, `ci`; `pnpm db:migrate` succeeds against the direct URL; `select 1` through the pooled URL |
| Neon API key | `neonctl branches list --api-key "$NEON_API_KEY"` lists only the `code-harvest` project's branches |
| Domain DNS | `dig CNAME play.<domain>` and `staging.<domain>` return Render's target; Render shows the domain as verified with a certificate |
| Mail aliases | A message to `dmarc@<domain>` and `support@<domain>` arrives in the owner's inbox |
| Google OAuth | Continue with Google on `staging.<domain>` completes and lands on onboarding; a test-user email outside the list is refused while in Testing; localhost works on `:5173` |
| Google Search Console | The property shows **Verified**; the consent screen publishes without a domain warning |
| Resend domain | Resend shows every record verified; a sign-in code arrives in under a minute at a personal address from staging; the headers show `dkim=pass`, `spf=pass`, `dmarc=pass` |
| Resend webhook | Send to Resend's bounce test address; a row appears in `email_suppression`; Resend's webhook log shows 200 |
| `BETTER_AUTH_SECRET` | Sign in, redeploy, still signed in. Change the secret and the session is gone |
| `AUTH_TEST_OTP_SECRET` | On staging, `e2e-1@e2e.test` signs in with the derived code without an email being sent; the server refuses to start if the variable is set with `APP_ENV=production` |
| Sentry | Trigger a test error in staging; it appears in `harvest-server` (or `harvest-web`) with the release equal to `RENDER_GIT_COMMIT` and a readable stack trace |
| Grafana Cloud | `curl -H "Authorization: Bearer $METRICS_TOKEN" https://play.<domain>/metrics` returns Prometheus text; without the header it returns 404; the Grafana dashboard shows `connected sockets` within 2 minutes |
| Plausible | A visit to `play.<domain>` shows in the Plausible dashboard; the browser's network tab shows the script served from `play.<domain>`, not `plausible.io` |
| Turnstile | With the flag on, the widget renders on the send-code form; a request without a token gets 4xx |
| HIBP | Creating an account with `password123` shows "This password appeared in a data breach" |
| Uptime monitor | Use the monitor's test notification: the owner's phone gets the push and SMS. The dashboard shows prod `/healthz` and `/readyz` green and no check on staging or previews |
| Status page | `status.<domain>` loads over HTTPS and the sign-in error state links to it |
| Backups | `backup.yml`'s log shows `pg_restore --list` succeeded and the object appears in the bucket; the bucket lifecycle rule reads 30 days; a dump decrypts with the private key from the password manager |
| Local dev | `pnpm dev`, open `http://localhost:5173`, request a code, the 6-digit code appears in the server console, sign-in completes |

## Doc mismatches found while writing this file, and how they were settled

All settled on 2026-10-07 in the same audit pass; listed so the reasoning survives.

1. **Preview branch name:** `preview/<branch-slug>` everywhere (Render exposes the git branch, not the PR number). hosting.md updated.
2. **How prod is deployed:** `release.yml` drains first (`POST /api/admin/drain` with the bearer `ADMIN_DRAIN_TOKEN`, poll `/healthz` until `roomsActive == 0`, max 20 min), then deploys the smoke-tested commit through the Render API (`RENDER_PROD_SERVICE_ID`); there is no deploy-hook URL. environments-and-ci.md, hosting.md and backlog SRV-14 all say this.
3. **Localhost redirect URI:** `http://localhost:5173/api/auth/callback/google` (one dev origin behind the Vite proxy). hosting.md updated.
4. **When `harvest-prod` exists:** declared in `render.yaml` from OPS-02.1, created in Render only when the first external testers join (closed beta); `harvest-staging` doubles as prod until then. hosting.md and cost-estimate.md agree.
5. **Service names:** `harvest-staging`, `harvest-prod`; the preview name pattern is confirmed in OPS-02 (environments-and-ci.md).
6. **Branch protection review rule:** off while the owner is the only committer (an author cannot approve their own PR); switched on with the second maintainer. standards.md, git-workflow.md and row 1 above agree.
7. **Analytics decision:** D-25 Plausible Cloud exists in decisions-needed.md; observability.md and privacy-and-age.md cite it.
8. **`backup.yml`:** has a CI-table row and its secrets are in row 28; environments-and-ci.md §CI-only secrets lists them.
9. **Deletion-log writer:** the server's nightly `jobs/account-deletion` (DB-06) writes it with the `R2_*` credentials in the `harvest-prod` env group (now in `.env.example` and the matrix above). No other server code touches the bucket.
10. **Preview URLs:** when `IS_PULL_REQUEST=true`, the server's start script derives `PUBLIC_URL`, `BETTER_AUTH_URL` and `ALLOWED_ORIGINS` from Render's `RENDER_EXTERNAL_URL`; the `previewValue` placeholders are overwritten at boot (environments-and-ci.md §Previews are isolated).
11. **README link:** README.md's doc tree and onboarding section link this file.
12. **Uptime monitor backlog id:** OPS-10 (uptime monitor and runbooks).
