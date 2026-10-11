# Simulation Engine (`packages/sim`)

## Responsibilities

- World state for 1..8 farms plus a shared market
- Host-function table for the VM (actions and sensors, with costs from `content`)
- **Discrete-event scheduler** that interleaves all drones deterministically
- Event log for animation and replay, plus periodic state hashes

## Model: discrete-event, lazy world

Each drone has its own VM and its own **local clock** (cycles spent). The world only needs to be correct **at the moments a drone touches it** (sensor or action). Between touches, a drone executes pure instructions with no world access, so they can run in a tight batch.

```
loop:
  for each runnable agent without a pending world-touch:
      vm.run(budget − agent.clock)   → yields at next host call (or halt/error/budget)
      agent.pending = { t: yield.atCycle, call }      // halt and error are scheduled like host calls, at t = atCycle
                                                      // a `budget` yield just finishes the agent
  pick agent with smallest pending.t
      tie-break: smallest (agentIndex − (t mod N) + N) mod N   ← fixed rotation, see Tie-break
  emit every hash event k·1000 ≤ t not yet emitted     // BEFORE anything at t is applied, see State hash
  world.advanceTo(pending.t)                 // lazy: growth, moisture, market decay
  result, cost = host.apply(agent, call)     // sensors: read; actions: mutate
  agent.clock = pending.t + cost             // cost = applied host cost (see Clock arithmetic); the 1-cycle CALL_HOST base is already inside pending.t
  eventLog.push(...)                         // actions only
  vm.resume(result, cost)
until all agents halted/errored/clock ≥ budget
emit the remaining hash events with k·1000 < budget
world.advanceTo(budget); liquidate silos; finalStateHash = H(budget); compute scores
```

- **Actions take effect at their start time** `t`, and the drone is then busy until `t + cost`. Effects at start is simpler and makes the "two players sell at the same cycle" case well-defined by tie-break.
- **Sensors cost cycles too**, so they occupy the drone, but they don't mutate anything.
- **Only the market is shared** between farms. Without the market, each farm would be fully independent. In single-player, the scheduler runs with one agent (or two with `spawn`). In showdowns every farm runs exactly one agent in v1 (`spawn` is rejected as a locked feature, D-24).

### Clock arithmetic (normative)

- `agent.clock` is the **committed** clock: the cycle at which the drone is next free (0 at the start, `t + cost` after each applied call). The VM's own cycle counter equals `agent.clock` whenever the VM is resumed.
- `atCycle` in a `host` yield is the agent's clock **after argument evaluation and after the 1-cycle `CALL_HOST` base**, i.e. the cycle at which the drone starts the action. `yield.cost` is `host.cost` only; it excludes the base cycle. For `wait(n)` and `goto(x, y)` the cost depends on the arguments (`n`; `move` cost × distance), so `host.apply` computes it and passes it to `resume` (below).
- The scheduler applies the call at `t = atCycle` and sets `agent.clock = t + cost`, where `cost` is the **applied cost**. It equals `yield.cost` (the default baked into the `CALL_HOST` operand) except where only `host.apply` can know the real cost: an action that did nothing costs 5 (a failed `plant`, `till`, `water`, `refill` or second `spawn`, or a `harvest` on an empty tile; see the [outcome matrix](../02-language/standard-library.md#outcome-matrix-normative)), `wait(n)` costs `n`, and `goto(x, y)` costs `move` cost × distance. `host.apply` passes the applied cost to `vm.resume(result, cost?)`, which charges it to the VM's counter; when `cost` is omitted the baked default is charged. The VM's counter and `agent.clock` therefore always agree.
- `cycles()` returns the `atCycle` of its own call. `cycles_left()` returns `max(0, budget − atCycle)`.
- `vm.run(maxCycles)`: a pure instruction executes only while `remaining ≥ 1`. A `CALL_HOST` yields `host` whenever `remaining ≥ 1`, regardless of `host.cost` (so `atCycle ≤ budget` always). When `remaining = 0` the VM yields `budget`. Instructions are atomic: an op starts while at least 1 cycle remains and is charged in full, per-element surcharge included (see [interpreter-vm](interpreter-vm.md#bytecode)), so a run can end a few cycles past `maxCycles`. The sim clamps world time to the budget.
- **Budget boundary:** a call that was reached with `remaining ≥ 1` always takes effect, even if `t + cost > budget`, and a call at exactly `t = budget` is applied before the final liquidation. The agent is then finished and its `cyclesUsed = min(agent.clock, budget)`. A player's `cyclesUsed` is the maximum over its drones.
- `halt()` is a builtin like any other: it costs 0 (plus the 1-cycle call), so the drone's clock is `atCycle`, and it emits `{ t: atCycle, slot, drone, k: 'halt' }`. A halt or error that comes from the VM itself (end of program, runtime error) is scheduled at its `atCycle` in the same way and emits its event then.
- **`spawn(fn)`** (campaign only in v1, D-24) is a world-touching call like any other. The caller pays 200 (`agent.clock = atCycle + 200`). The new drone (`droneNo` 1) is created at the caller's **current position** with its clock set to the same value, the caller's `atCycle + 200`. It shares the farm's credits, silo, water tank and the market with drone 0 (one farm, two drones), runs `fn()` to completion and then halts. A second `spawn` from either drone returns `False`, costs 5 and creates nothing. The call emits a `spawn` event either way (`ok` tells which).

### Tie-break (normative)

- Every drone has a fixed `agentIndex = slot × MAX_DRONES + droneNo`. `MAX_DRONES = 2` in v1: `droneNo` 0 is the primary drone, 1 is the drone started by `spawn` (same slot).
- `N = nSlots × MAX_DRONES` is **constant for the whole match**. Halted, errored or not-yet-spawned agents never change `N`; they simply have no pending call.
- Among agents with equal `pending.t`, run the one with the smallest `(agentIndex − (t mod N) + N) mod N`: the agent whose index equals `t mod N` goes first, then ascending indices, wrapping around.
- Example, 4 players (`N = 8`, primary drones at indices 0, 2, 4, 6) all pending at `t = 5`: ranks are 3, 5, 7, 1, so the order is slot 3, slot 0, slot 1, slot 2.
- Events carry `drone` (see Event log) so animations can tell a slot's two drones apart.

## Lazy world advancement

Per-tile state stores `lastUpdated`, and `Tile.crop` stores `ripeAt: number | null` (null until the crop first reaches `growCycles`). `advanceTile(tile, t)` with `last = tile.lastUpdated` (no-op when `t = last`):

```
For c in (last, t]:
  m(c)     = max(0, m(last) − |{ k : k mod 50 = 0, last < k ≤ c }|)   // decrement at k applies BEFORE growth for cycle k is counted
  grows(c) = crop ≠ null ∧ ¬withered ∧ m(c) ≥ crop.minMoisture
growth(t) = min(growCycles, growth(last) + |{ c ∈ (last, t] : grows(c) }|)
ripeAt    = first cycle c with growth(c) ≥ growCycles; stored on the crop (null until then)
withered  = ripeAt ≠ null ∧ t ≥ ripeAt + witherCycles                  // world cycles, never pauses with moisture
plantedAt = t of the plant action; cycle plantedAt itself contributes 0 growth
```

- **O(1) evaluation.** Moisture only falls between touches, so the growing cycles are one contiguous run. With `m0 = m(last)` and `mm = crop.minMoisture` (1 for radish and corn, 30 for melon): if `m0 < mm` nothing grows; otherwise `stop = 50 × (floorDiv(last, 50) + m0 − mm + 1)` is the first cycle at which moisture is below `mm`, and `grown = max(0, min(t, stop − 1) − last)`. If this advance carries `growth` up to `growCycles`, then `ripeAt = last + (growCycles − growth(last))`.
- **No-decay switch.** With `moistureDecay = false` (campaign runs before the Water node, see Public API) moisture never decrements: `m(c) = m(last)` and `stop = ∞` above. `water` still applies `min(100, m + 40)`.
- **Wither boundary:** a harvest at `t = ripeAt + witherCycles − 1` still pays, a harvest at `t = ripeAt + witherCycles` yields 0. Wither counts world cycles, so a dry tile does not delay it.
- `plant`, `till`, `water`, `harvest` and every sensor first advance the tile to `t`, then read or mutate it. `water` applies `min(100, m(t) + 40)` to the advanced moisture.
- **Dry pause (Never Thirsty).** An advance reports a *dry pause* when some cycle `c ∈ (last, t]` has `m(c) < crop.minMoisture` while the crop is still unripe (`ripeAt = null` at the start of `c`); a cycle in which the crop reaches `growCycles` grew, so it is not dry, and a dry cycle after `ripeAt` never counts. In O(1) terms a pause is reported when `m0 < mm`, or when `stop ≤ t` and the crop did not ripen before `stop`, and never for an empty, ripe or withered tile. A farm ORs the report of every tile it advances into a sticky boolean `everDryPaused` (never reset), which scoring reads for the Never Thirsty award. Because `m(c)` and `ripeAt` compose across touches, the flag is the same however the advances are split. It is not part of the state hash.
- **Advancing is compositional:** `advanceTile(advanceTile(x, t1), t2)` equals `advanceTile(x, t2)`. This is what lets the state hash force-advance the whole world without changing any outcome, and a unit test asserts it for random touch sequences (SIM-01).

### Market (normative)

State per crop: integer `pressure`. `market.lastUpdated` plays the role of the tile's `lastUpdated`.

- **Decay.** Market `pressure` decays once for every multiple of 500 in `(market.lastUpdated, t]`: `p = floorDiv(p × 80, 100)` per step (at most `budget / 500 = 60` steps), applied **before** any sale or price read at `t`, so a sale at exactly `t = 500` sees the decayed pressure.
- **Price.** `priceBp = max(floorBp, 10_000 − stepBp × pressure)` and `price = floorDiv(base × priceBp, 10_000)`, where `floorBp = MARKET.priceFloorBp`, `stepBp = MARKET.pressureStepBp` and `base` is the crop's base price, all from `content`. The decay interval and factor (500, 80 / 100) and `liquidationBp` are also `MARKET` constants.
- **Sale.** `sell(crop, n)` sells `k = min(n, inventory)` units. **One price per lot:** the price is computed once from the pressure *before* the sale, `credits += k × price`, then `pressure += k`. The price impact of a lot therefore only hits later sales, and the balance harness tracks "dump everything in one `sell`" strategies.
- **Liquidation** at the end of the match, after `world.advanceTo(budget)`: per slot ascending, per crop in `CROPS` order, `credits += floorDiv(inventory × price × liquidationBp, 10_000)` where `price` is the final market price, then the inventory is emptied. Liquidation never changes `pressure`, emits no `sell` event, and is **not** a credits change for tiebreak #1 (`cyclesLastChange`).

The world is only advanced to the times drones touch it, so simulation cost scales with **drone activity**, not with grid size × cycles.

## Determinism

| Rule | Enforcement |
|---|---|
| Integers only | Lint bans `/` outside a `floorDiv` helper. Values are checked with `Number.isSafeInteger` in debug builds |
| No ambient randomness | Lint bans `Math.random`, `Date`, `performance`, `crypto` in `lang`/`sim` |
| Seeded PRNG | `sfc32` (32-bit, `Math.imul` + `>>> 0`), seeded from the match seed and a per-stream id as described below. Streams: `layout`, `weather`, `player:<slot>` |
| Seed range | `seed` is an **unsigned 32-bit integer** (0 … 4,294,967,295). Match seeds are generated by the server at coding start with `crypto.getRandomValues` (outside `sim`, which bans `crypto`); contract seeds are fixed per contract in `content`; Free Farm seeds are issued with the server-side session. The seed is XORed with a stream id and fed to `splitmix32`, so a wider seed would be silently truncated |
| Stable iteration | Arrays and `Map` only. Tiles are iterated row-major |
| Versioned rules | `rulesVersion` is pinned per match. `content` values are frozen per version |

**PRNG seeding (normative).**
- `streamId = fnv1a32(streamName)` over the ASCII bytes of the name (`layout`, `weather`, `player:0`, `player:1`, …), with the FNV-1a parameters from [State hash](#state-hash-normative).
- `g = splitmix32((seed ^ streamId) >>> 0)`. The sfc32 state `(a, b, c, d)` is the next four outputs of `g`; then the first 12 sfc32 outputs are discarded. `next()` returns a uint32. The algorithms are pinned with known-answer unit tests, computed independently of the TypeScript, before the first golden hash is recorded (SIM-05). `splitmix32` is the widely used 32-bit variant: `state = (state + 0x9e3779b9) >>> 0; z = state ^ (state >>> 16); z = imul(z, 0x21f0aaad); z ^= z >>> 15; z = imul(z, 0x735a2d97); out = (z ^ (z >>> 15)) >>> 0`. `sfc32` is the usual schedule: `t = ((a + b) + d) >>> 0; d = (d + 1) >>> 0; a = b ^ (b >>> 9); b = (c + (c << 3)) >>> 0; c = rotl32(c, 21); c = (c + t) >>> 0; out = t`, each state word kept as a uint32. FNV-1a lives in `lang` (the `lang` goldens use it too, over UTF-8 bytes) and `sim` imports it.
- `random(n)` in slot `s` returns `player:s.next() % n` (`n ≥ 1`). The stream belongs to the slot, so both of its drones draw from it in scheduler order.
- **Layout.** The `layout` stream is consumed **once per match**, not per slot, because every player gets the same farm. For each tile in row-major order (y then x) draw `moisture = startMoisture.min + next() % (startMoisture.max − startMoisture.min + 1)` (showdowns use `{ min: 0, max: 40 }`, i.e. `next() % 41`), then `rockRoll = next() % 10_000` (`BASIS_POINTS`). The tile is `rock` when the room has the rocky modifier, `rockRoll < WORLD.rockDensityBp` and the tile is not the well tile (`WORLD.wellTile`, `(0,0)` in v1); otherwise it is `grass`. Both draws are always made, so the rest of the layout and every hash do not change with the modifier. Ranked has no rocks in v1. The 8 % density is provisional and lives in `content`. Every slot's farm starts as a copy of this layout.
- `weather` is reserved: no draws in v1.

**Cross-engine proof:** golden tests run the same programs and seeds in Node, Chromium, Firefox and WebKit, and compare the final **state hash** (see below). These run in CI on every PR that touches `lang`, `sim` or `content`.

## State hash (normative)

`H(t)` is **FNV-1a, 32-bit** (offset basis `0x811c9dc5`, prime `0x01000193`, multiplication with `Math.imul`) over the bytes of a sequence of int32 words, each written little-endian (uint32 values are written as their int32 reinterpretation). The result is a uint32 (`>>> 0`).

`H(t)` first **force-advances** every tile of every farm and the market to `t`, then feeds the words in this order:

1. `t, gridSize, nSlots`
2. Market: `pressure` per crop in `CROPS` order.
3. Per slot ascending: `credits`; `inventory` per crop in `CROPS` order; `water` (the farm's one shared tank); then per drone ascending (`droneNo` 0, 1): `x, y, clock, status`. `clock` is the committed `agent.clock`. `status` is 0 running, 1 halted, 2 error, 3 not spawned (a not-spawned drone writes 0 for `x, y, clock`).
4. Per slot ascending, tiles row-major (y then x): `soil` (0 grass, 1 tilled, 2 rock), `moisture`, `cropCode` (index in `CROPS` order, −1 for none), `plantedAt`, `growth`, `ripeAt` (−1 for null), `withered` (0/1). A tile without a crop writes `cropCode = −1`, `plantedAt = 0`, `growth = 0`, `ripeAt = −1`, `withered = 0`.
5. The four sfc32 state words `(a, b, c, d)` of every PRNG stream in the fixed order `layout, weather, player:0 … player:(nSlots−1)`.

The steps are sequential: step 3 is written for every slot (ascending) before step 4 starts, and step 4 for every slot before step 5. Slot data is therefore not interleaved.

VM heaps, programs, the event log, `lastUpdated` and the farm's `everDryPaused` flag are not hashed.

**Emission.** Before applying any call at time `t`, for every `k` with `lastHashT < k·1000 ≤ t`, emit `{ t: k·1000, k: 'hash', h: H(k·1000) }`. So the hash at 1000 precedes every action at 1000 and covers exactly the calls with `t < 1000`. After the main loop, emit the remaining multiples below `budget`. `finalStateHash = H(budget)` is computed **after** liquidation; when `budget` is a multiple of 1,000 the hash event at `t = budget` is emitted after liquidation and equals `finalStateHash`.

**`lang` goldens** have no world. Their `expected.hash` is the same FNV-1a over the UTF-8 bytes of `str(v) + "\n"` for every global in definition order, followed by each print line plus `"\n"`.

## Event log (for animation and replay)

```ts
type SimEvent =
  | { t: number; slot: number; drone: 0 | 1; k: 'move'; to: [x: number, y: number] }
  | { t: number; slot: number; drone: 0 | 1; k: 'plant'; at: [number, number]; crop: CropId; ok: boolean }
  | { t: number; slot: number; drone: 0 | 1; k: 'harvest'; at: [number, number]; crop: CropId | null; ok: boolean }
  | { t: number; slot: number; drone: 0 | 1; k: 'till' | 'water' | 'refill'; at: [number, number]; ok: boolean }
  | { t: number; slot: number; drone: 0 | 1; k: 'sell'; crop: CropId; n: number; price: number; credits: number }
  | { t: number; slot: number; drone: 0 | 1; k: 'spawn'; at: [number, number]; ok: boolean }
  | { t: number; slot: number; drone: 0 | 1; k: 'halt' | 'error'; info?: string }
  | { t: number; k: 'weather'; kind: string; data: unknown }
  | { t: number; k: 'hash'; h: number };          // every 1,000 cycles, before any action at that cycle
```

- **`drone`** is required on every per-slot event (`0` primary, `1` spawned) so the renderer can tell a slot's two drones apart.
- **`move` / `goto`.** `move(dir)` emits one `move` event. `goto(x, y)` emits exactly **one** `move` event with `to: [x, y]` (the target tile). Like every action it takes effect at its start time `t`, and the drone is busy for `cost` cycles, so the renderer spreads the flight over that time. `wait(n)` emits no event: the renderer idles the drone until its next event. Sensors emit no events.
- **`sell`** emits one event per call that sold at least one unit (`n > 0`): `price` is the single lot price and `credits` the balance after the sale. A `sell` that sells nothing, and end-of-match liquidation, emit no event.
- **`spawn`** emits `{ …, k: 'spawn', at, ok }` at the call's `t`. `drone` is the **caller**, `at` is the caller's position (where drone 1 appears when `ok` is true), and `ok: false` marks a second `spawn`.
- The client animates by interpolating drone movement between `move` events and computing crop growth visuals from the same lazy rules (it imports `sim`).
- Size estimate: a typical program performs about 1,000 actions per showdown (successful actions cost 21 to 61 cycles including the call, and real programs also spend cycles on logic), so about 8k events for 8 players plus 30 hash events. At about 50 bytes per event that is about 400 KB as JSON and about 60 to 90 KB gzipped, sent in chunks of at most 32 KB. Each player downloads the full log, so egress is about 0.7 MB per 8-player showdown. The hard upper bound is 5,000 events per player (the cheapest event-producing call is a failed `plant` or `harvest` at 5 + 1 cycles), about 2 MB of JSON for 8 players. A compact binary encoding can come later if needed.
- **Replays store inputs, not the event log**: programs, seed, rules version and language version. The log is regenerated on demand (no server-side cache in v1).

## Public API

Mirrors `packages/sim/src/index.ts`. Two entry points share one engine.

```
Simulation.run(config: SimConfig, players: PlayerInput[]): SimResult      // server path, official results and receipts; = create() + step(cycleBudget)
Simulation.create(config: SimConfig, players: PlayerInput[]): SimRun      // client path: editor run / pause / step, finale and replay player
Simulation.restore(snapshot: SimSnapshot): SimRun
SimRun.step(maxCycles, { stepLineOf? }): { t, events, done, result? }     // stepLineOf: stop when that slot's primary drone reaches its next statement boundary
SimRun.snapshot(): SimSnapshot                                            // the client takes one every 1,000 cycles for the timeline scrubber
```

- **`SimConfig`** holds `rulesVersion`, `languageVersion`, `seed` (uint32), `gridSize`, `cycleBudget`, `startCredits`, `startWater`, `startMoisture: { min, max }`, `moistureDecay`, `sharedMarket`, `randomEnabled`, `spawnEnabled` and `modifiers: { rocks, weather }`.
  - `startMoisture` is `{ min: 0, max: 40 }` in showdowns; campaign runs before the Water node use `{ min: 100, max: 100 }`. `moistureDecay` is `true` in showdowns and `false` in campaign runs before the Water node. Both are derived from the player's unlocks, so the client, the server re-simulation and `startStateHash` agree (see [farm-simulation](../01-game-design/farm-simulation.md) §Rocks and seeds).
  - `spawnEnabled` is `false` in showdowns (D-24): the compiler already reports `E-LOCKED-FEATURE`, and the host table also rejects `spawn()`. `randomEnabled` is `false` in ranked (D-18).
- **`PlayerInput`** is `{ slot, module: BytecodeModule | null, compileError?, upgrades? }`. A `null` module is the idle program, and `compileError` (the first diagnostic) surfaces in `PlayerResult.error`. `upgrades` is `{ moveCost, waterAmount, maxDrones }` (campaign only; showdowns use the defaults).
- **`PlayerResult`** is `{ slot, score, cyclesLastChange, logicCycles, programTokens, cropsHarvested, awards, output, error? }`. `output` is the first 200 `print` lines and is never shown to rivals (see [realtime-protocol](realtime-protocol.md)). `SimResult` is `{ players, finalStateHash, events }`.
- **Host-call contract.** `spawn` follows the Clock arithmetic bullet above; the scheduler resumes the VM with `vm.resume(result, cost?)` as described there.

## Balance harness (`tools/balance`)

A CLI that runs bot programs × seeds × rule tweaks and reports:
- score distribution per crop strategy (no single crop should dominate)
- sensitivity of the shared market (does an 8-player lobby collapse all prices?)
- `[SIM-BAL]` mean realised sale price against base in an 8-player all-radish lobby (a reported metric, provisional; no pass threshold until the architect sets one)
- `[SIM-BAL]` ideal-play profit per 1,000 drone-cycles for each crop, at base price and at the market floor price
- `[SIM-BAL]` "hoard and dump" strategies (one large `sell` per window) must not beat steady selling
- cycle budget pacing: the starter-program criterion below

**Starter-program criterion** `[SIM-BAL]` *(provisional)*. The published starter program (see [standard-library](../02-language/standard-library.md)) must finish with at least ₵250 when run solo, and with at least 30 % of the Agronomist bot's score in an 8-player lobby. The harness exits non-zero otherwise, and CI fails once the harness is wired into it.

This is where provisional numbers in `content` get tuned.
