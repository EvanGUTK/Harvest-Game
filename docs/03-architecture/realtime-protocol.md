# Real-time Protocol (`packages/protocol`)

## Transport

- One WebSocket per tab: `wss://<api-host>/ws?ticket=<one-time-ticket>`.
- JSON text frames: `{ v: 1, t: "<type>", id?: string, d: <payload> }`.
  - `v` = protocol major version. On mismatch the server replies `error{code:'PROTOCOL_VERSION'}`, and the client prompts a reload.
  - `id` = client-chosen correlation id for request/response. Server replies echo it.
- Every inbound payload is validated with **zod**. Invalid frames are dropped and counted, and at 20 invalid frames per minute the socket is closed with code `4400`.
- Heartbeat: server `ping` every 20 s. A client that misses two pongs is considered disconnected. This also keeps idle connections alive through proxies.

## Abuse limits

Enforced per connection unless the Limit column says otherwise. A message over its limit is dropped and answered with `error{code:'RATE_LIMITED'}`; **3 strikes within a minute close the socket with code `4429`**. Ping/pong control frames are not counted. The numbers are provisional: they live as named constants in `packages/protocol` and are tuned by the load test.

| Scope | Limit |
|---|---|
| `ws` server options | `maxPayload: 32 * 1024`, `perMessageDeflate: false` (no compression, so no compression bombs), `clientTracking: true` |
| Connections | 1 game connection per user (a new one supersedes the old), 20 per IP, 5,000 per instance. Beyond the instance cap the upgrade is refused with HTTP `503` and `Retry-After`. The per-IP cap is the first number to relax if shared networks such as schools hit it |
| Any message | 30 per 10 s per connection |
| `program.draft` | 1 per 2 s. `rev` must be greater than the last accepted `rev`, otherwise the frame is dropped without a strike. Only the latest draft is kept per player (no history) |
| `program.lockIn` | Once per match. A repeat is ignored, never a strike, so a late lock-in is not lost to the draft limit |
| `room.create` | 5 per 10 min per user; at most 1 live room hosted per user |
| `room.join` by code | 10 per min per user and 30 per min per IP; 10 failures trigger a 5 min cooldown |
| `rooms.subscribe` | 1 active subscription per connection; `rooms.delta` throttled to 1 per s server-side |
| `queue.join` / `queue.leave` | 6 per min |
| `party.invite`, `friend.request` | 10 per min and 100 per day |
| `presence.set`, `room.ready`, `rematch.vote`, `finale.ack` | 1 per s |
| `emote` | 1 per 2 s |
| Outbound backpressure | If `socket.bufferedAmount > 1 MB`, pause sending `match.events` chunks. If it is still above 1 MB after 10 s, close with `4408` (slow reader). The client then reconnects and rebuilds the event log locally from the programs and seed in `hello.resume` or `match.results` (see [saves-and-persistence](saves-and-persistence.md) §Replays); `GET /api/matches/:id/replay` serves the same inputs once the match is stored |
| Invalid frames | 20 per min, then close with `4400` |

**Close codes.** `4400` too many invalid frames; `4401` authentication failed (below); `4408` slow reader; `4429` rate-limit strikes.

**Server CPU budget.** Validate with zod before any lookup. Never compile drafts: compilation happens once, at lock.

## Authentication

1. The client (with its session cookie) calls `POST /api/ws-ticket`. The route uses the same-site cookie plus the `Origin` allowlist from [auth](auth.md) and is limited to 10 per minute per user. The response is `{ ticket }`: `crypto.randomBytes(32)` encoded as base64url, single-use, 30 s TTL, held in memory as `ticket → { userId, sessionId, expiresAt }`. At most **one outstanding ticket per session**: issuing a new one invalidates the old.
2. The client opens `wss://<host>/ws?ticket=…`. Before allocating any per-connection state, the server checks `Origin` against the allowlist, consumes the ticket atomically (constant-time compare, entry deleted before use) and verifies that the `sessionId` still exists in the `session` table. It then binds the connection to `{ userId, sessionId }`. Any failure closes the socket with code `4401`. Upgrade attempts are limited to 30 per minute per IP before authentication.
3. **Session revocation closes sockets.** Sign-out, "sign out everywhere", password reset, account deletion and moderator bans delete `session` rows and emit an in-process `session.revoked(sessionId | userId)` event. The connection manager sends matching sockets `session.revoked {}` and closes them, and the client returns to sign-in without auto-reconnecting. As a backstop for revocations made on another instance later, every connection re-checks every 5 min that its `sessionId` is still valid (a primary-key lookup).
4. The server enforces **one active game connection per user**. A new connection with the same user supersedes the old one, and the old one gets `session.replaced`.

Why tickets: browsers can't set headers on WebSocket upgrades, and putting a long-lived session token in a URL leaks it into logs. A ticket is useless once used or after 30 s, so a logged URL leaks nothing.

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
| `program.draft` | `{ source; rev }` | Every 10 s during coding plus on Lock-in. Max 16 KB. Rate and `rev` rules: see Abuse limits |
| `program.lockIn` | `{ source; rev }` | Early lock |
| `finale.ack` | `{}` | Client finished the animation |
| `rematch.vote` | `{ yes: boolean }` | |
| `emote` | `{ emoteId }` | Rate-limited to 1 per 2 s |
| `party.invite` / `party.respond` / `party.leave` / `party.kick` | … | |
| `presence.set` | `{ status: 'online' \| 'away' \| 'invisible' }` | |

### Server → Client

| Type | Payload |
|---|---|
| `hello` | `{ userId, serverNow, protocol: 1, resume?: ResumeSnapshot, draining?: { until, message } }` (`draining` only while the server is draining) |
| `queue.status` | `{ mode, searchingSince, estimatedWaitSec, playersInQueue }` |
| `ready.check` | `{ readyCheckId, acceptBy, players: n }` |
| `ready.update` | `{ accepted: n, total: n }` (no names until all accept) |
| `ready.failed` | `{ reason: 'you_declined' \| 'you_timed_out' \| 'other_declined'; requeued: boolean; cooldownUntil? }` |
| `room.state` | full `RoomState` snapshot (on join/reconnect) |
| `room.patch` | partial updates (player joined/left/ready, settings) |
| `room.left` | `{ reason: 'kicked' \| 'host_closed' \| 'room_expired' \| 'blocked' }` sent to a player who is no longer in a room through no action of their own (see notes below) |
| `phase` | `{ phase, deadline?, serverNow }` |
| `match.preview` | `{ seed, rulesVersion, languageVersion, grid, startCredits }` (sent at coding start) |
| `match.events` | `{ chunk: n, of: n, events: SimEvent[] }` |
| `match.results` | `MatchResults` (scores, awards, programs, rewards, rank change) |
| `rooms.list` / `rooms.delta` | room browser data |
| `presence.update` | `{ userId, status, activity? }` (friends only) |
| `friend.request` / `party.invite` / `party.state` | social |
| `emote` | `{ fromSlot, emoteId }` |
| `error` | `{ code, message, ref?: id }` |
| `session.replaced` | `{}` another connection for this user took over; this socket is then closed |
| `session.revoked` | `{}` this session was signed out, revoked or banned; this socket is then closed and the client returns to sign-in |
| `server.draining` | `{ until: number; message: string }` broadcast to every connection at `SIGTERM` (see Server drain) |

**Notes on the added messages.**

- `room.left` goes only to the removed player; the remaining members receive an ordinary `room.patch`. Reasons: `kicked` (the host removed you; kicks are Lobby-only), `host_closed` (the host closed the room), `room_expired` (idle expiry, see [rooms-and-lobbies](rooms-and-lobbies.md) §Lifecycle), `blocked` (a block between you and another member, see [social](social.md)). The client returns to the Multiplayer hub with a toast for the reason. A kicked player's later `room.join` for that room, by code or by `roomId`, gets `error{code:'ROOM_UNAVAILABLE'}` for the rest of the room's lifetime. It is the same reply as for a room that does not exist.
- `error.code` values defined in this document: `PROTOCOL_VERSION`, `RATE_LIMITED`, `SERVER_DRAINING`, `ROOM_UNAVAILABLE`.

## Reconnect

- On reconnect within **2 minutes**, `hello.resume` contains: current room snapshot, phase and deadline, **your last accepted draft source** (so you can keep coding), and any results you missed.
- Draft autosave also writes to `localStorage` every 3 s, so a crashed tab never loses more than a few seconds of typing. On resume, the client offers whichever copy is newer, local or server.
- Server-side, a disconnected player's room slot is held until the match ends.

## Server drain

On `SIGTERM` (see [hosting](../06-infrastructure/hosting.md)) the server broadcasts `server.draining` to every connection, and connections that arrive during the drain get the same payload as `hello.draining`. `until` is a server-clock timestamp (the same clock as `serverNow`): the server's best estimate of when new rooms and queue entries are accepted again. It is informational. The client clears the banner when a reconnect returns a `hello` without `draining`, and shows the reload prompt if `hello.protocol` has a new major.

While draining:

- `queue.join`, `room.create`, `room.join` and `rematch.vote` are refused with `error{code:'SERVER_DRAINING'}`. The client disables the matching buttons up front (see [screen-flow](../05-ux/screen-flow.md)).
- Rooms already running continue through Results, which omits the rematch vote, and then close as usual.
- Reconnect and resume work normally. Campaign and Free Farm use REST and are unaffected.

## Versioning rules

- Adding optional fields or new message types is non-breaking.
- Removing or renaming anything bumps `v`. During rollout, the server accepts `v` and `v-1` for one release.
