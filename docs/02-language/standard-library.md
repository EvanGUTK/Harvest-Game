# Sprout Standard Library

Costs are in **cycles** and are **in addition to** the 1-cycle `CALL` instruction. The values are provisional and tuned in the balance harness. Campaign availability shows the chapter or skill-tree node that unlocks each builtin. In multiplayer, everything is unlocked.

## Constants

| Group | Values |
|---|---|
| Directions | `NORTH`, `SOUTH`, `EAST`, `WEST` |
| Crops | `RADISH`, `CORN`, `MELON` (later: `TOMATO`, `RICE`, `LAVENDER`, `SUNROOT`, `GOURD`) |
| Soil | `GRASS`, `TILLED`, `ROCK` |

## Actions (change the world; expensive)

| Builtin | Cost | Returns | Behaviour | Unlock |
|---|---|---|---|---|
| `move(dir)` | 20 (Rotor upgrades: 16/12/9) | `None` | Move one tile, wrapping at edges | Ch 1 |
| `plant(crop)` | 30 | `bool` | Buys a seed and plants it. `False` (cost 5 instead) if the tile is occupied, the soil is wrong or credits are insufficient | Ch 1 |
| `harvest()` | 30 | `bool` | Ripe crop → silo, tile cleared (tilled soil reverts to grass). Unripe → crop destroyed, returns `False`. Empty → `False`, cost 5 | Ch 1 |
| `till()` | 30 | `bool` | Grass → tilled. `False` on rock or occupied tile | Skill: Till |
| `water()` | 25 | `bool` | +40 moisture (Sprayer: +60), uses 1 water unit. `False` if out of water | Skill: Water |
| `refill()` | 60 | `bool` | Only on the well tile `(0,0)`. Restores water to max | Skill: Water |
| `sell(crop, n)` | 10 | `int` | Sells up to `n` from the silo at current price. Returns credits gained | Ch 8 (SP), always (MP) |
| `wait(n)` | `n` (1 ≤ n ≤ 5,000) | `None` | Do nothing for `n` cycles. Cheaper than a busy loop | Ch 4 |
| `spawn(fn)` | 200 | `bool` | Starts a second drone at your position running `fn()`. Max 1 extra drone | Ch 10 (SP only in v1) |
| `halt()` | 0 | — | Stops this drone | Ch 1 |

## Sensors (read the world; cheap)

| Builtin | Cost | Returns | Unlock |
|---|---|---|---|
| `pos_x()`, `pos_y()` | 1 | `int` | Ch 5 |
| `world_size()` | 1 | `int` (grid is square) | Ch 2 |
| `crop()` | 2 | crop constant or `None` | Ch 3 |
| `is_ripe()` | 2 | `bool` | Ch 3 |
| `growth()` | 2 | `int` 0–100 (% grown) | Ch 4 |
| `soil()` | 2 | soil constant | Skill: Till |
| `moisture()` | 2 | `int` 0–100 | Skill: Moisture sensor |
| `water_left()` | 1 | `int` | Skill: Water |
| `credits()` | 1 | `int` | Ch 5 |
| `inventory(crop)` | 1 | `int` | Ch 5 |
| `price(crop)` | 3 | `int` current market price | Skill: Price sensor |
| `seed_cost(crop)` | 1 | `int` | Skill: Price sensor |
| `measure()` | 5 | `int` crop-specific (Sunroot yield, Gourd size) | Skill: Measure |
| `cycles()` | 1 | `int` cycles elapsed | Ch 4 |
| `cycles_left()` | 1 | `int` | Ch 4 |

## Pure helpers (no world access)

| Builtin | Cost | Notes |
|---|---|---|
| `range(n)`, `range(a, b)`, `range(a, b, step)` | 1 + 0 per element (lazy) | Lazy iterator, so it doesn't allocate a list |
| `len(x)` | 1 | str/list/dict |
| `abs(n)`, `min(a, b, …)`, `max(a, b, …)` | 1 | `min`/`max` also accept one list (cost +1 per element) |
| `list.append(x)`, `list.pop([i])` | 1 (pop(i): +1 per shifted element) | |
| `dict.get(k, d)` | 1 | |
| `str(x)`, `int(s)` | 1 + length | `int("12")` → 12, error on bad input |
| `print(…)` | 1 | Output panel. Max 200 lines/run. Not shown to rivals |
| `random(n)` | 2 | Deterministic seeded `0..n-1`, separate stream per player. **Disabled in ranked** for clean replays and fewer arguments, unlocked in campaign Ch 8 |

## Builtins we deliberately **don't** provide

| Not provided | Why |
|---|---|
| `goto(x, y)` | In the campaign the player writes it in Ch 5. Then it unlocks as a native builtin costing `move` × distance (no discount, just convenience). It's available in MP. |
| Global farm scan (`get_all_tiles()`) | It would remove the core spatial puzzle. The drone only senses the tile it's on. |
| Time-of-day or wall-clock | It breaks determinism. |

## Example: a complete starter showdown program

```python
# Starter program shown in the coding phase. Works, but is not efficient.
def tend():
    if crop() == None:
        plant(RADISH)
    elif is_ripe():
        harvest()
        plant(RADISH)

while True:
    for y in range(world_size()):
        for x in range(world_size()):
            tend()
            move(EAST)
        move(NORTH)
    sell(RADISH, inventory(RADISH))
```
