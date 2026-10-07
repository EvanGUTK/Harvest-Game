# Multiplayer Modes

## Modes at a glance

| Mode | Entry | Players | Coding time | Rewards | Rules |
|---|---|---|---|---|---|
| **Casual** | Find Match (queue) | 2–8 (fills to 4 target) | 10:00 | Wallet credits by placement, XP | Standard |
| **Ranked** | Find Match (queue) | **4 FFA** (fixed) | 10:00 (fixed) | RP + wallet credits + XP | Standard, locked settings |
| **Custom room** | Create room, then share code, or appear in the room browser | 2–8 | 5 / 10 / 15 | XP only (no credits, to prevent farming) | Host chooses grid, time, modifiers |
| **Practice vs bots** | Multiplayer hub → Practice vs bots | 1 + 1–7 bots | Any | None | Any |

Public custom rooms are browsable and are the only joinable listing in the room browser. Custom rooms pay XP only, so a browsable room can never farm wallet credits. Matchmade casual rooms are not listed, and ranked rooms are watch-only listings once spectating ships (M6).

### Why ranked is 4-player free-for-all
- 1v1 needs a large population to match fairly, and early on queues would be empty.
- 8-player lobbies take too long to fill and make placement RP noisy.
- 4 FFA gives a clear 1st/2nd/3rd/4th, a short queue and a readable finale. *(D-10: add a 1v1 Duel queue once concurrent ranked players exceed ~200.)*

### Bots
Bots are named `[BOT] Scarecrow`, `[BOT] Tractor`, etc. and always shown with the bot tag. Each bot runs a handwritten Sprout program from `packages/content/bots/` at a difficulty: Seedling (naive loop), Grower (conditionals) or Agronomist (market-aware). Bots double as **reference solutions** and as balance-harness players.

Bots never appear in ranked. In casual, if the queue can't find 2 humans in 90 s, the player is offered *"Play now with bots?"*. The match is then labelled casual-with-bots and pays 50 % of the Casual credits and no daily first-win bonus (see [scoring-and-judging](scoring-and-judging.md)).

## Showdown state machine (server-authoritative)

```mermaid
stateDiagram-v2
  [*] --> Forming
  Forming --> Lobby: room created / match accepted
  Lobby --> Coding: all ready OR host starts OR 60s timeout (matchmade)
  Coding --> Locking: deadline reached OR everyone pressed "Lock in early"
  Locking --> Executing: programs frozen & compiled
  Executing --> Finale: simulation done, event log ready
  Finale --> Results: animation finished (clients ack) OR 120s cap
  Results --> Lobby: rematch vote passes (custom/casual)
  Results --> [*]: all leave / 5 min idle
  Lobby --> [*]: everyone leaves
```

- **Server owns every deadline.** Clients show countdowns computed from `serverDeadline − estimatedClockOffset`.
- **Lock in early:** players can lock early. If all players lock, coding ends immediately. Early lock is shown to rivals as a ✔ next to the name, which is a social signal but leaks no code.
- **Disconnects:** the player's last autosaved draft (10 s cadence) is used. If they reconnect during coding they get a snapshot and continue. If they have no draft, they run the idle program (see [scoring-and-judging](scoring-and-judging.md), Idle program): score 0, placed below every player who has a program.
- **Leaving ranked** during lobby or coding counts as a loss (4th place RP) plus a queue cooldown.

## What rivals can see

| When | Visible about rivals |
|---|---|
| Lobby | Name, rank, cosmetics, level, ready state |
| Coding | Name, "typing…" pulse, test-run count, locked-in ✔. **No code, no farm.** |
| Finale | All farms animated side by side, live credit counters |
| Results | Full code of every player, score breakdown, replay. Replays of matchmade and custom-public matches are readable by any signed-in player; custom-private and practice replays only by participants (see [saves-and-persistence](../03-architecture/saves-and-persistence.md), Replays > Access) |
| Spectators (M6) | Coding: the shared farm preview (the seed's layout), the countdown and player chips (name, rank, typing pulse, locked ✔), no code and no test runs. Finale: live. Results: full code and replay. Players see only a count of spectators ("N watching"). Only custom-public and matchmade-ranked rooms are spectatable |

*(Open question D-05 from the original concept: answered as "only afterward".)* Showing code afterward is the teaching payoff, because you see exactly how the winner did it.

## Room codes & browser
See [rooms-and-lobbies](../03-architecture/rooms-and-lobbies.md).

## Rematch
Casual and custom rooms show a rematch vote. If at least 50 % accept within 20 s, the room returns to Lobby with a **new seed**, and players who declined leave. Players who have not voted when the 20 s window ends count as no (see [scoring-and-judging](scoring-and-judging.md), Results screen item 8). Ranked has no rematch, because players must requeue.

## Variants (post-MVP rotation, casual and custom only)
- **Sprint:** 5:00 coding, 6×6 grid.
- **Rocky:** seeded rock obstacles. Each tile is rock with probability `WORLD.rockDensityBp` (8 %, provisional) from the `layout` PRNG stream; the well tile is never rock.
- **Weather:** crows, rain and market-boom events.
- **Golf:** placement uses `golfScore = floorDiv((score − startCredits) × 1_000, max(50, programTokens))`, integers only: profit per token, scaled by 1,000. `programTokens` is defined in [scoring-and-judging](scoring-and-judging.md) and the floor of 50 keeps a tiny program from dividing by almost nothing. The shortest good program wins. Idle programs score 0 and place last, and ties use the normal tiebreakers.
- **Relay (2v2):** teammates alternate 2:30 coding blocks on a shared program. This needs a collaborative editor, so it's deferred.
