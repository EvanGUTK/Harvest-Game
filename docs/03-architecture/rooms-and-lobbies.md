# Rooms & Lobbies

## Room types

| Type | Created by | Joinable via | Listed in browser |
|---|---|---|---|
| `matchmade-casual` | Matchmaker | — (closed) | No |
| `matchmade-ranked` | Matchmaker | — (closed) | Spectate-only listing (M6+) |
| `custom-public` | A player | Browser, code, invite | Yes |
| `custom-private` | A player | Code or invite only | No |
| `practice` | A player (with bots) | — | No |

## Room state

```ts
type RoomState = {
  roomId: string;
  code: string | null;            // 6 chars from "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  type: RoomType;
  hostUserId: string | null;      // null for matchmade
  settings: {
    gridSize: 6 | 8 | 10;
    codingSeconds: 300 | 600 | 900;
    maxPlayers: 2..8;
    modifiers: ('rocky' | 'weather' | 'golf')[];
    botSlots: number;             // practice/custom only
  };
  phase: 'lobby' | 'coding' | 'locking' | 'executing' | 'finale' | 'results';
  deadline: number | null;
  players: Array<{
    slot: number; userId: string; name: string; level: number; rankIndex?: number;
    loadout: Loadout; ready: boolean; connected: boolean; lockedIn: boolean; isBot: boolean;
  }>;
  seed?: number;                  // revealed at coding start
  rulesVersion: string;
};
```

## Lifecycle

- A room is an in-memory object with a phase machine (see [multiplayer-modes](../01-game-design/multiplayer-modes.md)) and **one timer at a time**.
- Custom rooms: the host can change settings in Lobby only, and can kick. If the host leaves, host passes to the longest-present player.
- Rooms are destroyed 5 min after Results with nobody present, or immediately if empty in Lobby.
- Only **finished matches** are persisted (with programs, seed and results). In-progress rooms are lost on a server restart, so deploys use graceful drain: stop new rooms, let existing ones finish (max 20 min), then exit.

## Room browser

```
┌ Browse rooms ──────────────────────────────────────────────┐
│ [Casual ▾]  Grid [Any ▾]  Time [Any ▾]  [ ] Has friends    │
│ Search: [ room name or host ]                    ⟳ live     │
├────────────────────────────────────────────────────────────┤
│ 🌽 "Lunch break showdown"  host: maple_rows   3/8  10 min  8×8  Lobby   [Join] │
│ 🍉 "Melon only (rocky)"    host: byte_farmer  6/8   5 min  6×6  Coding  [Watch]│
│ 🔒 Private rooms are joinable by code only        [Enter code] │
└────────────────────────────────────────────────────────────┘
```

- Live updates via `rooms.subscribe` (deltas, throttled to 1/s).
- Rooms past Lobby show **Watch** once spectating ships, otherwise grey.
- "Ranked" filter tab: lists live ranked matches for spectating only (M6+). You can't join ranked from the browser, which prevents arranged matches. *(D-09 discusses the user's request to search ranked rooms; this is the recommended compromise.)*
- Room names: max 32 chars, profanity-filtered, can be reported.

## Room codes

- 6 chars from a 31-symbol alphabet, which gives about 887M combinations. Codes are random and checked for collisions among live rooms.
- A shareable link: `https://<site>/r/K7MPQ3` (deep-links through sign-in if needed).
- Code join rate limit: 10 attempts per minute per user, to prevent enumeration.
