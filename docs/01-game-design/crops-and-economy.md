# Crops & Economy

## Crop roster

All values are provisional and get tuned in M0/M1 with the balance harness (`[SIM-BAL]`). The harness reports an ideal-play profit per 1,000 drone-cycles for each crop, at base price and at the market floor, and is used to sanity-check that no crop dominates. Open concerns it must settle before these numbers are locked: at the 40 % floor a radish sells for ₵2, exactly its seed cost (margin ₵0), and melon looks like the best crop per drone-cycle at every price level.

### v1 (MVP: 3 crops)

| Crop | Seed cost | Base price | Grow cycles | Wither after | Needs | Design role |
|---|---|---|---|---|---|---|
| **Radish** | ₵2 | ₵5 | 300 | 3,000 | moisture > 0 | Fast and cheap. Teaches the basic plant → harvest loop. |
| **Corn** | ₵6 | ₵18 | 900 | 1,500 | tilled soil, moisture > 0 | Mid tier. Teaches `till()` and conditionals. |
| **Melon** | ₵15 | ₵60 | 2,400 | 2,400 | tilled soil, moisture ≥ 30 to grow | High value, slow. Teaches watering and planning. |

Growth pauses while the tile's moisture is below the crop's minimum (it never kills the crop); wither is measured in world cycles from the moment the crop is ripe and does not pause. See [farm-simulation](farm-simulation.md) Growth rules.

### Post-MVP (campaign unlocks, then added to showdown rotation)

| Crop | Mechanic it teaches |
|---|---|
| **Tomato vine** | Regrows after harvest (no replant). Teaches tracking state per tile (lists). |
| **Rice** | Only grows at moisture ≥ 60. Teaches `while` loops for watering until a threshold. |
| **Lavender** | +25 % price for each orthogonally adjacent lavender at harvest. Teaches 2D reasoning and neighbours. |
| **Sunroot** | Random yield 1–4 revealed by `measure()`. Teaches deciding with sensor data. |
| **Heirloom gourd** | Price depends on the order you harvest them in, e.g. must be ascending by size. Teaches sorting. |

## Single-player economy

There are two kinds of money, and they never mix:

| Balance | Where | Earned by | Spent on |
|---|---|---|---|
| **Farm credits** | Your campaign save | Selling crops in single-player | Seeds, skill-tree nodes, farm expansions |
| **Wallet credits** | Your account | Contract rewards, daily first win, multiplayer rewards | Cosmetics shop |

Why split them? If showdown winnings could buy skill-tree nodes, strong players would skip the curriculum. If campaign farming could buy cosmetics directly, idle farms would print cosmetics. The split keeps each loop honest. Contract *completion bonuses* pay into the wallet, so campaign progress still funds cosmetics.

*(Alternative: one currency. See decisions-needed D-03.)*

- **Single-player market:** fixed prices per chapter, with an occasional "market day" contract with a price multiplier.
- **Selling:** `sell(crop, n)` in code, or the "Sell all" button in the Free Farm.
- **Contract runs are sandboxed.** `credits()` starts at the contract's `startCredits` and seeds are bought from that sandbox balance. Farm credits are never touched by a run; the server adds the contract reward (to the wallet) and Free Farm sale proceeds (to farm credits) only after re-simulating the receipt (see [saves-and-persistence](../03-architecture/saves-and-persistence.md)).

## Multiplayer economy (shared market)

Every player starts the showdown with **₵100** and an empty silo. Seeds are bought automatically when you call `plant(crop)`. If you can't afford one, `plant` fails with a catchable result (returns `False`) and costs 5 cycles.

### Shared market: the "interference" mechanic

All players sell into one market. Prices react to *everyone's* sales:

```
priceBp(crop) = max(MARKET.priceFloorBp, 10_000 − MARKET.pressureStepBp × pressure(crop))
price(crop)   = floorDiv(base(crop) × priceBp(crop), 10_000)     // what the price() sensor returns
                                                                 // defaults: floor 4_000 bp (40 %), step 200 bp (2 % per unit)
sell(crop, n):                                // n must be an int, else R-TYPE
  k = min(n, inventory[crop])
  if k ≤ 0: return 0                          // no event, pressure unchanged, cost still 10 (plus the 1-cycle call)
  gained = k × price(crop)                    // one price for the whole lot, computed BEFORE the sale
  inventory[crop] −= k;  credits += gained;  pressure(crop) += k   // pressure counts units sold by anyone
  emit { t, slot, k:'sell', crop, n: k, price, credits };  return gained

every 500 cycles (global multiples of 500): pressure(crop) = floorDiv(pressure(crop) × 80, 100)   // recovers over time; applied before any sale or price read at that cycle
```

- If all eight players spam radishes, radish prices collapse, and the player who planted melons wins.
- **Lot pricing.** A `sell` call prices its whole lot at the pre-sale price and only then adds the units to the pressure, so the *next* sale sees the lower price. Many small `sell` calls walk down the curve; one large call does not. `[SIM-BAL]` the harness checks that "hoard and dump once per window" does not beat steady selling.
- **Scale.** `[SIM-BAL]` At 2 % per unit, a pressure of 30 units already puts the price on the 40 % floor, and a lobby of busy radish farms can keep radish there for the whole match. The harness reports the mean realised sale price against base for an 8-player all-radish lobby; the step and floor (and the radish price) are tuned against that result.
- `price(crop)` is a sensor (3 cycles), so programs *can* react to market conditions, e.g. "sell corn only when price ≥ 15".
- This makes rivals matter **without sabotage**. Nobody can touch your farm, but everyone shares the market.
- In the browser test run, the market is simulated with zero rival pressure. The coding-phase UI says so: *"Test runs assume no rivals. Prices in the real match will move."*

### End of match

- Unsold silo contents are liquidated at **50 %** of the market price at the end of the match. Selling at the right time is part of the skill.
- **Liquidation (normative).** At `t = budget`, after `world.advanceTo(budget)` and after every agent has finished, for each slot in ascending order and each crop in `CROPS` order:
  `credits += floorDiv(inventory[crop] × price(crop) × MARKET.liquidationBp, 10_000)`, using the prices as they stand at `budget`. The floor is taken once per crop on the total, not per unit (10 radishes at ₵5 give 25, not 20). Liquidation never changes `pressure`, so every player liquidates at the same prices regardless of slot order. It emits no event and does not count as a credits change for tiebreak #1 (see [scoring-and-judging](scoring-and-judging.md)).
- Crops still in the ground are worth 0.
- **Score = final credits.** See [scoring-and-judging](scoring-and-judging.md).

### Optional "Weather" events (casual modifier, post-MVP)

These are seeded and identical for every player:
- **Crows** at cycle X: unprotected ripe crops in row Y are lost. A *scarecrow* item can be placed for ₵.
- **Rain** at cycle X: all tiles get +30 moisture.
- **Market boom:** one crop's base price ×1.5 for 2,000 cycles.

These are interference from the world, never from rivals, so the outcome stays fair and deterministic.
