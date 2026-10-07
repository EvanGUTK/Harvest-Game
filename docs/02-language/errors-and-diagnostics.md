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

### Compile-time

| Code | Example trigger | Message (beginner wording) |
|---|---|---|
| `E-MISSING-COLON` | `if is_ripe()` | This `if` line needs a `:` at the end. *(fix: add `:`)* |
| `E-BAD-INDENT` | block body not indented | The lines inside this `while` should be indented one step further. |
| `E-MIXED-INDENT` | 2 and 4 spaces in one block | These lines are indented by different amounts. Pick one (4 spaces is standard). |
| `E-UNKNOWN-NAME` | `harvset()` | I don't know `harvset`. Did you mean `harvest`? *(Levenshtein ≤ 2 suggestion, fix-it)* |
| `E-LOCKED-FEATURE` | `while` in Ch 2 | `while` isn't unlocked yet. You'll get it in Chapter 4. *(campaign only)* |
| `E-WRONG-ARG-COUNT` | `move()` | `move` needs 1 thing in the brackets: a direction like `NORTH`. |
| `E-SLASH-DIVISION` | `a / 2` | Sprout uses whole numbers. Use `//` for division. *(fix-it)* |
| `E-ASSIGN-IN-IF` | `if x = 3:` | Use `==` to compare. A single `=` stores a value. *(fix-it)* |
| `E-NESTED-DEF` | `def` inside `def` | Define functions at the top level, not inside other functions. |
| `E-RETURN-OUTSIDE` | `return` at top level | `return` only works inside a function made with `def`. |
| `E-BREAK-OUTSIDE` | `break` outside a loop | `break` only works inside a loop. |
| `E-TOO-DEEP` / `E-PROGRAM-TOO-BIG` / `E-SRC-TOO-BIG` | limits | Tells you the limit and suggests using functions to simplify. |
| `W-UNREACHABLE` | code after `while True:` with no `break` | warning: This code will never run because the loop above never ends. |
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
| `R-OUT-OF-MEMORY` / `R-COLLECTION-FULL` | Lists can hold at most 1,024 items. |
| `R-BAD-ARG` | `plant` needs a crop like `RADISH`, but got `5`. |
| `R-NONE-CALL` | You tried to use the result of a function that doesn't return anything. |

### Action outcomes (not errors)

`plant` / `harvest` / `till` / `water` return `False` on failure. The editor's **Run log** shows *why*, e.g. "`plant` at (3,2): tile already has CORN". Rivals never see this.

## Debugger

- **Step:** execute until the next statement (not instruction).
- **Breakpoints:** click the gutter. The run pauses when the drone reaches the line.
- **Variables panel:** globals and the current function's locals, live.
- **Cost lens:** after a run, each line shows `×hits · cycles`.
- **Timeline scrubber:** after a test run, drag through time to see the farm at any cycle. This is cheap because the sim is deterministic: re-run from the nearest snapshot (every 1,000 cycles).
