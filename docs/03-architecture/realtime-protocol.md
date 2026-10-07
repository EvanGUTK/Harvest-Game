# Real-time Protocol (`packages/protocol`)

## Transport

- One WebSocket per tab: `wss://<api-host>/ws?ticket=<one-time-ticket>`.
- JSON text frames: `{ v: 1, t: "<type>", id?: string, d: <payload> }`.
  - `v` = protocol major version. On mismatch the server replies `error{code:'PROTOCOL_VERSION'}`, and the client prompts a reload.
  - `id` = client-chosen correlation id for request/response. Server replies echo it.
- Every inbound payload is validated with **zod**. Invalid frames are dropped and counted, and at 20 invalid frames per minute the socket is closed.
- Heartbeat: server `ping` every 20 s. A client that misses two pongs is considered disconnected. This also keeps idle connections alive through proxies.

## Authentication

1. The client (with session cookie) calls `POST /api/ws-ticket`, which returns `{ ticket }`: random 32 bytes, single-use, 30 s TTL, stored in memory and bound to the userId.
2. The client opens the socket with `?ticket=`. The server consumes the ticket and binds the connection to the user.
3. The server enforces **one active game connection per user**. A new connection with the same user supersedes the old one, and the old one gets `session.replaced`.

Why tickets: browsers can't set headers on WebSocket upgrades. Putting a long-lived session token in a URL leaks it into logs.

## Clock sync

The server includes `serverNow` in `hello` and in every `phase` message. The client keeps `offset = median(serverNow − localNowAtReceive − rtt/2)` over the last 5 samples. Countdowns render as `deadline − (Date.now() + offset)`. **Deadlines are enforced only by the server.**

## Message catalogue (v1)

### Client → Server

| Type | Payload | Notes |
|---|---|---|
| `queue.join` | `{ mode: 'casual' \| 'ranked' }` | Party leader only for casual parties |
| `queue.leave` | `{}` | |
| `ready.accept` / `ready.decline` | `{ readyCheckId }` | |
| `room.create` | `{ settings: RoomSettings; visibility: 'public' \| 'private' }` | Custom rooms |
| `room.join` | `{ code } \| { roomId }` | |
| `room.leave` | `{}` | |
| `room.ready` | `{ ready: boolean }` | |
| `room.start` | `{}` | Host only, custom rooms |
| `room.kick` | `{ userId }` | Host only, custom rooms |
| `rooms.subscribe` / `rooms.unsubscribe` | `{ filter }` | Live room browser |
| `program.draft` | `{ source; rev }` | Every 10 s during coding plus on Lock-in. Max 16 KB |
| `program.lockIn` | `{ source; rev }` | Early lock |
| `finale.ack` | `{}` | Client finished the animation |
| `rematch.vote` | `{ yes: boolean }` | |
| `emote` | `{ emoteId }` | Rate-limited to 1 per 2 s |
| `party.invite` / `party.respond` / `party.leave` / `party.kick` | … | |
| `presence.set` | `{ status: 'online' \| 'away' \| 'invisible' }` | |

### Server → Client

| Type | Payload |
|---|---|
| `hello` | `{ userId, serverNow, protocol: 1, resume?: ResumeSnapshot }` |
| `queue.status` | `{ mode, searchingSince, estimatedWaitSec, playersInQueue }` |
| `ready.check` | `{ readyCheckId, acceptBy, players: n }` |
| `ready.update` | `{ accepted: n, total: n }` (no names until all accept) |
| `ready.failed` | `{ reason: 'you_declined' \| 'you_timed_out' \| 'other_declined'; requeued: boolean; cooldownUntil? }` |
| `room.state` | full `RoomState` snapshot (on join/reconnect) |
| `room.patch` | partial updates (player joined/left/ready, settings) |
| `phase` | `{ phase, deadline?, serverNow }` |
| `match.preview` | `{ seed, rulesVersion, languageVersion, grid, startCredits }` (sent at coding start) |
| `match.events` | `{ chunk: n, of: n, events: SimEvent[] }` |
| `match.results` | `MatchResults` (scores, awards, programs, rewards, rank change) |
| `rooms.list` / `rooms.delta` | room browser data |
| `presence.update` | `{ userId, status, activity? }` (friends only) |
| `friend.request` / `party.invite` / `party.state` | social |
| `emote` | `{ fromSlot, emoteId }` |
| `error` | `{ code, message, ref?: id }` |
| `session.replaced` | `{}` |

## Reconnect

- On reconnect within **2 minutes**, `hello.resume` contains: current room snapshot, phase and deadline, **your last accepted draft source** (so you can keep coding), and any results you missed.
- Draft autosave also writes to `localStorage` every 3 s, so a crashed tab never loses more than a few seconds of typing. On resume, the client offers whichever copy is newer, local or server.
- Server-side, a disconnected player's room slot is held until the match ends.

## Versioning rules

- Adding optional fields or new message types is non-breaking.
- Removing or renaming anything bumps `v`. During rollout, the server accepts `v` and `v-1` for one release.
