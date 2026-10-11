# Sprout Standard Library

Costs are in cycles and are **in addition to** the 1-cycle `CALL_HOST` instruction that reaches every builtin (so `halt()` has cost 0, plus the 1-cycle call). The values are provisional and tuned in the balance harness. Campaign availability shows the chapter or skill-tree node that unlocks each builtin. Builtins and constants are gated by name; see the Feature gating map in [curriculum](curriculum.md#feature-gating-map-normative).

Action, sensor and host-helper costs and bounds live in `packages/content` (`ACTION_COSTS`, `SENSOR_COSTS`, `PURE_COSTS`, `WAIT_BOUNDS`); costs of language-intrinsic helpers (`range`, `len`, `abs`, `min`/`max`, list/dict methods, `str`, `int`, `print`) live in `packages/lang`.

In multiplayer, everything is unlocked, with two exceptions:

- `spawn()` is **single-player only in v1**. The Twin drone upgrade is campaign-only (see [farm-simulation](../01-game-design/farm-simulation.md)); in a showdown every farm runs exactly one drone. Decision D-24 in [decisions-needed](../00-overview/decisions-needed.md).
- `random()` is **disabled in ranked** (D-18).

Calling either where it is unavailable is the compile-time error `E-LOCKED-FEATURE`, and the message says why: *"`spawn()` is single-player only in v1."* / *"`random()` is turned off in ranked matches so replays stay clean."*

**Bad arguments.** A builtin called with an argument of the wrong type, or outside its allowed range, raises the runtime error `R-BAD-ARG` and stops that drone (see [errors-and-diagnostics](errors-and-diagnostics.md)). Builtins never clamp.

**Argument-dependent costs.** Most costs below are fixed. A few depend on the arguments (`wait`, `goto`, `str`, `int`, `print`, `min`/`max` over a list, `pop(i)`). The host computes those from the arguments when the call is made. The per-element cost table in [interpreter-vm](../03-architecture/interpreter-vm.md#bytecode) is the single source of truth if a number here ever disagrees with it.

## Constants

| Group | Values |
|---|---|
| Directions | `NORTH`, `SOUTH`, `EAST`, `WEST` |
| Crops | `RADISH`, `CORN`, `MELON` (later: `TOMATO`, `RICE`, `LAVENDER`, `SUNROOT`, `GOURD`) |
| Soil | `GRASS`, `TILLED`, `ROCK` |

## Actions (change the world; expensive)

| Builtin | Cost | Returns | Behaviour | Unlock |
|---|---|---|---|---|
| `move(dir)` | 20 (Rotor upgrades: 16/12/9) | `None` | Move one tile, wrapping at edges. Always succeeds, even onto a rock tile: the drone flies, and rock only blocks `plant` and `till` | Ch 1 |
| `plant(crop)` | 30 | `bool` | Buys a seed and plants it. `False` (cost 5 instead) if the tile has an unripe or ripe crop, the soil is wrong or credits are insufficient. Planting on a **withered** crop replaces it. See the outcome matrix | Ch 1 |
| `harvest()` | 30 | `bool` | Ripe crop → silo, tile cleared (tilled soil reverts to grass). Unripe → crop destroyed, returns `False`. Withered → cleared with 0 yield, returns `False`. Empty → `False`, cost 5. See the outcome matrix | Ch 1 |
| `till()` | 30 | `bool` | Grass → tilled. `False` (cost 5 instead) on rock, on already-tilled soil or on a tile with a crop | Skill: Till |
| `water()` | 25 | `bool` | +40 moisture (Sprayer: +60), capped at 100, uses 1 water unit. Works on any tile, with or without a crop, even at moisture 100. `False` (cost 5 instead) if out of water | Skill: Water |
| `refill()` | 60 | `bool` | Only on the well tile `(0,0)`. Restores water to max. `False` (cost 5 instead) anywhere else | Skill: Water |
| `goto(x, y)` | `move` cost × *d* | `None` | Flies to `(x, y)` by the shortest wrapped path. *d* is the wrapped Manhattan distance: `min(\|dx\|, N−\|dx\|) + min(\|dy\|, N−\|dy\|)` on an N×N grid (so `goto` to the current tile costs 0, plus the call). The travel costs exactly what the `move` calls it replaces would, Rotor upgrades included: no discount on the flight itself, the saving is the loop and the typing. Flies over rocks. `x` or `y` outside `0..N−1` is `R-BAD-ARG`. The drone is at `(x, y)` from the start of the call and emits a single `move` event; the client animates the flight along the wrapped x-then-y path (a half-grid tie goes east/north, which is visual only) | Ch 5 (after the player writes it), always (MP) |
| `sell(crop, n)` | 10 | `int` | Sells up to `n` from the silo at current price. Returns credits gained | Ch 8 · Skill: Sell (SP), always (MP) |
| `wait(n)` | `n` | `None` | Do nothing for `n` cycles. `n` must be an int in `1..5,000`; anything else is `R-BAD-ARG` (no clamping). Cheaper than a busy loop. It is a world-touching call, so other drones interleave normally, but it changes nothing and is not logged: the renderer simply idles the drone until its next event | Ch 4 |
| `spawn(fn)` | 200 | `bool` | Starts a second drone (drone 1) at your position running `fn()`; it halts when `fn` returns. Max 1 extra drone: a second `spawn` returns `False` (cost 5). See [Second drone](#second-drone-spawn) | Ch 10 (SP only in v1, D-24) |
| `halt()` | 0 (plus the 1-cycle call) | — | Stops this drone. With a second drone, only the calling drone stops | Ch 1 |

### Outcome matrix (normative)

Every action has exactly one row that applies, checked top to bottom within its group. Costs are in addition to the 1-cycle call. A failed action that did nothing costs 5, the same as `plantFailed` and `harvestEmpty` in `content`.

| Call | Condition | Returns | Cost | Effect |
|---|---|---|---|---|
| `plant` | tile has an unripe or ripe crop | `False` | 5 | none |
| `plant` | soil is `ROCK`, or the crop needs tilled soil and the soil is `GRASS` | `False` | 5 | none |
| `plant` | credits < seed cost | `False` | 5 | none |
| `plant` | otherwise (tile empty or holding a withered crop; radish and other crops without a soil need may go on grass or tilled soil) | `True` | 30 | credits −= seed cost; a withered crop is cleared; the new crop is placed at growth 0 |
| `harvest` | tile empty | `False` | 5 | none |
| `harvest` | crop unripe | `False` | 30 | crop destroyed; soil **keeps** its tilled state |
| `harvest` | crop withered | `False` | 30 | crop cleared, 0 to the silo; tilled soil → grass; not counted as a harvested crop |
| `harvest` | crop ripe | `True` | 30 | +1 to the silo; tilled soil → grass; counts as a harvested crop (🌾 Bumper Crop) |
| `till` | grass and no crop | `True` | 30 | soil → tilled |
| `till` | rock, already tilled, or has a crop | `False` | 5 | none |
| `water` | water left = 0 | `False` | 5 | none |
| `water` | otherwise (any soil, with or without a crop, even at moisture 100) | `True` | 25 | moisture = `min(100, moisture + 40)` (Sprayer +60); water −= 1 |
| `refill` | drone is not on `(0,0)` | `False` | 5 | none |
| `refill` | drone is on `(0,0)` (even if the tank is already full) | `True` | 60 | water = capacity |
| `move` | always | `None` | 20 (Rotor: 16/12/9) | position wraps |

The editor's Run log explains each `False` in words ("`till` at (3,2): that tile is rock"). Rivals never see it.

### Second drone (`spawn`)

Single-player only in v1 (see above); the rules below are what the campaign's Chapter 10 uses.

- **One farm, two drones.** The second drone works the same farm. Credits, silo and **water** are shared with drone 0 (one water tank, one set of water units), as is the market. Only position, facing and clock belong to each **drone**. Globals, lists and dicts are one heap per player, so the second drone can read the first drone's tracking lists, and the list/dict limits are per player.
- **How it starts.** `spawn(fn)` costs 200, paid by the caller. The new drone (drone 1) appears at the parent drone's current position, and its clock starts at the cycle at which the caller's `spawn` call finishes (the parent's `atCycle + 200`, the spawn cost). It runs the **same bytecode module** in its own call stack.
- **`fn`** must be a user-defined function with 0 parameters, otherwise `R-BAD-ARG`. The drone runs `fn()` to completion, then halts.
- **Stopping.** `halt()` and runtime errors stop only the drone that called or raised them. The player's program is finished when both drones have stopped.
- **Only one extra drone.** A second `spawn` (from either drone) returns `False` and costs 5.
- **Campaign only in v1** (D-24): in a showdown `spawn` is `E-LOCKED-FEATURE` and every farm runs exactly one drone.
- **No collisions.** Drones never block each other, and two may share a tile.
- **Scheduling.** Each drone is its own agent with `agentIndex = slot × MAX_DRONES + droneNo` (0 for the original, 1 for the spawned drone); see [simulation-engine](../03-architecture/simulation-engine.md).

## Sensors (read the world; cheap)

| Builtin | Cost | Returns | Unlock |
|---|---|---|---|
| `pos_x()`, `pos_y()` | 1 | `int` | Ch 5 |
| `world_size()` | 1 | `int` (grid is square) | Ch 2 |
| `crop()` | 2 | crop constant or `None` | Ch 3 |
| `is_ripe()` | 2 | `bool` | Ch 3 · Skill: is_ripe sensor |
| `is_withered()` | 2 | `bool` | Ch 3 |
| `growth()` | 2 | `int` 0–100 (% grown) | Ch 4 |
| `soil()` | 2 | soil constant | Skill: Till |
| `moisture()` | 2 | `int` 0–100 | Skill: Moisture sensor |
| `water_left()` | 1 | `int` | Skill: Water |
| `credits()` | 1 | `int` | Ch 5 |
| `inventory(crop)` | 1 | `int` | Ch 5 |
| `price(crop)` | 3 | `int` current market price | Ch 8 · Skill: Price sensor |
| `seed_cost(crop)` | 1 | `int` | Ch 8 · Skill: Price sensor |
| `measure()` | 5 | `int` crop-specific (Sunroot yield, Gourd size) | Ch 9 · Skill: Measure |
| `cycles()` | 1 | `int`: the cycle at which this call starts (after its 1-cycle base) | Ch 4 |
| `cycles_left()` | 1 | `int`: `max(0, budget − that cycle)` | Ch 4 |

**What the crop sensors say** (a withered crop stays on the tile until it is cleared, so the sensors tell the truth about it):

| Tile | `crop()` | `is_ripe()` | `is_withered()` | `growth()` |
|---|---|---|---|---|
| Empty | `None` | `False` | `False` | 0 |
| Growing | the crop constant | `False` | `False` | `floorDiv(growth × 100, growCycles)` (always below 100 until ripe) |
| Ripe | the crop constant | `True` | `False` | 100 |
| Withered | the crop constant | `False` | `True` | 100 |

`is_ripe()` is `True` only when `growth ≥ growCycles` and the crop is not withered. `soil()` is not affected by crops. To recover a withered tile, `harvest()` clears it (0 yield) or `plant()` replaces it.

## Pure helpers (no world access)

| Builtin | Cost | Notes |
|---|---|---|
| `range(n)`, `range(a, b)`, `range(a, b, step)` | 1 for the call, then 1 per iteration (the loop's `ITER_NEXT`) | Lazy iterator, so it doesn't allocate a list. Arguments must be ints (`R-BAD-ARG`). `step = 0` is `R-BAD-ARG` (*"range step can't be 0"*); a negative step counts down as in Python. `range(...)` is not a storable value: it is **only valid as the iterable of a `for` statement**. Using it anywhere else (`r = range(5)`, `len(range(5))`, `5 in range(10)`, passing it to a function) is the compile error `E-RANGE-ONLY-IN-FOR`: *"`range` can only be used in `for x in range(...)`."* |
| `len(x)` | 1 | str/list/dict. A str's length counts UTF-16 code units |
| `abs(n)`, `min(a, b, …)`, `max(a, b, …)` | 1 | `min`/`max` also accept one list (cost +1 per element). Ordering follows the Type interactions rules in [language-spec](language-spec.md) (int/bool or str against str only, else `R-TYPE`). `min()`/`max()` with no values, or over an empty list, is `R-BAD-ARG` (*"`min` needs at least one value."*) |
| `list.append(x)`, `list.pop([i])` | 1 (pop(i): +1 per shifted element) | `pop()` on an empty list and `pop(i)` out of range are `R-INDEX` |
| `dict.get(k[, default])` | 1 | The value for `k`, or `default` when `k` is missing; `default` is `None` when omitted, as in Python |
| `str(x)` | 1 + length of the result | Ints in decimal; `True`, `False`, `None` as in Python; constants by their name (`RADISH`); strings unchanged; lists as `[1, 'a', RADISH]` and dicts as `{1: 2}` using Python `repr` rules (strings single-quoted, or double-quoted when the text contains `'` and no `"`; `\\`, the quote, `\t`, `\n`, `\r` and `\xNN` for other characters below U+0020 and for U+007F are escaped; every other character, including non-ASCII, is kept as is); a function as `<function name>`. A result longer than the 256-character string limit is `R-STR-TOO-LONG`; nesting deeper than 64 levels (a list that contains itself) is `R-STACK-OVERFLOW`, whichever the output reaches first |
| `int(s)` | 1 + length of `s` | `int("12")` → 12. Accepts an optional sign and digits, with optional `_` separators as in literals, and surrounding spaces; leading zeros are fine here. Anything else is `R-BAD-ARG` (*"`int` can't read 'abc' as a whole number"*). `int(True)` is 1 and `int(5)` is 5 |
| `print(…)` | 1 + length of the printed line | Joins its arguments with one space and ends with a newline; `print()` prints an empty line. Arguments are formatted as `str` does, except that a top-level string prints without quotes. Output panel. Max 200 lines/run (rest dropped with notice). Not shown to rivals. In official (server) executions the first 200 lines per player are kept in `PlayerResult.output: string[]` and sent only to that player in `match.results`; the balance harness prints them to stdout |
| `random(n)` | 2 | `n` must be an int ≥ 1, else `R-BAD-ARG`. Deterministic seeded `0..n-1`, separate stream per player. **Disabled in ranked** for clean replays and fewer arguments (D-18); every other mode allows it, and the campaign unlocks it in Ch 8. Where it is off, using it is the compile error `E-LOCKED-FEATURE`. The server compiles with the match's setting, so a ranked program that uses `random()` runs the idle program |

## Builtins we deliberately **don't** provide

| Not provided | Why |
|---|---|
| Global farm scan (`get_all_tiles()`) | It would remove the core spatial puzzle. The drone only senses the tile it's on. |
| Time-of-day or wall-clock | It breaks determinism. |

## Example: a complete starter showdown program

```python
# Starter program shown in the coding phase.
# Inefficient but profitable: it farms only the 2 bottom rows (16 tiles),
# waters when the soil is dry, and refills and sells after every pass.
def tend():
    if moisture() < 10:
        water()
    if crop() == None:
        plant(RADISH)
    elif is_ripe():
        harvest()
        plant(RADISH)

while True:
    for y in range(2):
        for x in range(world_size()):
            tend()
            move(EAST)
        move(NORTH)
    move(SOUTH)
    move(SOUTH)
    refill()
    sell(RADISH, inventory(RADISH))
```

Why only two rows? A radish withers a fixed time after it ripens, and a full sweep of all 64 tiles takes longer than that window, so a naive 8×8 starter would watch its crops die. Farming a small plot well beats farming a big one badly; that pressure toward smaller plots is intended (see [farm-simulation](../01-game-design/farm-simulation.md) §Growth rules). The balance harness keeps this program honest: it must stay profitable and land at a modest fraction of a strong bot's score (see [simulation-engine](../03-architecture/simulation-engine.md) §Balance harness).
