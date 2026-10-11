# Sprout Language Specification (v0.1 draft)

Sprout is a **small, Python-shaped language** for programming a farm drone. If you know Python, Sprout should feel familiar within minutes. If you don't, learning Sprout teaches real Python habits like indentation, `def`, `for … in range()` and lists.

## Design goals

1. **Python-compatible surface.** Every valid Sprout program should *look* like valid Python wherever possible. Players graduating to Python shouldn't need to unlearn anything.
2. **Small.** A beginner can read the entire spec in one sitting.
3. **Deterministic and metered.** Every operation has a documented cycle cost. No floats, no wall-clock, no hidden randomness.
4. **Safe by construction.** No I/O, no imports, no reflection, no `eval`. The interpreter is our own VM written in TypeScript. Player code never becomes JavaScript.
5. **Teachable errors.** Every error points to a line and column and explains the fix in plain language (see [errors](errors-and-diagnostics.md)).

## Lexical structure

- Source is UTF-8, max **16 KB** per file, max **10 files** per program (campaign) or **1 file** (showdown v1). How several files combine is defined under [Files](#files).
- Comments: `#` to end of line.
- **Indentation** defines blocks, as in Python. A tab counts as 4 spaces. Mixing indentation widths within one block is an error with a fix-it hint. Blank lines and comment-only lines are ignored for indentation: they never produce `INDENT`, `DEDENT` or `NEWLINE` tokens, whatever their own indentation.
- Identifiers: `[A-Za-z_][A-Za-z0-9_]*`, case-sensitive, max 32 chars (longer is `E-IDENT-TOO-LONG`).
- Keywords: `if elif else while for in repeat def return break continue pass and or not True False None global`
- Literals: integers (`0`, `42`, `1_000`), strings (`"…"` or `'…'`, no f-strings in v0.1), `True`, `False`, `None`.
  - Integer literals may not have leading zeros (`0` alone is fine, `007` is not): `E-LEADING-ZERO`, with a fix-it that removes the zeros. A literal above 9,007,199,254,740,991 is `E-INT-TOO-BIG`.
  - A string literal may not span lines. A quote with no closing quote on the same line is `E-UNTERMINATED-STRING`. A literal longer than 256 characters is `E-STRING-TOO-LONG`.
  - Escapes inside strings are `\\`, `\'`, `\"`, `\n` and `\t`. Any other backslash sequence is `E-BAD-ESCAPE`.
- Operators: `+ - * // % == != < <= > >= = += -= *= //= %= ( ) [ ] { } , : .`
- `/` is recognised only to give a helpful error: *"Sprout uses whole numbers. Use `//` for division."* Any other character that is not part of the language (such as `$` or `?` outside a string or comment) is `E-UNEXPECTED-CHAR`.

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

`break` and `continue` outside a loop are `E-BREAK-OUTSIDE` and `E-CONTINUE-OUTSIDE`, and `return` outside a `def` is `E-RETURN-OUTSIDE`.

### `repeat`

`repeat n:` runs its block `n` times. It is introduced in Chapter 2 before `for`, and the lesson then shows that `repeat 5:` is the same as `for _ in range(5):`. It is the only non-Python keyword, and it can be removed from a player's toolbox later in the campaign (the "graduate" contract asks you to rewrite `repeat` as `for`).

## Types

| Type | Notes |
|---|---|
| `int` | Whole numbers. Range ±9,007,199,254,740,991 (JS safe integer). Overflow is a runtime error, never silent. `//` and `%` use Python floor semantics. |
| `bool` | `True` / `False`. A `bool` is also an `int`, as in Python (`True == 1`, `True + 1 == 2`). Truthiness: see below. |
| `None` | Returned by functions without `return`. |
| `str` | Immutable. Supports `+`, `*` (repeat), indexing, `==`, `len()`, `in` (substring) and `for … in` (one character at a time). Mostly for `print` and dict keys. Max length 256. Length, indexing and the limit count **UTF-16 code units** (JS semantics). |
| `list` | Mutable, max **1,024** elements. Supports indexing (negative indices allowed), `+`, `*`, `==`, `len`, `.append(x)`, `.pop()`, `.pop(i)`, `in`, `for … in`. |
| `dict` | Mutable, max **1,024** entries. Keys may be `int`, `bool`, `str`, `None` or game constants. Supports `d[k]`, `d[k] = v`, `k in d`, `==`, `len`, `for k in d` (insertion order), `.get(k, default)`. There is no way to remove a key in v0.1 (overwrite the value instead). |
| `function` | User-defined via `def` or a builtin. First-class: can be passed to `spawn(fn)`. |
| constants | `NORTH`, `RADISH`, … opaque enum values. Comparable with `==`, usable as dict keys, printable. |

Tuples, sets, floats, classes, exceptions, imports, comprehensions, lambdas, f-strings and slicing are **not in v0.1**. Comprehensions and tuples are candidates for v0.2.

### Truthiness and `and` / `or`

`0`, `None`, `""`, `[]`, `{}` and `False` are falsy. **Every other value is truthy**, including non-zero ints, non-empty strings, lists and dicts, every game constant and every function (so `if crop():` is true on any occupied tile and false on an empty one).

`a and b` and `a or b` evaluate left to right, short-circuit, and return the deciding **operand**, not a bool, exactly as in Python: `crop() or RADISH` is `RADISH` on an empty tile. `not x` always returns a bool.

### Type interactions

- **`bool` is a subtype of `int`**: `True < 2` is valid, and as a dict key `True` and `1` are the same key.
- **`==` and `!=` never raise.** Values of different types are unequal (the only cross-type equalities are `bool` with `int`). `None` equals only `None`; constants and functions equal only themselves; `str` compares by content. `list` and `dict` compare **structurally** (element by element, recursively; dicts ignore insertion order). Structure nested deeper than the call-depth limit (for example a list that contains itself) raises `R-STACK-OVERFLOW`.
- **`<  <=  >  >=` are defined only for `int`/`bool` against `int`/`bool`, and `str` against `str`** (strings compare by UTF-16 code unit, like JS). Every other pair, including constants, `None`, lists and dicts, is `R-TYPE` (*"Can't compare `RADISH` and `5`."*).
- **`x in y` (and `not in`)**: if `y` is a `str`, `x` must also be a `str` (else `R-TYPE`) and the result is a substring test; if `y` is a `list`, whether any element `== x`; if `y` is a `dict`, whether the key is present. Any other right-hand type (`int`, `None`, constant, function) is `R-TYPE`: *"`in` needs a list, dict or text on the right."*
- **Calling.** Calling a value that is not a function (`x = 5` then `x()`) is `R-NOT-CALLABLE`. Calling a function value (a variable that holds a `def`) with the wrong number of arguments is `R-WRONG-ARG-COUNT`; a direct call by name is checked earlier, at compile time, as `E-WRONG-ARG-COUNT`.
- **Dict keys** are `int`, `bool`, `str`, `None` and constants. A list or dict used as a key is `R-TYPE`. Reading a missing key is `R-KEY`.
- **Indexing** `x[i]`: `list` and `str` take an `int` (negative allowed, out of range is `R-INDEX`; a `str` index returns a 1-unit string), `dict` takes a key. Assigning into a `str` is `R-TYPE`. Any other indexed type is `R-TYPE`.

### Operators by type

| Expression | Result |
|---|---|
| `int + - * // % int` | `int` (floor semantics for `//` and `%`; `R-DIV-ZERO` on a zero divisor; `R-OVERFLOW` beyond the safe range). `bool` operands count as `int`. |
| `-x` | `int` or `bool` (result `int`), else `R-TYPE` |
| `str + str` | `str`; `R-STR-TOO-LONG` above 256 |
| `str * int`, `int * str` | repetition, as in Python (a count below 1 gives `""`); same length limit |
| `list + list` | a **new** list; `R-COLLECTION-FULL` above 1,024 |
| `list * int`, `int * list` | repetition, as in Python (`[0] * 8` is the idiomatic fixed-size list); same limit |
| `str + int`, `int + str`, and any arithmetic involving `None`, a constant, a function or a `dict` | `R-TYPE` |

Augmented assignment is plain assignment of the operator's result: `x += y` means `x = x + y`. For lists this builds a new list (Python extends in place), which is visible only through another name for the same list.

Per-element cycle costs (concatenation, repetition, structural `==`, `in`, `pop(i)`, and so on) are defined in one place, the op-cost table in [interpreter-vm](../03-architecture/interpreter-vm.md#bytecode). Nothing in this spec overrides it.

### Iteration

- `for x in range(…)` is lazy (see [stdlib](standard-library.md)). `range` is only valid as the iterable of a `for`; anywhere else (`r = range(5)`) it is `E-RANGE-ONLY-IN-FOR`.
- `for x in s` over a `str` yields 1-character strings.
- `for x in lst` iterates a `list` **by index**, as in Python: elements appended during the loop are visited, and elements popped shrink the loop.
- `for k in d` iterates a **snapshot of the keys taken when the loop starts**. Adding keys inside the loop is allowed and does not affect the iteration (stricter than Python, which raises). Values are read live.
- Every iterable kind costs 1 cycle per `ITER_NEXT`.

## Scoping

Python rules, simplified:
- Module-level names are **globals**.
- A name that is assigned anywhere in a `def` body (including `for` targets and augmented assignment such as `total += 1`) and not declared `global` in that function is **local for the whole body**. Reading it before its first assignment is `R-UNBOUND-LOCAL`: *"`total` is used before it gets a value in this function. Did you mean `global total`?"*
- `global x` must appear before any use of `x` in the same `def`; otherwise `E-GLOBAL-AFTER-USE`.
- A name that is never assigned in the body is looked up as a global (read-only).
- `def` is a statement: the function's name is bound when its `def` line executes. A function body may mention a global or another function that is defined further down the file, provided it is bound by the time the call actually runs. Calling a function above its `def` is `R-UNBOUND-GLOBAL`: *"`tend` isn't defined yet at this line. Move the `def` above."* The checker raises `W-USE-BEFORE-DEF` statically for the obvious top-level case. A name that is defined nowhere in the program is the compile-time `E-UNKNOWN-NAME`.
- No closures over enclosing function locals in v0.1. A `def` anywhere but the top level of a file is a compile error (`E-NESTED-DEF`): *"Define functions at the top level, not inside other functions or blocks."*

## Evaluation and cost model

The program compiles to bytecode for a stack VM (see [interpreter-vm](../03-architecture/interpreter-vm.md)).

- **Every bytecode instruction costs 1 cycle, except `LINE` (0, a debug marker), plus the surcharges listed in the op-cost table in [interpreter-vm](../03-architecture/interpreter-vm.md#bytecode).** That includes loads, stores, arithmetic, compares, jumps, calls and returns.
- **Builtins** cost `1 (CALL_HOST) + builtin.cost`. Action builtins also advance world time by their cost (see [stdlib](standard-library.md)).
- **Size-dependent operations** (string and list concatenation or repetition, structural `==`, `in`, `pop(i)`, iteration set-up) cost extra per element. The single source of truth for those costs is the op-cost table in [interpreter-vm](../03-architecture/interpreter-vm.md#bytecode); this spec only says *which* operations are legal.
- The editor's **cost lens** shows the estimated cycle cost next to each line after a test run (measured, not guessed).

## Limits (hard, enforced by the compiler/VM)

| Limit | Value | When | Error |
|---|---|---|---|
| Source size | 16 KB / file | compile | `E-SRC-TOO-BIG` |
| Identifier length | 32 chars | compile | `E-IDENT-TOO-LONG` |
| String length | 256 UTF-16 code units | compile (literal) / runtime (`+`, `*`, `str()`) | `E-STRING-TOO-LONG` / `R-STR-TOO-LONG` |
| Files per program | 10 (campaign), 1 (showdown v1) | compile | `E-TOO-MANY-FILES` |
| AST nodes | 5,000 per program (all files together) | compile | `E-PROGRAM-TOO-BIG` |
| Nesting depth (blocks) | 12 | compile | `E-TOO-DEEP` |
| Expression tree height | 64 | compile | `E-TOO-DEEP` |
| Call depth (recursion) | 64 | runtime | `R-STACK-OVERFLOW` |
| List / dict size | 1,024 | runtime | `R-COLLECTION-FULL` |
| Total live heap cells | 16,384 | runtime | `R-OUT-OF-MEMORY` |
| `print` lines per run | 200 (rest dropped with a notice in the Output panel) | runtime | notice only, no code |
| Cycle budget | per context (contract or showdown) | runtime | **not an error**: the program simply stops when time runs out |

**Code prefixes:** `E-` compile-time error, `W-` compile-time warning or hint, `R-` runtime error raised by the VM. The canonical list of codes is [errors-and-diagnostics](errors-and-diagnostics.md); this table must match it.

**Heap cells.** A heap cell is one list slot or one dict entry. A `str` value costs `ceil(len / 16)` cells (a full 256-unit string is 16 cells; literals in the constant pool are free). Ints, bools, `None`, constants and functions are free. Call frames and the value stack are not heap cells; they are bounded by the call-depth limit (64) and the AST limit. By design, 64 frames each holding a full 1,024-element list exceed 16,384 cells, so `R-OUT-OF-MEMORY` fires first.

**Expression tree height.** A name or literal has height 1; every other expression is one more than its tallest part, and a pair of parentheses adds one too. So `a + b + c` has height 3, `f()()` has height 3, and `[[x]]` has height 3. Every kind of nesting counts: brackets, prefix `-` and `not`, call chains and long left-deep chains such as `a + b + c + …`. A comparison chain is one expression, so `0 <= x < 8` has height 2. Together with the 12-level block limit this bounds the depth of the whole syntax tree. Input like ten thousand `(` therefore gets a diagnostic instead of crashing the compiler, and later compiler stages can walk the tree recursively.

**Two size counters.** Sprout code averages roughly 0.3 AST nodes per source byte, so the 5,000-node and 16 KB limits sit close together, and dense code can reach the node limit first. The AST limit is a parser safety net, not a gameplay target: the editor status bar shows `bytes / 16,384` and `nodes / 5,000` side by side so a player is never surprised by `E-PROGRAM-TOO-BIG`.

An infinite loop is not an error. It just spends the whole budget, and the cost lens makes that obvious.

## Program entry

- The whole program runs top to bottom once: files in the order given under [Files](#files), statements in each file from first to last.
- If execution reaches the end before the budget is spent, **the drone halts** and the remaining cycles pass with crops still growing. A halted program cannot sell, so most good programs end with a `while True:` main loop that exits on a sensor condition.
- `halt()` ends the program explicitly (cost 0, plus the 1-cycle call).

### Files

- A campaign program has 1 to 10 files; a showdown program is exactly one file. `main.sprout` always exists, is the **entry file**, and cannot be deleted or renamed.
- All files share **one global namespace** and are compiled as one program. Diagnostics and the debugger keep each file's own name and line numbers (`range.file`).
- **Run order is fixed and does not depend on tab order:** every file other than `main.sprout` runs first, in tab order, then `main.sprout` runs last. Top-level statements of every file execute, so a helper file normally contains only `def`s (and perhaps starting values), and `main.sprout` holds the main loop. Because `def` binds when it executes, this order guarantees helper functions exist before the main loop calls them.
- Two `def`s with the same name in different files are `E-DUPLICATE-DEF` (within one file a later `def` simply rebinds the name, as in Python).
- More files than the limit is `E-TOO-MANY-FILES`.

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
- Every saved program and every match stores the `language_version` and `rules_version` it ran under. Old replays run on archived VM builds (`packages/lang` is versioned and old majors are kept importable as committed bundles under `apps/web/public/engines/`, see [saves-and-persistence](../03-architecture/saves-and-persistence.md) §Replays).
