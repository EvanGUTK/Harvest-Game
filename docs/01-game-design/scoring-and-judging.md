# Scoring & Judging

## The question from the concept: "judged on latency, interference, total crops and money"

Here is how each of those maps to something deterministic and fair:

| Idea | Problem | What we do instead |
|---|---|---|
| **Latency** (network) | Penalises players for their internet or location, not their code. Not reproducible in a replay. | **Execution efficiency**, measured in *cycles*. A fast program is one that does more per cycle. This is the "latency" of your code, and it's fully deterministic. |
| **Interference** | Direct sabotage (e.g. stealing crops) makes losing feel unfair and makes code hard to test privately. | **Shared market**: everyone's sales move everyone's prices. Rivals affect you, but only through the economy. Optional seeded **weather** events hit everyone identically. |
| **Total crops** | Rewards mass-planting cheap crops regardless of value. | Counted as a stat and award, not the score. |
| **Money** | Clean, single number, easy to animate. | ✅ **Primary score.** |

## Official score

```
score = final_credits            // after end-of-match liquidation of silo at 50% of final price
```

The score starts at ₵100 (starting money), so a player who did nothing still has ₵100. For fairness, a player with no valid program is recorded at **₵0 and placed last**, not ₵100.

## Tiebreakers (in order)

1. **Earlier finish:** the cycle at which the player's credits last changed. Reaching the same money sooner is more efficient.
2. **Fewer total executed VM instructions** (pure logic cycles, excluding action costs). This rewards cleaner logic.
3. **Smaller program** (token count).
4. Still tied: **shared placement.** Both get the better place, and ranked RP is averaged.

## Awards (cosmetic badges, shown in results)

Awards never affect placement. They give non-winners something to chase.

| Award | Criterion |
|---|---|
| 🏆 **Top Earner** | Highest score |
| ⚡ **Most Efficient** | Highest `(score − 100) / (cycles used ÷ 1000)` among players with score > 100 |
| 🌾 **Bumper Crop** | Most total crops harvested |
| 📈 **Market Timer** | Highest average sale price as % of base |
| ✂️ **Clean Code** | Fewest tokens among the top half |
| 💧 **Never Thirsty** | No crop paused for moisture for the whole match |

## Multiplayer rewards (wallet credits)

| Placement in a 4-player match | Casual ₵ | Ranked ₵ |
|---|---|---|
| 1st | 60 | 90 |
| 2nd | 40 | 60 |
| 3rd | 25 | 40 |
| 4th | 15 | 25 |

For other lobby sizes, interpolate linearly by percentile. There's also a daily first-win bonus of ₵50. Custom rooms pay XP only.

## Results screen contents

1. Podium (animated)
2. Table: place, player, score, crops, cycles used, awards
3. Per-player **credit-over-time chart** (sparkline from the event log)
4. **View code** for each player (read-only, syntax highlighted, with a link to "copy into my sandbox")
5. **Watch replay** (re-runs the deterministic event log at selectable speed)
6. Rewards earned, RP change (ranked), rematch vote (casual/custom)
