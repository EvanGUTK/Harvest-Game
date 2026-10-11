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
    codingSeconds: 300 | 600 | 900 | null;   // null = no timer; allowed for type 'practice' only
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
  seed?: number;                  // unsigned 32-bit; revealed at coding start (match.preview)
  rulesVersion: string;
};
```

## Lifecycle

- A room is an in-memory object with a phase machine (see [multiplayer-modes](../01-game-design/multiplayer-modes.md)) and **one timer at a time**.
- Custom rooms: the host can change settings, kick players and **Close room**, all in Lobby only. A player the server removes from a room (kicked, room closed or expired, or blocked) receives `room.left { reason: 'kicked' | 'host_closed' | 'room_expired' | 'blocked' }`, see [realtime-protocol](realtime-protocol.md).
  - **Kicks are Lobby-only.** A kicked player returns to the Multiplayer hub with the toast "You were removed from this room by the host." and cannot rejoin that room by code or link for the rest of its lifetime (`error { code: 'ROOM_UNAVAILABLE' }`, shown as "This room isn't available.").
  - **Close room** is a host action in Lobby only; there is no close action once the match has started. The server destroys the room and sends every other player in it `room.left { reason: 'host_closed' }`, which the client shows as the toast "The host closed this room." (the host, who chose to close it, simply returns to the Multiplayer hub). The code stops working at once.
- **Host migration.** If the host leaves, or is disconnected for 30 s while the room is in Lobby, host passes to the longest-present *connected* player. Everyone gets `room.patch { hostUserId }`. The new host sees the toast "maple_rows left. You're now the host." and the settings, kick and Start controls appear for them. Everyone else sees "byte_farmer is now the host." A returning former host is a normal player. From Coding to Finale the host role is irrelevant (the server owns every timer), so no migration happens then; if the host is gone when the room returns to Lobby for a rematch, the same rule applies at that moment.
- **Disconnected players in Lobby.** Their row shows a ⚡ "reconnecting…" state (`connected: false`), their slot is held, and their `ready` flag is cleared, so "all ready" cannot start the match without them. After they have been disconnected for 30 s the host may start anyway ("Start without sproutling?"); the absent player is then handled like any disconnect during coding (see [multiplayer-modes](../01-game-design/multiplayer-modes.md)). A Lobby in which nobody is connected for 30 s is destroyed, the same as an empty one.
- Rooms are destroyed 5 min after Results with nobody present, or immediately if empty in Lobby.
- Only **finished matches** are persisted (with programs, seed and results). In-progress rooms are lost on a server restart, so prod deploys drain before the deploy: an admin drain endpoint stops new rooms, joins and queue entries (error `MAINTENANCE`) and closes Lobby rooms, the release workflow waits (max 20 min) for active rooms to finish, then deploys. Rooms still alive after Render's 300 s `SIGTERM` window are abandoned without rewards. Rooms are not snapshotted or restored across deploys in v1. See [hosting](../06-infrastructure/hosting.md) and [realtime-protocol](realtime-protocol.md) §Server drain.

## Room browser

```
┌ Browse rooms ──────────────────────────────────────────────┐
│ [Custom ▾ | Ranked (watch)]  Grid [Any ▾]  Time [Any ▾]  [ ] Has friends │
│ Search: [ room name or host ]                    ⟳ live     │
├────────────────────────────────────────────────────────────┤
│ 🌽 "Lunch break showdown"  host: maple_rows   3/8  10 min  8×8  Lobby   [Join] │
│ 🍉 "Melon only (rocky)"    host: byte_farmer  6/8   5 min  6×6  Coding  [Watch]│
│ 🔒 Private rooms are joinable by code only        [Enter code] │
└────────────────────────────────────────────────────────────┘
```

- **What the browser lists.** Only `custom-public` rooms are joinable from the browser, so the filter is `Custom` (default) or `Ranked (watch)`; there is no `Casual` tab. Matchmade casual rooms are formed by Find Match and are never listed: that is how casual pays wallet credits. Custom rooms pay XP only (see [multiplayer-modes](../01-game-design/multiplayer-modes.md)), so a browsable room can never be used to farm wallet credits.
- Live updates via `rooms.subscribe` (deltas, throttled to 1/s).
- Rooms past Lobby show **Watch** once spectating ships (M6), otherwise grey. Only `custom-public` and `matchmade-ranked` rooms can be watched. A room allows at most 50 spectators *(provisional)*. Spectators are not in `players`; the room sends players and spectators a spectator count. See [screen-flow](../05-ux/screen-flow.md) §Spectate.
- Players who have blocked each other (either direction) never see each other's rooms: the browser filters them out for both (see [social](social.md)).
- The **Ranked (watch)** tab lists live ranked matches for spectating only (M6+). You can't join ranked from the browser, which prevents arranged matches. *(D-09 discusses the user's request to search ranked rooms; this is the recommended compromise.)*
- Room names: max 32 chars, profanity-filtered, can be reported.

## Room codes & joining

- A code is 6 characters from the 31-symbol alphabet (about 887M combinations), generated with `crypto.randomInt`, collision-checked among live rooms, and never reused while its room lives.
- `room.join { code }` is the only way into a `custom-private` room without an invite. `room.join { roomId }` is accepted only when the room is `custom-public` (listed in the browser) **or** the user holds a pending party or friend invite to that room. Otherwise the server answers exactly as it does for a wrong code.
- Every join failure (unknown code, private room joined by id, room full, match already started, kicked from this room earlier, or a block between the joiner and the host or any player in the room, in either direction) returns the same `error { code: 'ROOM_UNAVAILABLE' }` to the joiner, shown as "This room isn't available.", so codes and room ids cannot be probed. There is no "you are blocked" wording anywhere. The real reason is logged server-side with ids only.
- Rate limits: 10 code attempts per minute per user and 30 per minute per IP. Ten consecutive failures start a 5-minute join cooldown, reported as `cooldownUntil` in the error. *(Provisional.)*
- A shareable link `https://<site>/r/K7MPQ3` carries the code through the landing-screen age gate, sign-in and first-time onboarding in the OAuth `state` / return-URL parameter. Only the exact pattern `/r/` plus 6 code-alphabet characters is accepted as a return URL. The code is used for a single `room.join { code }` once the account is ready. A visitor who fails the age gate never reaches it.
