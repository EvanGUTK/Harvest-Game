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

## Purity (lang, sim)

- Integers only. Use `floorDiv(a, b)` and `floorMod(a, b)` helpers from `lang` (Python semantics). The `/` operator is banned by lint.
- No ambient state: no `Date`, `Math.random`, `performance`, `crypto`, timers, globals, module-level mutable variables.
- All randomness through the seeded PRNG passed in explicitly.
- Iteration only over arrays and `Map` (insertion order). Never iterate object keys for anything that affects results.

## Errors

- Expected failures are **values**, not exceptions: `Result<T, E>` or discriminated unions (compile results, action outcomes).
- Exceptions only for programmer errors (invariant violations), and they must be `Error` subclasses with a stable `code`.
- Never swallow an error. Log with context or return it.

## Naming

- Use glossary terms exactly: `cycle`, `showdown`, `contract`, `credits`, `silo`, `rankIndex`. Not "tick", "match-round", "coins", "inventory", "elo".
- Files: `kebab-case.ts`. Types: `PascalCase`. Functions/vars: `camelCase`. Constants from `content`: `SCREAMING_CASE`.
- Test files sit beside the code: `lexer.ts` / `lexer.test.ts`.

## Comments and docs

- Comment **why**, not what. Every module starts with a 2–5 line header: purpose, design doc link, invariants.
- Public functions get a JSDoc line. Internal helpers usually don't need one.
- `TODO(ID):` only with a backlog ID. Lint rejects bare TODO/FIXME.

## Dependencies

- Add a dependency only if it saves real complexity and is maintained. Record the reason in the PR. Pin with `^` and let Dependabot propose updates.
- `lang` and `content`: zero runtime dependencies, permanently.

## Data and numbers

- All tunable numbers live in `packages/content`. `sim` reads them; it never hard-codes.
- Any change that alters simulation output bumps `RULES_VERSION` and updates golden hashes in the same commit, with a line in `docs/07-roadmap/changelog.md`.

## Formatting

Prettier, zero config beyond `.prettierrc`. Run `pnpm format`. Don't argue with it.
