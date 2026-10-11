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

Why tickets: browsers can't set headers on WebSocket upgrades, and putting a long-lived session token in a URL leaks it into logs. A ticket is useless once used or after 30 s, so a logged URL leaks nothing. The ticket query string is also stripped from our logs (see [observability](../06-infrastructure/observability.md#what-may-be-logged-pii-policy)).

## Clock sync

The server includes `serverNow` in `hello` and in every `phase` message. The client keeps `offset = median(serverNow − localNowAtReceive − rtt/2)` over the last 5 samples. Countdowns render as `deadline − (Date.now() + offset)`. **Deadlines are enforced only by the server.**

## Message catalogue (v1)

### Client → Server

| Type | Payload | Notes |
|---|---|---|
| `queue.join` | `{ mode: 'casual' \| 'ranked' }` | Party leader only for casual parties |
| `queue.leave` | `{}` | |
| `queue.acceptBots` | `{}` | Answers `queue.botsOffer`. Solo ticket only (see [matchmaking](matchmaking.md)) |
| `ready.accept` / `ready.decline` | `{ readyCheckId }` | |
| `room.create` | `{ settings: RoomSettings; visibility: 'public' \| 'private' }` | Custom rooms |
| `room.join` | `{ code } \| { roomId }` | `roomId` only for `custom-public` rooms or with a pending party or friend invite. Every failure returns `error{code:'ROOM_UNAVAILABLE'}`, so codes and ids cannot be probed |
| `room.leave` | `{}` | |
| `room.ready` | `{ ready: boolean }` | |
| `room.start` | `{}` | Host only, custom rooms |
| `room.kick` | `{ userId }` | Host only, custom rooms, Lobby only |
| `room.close` | `{}` | Host only, custom rooms, Lobby only (the **Close room** action). Everyone else in the room receives `room.left { reason: 'host_closed' }` |
| `rooms.subscribe` / `rooms.unsubscribe` | `{ filter }` | Live room browser |
| `spectate.join` | `{ roomId }` | Only `custom-public` and `matchmade-ranked` rooms past Lobby; any other room answers `error{code:'ROOM_UNAVAILABLE'}`. A room with 50 spectators answers `error{code:'SPECTATOR_LIMIT'}` *(cap provisional)*. Ships with spectating in M6 |
| `spectate.leave` | `{}` | |
| `program.draft` | `{ source; rev }` | Every 10 s during coding plus on Lock-in. Max 16 KB. Rate and `rev` rules: see Abuse limits |
| `program.lockIn` | `{ source; rev }` | Early lock |
| `finale.ack` | `{}` | Client finished the animation |
| `rematch.vote` | `{ yes: boolean }` | |
| `emote` | `{ emoteId }` | Rate-limited to 1 per 2 s |
| `party.invite` | `{ userId }` | Leader only, friends only. Rate limit: see Abuse limits |
| `party.respond` | `{ partyId: string; accept: boolean }` | Answers a `party.invite` before it expires (60 s) |
| `party.leave` | `{}` | |
| `party.kick` | `{ userId }` | Leader only |
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
| `room.patch` | partial updates (player joined/left, `ready` and `connected` changes in Lobby, settings, and `hostUserId` when the host role migrates) |
| `room.left` | `{ reason: 'kicked' \| 'host_closed' \| 'room_expired' \| 'blocked' }` sent to a player who is no longer in a room through no action of their own (see notes below) |
| `phase` | `{ phase, deadline?, serverNow }` |
| `match.preview` | `{ seed, rulesVersion, languageVersion, grid, startCredits }` (sent at coding start; `seed` is a uint32) |
| `match.events` | `{ chunk: n, of: n, events: SimEvent[], standings?: [{ slot, score }] }` (`standings` on the last chunk only) |
| `match.results` | `MatchResults` (scores, awards, programs, rewards, rank change). Each player's own entry also carries `output: string[]` (the first 200 `print` lines of the official run), sent only to that player and never to rivals or spectators |
| `rooms.list` / `rooms.delta` | room browser data |
| `presence.update` | `{ userId, status, activity? }` (friends only) |
| `friend.request` | `{ fromUserId, fromHandle }` |
| `party.invite` | `{ partyId, fromHandle, expiresAt }` |
| `party.state` | `{ partyId, leaderId, members: [{ userId, handle, status: 'online' \| 'offline' }], inviteExpiresAt? }` (a member going offline arrives here; see [social](social.md)) |
| `queue.botsOffer` | `{ expiresAt }` solo ticket only, after 90 s with fewer than 2 humans (see [matchmaking](matchmaking.md)) |
| `spectate.state` | the `RoomState` without drafts, sent once on `spectate.join` |
| `spectators` | `{ count }` sent to players and spectators, throttled to 1 per s |
| `emote` | `{ fromSlot, emoteId }` |
| `error` | `{ code, message, ref?: id, cooldownUntil?: number, until?: string \| null }` (`cooldownUntil`: join cooldown, `until`: `BANNED` only, `null` = permanent) |
| `session.replaced` | `{}` another connection for this user took over; this socket is then closed |
| `session.revoked` | `{}` this session was signed out, revoked or banned; this socket is then closed and the client returns to sign-in |
| `server.draining` | `{ until: number \| null; message: string }` broadcast to every connection when a drain starts (`until` set) or is cancelled (`until: null`); see Server drain |

**Notes on the added messages.**

- `room.left` goes to each player who is no longer in a room through no action of their own. For `kicked` and `blocked` that is only the removed player, and the remaining members receive an ordinary `room.patch`; for `host_closed` and `room_expired` the room is gone and every member receives it (except the host who closed it). Reasons: `kicked` (the host removed you; kicks are Lobby-only), `host_closed` (the host used **Close room**, Lobby only; the client shows "The host closed this room."), `room_expired` (the server closed the room: idle expiry, see [rooms-and-lobbies](rooms-and-lobbies.md) §Lifecycle, or a drain closing Lobby rooms), `blocked` (a block between you and another member, see [social](social.md)). The client returns to the Multiplayer hub with a toast for the reason. A kicked player's later `room.join` for that room, by code or by `roomId`, gets `error{code:'ROOM_UNAVAILABLE'}` for the rest of the room's lifetime. It is the same reply as for a room that does not exist.
- `error.code` values defined in this document are always SCREAMING_CASE: `PROTOCOL_VERSION`, `RATE_LIMITED`, `ROOM_UNAVAILABLE`, `SPECTATOR_LIMIT`, `BANNED`, `MAINTENANCE` and `SERVER_RESTARTING` (the last two: see Server drain).
  - `ROOM_UNAVAILABLE` is the single answer to every refused join or spectate (unknown code, room full, match started, kicked earlier, a block, or a private room joined by id) and the client renders it as "This room isn't available." It never reveals that a block caused it. During a join cooldown (see Abuse limits) the same code carries `cooldownUntil`.
  - `BANNED` is `error { code: 'BANNED', until: string | null }` (`null` = permanent), sent on `hello`, `queue.join` and `room.join` for a banned user (see [auth](auth.md)).
- **Spectators.** After `spectate.join` a spectator receives `spectate.state`, then `phase`, `match.preview`, `match.events` and `match.results` exactly as players do. `match.events` is sent from chunk 1, so a spectator who joins mid-finale can catch up. Spectators receive `room.left { reason: 'room_expired' }` when the room closes and cannot send `emote` or `rematch.vote`. The cap is 50 per room *(provisional)*.
- **Final standings.** The last `match.events` chunk (`chunk == of`) carries `standings: [{ slot, score }]`, the final credits per slot after liquidation. A client that skips the finale shows the standings table from it immediately and waits for `match.results` for rewards and awards (see [scoring-and-judging](../01-game-design/scoring-and-judging.md)).

## Reconnect

- On reconnect within **2 minutes**, `hello.resume` contains: current room snapshot, phase and deadline, **your last accepted draft source** (`resume.draft`, so you can keep coding), and any results you missed.
- After 2 minutes the slot is **still held until the match ends**. The reconnecting client then receives `room.state` and `phase` (with the last accepted draft while the phase is coding), and `match.results` if the match has already ended.
- Draft autosave also writes to `localStorage` every 3 s, so a crashed tab never loses more than a few seconds of typing. On resume the client compares its `localStorage` draft with `resume.draft`. If the server has the player locked, the server copy wins. Otherwise the newer copy is loaded and the editor shows an undo toast offering the other copy (see [screen-flow](../05-ux/screen-flow.md) §Connection states).

## Server drain

Deploys drain the server *before* the process is stopped; the sequence (admin `drain`, wait for `roomsActive == 0`, deploy, `SIGTERM`) is in [hosting](../06-infrastructure/hosting.md) §Render specifics. The protocol side is:

- **Drain starts.** The server broadcasts `server.draining { until, message }` to every connection, and connections that arrive during the drain get the same payload as `hello.draining`. `until` is a server-clock timestamp (the same clock as `serverNow`): the latest time the server will wait for running matches before it restarts. It is informational. `message` is display text for the maintenance banner.
- **While draining**, `queue.join`, `room.create`, `room.join` and `rematch.vote` are refused with `error{code:'MAINTENANCE'}`; the client disables the matching buttons up front (see [screen-flow](../05-ux/screen-flow.md)). Rooms still in **Lobby** are closed at once, and their players receive `room.left{reason:'room_expired'}`. Rooms already in coding, locking, executing or finale run through Results, which omits the rematch vote, and then close as usual. Reconnect and resume work normally, and Campaign and Free Farm use REST and are unaffected.
- **Drain cancelled** (`undrain`). The server broadcasts `server.draining { until: null, message: '' }` and the client clears the banner.
- **`SIGTERM`.** The server sends every socket `error{code:'SERVER_RESTARTING'}` and closes it. The client treats this as a disconnect: it reconnects with the normal backoff and keeps the banner up until a `hello` arrives without `draining`. If that `hello.protocol` has a new major, the client shows the reload prompt instead.

## Versioning rules

- Adding optional fields or new message types is non-breaking.
- Removing or renaming anything bumps `v`. During rollout, the server accepts `v` and `v-1` for one release.
