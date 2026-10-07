# Environments & CI

## Environments

| Env | Web + server | DB | Purpose |
|---|---|---|---|
| **local** | `pnpm dev` (Vite + server with watch) | Neon dev branch, or local Postgres via Docker | Daily dev. Email codes print to the console |
| **preview** | Render preview environment per PR (free instances OK) | Neon branch `preview/pr-<n>` | Review features with real URLs |
| **staging** | Render (paid, smallest) | Neon `staging` branch | Load tests, release candidates |
| **prod** | Render (paid) | Neon `main` | Players |

## CI (GitHub Actions)

| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | PR, push | install (pnpm cache) → typecheck → lint (incl. purity rules for `lang`/`sim`) → unit tests → build |
| `determinism.yml` | PR touching `packages/lang|sim|content` | golden tests in Node + Playwright (Chromium, Firefox, WebKit), then compare state hashes |
| `differential.yml` | nightly | random-program differential tests vs CPython |
| `assets.yml` | PR touching `assets/` | license-manifest check, voxel bake, size budget check |
| `bench.yml` | PR touching `packages/lang|sim` | VM throughput + showdown execution time, fail on > 20 % regression |
| `e2e.yml` | PR (preview env ready) | Playwright: sign-in (test OTP), campaign contract 1-1, 2-browser showdown in a custom room |

## Release process

1. Merge to `main` deploys to **staging** automatically.
2. A smoke e2e runs against staging.
3. Promote to prod by manual approval (Render deploy hook). DB migrations run first and must be **backward compatible** (expand → deploy → contract).
4. A `rules_version` bump requires a changelog entry in `docs/` and an in-game patch note.
