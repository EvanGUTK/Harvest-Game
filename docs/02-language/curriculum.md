# Curriculum Map

Each chapter introduces **one programming concept** by creating a problem that the concept solves. The "pain" column is the deliberate friction that motivates the unlock.

| Ch | Concept | Pain that motivates it | Contracts (examples) | Unlocks |
|---|---|---|---|---|
| 1 | Sequencing, calls | — | Plant 3 radishes on a 3×1 strip. Harvest them. | `move`, `plant`, `harvest`, `halt`, constants |
| 2 | `repeat`, `for … in range` | Ch 1's 3×3 contract needs 27 handwritten lines | Plant a full 4×4 field in under 25 lines | `repeat`, `for`, `range`, `world_size` |
| 3 | `if` / `elif` / `else`, sensors | Harvesting unripe crops destroys them | Harvest only ripe radishes; replant | `if`, `crop`, `is_ripe`, `==`, `!=` |
| 4 | `while`, booleans, `wait` | Unknown number of repetitions | Keep a 4×4 farm running until 60 radishes harvested | `while`, `and/or/not`, `growth`, `cycles`, `wait` |
| 5 | Variables, arithmetic | Need to count and track position | Write your own `goto(x, y)`. Deliver exactly 25 corn | variables, `+ - * // %`, `pos_x/y`, `credits`, `inventory` → then native `goto` |
| 6 | Functions | Copy-pasted blocks everywhere | Refactor a provided 80-line program under 30 lines with the same output | `def`, `return`, parameters |
| 7 | Lists, `for x in list` | Remember which tiles have what | Track tomato vines (regrow) across a 6×6 | lists, `append`, `pop`, `len`, `in` |
| 8 | Strategy with sensors | Prices vary; selling blindly loses money | Earn ₵500 in a market-day contract | `price`, `sell`, `seed_cost`, `random` |
| 9 | Nested loops, sorting | Gourds pay more if harvested in size order | Harvest 10 gourds in ascending size | dicts, `measure`, `min/max` over lists |
| 10 | Concurrency (gentle) | One drone is too slow for 12×12 | Two drones, no collisions, finish in budget | `spawn` |

## Lesson card template

```
Title: Loops save typing
Problem:  (shows the player's own repetitive code, highlighted)
Idea:     "repeat N: runs the indented lines N times."
Try it:   (editable example pre-filled from their program; Run button)
Check:    (a 1-question quiz: "How many times does this move?")
Python note: "In Python you'd write `for _ in range(N):`, and you'll learn that next."
```

## Python bridge

Starting in Chapter 2, each lesson includes a short **"In real Python…"** note. After Chapter 10, a **Graduation** screen shows the player's best campaign program converted to plain Python, with a stub library and a link to a free Python tutorial. This is the "it teaches you to code" promise made concrete.

## Assessment hooks (for future classroom mode)

- Every contract records attempts, time-to-complete, program size and errors encountered. These are stored as aggregate events only (see privacy doc).
- A future teacher dashboard can show concept mastery per student. This is out of scope for v1 but informs the data model (`contract_attempts` table).
