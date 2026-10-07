# Crops & Economy

## Crop roster

All values are provisional and get tuned in M0/M1 with the balance harness. "Profit/kCycle" is a rough ideal-play number used to sanity-check that no crop dominates.

### v1 (MVP: 3 crops)

| Crop | Seed cost | Base price | Grow cycles | Wither after | Needs | Design role |
|---|---|---|---|---|---|---|
| **Radish** | ₵2 | ₵5 | 300 | 900 | — | Fast and cheap. Teaches the basic plant → harvest loop. |
| **Corn** | ₵6 | ₵18 | 900 | 1,500 | tilled soil | Mid tier. Teaches `till()` and conditionals. |
| **Melon** | ₵15 | ₵60 | 2,400 | 2,400 | tilled soil, moisture ≥ 30 to grow | High value, slow. Teaches watering and planning. |

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

## Multiplayer economy (shared market)

Every player starts the showdown with **₵100** and an empty silo. Seeds are bought automatically when you call `plant(crop)`. If you can't afford one, `plant` fails with a catchable result (returns `False`) and costs 5 cycles.

### Shared market: the "interference" mechanic

All players sell into one market. Prices react to *everyone's* sales:

```
price(crop) = base × max(40%, 100% − 2% × pressure(crop))         // integer basis points
pressure(crop) += units sold (by anyone)
every 500 cycles: pressure(crop) = pressure(crop) × 80 / 100     // recovers over time
```

- If all eight players spam radishes, radish prices collapse, and the player who planted melons wins.
- `price(crop)` is a sensor (3 cycles), so programs *can* react to market conditions, e.g. "sell corn only when price ≥ 15".
- This makes rivals matter **without sabotage**. Nobody can touch your farm, but everyone shares the market.
- In the browser test run, the market is simulated with zero rival pressure. The coding-phase UI says so: *"Test runs assume no rivals. Prices in the real match will move."*

### End of match

- Unsold silo contents are liquidated at **50 %** of the final market price. Selling at the right time is part of the skill.
- Crops still in the ground are worth 0.
- **Score = final credits.** See [scoring-and-judging](scoring-and-judging.md).

### Optional "Weather" events (casual modifier, post-MVP)

These are seeded and identical for every player:
- **Crows** at cycle X: unprotected ripe crops in row Y are lost. A *scarecrow* item can be placed for ₵.
- **Rain** at cycle X: all tiles get +30 moisture.
- **Market boom:** one crop's base price ×1.5 for 2,000 cycles.

These are interference from the world, never from rivals, so the outcome stays fair and deterministic.
