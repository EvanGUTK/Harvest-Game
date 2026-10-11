# @harvest/sim

Deterministic farm world, host functions (actions/sensors), shared market, and the discrete-event scheduler that interleaves every drone.

- Design: [`docs/03-architecture/simulation-engine.md`](../../docs/03-architecture/simulation-engine.md)
- Rules: [`docs/01-game-design/farm-simulation.md`](../../docs/01-game-design/farm-simulation.md)
- Backlog: `SIM-01` … `SIM-08`, `SIM-BAL` (milestone M0)

**Purity:** integers only; no `Date`, `Math.random`, DOM or Node APIs.

## Public API so far

- **PRNG (SIM-05):** `splitmix32`, `createSfc32`, `seedStream`, `createStreams`, `randomBelow`, `generateLayout` (FNV-1a comes from `@harvest/lang`). Streams `layout`, `weather` and `player:<slot>` are seeded from the match seed as in [§PRNG seeding](../../docs/03-architecture/simulation-engine.md#determinism).
- **Market (SIM-04):** `createMarket(config)`, `advanceMarket(market, t)` (returns the advanced market; states are values), `marketPrice(market, crop)`, `marketPressures(market)` (in `CROP_IDS` order, for the state hash), `cloneMarket`. Decay and the price curve follow [§Market](../../docs/03-architecture/simulation-engine.md#market-normative); the market must be advanced to `t` before a price read.
- **Scoring (SIM-07):** `scorePlayers(rules, stats)` turns the scheduler's per-slot `PlayerStats` (slots exactly `0..n−1`) into `PlayerResult`s (final credits after liquidation, the idle program's fixed result, awards) and placements with the tiebreakers and shared places; `buildPlayerResult`, `rankPlayers` and `assignAwards` are the parts. See [scoring-and-judging](../../docs/01-game-design/scoring-and-judging.md).
