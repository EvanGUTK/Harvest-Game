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
      agent.pending = { t: agent.clock_at_yield, call }
  pick agent with smallest pending.t
      tie-break: slot order rotated by (t mod nAgents)   ← fair, deterministic
  world.advanceTo(pending.t)                 // lazy: growth, moisture, market decay, events
  result = host.apply(agent, call)           // sensors: read; actions: mutate
  agent.clock = pending.t + call.cost
  eventLog.push(...)                         // actions only
  vm.resume(result)
until all agents halted/errored/clock ≥ budget
world.advanceTo(budget); liquidate silos; compute scores
```

- **Actions take effect at their start time** `t`, and the drone is then busy until `t + cost`. Effects at start is simpler and makes the "two players sell at the same cycle" case well-defined by tie-break.
- **Sensors cost cycles too**, so they occupy the drone, but they don't mutate anything.
- **Only the market is shared** between farms. Without the market, each farm would be fully independent. In single-player, the scheduler runs with one agent (or two with `spawn`).

## Lazy world advancement

Per-tile state stores `lastUpdated`. `advanceTile(tile, t)`:
1. Moisture decays by 1 at every *global* cycle multiple of 50 in `(lastUpdated, t]`, floored at 0. This is computed in O(1) by counting multiples.
2. Growth increases by the number of cycles in `(lastUpdated, t]` during which moisture was > 0 (and ≥ the crop's threshold if it has one). This is also O(1), since moisture is monotone between touches.
3. Wither check against `ripeAt + witherCycles`.

Market `pressure` decays at global multiples of 500 cycles, using the same O(1) counting with integer math (`p = p × 80 / 100` applied k times, done as a loop of k ≤ budget/500 = at most 60 iterations).

The world is only advanced to the times drones touch it, so simulation cost scales with **drone activity**, not with grid size × cycles.

## Determinism

| Rule | Enforcement |
|---|---|
| Integers only | Lint bans `/` outside a `floorDiv` helper. Values are checked with `Number.isSafeInteger` in debug builds |
| No ambient randomness | Lint bans `Math.random`, `Date`, `performance`, `crypto` in `lang`/`sim` |
| Seeded PRNG | `sfc32` (32-bit, `Math.imul` + `>>> 0`), seeded by `splitmix32(matchSeed ⊕ streamId)`. Streams: `layout`, `weather`, `player:<slot>` |
| Stable iteration | Arrays and `Map` only. Tiles are iterated row-major |
| Versioned rules | `rulesVersion` is pinned per match. `content` values are frozen per version |

**Cross-engine proof:** golden tests run the same programs and seeds in Node, Chromium, Firefox and WebKit, and compare the final **state hash** (FNV-1a over a canonical serialization). These run in CI on every PR that touches `lang`, `sim` or `content`.

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
  | { t: number; k: 'hash'; h: number };          // every 1,000 cycles
```

- The client animates by interpolating drone movement between `move` events and computing crop growth visuals from the same lazy rules (it imports `sim`).
- Size estimate: about 1,500 actions per player per showdown, so roughly 12k events for 8 players. That's about 150 KB as JSON and about 30 KB gzipped, sent chunked. A compact binary encoding can come later if needed.
- **Replays store inputs, not the event log**: programs, seed, rules version and language version. The log is regenerated on demand and cached.

## Balance harness (`tools/balance`)

A CLI that runs bot programs × seeds × rule tweaks and reports:
- score distribution per crop strategy (no single crop should dominate)
- sensitivity of the shared market (does an 8-player lobby collapse all prices?)
- cycle budget pacing (the naive starter should reach ~30 % of a strong bot's score)

This is where provisional numbers in `content` get tuned.
