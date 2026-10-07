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
  agent.clock = pending.t + cost             // cost = host cost only; the 1-cycle CALL_HOST base is already inside pending.t
  eventLog.push(...)                         // actions only
  vm.resume(result, cost)
until all agents halted/errored/clock ≥ budget
emit the remaining hash events with k·1000 < budget
world.advanceTo(budget); liquidate silos; finalStateHash = H(budget); compute scores
```

- **Actions take effect at their start time** `t`, and the drone is then busy until `t + cost`. Effects at start is simpler and makes the "two players sell at the same cycle" case well-defined by tie-break.
- **Sensors cost cycles too**, so they occupy the drone, but they don't mutate anything.
- **Only the market is shared** between farms. Without the market, each farm would be fully independent. In single-player, the scheduler runs with one agent (or two with `spawn`).

### Clock arithmetic (normative)

- `agent.clock` is the **committed** clock: the cycle at which the drone is next free (0 at the start, `t + cost` after each applied call). The VM's own cycle counter equals `agent.clock` whenever the VM is resumed.
- `atCycle` in a `host` yield is the agent's clock **after argument evaluation and after the 1-cycle `CALL_HOST` base**, i.e. the cycle at which the drone starts the action. `yield.cost` is `host.cost` only; it excludes the base cycle. For `wait(n)` and `goto(x, y)` the host table computes `yield.cost` from the arguments (`n`; `move` cost × distance).
- The scheduler applies the call at `t = atCycle` and sets `agent.clock = t + cost`. `cost` equals `yield.cost`, except for the two outcome-dependent cases that only `host.apply` can know: a failed `plant` and a `harvest` on an empty tile cost `plantFailed` / `harvestEmpty` instead. `vm.resume(result, cost)` charges that applied cost to the VM's counter.
- `cycles()` returns the `atCycle` of its own call. `cycles_left()` returns `max(0, budget − atCycle)`.
- `vm.run(maxCycles)`: a pure instruction executes only while `remaining ≥ 1`. A `CALL_HOST` yields `host` whenever `remaining ≥ 1`, regardless of `host.cost` (so `atCycle ≤ budget` always). When `remaining = 0` the VM yields `budget`.
- **Budget boundary:** a call that was reached with `remaining ≥ 1` always takes effect, even if `t + cost > budget`, and a call at exactly `t = budget` is applied before the final liquidation. The agent is then finished and its `cyclesUsed = min(agent.clock, budget)`. A player's `cyclesUsed` is the maximum over its drones.
- `halt()` is a builtin like any other: it costs 0 (plus the 1-cycle call), so the drone's clock is `atCycle`, and it emits `{ t: atCycle, slot, k: 'halt' }`. A halt or error that comes from the VM itself (end of program, runtime error) is scheduled at its `atCycle` in the same way and emits its event then.

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
- **Wither boundary:** a harvest at `t = ripeAt + witherCycles − 1` still pays, a harvest at `t = ripeAt + witherCycles` yields 0. Wither counts world cycles, so a dry tile does not delay it.
- `plant`, `till`, `water`, `harvest` and every sensor first advance the tile to `t`, then read or mutate it. `water` applies `min(100, m(t) + 40)` to the advanced moisture.
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
- `g = splitmix32((seed ^ streamId) >>> 0)`. The sfc32 state `(a, b, c, d)` is the next four outputs of `g`; then the first 12 sfc32 outputs are discarded. `next()` returns a uint32. The standard 32-bit splitmix and sfc32 algorithms are pinned with known-answer unit tests before the first golden hash is recorded (SIM-05).
- `random(n)` in slot `s` returns `player:s.next() % n` (`n ≥ 1`). The stream belongs to the slot, so both of its drones draw from it in scheduler order.
- **Layout.** The `layout` stream is consumed **once per match**, not per slot, because every player gets the same farm. For each tile in row-major order (y then x) draw `moisture = next() % 41`, then `rockRoll = next() % 100`. The tile is `rock` when the room has the rocky modifier, `rockRoll < 8` and the tile is not `(0,0)`; otherwise it is `grass`. Both draws are always made, so the rest of the layout and every hash do not change with the modifier. Ranked has no rocks in v1. The 8 % density is provisional and lives in `content`. Every slot's farm starts as a copy of this layout.
- `weather` is reserved: no draws in v1.

**Cross-engine proof:** golden tests run the same programs and seeds in Node, Chromium, Firefox and WebKit, and compare the final **state hash** (see below). These run in CI on every PR that touches `lang`, `sim` or `content`.

## State hash (normative)

`H(t)` is **FNV-1a, 32-bit** (offset basis `0x811c9dc5`, prime `0x01000193`, multiplication with `Math.imul`) over the bytes of a sequence of int32 words, each written little-endian (uint32 values are written as their int32 reinterpretation). The result is a uint32 (`>>> 0`).

`H(t)` first **force-advances** every tile of every farm and the market to `t`, then feeds the words in this order:

1. `t, gridSize, nSlots`
2. Market: `pressure` per crop in `CROPS` order.
3. Per slot ascending: `credits`; `inventory` per crop in `CROPS` order; then per drone ascending (`droneNo` 0, 1): `x, y, water, clock, status`. `clock` is the committed `agent.clock`. `status` is 0 running, 1 halted, 2 error, 3 not spawned (a not-spawned drone writes 0 for `x, y, water, clock`).
4. Per slot ascending, tiles row-major (y then x): `soil` (0 grass, 1 tilled, 2 rock), `moisture`, `cropCode` (index in `CROPS` order, −1 for none), `plantedAt`, `growth`, `ripeAt` (−1 for null), `withered` (0/1). A tile without a crop writes `cropCode = −1`, `plantedAt = 0`, `growth = 0`, `ripeAt = −1`, `withered = 0`.
5. The four sfc32 state words `(a, b, c, d)` of every PRNG stream in the fixed order `layout, weather, player:0 … player:(nSlots−1)`.

VM heaps, programs, the event log and `lastUpdated` are not hashed.

**Emission.** Before applying any call at time `t`, for every `k` with `lastHashT < k·1000 ≤ t`, emit `{ t: k·1000, k: 'hash', h: H(k·1000) }`. So the hash at 1000 precedes every action at 1000 and covers exactly the calls with `t < 1000`. After the main loop, emit the remaining multiples below `budget`. `finalStateHash = H(budget)` is computed **after** liquidation; when `budget` is a multiple of 1,000 the hash event at `t = budget` is emitted after liquidation and equals `finalStateHash`.

**`lang` goldens** have no world. Their `expected.hash` is the same FNV-1a over the UTF-8 bytes of `str(v) + "\n"` for every global in definition order, followed by each print line plus `"\n"`.

## Event log (for animation and replay)

```ts
type SimEvent =
  | { t: number; slot: number; k: 'move'; to: [x: number, y: number] }
  | { t: number; slot: number; k: 'plant'; at: [number, number]; crop: CropId; ok: boolean }
  | { t: number; slot: number; k: 'harvest'; at: [number, number]; crop: CropId | null; ok: boolean }
  | { t: number; slot: number; k: 'till' | 'water' | 'refill'; at: [number, number]; ok: boolean }
  | { t: number; slot: number; k: 'sell'; crop: CropId; n: number; price: number; credits: number }
  | { t: number; slot: number; k: 'halt' | 'error'; info?: string }
  | { t: number; k: 'weather'; kind: string; data: unknown }
  | { t: number; k: 'hash'; h: number };          // every 1,000 cycles, before any action at that cycle
// Every event with a `slot` also carries `drone?: 0 | 1` (omitted means 0, the primary drone).
```

- The client animates by interpolating drone movement between `move` events and computing crop growth visuals from the same lazy rules (it imports `sim`).
- Size estimate: a typical program performs about 1,000 actions per showdown (successful actions cost 21 to 61 cycles including the call, and real programs also spend cycles on logic), so about 8k events for 8 players plus 30 hash events. At about 50 bytes per event that is about 400 KB as JSON and about 60 to 90 KB gzipped, sent in chunks of at most 32 KB. Each player downloads the full log, so egress is about 0.7 MB per 8-player showdown. The hard upper bound is 5,000 events per player (the cheapest event-producing call is a failed `plant` or `harvest` at 5 + 1 cycles), about 2 MB of JSON for 8 players. A compact binary encoding can come later if needed.
- **Replays store inputs, not the event log**: programs, seed, rules version and language version. The log is regenerated on demand and cached.

## Balance harness (`tools/balance`)

A CLI that runs bot programs × seeds × rule tweaks and reports:
- score distribution per crop strategy (no single crop should dominate)
- sensitivity of the shared market (does an 8-player lobby collapse all prices?)
- cycle budget pacing (the naive starter should reach ~30 % of a strong bot's score)

This is where provisional numbers in `content` get tuned.
