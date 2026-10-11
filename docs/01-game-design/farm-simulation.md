# Farm Simulation

All numbers here are **provisional**. They live in `packages/content` once M0 starts, and they get tuned with the balance harness (see [backlog](../07-roadmap/backlog.md) `SIM-BAL`).

## Time is cycles

There is no wall-clock time in the simulation. The world clock is an integer **cycle counter**.

- Every VM instruction costs **1 cycle**. That covers arithmetic, comparisons, jumps, variable access and function calls.
- Every **action** (world-changing builtin) costs a fixed larger amount (move 20, plant 30…). See [standard-library](../02-language/standard-library.md).
- Crops grow, soil dries and the market recovers as functions of the cycle counter.

The consequence is that efficient code *literally makes time pass more slowly for you relative to the work you get done*. A wasteful loop that checks every tile 10 times is not just ugly. It burns cycles in which your crops could have been harvested and replanted. This is the single mechanic that ties "good code" to "good farm".

## Grid

| Context | Size |
|---|---|
| Campaign start | 3×3 |
| Campaign max (skill tree) | 12×12 |
| Showdown | 8×8 (fixed for ranked; casual can pick 6×6 / 8×8 / 10×10) |

- Coordinates: `(0,0)` is the south-west corner. `x` grows east and `y` grows north.
- The drone starts at `(0,0)`.
- Edges **wrap**: moving east off column 7 arrives at column 0. This makes snake and loop patterns elegant and prevents "stuck on wall" errors for beginners. *(Decision: see decisions-needed D-07.)*

## Tile state

```ts
type Tile = {
  soil: 'grass' | 'tilled' | 'rock';   // rock = obstacle in some seeds; cannot plant
  moisture: number;                     // 0..100 integer
  crop: null | {
    kind: CropKind;
    plantedAt: number;                  // cycle
    growth: number;                     // 0..crop.growCycles, integer
    ripeAt: number | null;              // first cycle growth reached growCycles; null until ripe. Wither is measured from here
    withered: boolean;
  };
};
```

## Growth rules

- A crop gains **+1 growth per cycle** while the tile's `moisture >= crop.minMoisture` (1 for radish and corn, 30 for melon). Below that, growth pauses. It doesn't die. The moisture decrement at a multiple of 50 applies before that cycle's growth is counted. Exact rules: [simulation-engine](../03-architecture/simulation-engine.md) Lazy world advancement.
- When `growth >= growCycles`, the crop is **ripe**.
- A ripe crop that is not harvested within `witherCycles` becomes **withered**: wither is `t >= ripeAt + witherCycles` in world cycles and never pauses with moisture. This punishes "plant everything, harvest once at the end".
- A withered crop **stays on the tile** until it is cleared. `crop()` still returns its kind, `is_ripe()` is `False`, `is_withered()` is `True` and `growth()` is 100. `harvest()` on a withered crop yields 0 and clears the tile; `plant()` on a withered tile clears it and plants (cost 30, returns `True`). Full sensor table: [standard-library](../02-language/standard-library.md).
- **Wither pressure toward smaller plots is intended.** A naive full 8×8 sweep lets radishes wither. One lap that moves to, plants and waters all 64 tiles costs roughly 80 cycles per tile (about 5,000 cycles, from the costs in [standard-library](../02-language/standard-library.md)). That is longer than a radish needs to ripen (300) plus its `witherCycles` (3,000), so radishes planted early in the lap have withered by the time the drone returns to harvest them. The fast loop is a strip you can lap before its crops wither, and the showdown starter program deliberately farms a 2-row (16-tile) strip for that reason. Provisional; the balance harness (`SIM-BAL`) re-checks it.
- Some crops need **tilled** soil (`till()` first). Tilling persists until harvest.

## Moisture

- `water()` sets moisture to `min(100, moisture + 40)` and costs 25 cycles plus 1 **water unit**.
- Moisture decays by 1 every 50 cycles (integer, deterministic).
- Water supply: showdown starts with 60 units. `refill()` at the well tile, which is `(0,0)` in v1, restores to max and costs 60 cycles. This creates a routing decision without being a chore.
- **Design intent: water is the scarce resource.** One watering (+40) is worth 2,000 tile-cycles of growth for about 26 drone cycles, so keeping one tile in continuous growth for a whole 30,000-cycle match costs about 15 waterings (roughly 390 cycles). Doing that for all 64 tiles would cost about 25,000 cycles and 960 water units (16 refills). One drone can irrigate roughly 16–24 tiles for a full showdown, and the 8×8 grid is deliberately larger than that, so deciding how much of it to farm is part of the puzzle. Provisional (`SIM-BAL`).

## Rocks and seeds (procedural layout)

Each match or contract seed generates:
- the starting soil map (a few `rock` tiles in later chapters and in casual "rocky" variants, none in ranked v1; rock probability per tile is `WORLD.rockDensityBp` = 8 %, provisional, and the well tile is never rock)
- starting moisture per tile: seeded in `0–40` for showdowns, and for any campaign run once the player owns the Water node. **Until the Water node is owned, campaign runs (contracts and Free Farm) start every tile at moisture 100 and moisture does not decay.** Otherwise dry soil would make early contracts unwinnable with no tool to fix it: a radish needs about 6 moisture to ripen unwatered, so roughly 1 tile in 7 could never grow one. The range and the no-decay switch are part of the sim config, so the server re-simulates the same rule (see [simulation-engine](../03-architecture/simulation-engine.md)).
- crow events (later; see [crops-and-economy](crops-and-economy.md) "Interference")

The layout is generated once per match and every player gets a copy. Rock density is 8 % (provisional); ranked has none. Generation uses the deterministic PRNG described in [simulation-engine](../03-architecture/simulation-engine.md).

## Drone

- Position, facing (cosmetic only), carried water.
- No carrying capacity limit in v1. Harvest goes straight to the silo.
- Upgrades (campaign only): **Rotor I/II/III** reduces `move` cost 20, 16, 12, 9. **Sprayer** gives `water()` +60 instead of +40. **Twin drone** lets you call `spawn(fn)` to run a second drone (same program, its own call stack, sharing the farm's credits, silo and water: one farm, two drones; late game, see [curriculum](../02-language/curriculum.md); campaign only in v1, D-24).
- Single-player only in v1. Credits, silo, water tank and market belong to the player (one farm, two drones); position, facing and clock belong to each drone. Full rules: [standard-library](../02-language/standard-library.md#second-drone-spawn).

In multiplayer every drone has the same stats. Drone *cosmetics* are visual only.

## Determinism guarantees

- All state is integers. There are no floats anywhere in `packages/sim` or `packages/lang`.
- Iteration order over tiles is always row-major `y` then `x`.
- Multi-farm ordering at equal cycle: every drone has a fixed `agentIndex = slot × MAX_DRONES + droneNo`, and the pending action whose `(agentIndex − (t mod N) + N) mod N` is smallest runs first, where `t` is the cycle of the pending action and `N = nSlots × MAX_DRONES` is constant for the match (see simulation-engine).
