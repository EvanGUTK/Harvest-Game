# Editor UX

## Text mode (primary)

- **CodeMirror 6** with a Lezer grammar for Sprout: highlighting, bracket matching, folding, auto-indent after `:`, smart dedent on `else`/`elif`.
- **Autocomplete:** builtins (with costs and one-line docs), user functions and variables, constants. Locked features are shown greyed with a 🔒 and the chapter or skill node that unlocks them.
- **Hover docs** on builtins, with a mini example.
- **Commands panel** (bottom right, layout in [screen-flow](screen-flow.md)) has two tabs: **Reference** (searchable) and **Lessons** (every unlocked lesson card).
- **Inline diagnostics** from `lang` running in the Worker on every change (debounced 150 ms).
- **Cost lens** after a run: `×hits · cycles` ghost text at the end of each line, and a heat tint in the gutter.
- **Snippets:** `for` → `for i in range(n):`, `def`, `while`, plus a "sweep the field" snippet unlocked in Ch 2.
- **File tabs** (campaign: 1 to 10 files; a showdown program is a single file): `main.sprout` is always present, cannot be deleted or renamed, and runs last regardless of its tab position. Every other file runs first, in tab order (see [language-spec](../02-language/language-spec.md#files)).
- **Status bar** shows two size counters, `bytes / 16,384` (per file) and `nodes / 5,000` (whole program), so `E-PROGRAM-TOO-BIG` is never a surprise.
- **Keyboard.** Every shortcut is listed in a cheat-sheet overlay (toolbar keyboard button, or `?` when focus is outside the text area). Every control is also a focusable button, so a shortcut is never the only way to do something.
  - Run `Ctrl/Cmd+Enter` (overrides CodeMirror's insert-blank-line binding) · Pause/Resume `Ctrl/Cmd+Shift+Enter` · Step `Ctrl/Cmd+'`. `F10` also steps where the browser lets it through, but it is not the primary binding because Windows browsers use it for their menu bar.
  - Save `Ctrl/Cmd+S`: a no-op that flashes "Saved" (saving is automatic) and stops the browser's Save Page dialog from opening.
  - Problems panel `Ctrl/Cmd+Shift+M` (CodeMirror's lint binding).
  - Reset, Speed and the Commands panel have **no chord**: every free combination collides with the browser, the OS or CodeMirror's editing keys (`Ctrl/Cmd+1–4` switch browser tabs, `Ctrl+Backspace` deletes a word, `Ctrl/Cmd+/` toggles a comment). Reach them from the toolbar with `Tab`. Speed is a radio group, so the arrow keys change it.
  - **No keyboard trap:** `Tab` indents inside the editor. `Esc` then `Tab` moves focus out of it (WCAG 2.1.2).
- **Vim/Emacs keymaps** as an option in settings (low cost with CodeMirror, and loved by the programmer audience). They change editing keys only. The app shortcuts above stay as they are.

## Blocks mode (touch devices and early chapters)

- **Blockly** workspace whose blocks map 1:1 to Sprout statements. Blocks **generate Sprout text**, so text stays the single source of truth.
- Switching Blocks → Text is always possible. Text → Blocks only works if the program uses block-supported constructs, otherwise "This program is too advanced for blocks."
- Blocks are the default on touch devices for Chapters 1–3; on tablets the game then suggests trying text. Phones stay in Blocks (D-21). Every construct through Chapter 10 has a block, so Text → Blocks only fails for programs that use more than the curriculum teaches.
- The Settings Editor tab has an input-mode choice (Auto, Blocks, Text). Auto is the default described above.

## Run & debug controls

| Control | Behaviour |
|---|---|
| Run | Compile, then simulate in the Worker and stream events to the renderer |
| Pause / Resume | Freezes VM and animation |
| Step | Runs to the next `LINE` op. The current line is highlighted, and the drone animates the action |
| Speed | 1× (≈ 100 cycles/s), 4×, 16×, Max (contracts and showdown test runs only; no animation, then jump to end state). Free Farm offers 1×/4×/16× only so receipts stay verifiable (see [saves-and-persistence](../03-architecture/saves-and-persistence.md) Run receipts) |
| Reset | Restores the farm to the contract or match start |
| Breakpoints | Gutter click |
| Variables | Panel with globals and current locals |
| Timeline | Scrubber after the run ends (snapshots every 1,000 cycles) |

In Free Farm, a tab that another tab has superseded stops and shows "Free Farm is running in another tab" with a **Use this tab** button, which starts a new session there (details in [screen-flow](screen-flow.md#free-farm)). The receipt toasts and errors are owned by [saves-and-persistence](../03-architecture/saves-and-persistence.md) (Outcomes).

## Multiplayer-specific

- Your draft autosaves to the server every 10 s (indicator: "Saved 3 s ago").
- The **starter program** is preloaded and can be reset to it at any time.
- **"My snippets"** library: players can save functions from the campaign and insert them in showdowns. This rewards campaign play without gating features. *Scope status: unscheduled stretch feature (Pillar 5, short sessions and long arc). It has no backlog ID or milestone yet, so treat it as post-MVP until one is added. Nothing else in the editor depends on it.*
- The coding phase shows a persistent notice: "Your code is shown to rivals after the match. Don't put personal info in comments."
- **Lock in** has no keyboard shortcut, because it is irreversible. **Test run** is the same action as Run (`Ctrl/Cmd+Enter`).
