# @harvest/db

Drizzle ORM schema and migrations for Neon Postgres.

Env: `DATABASE_URL` (pooled, `-pooler` host) for the app; `DATABASE_URL_UNPOOLED` (direct host) for `migrate`, the seeds and `drizzle-kit`. Scripts (planned, DB-01): `generate` (drizzle-kit generate), `migrate` (apply the committed SQL from `migrations/`), `seed`, `seed:e2e` (12 accounts, `e2e-1@e2e.test` .. `e2e-12@e2e.test`). Root aliases: `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:seed:e2e`.

Client config (postgres.js, `prepare: false`, two URLs): see [`docs/03-architecture/data-model.md`](../../docs/03-architecture/data-model.md) -> Neon specifics.

Design: [`docs/03-architecture/data-model.md`](../../docs/03-architecture/data-model.md). Lands in M2.
