# Editor UX

## Text mode (primary)

- **CodeMirror 6** with a Lezer grammar for Sprout: highlighting, bracket matching, folding, auto-indent after `:`, smart dedent on `else`/`elif`.
- **Autocomplete:** builtins (with costs and one-line docs), user functions and variables, constants. Locked features are shown greyed with a 🔒 and the chapter that unlocks them.
- **Hover docs** on builtins, with a mini example.
- **Inline diagnostics** from `lang` running in the Worker on every change (debounced 150 ms).
- **Cost lens** after a run: `×hits · cycles` ghost text at the end of each line, and a heat tint in the gutter.
- **Snippets:** `for` → `for i in range(n):`, `def`, `while`, plus a "sweep the field" snippet unlocked in Ch 2.
- **Keyboard.** Every shortcut is listed in a cheat-sheet overlay (toolbar keyboard button, or `?` when focus is outside the text area). Every control is also a focusable button, so a shortcut is never the only way to do something.
  - Run `Ctrl/Cmd+Enter` (overrides CodeMirror's insert-blank-line binding) · Pause/Resume `Ctrl/Cmd+Shift+Enter` · Step `Ctrl/Cmd+'`. `F10` also steps where the browser lets it through, but it is not the primary binding because Windows browsers use it for their menu bar.
  - Save `Ctrl/Cmd+S`: a no-op that flashes "Saved" (saving is automatic) and stops the browser's Save Page dialog from opening.
  - Problems panel `Ctrl/Cmd+Shift+M` (CodeMirror's lint binding).
  - Reset, Speed and the Commands panel have **no chord**: every free combination collides with the browser, the OS or CodeMirror's editing keys (`Ctrl/Cmd+1–4` switch browser tabs, `Ctrl+Backspace` deletes a word, `Ctrl/Cmd+/` toggles a comment). Reach them from the toolbar with `Tab`. Speed is a radio group, so the arrow keys change it.
  - **No keyboard trap:** `Tab` indents inside the editor. `Esc` then `Tab` moves focus out of it (WCAG 2.1.2).
- **Vim/Emacs keymaps** as an option in settings (low cost with CodeMirror, and loved by the programmer audience). They change editing keys only. The app shortcuts above stay as they are.

## Blocks mode (tablets and early chapters)

- **Blockly** workspace whose blocks map 1:1 to Sprout statements. Blocks **generate Sprout text**, so text stays the single source of truth.
- Switching Blocks → Text is always possible. Text → Blocks only works if the program uses block-supported constructs, otherwise "This program is too advanced for blocks."
- Blocks are the default on touch-only devices for Chapters 1–3, and then the game suggests trying text.

## Run & debug controls

| Control | Behaviour |
|---|---|
| Run | Compile, then simulate in the Worker and stream events to the renderer |
| Pause / Resume | Freezes VM and animation |
| Step | Runs to the next `LINE` op. The current line is highlighted, and the drone animates the action |
| Speed | 1× (≈ 100 cycles/s), 4×, 16×, Max (no animation, then jump to end state) |
| Reset | Restores the farm to the contract or match start |
| Breakpoints | Gutter click |
| Variables | Panel with globals and current locals |
| Timeline | Scrubber after the run ends (snapshots every 1,000 cycles) |

## Multiplayer-specific

- Your draft autosaves to the server every 10 s (indicator: "Saved 3 s ago").
- The **starter program** is preloaded and can be reset to it at any time.
- **"My snippets"** library: players can save functions from the campaign and insert them in showdowns. This rewards campaign play without gating features. *Scope status: unscheduled stretch feature (Pillar 5, short sessions and long arc). It has no backlog ID or milestone yet, so treat it as post-MVP until one is added. Nothing else in the editor depends on it.*
- **Lock in** has no keyboard shortcut, because it is irreversible. **Test run** is the same action as Run (`Ctrl/Cmd+Enter`).
