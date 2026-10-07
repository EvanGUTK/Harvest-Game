# Errors & Diagnostics

## Principles

1. **Point at the exact spot.** Every diagnostic has `{ file, line, col, endLine, endCol }`. The editor underlines the range.
2. **Say what happened, then what to do.** One sentence each, with no jargon until the chapter that teaches the term.
3. **Offer a fix-it** when there's one obvious repair (e.g. add the missing `:`). One click applies it.
4. **Runtime errors stop that drone, not the world.** Crops keep growing and the rest of the budget elapses. In multiplayer, a runtime error freezes your drone for the rest of the match. That is harsh but fair and teaches testing. The results screen shows the error line.

## Diagnostic shape

```ts
type Diagnostic = {
  code: string;            // stable, e.g. 'E-MISSING-COLON'
  severity: 'error' | 'warning' | 'hint';
  range: { file: string; line: number; col: number; endLine: number; endCol: number };
  message: string;         // "This `if` line needs a `:` at the end."
  help?: string;           // "Python-style languages use `:` to start a block."
  fix?: { label: string; edits: TextEdit[] };
  learnMore?: string;      // lesson id, opens lesson card
};
```

## Catalogue (initial)

This is the canonical list. The compiler and VM may emit only the codes below, so a new code needs a row here in the same change, and a test (see [testing](../09-engineering/testing.md): every diagnostic code). Codes are stable: lesson ids (`learnMore`) and the `error_codes` stored with receipts depend on them. Prefixes: `E-` compile-time error, `W-` compile-time warning or hint, `R-` runtime error raised by the VM (see [language-spec](language-spec.md#limits-hard-enforced-by-the-compilervm)).

### Compile-time

| Code | Example trigger | Message (beginner wording) |
|---|---|---|
| `E-MISSING-COLON` | `if is_ripe()` | This `if` line needs a `:` at the end. *(fix: add `:`)* |
| `E-BAD-INDENT` | block body not indented | The lines inside this `while` should be indented one step further. |
| `E-MIXED-INDENT` | 2 and 4 spaces in one block | These lines are indented by different amounts. Pick one (4 spaces is standard). |
| `E-UNKNOWN-NAME` | `harvset()` | I don't know `harvset`. Did you mean `harvest`? *(Levenshtein ≤ 2 suggestion, fix-it)* |
| `E-LOCKED-FEATURE` | `while` in Ch 2; `random()` in ranked; `spawn()` in a showdown | `while` isn't unlocked yet. You'll get it in Chapter 4. *(campaign only)* Where a builtin is turned off for a mode, the message says why: "`random()` is turned off in ranked matches so replays stay clean." |
| `E-WRONG-ARG-COUNT` | `move()` | `move` needs 1 thing in the brackets: a direction like `NORTH`. |
| `E-SLASH-DIVISION` | `a / 2` | Sprout uses whole numbers. Use `//` for division. *(fix-it)* |
| `E-ASSIGN-IN-IF` | `if x = 3:` | Use `==` to compare. A single `=` stores a value. *(fix-it)* |
| `E-NESTED-DEF` | `def` inside `def` | Define functions at the top level, not inside other functions. |
| `E-RETURN-OUTSIDE` | `return` at top level | `return` only works inside a function made with `def`. |
| `E-BREAK-OUTSIDE` | `break` outside a loop | `break` only works inside a loop. |
| `E-CONTINUE-OUTSIDE` | `continue` outside a loop | `continue` only works inside a loop. |
| `E-GLOBAL-AFTER-USE` | `global total` below a line that already uses `total` in the same `def` | Put `global total` before the first line that uses `total`. |
| `E-DUPLICATE-DEF` | the same function name defined in two files | `tend` is defined in two files: `main.sprout` and `helpers.sprout`. Keep one. *(Within one file a later `def` just replaces the earlier one.)* |
| `E-RANGE-ONLY-IN-FOR` | `r = range(5)` | `range` can only be used in `for x in range(...)`. |
| `E-IDENT-TOO-LONG` | a name of 33 or more characters | Names can be at most 32 characters. Try a shorter one. |
| `E-INT-TOO-BIG` | `99999999999999999999` | That number is too big. Whole numbers go up to 9,007,199,254,740,991. |
| `E-LEADING-ZERO` | `007` | Whole numbers can't start with a zero. *(fix-it: remove the zeros)* |
| `E-UNTERMINATED-STRING` | `"hello` | This text is missing its closing quote. |
| `E-BAD-ESCAPE` | `"a\q"` | `\q` isn't a known escape. You can use `\\`, `\'`, `\"`, `\n` and `\t`. |
| `E-UNEXPECTED-CHAR` | `$` or `?` in code | I don't know what to do with `$`. Sprout doesn't use that character. |
| `E-TOO-MANY-FILES` | an 11th file in the campaign, or a second file in a showdown | Your program can have at most 10 files (1 in a showdown). |
| `E-TOO-DEEP` / `E-PROGRAM-TOO-BIG` / `E-SRC-TOO-BIG` | limits | Tells you the limit and suggests using functions to simplify. |
| `W-UNREACHABLE` | code after `while True:` with no `break` | warning: This code will never run because the loop above never ends. |
| `W-PURE-INFINITE-LOOP` | `while True:` that only does arithmetic, with no `break`, `return`, `halt()`, action or sensor, directly or in any function it calls | warning: This loop never ends and never touches the farm, so it will use up all your cycles doing nothing. |
| `W-USE-BEFORE-DEF` | `tend()` at the top level above `def tend():` | warning: `tend` isn't defined yet at this line. Move the `def` above. |
| `W-UNUSED-VAR` | assigned, never read | hint |

### Runtime

| Code | Message |
|---|---|
| `R-TYPE` | Can't add a number and a crop. `x` is `5`, `y` is `RADISH`. |
| `R-INDEX` | List index 9 is outside the list (it has 8 items, so use 0–7). |
| `R-KEY` | The dict has no key `CORN`. Use `d.get(CORN, 0)` if it might be missing. |
| `R-DIV-ZERO` | Can't divide by zero (`//` or `%`). |
| `R-OVERFLOW` | That number got too big. |
| `R-STACK-OVERFLOW` | A function called itself too many times (64 max). Check your stopping condition. |
| `R-COLLECTION-FULL` | Lists and dicts can hold at most 1,024 items. |
| `R-OUT-OF-MEMORY` | Your program is holding too much data at once (16,384 cells). Let go of lists you no longer need. |
| `R-STR-TOO-LONG` | Text can be at most 256 characters long. |
| `R-BAD-ARG` | A builtin got an argument of the wrong type or an unusable value. Examples: `plant` needs a crop like `RADISH`, but got `5`; `wait` needs a whole number from 1 to 5,000, but got `0`; `int` can't read `'abc'` as a whole number; `range` step can't be 0; `random` needs 1 or more, but got `0`; `min` needs at least one value, but the list is empty. |
| `R-UNBOUND-LOCAL` | `total` is used before it gets a value in this function. Did you mean `global total`? |
| `R-UNBOUND-GLOBAL` | `tend` isn't defined yet at this line. Move the `def` above. |
| `R-NOT-CALLABLE` | `5` isn't a function, so it can't be called with `()`. (`None` is what a function with no `return` gives back.) |
| `R-WRONG-ARG-COUNT` | `f` needs 2 things in the brackets, but got 1. Raised when a function stored in a variable is called with the wrong number of arguments. Direct calls are caught earlier by `E-WRONG-ARG-COUNT`. |

`pop()` on an empty list and `pop(i)` past the end are `R-INDEX` (*"The list is empty, so there is nothing to pop."*). Bad numbers and bad text passed to builtins are `R-BAD-ARG`, never a separate value-error code.

### Action outcomes (not errors)

`plant` / `harvest` / `till` / `water` return `False` on failure. The editor's **Run log** shows *why*, e.g. "`plant` at (3,2): tile already has CORN". Rivals never see this.

## Debugger

- **Step:** execute until the next statement (not instruction).
- **Breakpoints:** click the gutter. The run pauses when the drone reaches the line.
- **Variables panel:** globals and the current function's locals, live.
- **Cost lens:** after a run, each line shows `×hits · cycles`.
- **Timeline scrubber:** after a test run, drag through time to see the farm at any cycle. This is cheap because the sim is deterministic: re-run from the nearest snapshot (every 1,000 cycles).
