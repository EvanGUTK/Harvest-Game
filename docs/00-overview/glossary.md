# Glossary

One definition per term. Docs, code and UI copy must use these words consistently.

| Term | Meaning |
|---|---|
| **Sprout** | The Python-style programming language players write. File extension `.sprout`. |
| **Program** | One player's Sprout source plus its compiled bytecode. |
| **Drone** | The flying farm robot a program controls. One per farm in v1; multi-drone is a late campaign unlock. |
| **Farm** | A rectangular grid of tiles owned by one player in one simulation. |
| **Tile** | One grid cell. It has a soil state, moisture and an optional crop. |
| **Crop** | A plant on a tile with growth progress. Ripe crops can be harvested. |
| **Cycle** | The unit of simulated time. Every VM instruction and every drone action costs cycles. Crops grow per cycle. **Time is cycles.** |
| **Cycle budget** | The total cycles a simulation runs for, e.g. a showdown's 30,000. |
| **Action** | A builtin that changes the world (`move`, `plant`, `harvest`…). Actions are expensive in cycles. |
| **Sensor** | A builtin that reads the world (`is_ripe`, `moisture`…). Sensors are cheap. |
| **Silo** | The player's crop inventory. |
| **Market** | Where crops are sold for credits. Single-player has a fixed market per chapter. Multiplayer has a **shared market** whose prices react to every player's sales. |
| **Credits (₵)** | Soft currency. In a match it is the score. In your profile it is spending money. *These are separate balances* (see economy doc). |
| **XP / Level** | Account progression from playing. Unlocks badges and profile frames. |
| **Contract** | A single-player objective, e.g. "Deliver 40 radishes in 6,000 cycles". |
| **Chapter** | A group of contracts that introduces one concept. |
| **Skill tree** | Single-player unlock graph for language features, commands, crops and farm upgrades. |
| **Showdown** | A multiplayer match: lobby, then coding phase, lock, execution, finale and results. |
| **Coding phase** | The timed window (default 10:00) where players write and privately test programs. |
| **Lock** | The moment the coding phase ends and the server freezes every program. |
| **Execution** | The server runs all locked programs in one deterministic lockstep simulation. |
| **Finale** | The animated replay and reveal shown to all players after execution. |
| **Seed** | The integer that determines a match's farm layout and random events. |
| **Rules version** | Semver of simulation + stdlib rules. Stored with every match for replay. |
| **Room** | A server-side container for 2–8 players going through a showdown. |
| **Room code** | 6-character code (no ambiguous chars) to join a private room. |
| **Queue** | Matchmaking pool for casual or ranked. |
| **Ready check** | The "Match found, accept within 20 s" step after matchmaking. |
| **Party** | 1–4 friends queuing together. |
| **Division** | Ranked band: Iron, Bronze, Silver, Gold, Diamond. |
| **Tier** | Sub-band within a division: III (lowest), II, I (highest). |
| **RP** | Rank Points, the visible number that moves you between tiers. There is no hidden MMR. |
| **Run receipt** | Single-player claim the server re-simulates before granting credits. |
| **Replay** | Locked programs + seed + rules version. Enough to deterministically re-run any match. |
