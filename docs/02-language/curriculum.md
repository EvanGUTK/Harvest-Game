# Curriculum Map

Each chapter introduces **one programming concept** by creating a problem that the concept solves. The "pain" column is the deliberate friction that motivates the unlock.

| Ch | Concept | Pain that motivates it | Contracts (examples) | Unlocks (node becomes purchasable) |
|---|---|---|---|---|
| 1 | Sequencing, calls | — | Plant 3 radishes on a 3×1 strip, then harvest the 3 ripe radishes already in the row above.¹ Later in the chapter: plant and harvest a full 3×3 patch | `move`, `plant`, `harvest`, `halt`, constants |
| 2 | `repeat`, `for … in range` | Ch 1's 3×3 contract needs 36 handwritten lines (9 × plant/move, 9 × harvest/move) | Plant a full 4×4 field in under 25 lines | `repeat`, `for`, `range`, `world_size` |
| 3 | `if` / `elif` / `else`, sensors | Harvesting unripe crops destroys them | Harvest only ripe radishes; replant | `if`, `crop`, `is_ripe`, `is_withered`, comparisons (`== != < <= > >=`) |
| 4 | `while`, booleans, `wait` | Unknown number of repetitions | Keep a 4×4 farm running until 60 radishes harvested | `while`, `and/or/not`, `growth`, `cycles`, `wait` |
| 5 | Variables, arithmetic | Need to count and track position | Write your own `goto(x, y)`. Deliver exactly 25 corn | variables, `+ - * // %`, `pos_x/y`, `credits`, `inventory` → then native `goto` |
| 6 | Functions | Copy-pasted blocks everywhere | Refactor a provided 80-line program under 30 lines with the same output | `def`, `return`, parameters |
| 7 | Lists, `for x in list` | Remember which tiles have what | Track tomato vines (regrow) across a 6×6 | lists, `append`, `pop`, `len`, `in` |
| 8 | Strategy with sensors | Prices vary; selling blindly loses money | Earn ₵500 in a market-day contract | `price`, `sell`, `seed_cost`, `random` |
| 9 | Nested loops, sorting | Gourds pay more if harvested in size order | Harvest 10 gourds in ascending size | dicts, `measure`, `min/max` over lists |
| 10 | Concurrency (gentle) | One drone is too slow for 12×12 | Two drones, no wasted double-visits, finish in budget | `spawn` |

**Notes on the table**

- **Unlocks column.** A chapter makes the listed language features and commands *purchasable* in the skill tree ([campaign-and-skill-tree](../01-game-design/campaign-and-skill-tree.md)). They still have to be bought with farm credits, except the Chapter 1 commands, which are the root of the Commands tree and available from the start. Standard-library rows that name a skill node instead of a chapter (`till`, `water`, `moisture`, …) follow the tree's own prerequisites and carry no chapter gate.
- ¹ **Chapter 1 timing.** A radish needs 300 cycles to grow, but planting three tiles and walking back to the first takes about 160 cycles, and `wait` (Ch 4), loops (Ch 2) and `is_ripe` (Ch 3) are still locked. So the first contract starts with three ripe radishes already in the ground, and its lesson card says: "Radishes take 300 cycles to grow. The cycle counter next to the Run button shows how long your program has been running." The 3×3 patch works without a trick, because planting nine tiles takes longer than 300 cycles.

## Feature gating map (normative)

The compiler gates by **feature** (syntax) and by **name** (builtins and constants). This table is the single source for the `Feature` union in `packages/lang`: the union contains exactly these values.

| Feature | Unlocks in | What it gates |
|---|---|---|
| `repeat` | Ch 2 | the `repeat n:` statement |
| `for` | Ch 2 | `for NAME in range(...)` **only**. Any other iterable needs `for_in_list` |
| `if` | Ch 3 | `if` / `elif` / `else` |
| `comparison` | Ch 3 | `== != < <= > >=`, including chained comparisons |
| `while` | Ch 4 | `while`, `break`, `continue` |
| `boolean_ops` | Ch 4 | `and`, `or`, `not` |
| `variables` | Ch 5 | assignment and augmented assignment to a NAME |
| `arithmetic` | Ch 5 | binary `+ - * // %` and unary `-` |
| `def` | Ch 6 | `def` and its parameters. `global` is a Feature of its own but is never sold separately: it unlocks together with `def` |
| `return` | Ch 6 | `return` with a value |
| `lists` | Ch 7 | list literals, indexing, list methods, `in` / `not in` |
| `for_in_list` | Ch 7 | `for x in <anything that is not range(...)>` |
| `dicts` | Ch 9 | dict literals, indexing, dict methods |

Rules:

- **Never gated:** literals (`5`, `"hi"`, `True`, `None`), call syntax and `pass`. Binding a `for` loop target (`for i in range(5)` binds `i` before `variables` unlocks) and a `def` parameter never needs `variables`. Integer literals work before `arithmetic`, so `range(5)` is fine in Ch 2.
- **Builtins and constants are gated by name**, not by Feature. `CompileOptions.lockedNames: ReadonlySet<string>` lists the names the player cannot use yet: a name is locked until its chapter has been reached and, for command nodes, until the node has been bought. A reference to a locked name is `E-LOCKED-FEATURE` and takes precedence over `E-UNKNOWN-NAME`. Chapter not reached: "`sell` isn't unlocked yet. You'll get it in Chapter 8." Chapter reached, node not bought: "`sell` isn't unlocked yet. Buy the Sell node in the skill tree."
- `HostSignature` carries an optional `unlock?: { chapter?: number; node?: string }` (the chapter that teaches it and/or the skill node that sells it), so the editor can build the 🔒 text in autocomplete from the fields without a second lookup.
- Gating applies to the campaign only. In multiplayer everything is unlocked (see [standard-library](standard-library.md)).

## Lesson card template

```
Title: Loops save typing
Problem:  (shows the player's own repetitive code, highlighted)
Idea:     "repeat N: runs the indented lines N times."
Try it:   (editable example pre-filled from their program; Run button)
Check:    (a 1-question quiz: "How many times does this move?")
Python note: "In Python you'd write `for _ in range(N):`, and you'll learn that next."
```

**Where lesson cards appear**

- A lesson card renders as a modal over the **contract editor**. Buying a language node in the skill tree navigates to the last-open contract (or Free Farm) and opens the card there, so "Try it" edits a real program, not a blank one.
- `learnMore` on a diagnostic opens the card in place, without leaving the editor.
- Every unlocked lesson is listed in the editor's **Commands ▸ Lessons** tab (for example "Loops save typing · Ch 2") and on its Campaign map chapter header, so lessons can be re-read at any time.
- The card's quiz is optional. Closing the card without answering is allowed ("Skip"), and a skipped quiz never blocks a contract.

## Python bridge

Starting in Chapter 2, each lesson includes a short **"In real Python…"** note. After Chapter 10, a **Graduation** screen shows a campaign program of the player's choice (defaulting to their latest Chapter 10 solution) converted to plain Python, with a stub library and a link to a free Python tutorial. This is the "it teaches you to code" promise made concrete (Pillar 2, learn by wanting). The conversion is a `toPython()` pretty-printer over the AST (backlog LANG-07, M7; post-MVP if M7 runs long).

## Assessment hooks (for future classroom mode)

- Every contract records attempts, time-to-complete, program size and errors encountered. These are stored as aggregate events only (see privacy doc).
- A future teacher dashboard can show concept mastery per student. This is out of scope for v1 but informs the data model (`contract_attempt` table).
