# Audio Design

## Music: adaptive, layered

| Context | Track concept | Layers / behaviour |
|---|---|---|
| Home / Farmhouse | "Porch" | Acoustic guitar, light percussion, birds ambience bed |
| Campaign editing | "Fieldwork" | Calm, low-energy loop. Ducks −6 dB while the user types continuously |
| Campaign run | "Fieldwork" + rhythm layer | Rhythm layer fades in while the drone runs |
| Multiplayer coding (10:00) | "Showdown" | Stem 1 from start. Stem 2 (pulse) at 3:00 left. Stem 3 (strings/drive) at 1:00 left. Ticking accent in the last 10 s |
| Finale | "Harvest Moon" | Builds through the simulation, peaks at the podium |
| Results | Stinger: win / place / lose | 3–6 s, then back to Porch |

Music is implemented as Web Audio stems with a shared clock. Layers fade in on bar boundaries.

## SFX list (MVP)

| Group | Sounds |
|---|---|
| Drone | rotor loop (pitch follows speed), move whoosh (tiny), bump/error buzz |
| Farming | till (soil scrape), plant (seed + soft thump), water (splash short), harvest (pluck + pop), withered harvest (dry crunch), refill (well bucket) |
| Economy | sell (coins), credit tick (counter), money tower grow (rising chime) |
| UI | click, hover tick, toggle, tab, error, success, lock-in (stamp), unlock (chime + paper) |
| Matchmaking | searching pulse (subtle), **MATCH FOUND** (sting), accept click, all-accepted whoosh, failed (low thud) |
| Timer | 60 s warning, 10…1 ticks, time's up horn |
| Finale | crowd-of-crows ambience (light), podium fanfare, confetti pops |

## Mixing rules

- Volume sliders: Master, Music, SFX, UI. Respect the OS "reduce motion" setting by also defaulting to *calmer* finale audio.
- Max 8 simultaneous one-shot SFX. Farming SFX from rival farms in the finale are aggregated (one "busy farm" bed instead of 8 × every action).
- Audio starts only after first user interaction (autoplay policies). The sign-in click unlocks the audio context.
