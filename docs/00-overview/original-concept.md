# Original Concept Notes (archived)

Kept for history. The docs in this repo **supersede** these notes wherever they differ. Each difference is tracked in [decisions-needed](decisions-needed.md).

## "Code Harvest: saved concept for later" (Oct 4, 2026)

- Browser game, 2–8 players compete to run the most efficient farm with small programs built from supplied commands.
- Join by room code. Solo practice and labelled computer opponents.
- Proposed match: 3 rounds × 2-minute editing on a private preview, then the server locks programs and runs all farms for a fixed budget (~300 steps) with a shared animation.
- Commands: move, inspect, plant, water, harvest, repeat, simple conditions. Every instruction has a documented execution cost. Infinite loops can't exceed the budget.
- Harvested crops earn points, unharvested earn zero. Highest total wins. Ties go to fewest steps.
- Disconnected players keep their last program. No valid program means an idle program and zero.
- Screens: Home, Lobby, Editor, Execution, Results. Touch-friendly blocks by default, with an optional text mode.
- Architecture: TS + React client, Node authoritative server, limited command language parsed to a validated AST and interpreted. Never run player JS/Python. Deterministic seeds. Persist programs/seeds/rules/scores for replay.
- First version: 1 biome, 3 crops, small vocabulary, private rooms, solo practice, 3-round matches.

## Expanded vision (Oct 7, 2026)

- Sign-in: OAuth or email (Resend) with password and code verification.
- **Single player:** a skill tree that unlocks new code features, like a campaign. Code the farm, harvest and sell, save progress. Credits buy drone customisation, level badges, different crops (some worth more), backdrops and character customisation. It teaches coding, in a simple Python-style language.
- **Multiplayer:** cosmetics visible to others. A timed (~10 min) coding showdown to build the best and most efficient farm, then a cool end animation and judging (latency, interference, total crops, money). All code is unlocked in multiplayer. Casual rounds earn money. Ranked earns money and rank: Iron, Bronze, Silver, Gold, Diamond × 3 tiers, with no MMR.
- CS:GO-style matchmaking: Find Match (casual or ranked), a found animation, about 30 s for everyone to accept, and if anyone doesn't accept, matchmaking continues.
- Room search for casual or ranked. Friends list.
- Voxel style, but not too cartoonish. Fun farming.
- Hosting candidates: Neon, Render, ChatGPT Sites. Question: is JS/TS a hurdle, and should it be Wasm?
