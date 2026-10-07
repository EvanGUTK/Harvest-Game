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
    withered: boolean;
  };
};
```

## Growth rules

- A crop gains **+1 growth per cycle** while its tile's `moisture > 0`. With moisture at 0, growth pauses. It doesn't die.
- When `growth >= growCycles`, the crop is **ripe**.
- A ripe crop left unharvested for `witherCycles` becomes **withered**. Harvesting a withered crop yields 0 and clears the tile. This punishes "plant everything, harvest once at the end".
- Some crops need **tilled** soil (`till()` first). Tilling persists until harvest.

## Moisture

- `water()` sets moisture to `min(100, moisture + 40)` and costs 25 cycles plus 1 **water unit**.
- Moisture decays by 1 every 50 cycles (integer, deterministic).
- Water supply: showdown starts with 60 units. `refill()` at the well tile, which is `(0,0)` in v1, restores to max and costs 60 cycles. This creates a routing decision without being a chore.

## Rocks and seeds (procedural layout)

Each match or contract seed generates:
- the starting soil map (a few `rock` tiles in later chapters and in casual "rocky" variants, none in ranked v1)
- starting moisture per tile (0–40)
- crow events (later; see [crops-and-economy](crops-and-economy.md) "Interference")

Generation uses the deterministic PRNG described in [simulation-engine](../03-architecture/simulation-engine.md).

## Drone

- Position, facing (cosmetic only), carried water.
- No carrying capacity limit in v1. Harvest goes straight to the silo.
- Upgrades (campaign only): **Rotor I/II/III** reduces `move` cost 20, 16, 12, 9. **Sprayer** gives `water()` +60 instead of +40. **Twin drone** lets you call `spawn(fn)` to run a second drone with its own VM (late game; see curriculum).

In multiplayer every drone has the same stats. Drone *cosmetics* are visual only.

## Determinism guarantees

- All state is integers. There are no floats anywhere in `packages/sim` or `packages/lang`.
- Iteration order over tiles is always row-major `y` then `x`.
- Multi-farm ordering at equal cycle uses player slot order rotated by tick (see simulation-engine).
