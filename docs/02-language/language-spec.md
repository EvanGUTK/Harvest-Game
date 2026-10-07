# Sprout Language Specification (v0.1 draft)

Sprout is a **small, Python-shaped language** for programming a farm drone. If you know Python, Sprout should feel familiar within minutes. If you don't, learning Sprout teaches real Python habits like indentation, `def`, `for … in range()` and lists.

## Design goals

1. **Python-compatible surface.** Every valid Sprout program should *look* like valid Python wherever possible. Players graduating to Python shouldn't need to unlearn anything.
2. **Small.** A beginner can read the entire spec in one sitting.
3. **Deterministic and metered.** Every operation has a documented cycle cost. No floats, no wall-clock, no hidden randomness.
4. **Safe by construction.** No I/O, no imports, no reflection, no `eval`. The interpreter is our own VM written in TypeScript. Player code never becomes JavaScript.
5. **Teachable errors.** Every error points to a line and column and explains the fix in plain language (see [errors](errors-and-diagnostics.md)).

## Lexical structure

- Source is UTF-8, max **16 KB** per file, max **10 files** per program (campaign) or **1 file** (showdown v1).
- Comments: `#` to end of line.
- **Indentation** defines blocks, as in Python. A tab counts as 4 spaces. Mixing indentation widths within one block is an error with a fix-it hint.
- Identifiers: `[A-Za-z_][A-Za-z0-9_]*`, case-sensitive, max 32 chars.
- Keywords: `if elif else while for in repeat def return break continue pass and or not True False None global`
- Literals: integers (`0`, `42`, `1_000`), strings (`"…"` or `'…'`, no f-strings in v0.1), `True`, `False`, `None`.
- Operators: `+ - * // % == != < <= > >= = += -= *= //= %= ( ) [ ] { } , : .`
- `/` is recognised only to give a helpful error: *"Sprout uses whole numbers. Use `//` for division."*

## Grammar (EBNF)

```ebnf
program      = { statement } EOF ;
statement    = simple_stmt NEWLINE | compound_stmt ;
simple_stmt  = assign | aug_assign | expr | "pass" | "break" | "continue"
             | "return" [ expr ] | "global" NAME { "," NAME } ;
assign       = target "=" expr ;
aug_assign   = target ( "+=" | "-=" | "*=" | "//=" | "%=" ) expr ;
target       = NAME | postfix "[" expr "]" ;
compound_stmt= if_stmt | while_stmt | for_stmt | repeat_stmt | def_stmt ;
if_stmt      = "if" expr ":" block { "elif" expr ":" block } [ "else" ":" block ] ;
while_stmt   = "while" expr ":" block ;
for_stmt     = "for" NAME "in" expr ":" block ;
repeat_stmt  = "repeat" expr ":" block ;                  (* Sprout-only beginner sugar *)
def_stmt     = "def" NAME "(" [ NAME { "," NAME } ] ")" ":" block ;
block        = NEWLINE INDENT statement { statement } DEDENT ;

expr         = or_expr ;
or_expr      = and_expr { "or" and_expr } ;
and_expr     = not_expr { "and" not_expr } ;
not_expr     = "not" not_expr | comparison ;
comparison   = sum { ( "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not" "in" ) sum } ;
sum          = term { ( "+" | "-" ) term } ;
term         = unary { ( "*" | "//" | "%" ) unary } ;
unary        = "-" unary | postfix ;
postfix      = atom { "(" [ args ] ")" | "[" expr "]" | "." NAME "(" [ args ] ")" } ;
args         = expr { "," expr } ;
atom         = NAME | INT | STRING | "True" | "False" | "None"
             | "(" expr ")" | "[" [ args ] "]" | "{" [ kv { "," kv } ] "}" ;
kv           = expr ":" expr ;
```

Chained comparisons (`0 <= x < 8`) behave as in Python.

### `repeat`

`repeat n:` runs its block `n` times. It is introduced in Chapter 2 before `for`, and the lesson then shows that `repeat 5:` is the same as `for _ in range(5):`. It is the only non-Python keyword, and it can be removed from a player's toolbox later in the campaign (the "graduate" contract asks you to rewrite `repeat` as `for`).

## Types

| Type | Notes |
|---|---|
| `int` | Whole numbers. Range ±9,007,199,254,740,991 (JS safe integer). Overflow is a runtime error, never silent. `//` and `%` use Python floor semantics. |
| `bool` | `True` / `False`. Truthiness as in Python: `0`, `None`, `""`, `[]`, `{}` are falsy. |
| `None` | Returned by functions without `return`. |
| `str` | Immutable. Supports `+`, `==`, `len()`, `in`. Mostly for `print` and dict keys. Max length 256. |
| `list` | Mutable, max **1,024** elements. Supports indexing (negative indices allowed), `len`, `.append(x)`, `.pop()`, `.pop(i)`, `in`, `for … in`. |
| `dict` | Mutable, max **1,024** entries. Keys may be `int`, `str`, `bool` or game constants. Supports `d[k]`, `d[k] = v`, `k in d`, `len`, `for k in d` (insertion order), `.get(k, default)`. |
| `function` | User-defined via `def` or a builtin. First-class: can be passed to `spawn(fn)`. |
| constants | `NORTH`, `RADISH`, … opaque enum values. Comparable with `==`, usable as dict keys, printable. |

Tuples, sets, floats, classes, exceptions, imports, comprehensions, lambdas and f-strings are **not in v0.1**. Comprehensions and tuples are candidates for v0.2.

## Scoping

Python rules, simplified:
- Module-level names are **globals**.
- Assigning to a name inside a `def` creates a **local** unless the name is declared `global` in that function.
- Reading an unassigned local that exists as a global reads the global (matches Python for read-only access).
- No closures over enclosing function locals in v0.1. A nested `def` is a compile error: *"Define functions at the top level."*

## Evaluation and cost model

The program compiles to bytecode for a stack VM (see [interpreter-vm](../03-architecture/interpreter-vm.md)).

- **Every bytecode instruction costs 1 cycle.** That includes loads, stores, arithmetic, compares, jumps, calls and returns.
- **Builtins** cost `1 (CALL) + builtin.cost`. Action builtins also advance world time by their cost (see [stdlib](standard-library.md)).
- The editor's **cost lens** shows the estimated cycle cost next to each line after a test run (measured, not guessed).

## Limits (hard, enforced by the compiler/VM)

| Limit | Value | Error |
|---|---|---|
| Source size | 16 KB / file | `E-SRC-TOO-BIG` |
| AST nodes | 5,000 | `E-PROGRAM-TOO-BIG` |
| Nesting depth (blocks) | 12 | `E-TOO-DEEP` |
| Call depth (recursion) | 64 | `E-STACK-OVERFLOW` |
| List / dict size | 1,024 | `E-COLLECTION-FULL` |
| Total live heap cells | 16,384 | `E-OUT-OF-MEMORY` |
| `print` lines per run | 200 (rest dropped with notice) | warning only |
| Cycle budget | per context (contract or showdown) | **not an error**: the program simply stops when time runs out |

An infinite loop is not an error. It just spends the whole budget, and the cost lens makes that obvious.

## Program entry

- The whole file runs top to bottom once.
- If execution reaches the end before the budget is spent, **the drone halts** and the remaining cycles pass with crops still growing. A halted program cannot sell, so most good programs end with a `while True:` main loop that exits on a sensor condition.
- `halt()` ends the program explicitly (1 cycle).

## Example

```python
# Plant radishes on every tile, then keep harvesting and replanting.
def tend():
    if is_ripe():
        harvest()
        plant(RADISH)
    elif crop() == None:
        plant(RADISH)

def sweep():
    for y in range(world_size()):
        for x in range(world_size()):
            tend()
            move(EAST)
        move(NORTH)

while True:
    sweep()
    if inventory(RADISH) >= 20:
        sell(RADISH, inventory(RADISH))
```

## Versioning

- `language_version` is semver. Breaking syntax changes need a major bump.
- Every saved program and every match stores the `language_version` and `rules_version` it ran under. Old replays run on archived VM builds (`packages/lang` is versioned and old majors are kept importable).
