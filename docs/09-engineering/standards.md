# Coding Standards

The point of these rules: code that a stranger (or Claude on another machine, next month) can read, change and trust. Speed is never a reason to break one.

## TypeScript

- `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (see `tsconfig.base.json`). Never loosen them.
- **No `any`.** Use `unknown` and narrow. No `@ts-ignore`; `@ts-expect-error` only with a one-line reason and a backlog ID.
- Prefer `type` aliases and discriminated unions over classes for data. Classes only where identity and lifecycle matter (VM, Room, Connection).
- Exhaustive `switch` over unions with an `assertNever(x)` default.
- Branded types for ids and opaque handles (`UserId`, `RoomId`, `BytecodeModule`).
- Functions: small, named for what they return or do, one level of abstraction each. If a function needs a comment to explain its sections, split it.
- No default exports. Public API only through `src/index.ts`.
- Immutability by default: `readonly` arrays and properties on inputs; mutate only inside the owning module.

## Purity (lang, sim, content)

- Integers only. Use `floorDiv(a, b)` and `floorMod(a, b)` helpers from `lang` (Python semantics). The `/` operator and `/=` are banned by lint.
- No ambient state: no `Date`, `Math.random`, `performance`, `crypto`, timers, `globalThis` and other globals (`window`, `document`, `process`, `fetch`, `localStorage`…), module-level mutable variables.
- All randomness through the seeded PRNG passed in explicitly.
- Iteration only over arrays and `Map` (insertion order). Never iterate object keys for anything that affects results; lint bans `for…in` and `Object.keys/values/entries`.
- No regular expressions in `lang`/`sim`/`content`: the lexer is hand-written for determinism and exact metering (see [interpreter-vm](../03-architecture/interpreter-vm.md) §Lexer). No `**` (it can produce non-integers; use an integer multiply loop). No dynamic `import()`. No `eval` or `new Function` (CLAUDE.md rule 2).
- Test files beside the engine code (`*.test.ts`, `*.bench.ts` in `lang`/`sim`) keep the ambient-state and sandbox bans so they run unchanged in Node and every browser engine, but may use regex, `/` and `**` in assertions (see `eslint.config.js`).

## Errors

- Expected failures are **values**, not exceptions: `Result<T, E>` or discriminated unions (compile results, action outcomes).
- Exceptions only for programmer errors (invariant violations), and they must be `Error` subclasses with a stable `code`.
- Never swallow an error. Log with context or return it.

## Naming

- Use glossary terms exactly in code identifiers, types, server/DB fields and UI copy: `cycle`, `showdown`, `contract`, `credits`, `silo`, `rankIndex`. Not "tick", "match-round", "coins", "elo". Player-facing Sprout builtin names and campaign chapter titles are fixed by the language spec and are exempt: the sensor `inventory(crop)` reads the silo and keeps its name. Its host-table implementation may be called `inventory` in `SENSOR_COSTS` and the SIM-02 host table because it mirrors the builtin, but all other internal code uses `silo`.
- Files: `kebab-case.ts`. Types: `PascalCase`. Functions/vars: `camelCase`. Constants from `content`: `SCREAMING_CASE`.
- Test files sit beside the code: `lexer.ts` / `lexer.test.ts`.

## Comments and docs

- Comment **why**, not what. Every module starts with a 2–5 line header: purpose, design doc link, invariants.
- Public functions get a JSDoc line. Internal helpers usually don't need one.
- No `TODO`/`FIXME`/`HACK` comments in code (lint rejects them, whether or not they carry an ID). Deferred work gets a backlog ID in [backlog](../07-roadmap/backlog.md) and a line under `STATE.md` → Known gaps / debt.

## Dependencies

- Add a dependency only if it saves real complexity and is maintained (commits in the last 6 months, more than one maintainer or a well-known org). Record the reason in the PR.
- `lang` and `content`: zero runtime dependencies, permanently. `sim`: none beyond `lang` and `content`.
- Version ranges use `^`; the lockfile is the truth. Every install in CI and on Render runs `pnpm install --frozen-lockfile` (the Render build command is set to exactly that). A PR that changes `pnpm-lock.yaml` without a matching `package.json` change needs an explicit reason in its description (for example a transitive security fix); otherwise it is rejected.
- **Release-age gate.** pnpm's `minimumReleaseAge` is set to 7 days (10,080 minutes) in `pnpm-workspace.yaml`, so a version must be at least a week old before pnpm will select it. Fresh malicious releases, the usual way supply-chain worms spread, are then caught by the ecosystem before we install them. Use `minimumReleaseAgeExclude` only for our own packages, if we ever publish any.
- **Install scripts stay blocked.** pnpm 10 does not run dependency lifecycle scripts. A package that genuinely needs a build step is added to `onlyBuiltDependencies` in `pnpm-workspace.yaml` with a comment saying why (today: `esbuild` only).
- **CI audit.** CI runs `pnpm audit --prod --audit-level=high` (fails the build) and checks the licenses of production dependencies (`pnpm licenses list --prod`), failing on GPL, AGPL or unknown.
- **Actions are pinned to full commit SHAs** with a version comment (`actions/checkout@<sha> # v4.2.2`). Dependabot's `github-actions` entry keeps them fresh. Dependabot `groups` keep tooling bumps in one PR; security updates always come as separate PRs.
- **Repo protection** (owner's one-time GitHub settings, tracked in [connections](../06-infrastructure/connections.md)): `main` requires a PR, the CI `check` job (plus `determinism` once it exists); the "one approving review" rule is switched on only once a second maintainer exists, because GitHub never lets an author approve their own PR and the owner is the only committer today; secret scanning **with push protection** and Dependabot security updates are on; a `CODEOWNERS` file names `@evanggoodman` for `/packages/db`, `/apps/server/src/http` and `/.github`.

## Data and numbers

- All tunable numbers live in `packages/content`. `sim` reads them; it never hard-codes.
- Any change that alters simulation output bumps `RULES_VERSION` and updates golden hashes in the same commit, with a line in `docs/07-roadmap/changelog.md`.

## What is enforced where

| Rule | Enforced by |
|---|---|
| Engine purity bans (§Purity), dependency direction, no `any`, no `@ts-ignore`, `@ts-expect-error` needs a description, no default exports, no `TODO`/`FIXME`/`HACK` comments, no inline lint disables, no focused/skipped/placeholder tests, exhaustive `switch`, type-only imports | ESLint (`pnpm lint`, part of `pnpm check` and CI) |
| `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | `tsc` (`pnpm typecheck`) |
| Formatting | Prettier (`pnpm format:check`) |
| Dependency policy (§Dependencies) | CI and pnpm config, as listed there |
| Branded ids, small functions, comment quality, glossary naming, immutability, errors as values, a backlog ID on every `@ts-expect-error` | Human review and the `reviewer` agent against the [definition of done](definition-of-done.md) |

## Formatting

Prettier, zero config beyond `.prettierrc`. Run `pnpm format`. Don't argue with it.
