# Accessibility

Target: **WCAG 2.2 AA** for all 2D UI. The 3D scene gets equivalent information in text.

| Area | Requirement |
|---|---|
| Keyboard | Every screen fully operable by keyboard. Visible focus rings. The editor is keyboard-native. Editor shortcuts are listed in [editor-ux](editor-ux.md) and in an in-app cheat sheet; `Tab` indents in the editor and `Esc` then `Tab` leaves it (no keyboard trap). Global shortcuts: `Esc` closes the topmost modal or panel |
| Screen readers | CodeMirror's accessible mode. The farm has an **ARIA live "farm log"** ("Drone moved to 3,2. Harvested corn, +₵18"). Results are a real `<table>` |
| Color | Crops are distinguishable by shape and icon, not only color. Colorblind palettes for UI states (Deuteranopia / Protanopia / Tritanopia presets) |
| Text size | UI scale 85–150 %. Editor font 12–24 px |
| Motion | "Reduce motion" honours `prefers-reduced-motion` and can be toggled in-game |
| Time pressure | Multiplayer is inherently timed. Custom rooms allow 15 min. Single-player has **no timers** except the in-game cycle budget |
| Audio | Every audio cue has a visual equivalent (match found = modal + tab flash) |
| Readability | Atkinson Hyperlegible option for UI. Dyslexia-friendly code font option (OpenDyslexic Mono, OFL) |
