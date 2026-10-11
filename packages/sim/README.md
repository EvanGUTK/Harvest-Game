# @harvest/sim

Deterministic farm world, host functions (actions/sensors), shared market, and the discrete-event scheduler that interleaves every drone.

- Design: [`docs/03-architecture/simulation-engine.md`](../../docs/03-architecture/simulation-engine.md)
- Rules: [`docs/01-game-design/farm-simulation.md`](../../docs/01-game-design/farm-simulation.md)
- Backlog: `SIM-01` … `SIM-08`, `SIM-BAL` (milestone M0)

**Purity:** integers only; no `Date`, `Math.random`, DOM or Node APIs.

## Public API so far

- **PRNG (SIM-05):** `splitmix32`, `createSfc32`, `seedStream`, `createStreams`, `randomBelow`, `generateLayout` (FNV-1a comes from `@harvest/lang`). Streams `layout`, `weather` and `player:<slot>` are seeded from the match seed as in [§PRNG seeding](../../docs/03-architecture/simulation-engine.md#determinism).
- **World (SIM-01):** `advanceTile`, `advanceTileDetailed` (also reports the dry pause behind Never Thirsty), `advanceFarm`, `Farm`, `AdvanceRules`, `TileAdvance`. `Farm.everDryPaused` is sticky and not part of the state hash.
- **Market (SIM-04):** `createMarket(config)`, `advanceMarket(market, t)` (returns the advanced market; states are values), `marketPrice(market, crop)`, `marketPressures(market)` (in `CROP_IDS` order, for the state hash), `cloneMarket`, `sell(market, farm, crop, n, t)` (one price per lot; returns the new market and farm, the credits gained and the `sell` event payload) and `liquidate(market, farms, t)` (returns the new farms). Decay and the price curve follow [§Market](../../docs/03-architecture/simulation-engine.md#market-normative); the market must be advanced to `t` before a price read.
- **Scoring (SIM-07):** `scorePlayers(rules, stats)` turns the scheduler's per-slot `PlayerStats` (slots exactly `0..n−1`) into `PlayerResult`s (final credits after liquidation, the idle program's fixed result, awards) and placements with the tiebreakers and shared places; `buildPlayerResult`, `rankPlayers` and `assignAwards` are the parts. See [scoring-and-judging](../../docs/01-game-design/scoring-and-judging.md).
- **Actions and sensors (SIM-01):** `plant`, `harvest`, `till`, `water`, `refill`, `move` (pure: each returns `{ ok, cost, farm, event }`, or `{ cost, to, event }` for `move`, per the [outcome matrix](../../docs/02-language/standard-library.md#outcome-matrix-normative)), `DEFAULT_DRONE_STATS`, `touchTile`, `tileIndex`, `withTile`, and the sensors `sensorCrop`, `sensorIsRipe`, `sensorIsWithered`, `sensorGrowth`, `sensorSoil`, `sensorMoisture`. The SIM-02 host table dispatches to these.
- **State hash (SIM-06):** `stateHash(state, t, rules)` and `stateWords` (the words it hashes) implement [§State hash](../../docs/03-architecture/simulation-engine.md#state-hash-normative): FNV-1a over the int32 words after force-advancing copies of every farm and the market to `t`. `everDryPaused`, `lastUpdated`, VM heaps and the event log are not hashed.
- **Host table (SIM-02):** `hostSignatures(upgrades?)` (one `HostSignature` per builtin, id = index in `BUILTINS`, costs baked from `content`, move and goto at the drone's move cost) and `constantDefs()`, the two tables `compile` needs.
