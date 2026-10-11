# @harvest/sim

Deterministic farm world, host functions (actions/sensors), shared market, and the discrete-event scheduler that interleaves every drone.

- Design: [`docs/03-architecture/simulation-engine.md`](../../docs/03-architecture/simulation-engine.md)
- Rules: [`docs/01-game-design/farm-simulation.md`](../../docs/01-game-design/farm-simulation.md)
- Backlog: `SIM-01` … `SIM-08`, `SIM-BAL` (milestone M0)

**Purity:** integers only; no `Date`, `Math.random`, DOM or Node APIs.

## Public API so far

- **PRNG (SIM-05):** `splitmix32`, `createSfc32`, `seedStream`, `createStreams`, `randomBelow`, `generateLayout` (FNV-1a comes from `@harvest/lang`). Streams `layout`, `weather` and `player:<slot>` are seeded from the match seed as in [§PRNG seeding](../../docs/03-architecture/simulation-engine.md#determinism).
- **World (SIM-01):** `advanceTile`, `advanceTileDetailed` (also reports the dry pause behind Never Thirsty), `advanceFarm`, `Farm`, `AdvanceRules`, `TileAdvance`. `Farm.everDryPaused` is sticky and not part of the state hash.
- **Market (SIM-04):** `createMarket(config)`, `advanceMarket(market, t)` (returns the advanced market; states are values), `marketPrice(market, crop)`, `marketPressures(market)` (in `CROP_IDS` order, for the state hash), `cloneMarket`. Decay and the price curve follow [§Market](../../docs/03-architecture/simulation-engine.md#market-normative); the market must be advanced to `t` before a price read.
- **State hash (SIM-06):** `stateHash(state, t, rules)` and `stateWords` (the words it hashes) implement [§State hash](../../docs/03-architecture/simulation-engine.md#state-hash-normative): FNV-1a over the int32 words after force-advancing copies of every farm and the market to `t`. `everDryPaused`, `lastUpdated`, VM heaps and the event log are not hashed.
