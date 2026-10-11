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

The score starts at ₵100 (starting money, `startCredits`), so a player who did nothing still has ₵100. The one exception is the idle program, defined next.

## Idle program

A player runs the **idle program** when the server has no compiled program for them at lock: they never saved a draft, or their draft did not compile. The server passes `PlayerInput.module = null` to `sim`.

- The drone halts at `t = 0`, and `sim` emits `{ t: 0, slot, drone: 0, k: 'halt', info: 'idle' }`.
- `sim` reports `score = 0` (**not** `startCredits`), `cyclesLastChange = budget`, `logicCycles = 0`, `programTokens = 0`, `cropsHarvested = 0`, `cyclesUsed = 0` and no awards. Nothing is liquidated. `error` carries the first compile diagnostic's `{ code, line }` when a compile error caused it, and is absent when there was no draft. The server supplies that diagnostic to `sim` alongside the null module.
- The player is placed **below every player who has a program**, whatever the scores. A real program that ends at ₵0 still beats idle. Several idle players share the last place.
- **Any program that compiles is valid**, even `pass` or one that halts immediately. It keeps its real credits (₵100 if it does nothing). Doing nothing on purpose therefore beats failing to compile.

## Tiebreakers (in order)

Applied to players with equal `score`.

1. **Earlier finish:** `cyclesLastChange` is the start cycle `t` of the player's last `sell` that sold ≥ 1 unit. Seed purchases (`plant`) and end-of-match liquidation do not count. A player with no such sale has `cyclesLastChange = budget`. Lower wins. Reaching the same money sooner is more efficient.
2. **Fewer logic cycles:** `logicCycles` is the number of 1-cycle VM instructions the player's drones executed, summed over all their drones. Equivalently, total cycles consumed minus the `host.cost` of every host call applied. It includes the 1-cycle `CALL_HOST` that every builtin call pays, but not the builtin's own cost: `move`, `plant`, a sensor and `wait(5)` each contribute 1, and `halt()` contributes its 1-cycle call (cost 0 plus the call). Per-op costs come from the table in [interpreter-vm](../03-architecture/interpreter-vm.md). Lower wins. This rewards cleaner logic.
3. **Smaller program:** lower `programTokens` wins (see **Token count** below).
4. Still tied: **shared placement.** The tied players are shown at the better place, written "=2nd". For rewards and RP, each receives the average of the values for all the places the tie spans, rounded down with `floorDiv`. Example: a tie for 2nd and 3rd in Silver ranked is (+8 − 12) / 2 = −2 RP each, and in casual it is (₵40 + ₵25) / 2 = ₵32 each. The next player takes the place after the shared group (1st, =2nd, =2nd, 4th).

### Token count

`programTokens` is the number of lexer tokens over all files of the locked program, excluding `NEWLINE`, `INDENT`, `DEDENT`, `EOF`, comments and `ERROR` tokens. A number literal (`1_000`) or a string literal is one token. The idle program has 0 tokens, and so does a file over the source-size limit (it never lexes). `lang` exports a single `countTokens(source: SourceFiles): number`, and `sim`, the server and the editor all call it, so every place that shows or compares a count agrees.

## Awards (cosmetic badges, shown in results)

Awards never affect placement. They give non-winners something to chase. `PlayerResult.awards` holds the ids below. Players tied on a criterion all receive the award. Idle players receive none.

| Award | Id | Criterion |
|---|---|---|
| 🏆 **Top Earner** | `top_earner` | Highest score |
| ⚡ **Most Efficient** | `most_efficient` | Highest `floorDiv((score − startCredits) × 1000, max(1, cyclesUsed))`, where `cyclesUsed` is the player's value from [simulation-engine](../03-architecture/simulation-engine.md) (the maximum over their drones of `min(agent.clock, budget)`). Players with score ≤ `startCredits` are not eligible |
| 🌾 **Bumper Crop** | `bumper_crop` | Most crops harvested into the silo (`cropsHarvested`, at least 1) |
| 📈 **Market Timer** | `market_timer` | Highest unit-weighted average sale price as basis points of base price: `floorDiv(Σ over sell lots of (units × floorDiv(price × 10_000, basePrice)), Σ units)`. Needs ≥ 1 unit sold |
| ✂️ **Clean Code** | `clean_code` | Fewest `programTokens` among players placed in the top half (places 1 to ⌈n ÷ 2⌉ of n players; `n` counts every slot including idle players, and a shared place such as "=2nd" counts as place 2) |
| 💧 **Never Thirsty** | `never_thirsty` | At least 1 crop planted, and no crop of the player's ever had its growth paused for lack of moisture (below the crop's minimum) while it was unripe |

## Multiplayer rewards (wallet credits)

| Placement in a 4-player match | Casual ₵ | Casual with bots ₵ | Ranked ₵ |
|---|---|---|---|
| 1st | 60 | 30 | 90 |
| 2nd | 40 | 20 | 60 |
| 3rd | 25 | 12 | 40 |
| 4th | 15 | 7 | 25 |

For other lobby sizes, interpolate linearly by percentile. There's also a daily first-win bonus of ₵50. Custom rooms pay XP only. "Casual with bots" is 50 % of Casual, rounded down with `floorDiv`. No daily first-win bonus from bot matches.

## Results screen contents

Your own program's `print` output (`PlayerResult.output`, first 200 lines) is shown in an **Output** tab of the results panel. Rivals' output is never sent to anyone.

1. Podium (animated)
2. Table: place, player, score, crops, cycles used, awards
3. Per-player **credit-over-time chart** (sparkline from the event log)
4. **View code** for each player (read-only, syntax highlighted, with a **Save to my files** button; idle players have no code, so their row has no button). **Save to my files** adds a new file to your campaign programs. If you already have 10 files it shows "Your files are full (10/10). Delete one first."
5. **Watch replay** (re-runs the deterministic event log at selectable speed)
6. Rewards earned, RP change (ranked), rematch vote (casual/custom, see item 8)
7. **Row labels** in the table: "Left early" (`left_early`), "No program (idle)" (no draft, or `compiled_ok = false`), "Runtime error at line 7" (D-17), "[BOT] Scarecrow" and "deleted player". Shared placements show "=2nd".
8. **Rematch vote** (casual and custom only): "Rematch? 2 of 4 yes · 0:14" with [Yes] and [No]. Players who have not voted when the 20 s window ends count as no. If at least 50 % say yes, the screen reads "Rematch starting with a new seed" and everyone who voted yes goes to the Lobby. Everyone else returns to the Multiplayer hub.
9. **Skip** (finale): after a player skips, the results screen opens at once in a waiting state. The standings table shows immediately, under the header "Waiting for other players to finish watching… (0:48)", counting down to the server's 120 s cap. Rewards, RP and the rematch vote animate in when `match.results` arrives.
