# Vision & Pillars

## One-liner

Program a farm drone in a small Python-style language, alone to learn and grow your farm, or against up to 7 rivals in a 10-minute coding showdown.

## Pillars

Every feature has to serve at least one of these. If it serves none, it gets cut.

1. **Code is the controller.** The player never steers the drone by hand. All farming happens through programs. Typing better code is the only way to get better at the game.
2. **Learn by wanting.** Each new language feature solves a problem the player already has, like a loop when typing `move()` 40 times gets tedious. The game teaches by creating that need first.
3. **Fair, visible competition.** Multiplayer is deterministic. Every player gets the same farm, the same seed and the same rules, and the server runs every program exactly as written. A player who loses can watch the replay and see why.
4. **A farm you want to look at.** The world is grounded voxel art: warm light, earthy palette, satisfying growth and harvest animations. It should not look like a kids' toy (see [art direction](../04-art-audio/art-direction.md)).
5. **Short sessions, long arc.** A campaign contract takes 5–15 minutes and a showdown about 15. The arc that keeps people coming back is the skill tree, cosmetics and ranks.

## Audience

| Segment | Wants | Serves them |
|---|---|---|
| Curious beginners (teens and adults, 13+) | To learn to code without it feeling like school | Campaign, skill tree, friendly errors |
| Hobby and working programmers | Optimisation puzzles, bragging rights | Showdowns, ranked ladder, replays, efficiency awards |
| Friend groups and classrooms | Something to play together on any laptop | Room codes, room browser, friends list, no install |

The launch target is **13+** to avoid COPPA scope. See [privacy-and-age](../08-legal-safety/privacy-and-age.md). A separate classroom or under-13 mode would be a later product decision.

## Prior art and how we differ

**The Farmer Was Replaced** (Timon Herzog, Steam, Oct 2025, 500k+ copies) is a single-player game where you program a drone with a Python-like language to automate a farm, with continuous progression that unlocks language features. It is the closest prior art and it proves demand. It also means a single-player-only clone would be both redundant and legally and reputationally risky.

**Our differentiation:**

| | The Farmer Was Replaced | Code Harvest |
|---|---|---|
| Platform | Steam (desktop) | Browser, no install, any laptop or tablet |
| Core hook | Solo automation and idle progression | **Head-to-head showdowns** plus campaign |
| Multiplayer | None | Room codes, room browser, matchmaking, ranked ladder |
| Economy | Solo resources | **Shared market**: rivals' selling moves your prices |
| Social | None | Friends, parties, presence, replays, cosmetics shown to others |

**Originality rules** (enforced in reviews):
- Don't reuse another game's command names, crop roster, unlock order, UI layout, art or text. Mechanics like "program a drone" aren't ownable, but expression is.
- Our crop roster, command vocabulary and unlock tree are designed from scratch (see [crops](../01-game-design/crops-and-economy.md), [stdlib](../02-language/standard-library.md)).
- Do not market the game by comparison to another title's name.

Other inspirations for specific systems:
- **CS2 / Valorant**: queue, then "match found", then everyone accepts within a time limit.
- **Screeps / CodinGame / Battlecode**: program-vs-program competition, server-side execution, replays.
- **Human Resource Machine / 7 Billion Humans**: cost-per-instruction as a score dimension.

## Non-goals (v1)

- Running real Python, JavaScript or any general-purpose language. Sprout is interpreted by our own VM.
- Real-money purchases. Every cosmetic is earned with in-game credits. Monetisation is a post-launch decision (see decisions-needed).
- Free-text chat. v1 has quick-chat and emotes only.
- Player-made levels or command packs.
- Native mobile apps. Phones get spectate, replays, profile, shop and the Blocks-mode campaign (D-21). Text coding is designed for keyboards and tablets.
