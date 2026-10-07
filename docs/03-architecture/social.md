# Social: Friends, Presence, Parties

## Identity

- Every account picks a **unique handle** at first sign-in: 3–16 chars from `[a-z0-9_]`, case-insensitive unique, profanity-filtered, and changeable once per 30 days.
- The display name is the handle. There is no separate free-text display name in v1, to reduce moderation surface.

## Friends

| Action | Rules |
|---|---|
| Send request | By handle search (exact or prefix ≥ 3 chars), from a results screen, or from a room player list. Max 20 pending outgoing |
| Accept / decline | Declines are silent (the sender sees "pending" until it expires after 30 days) |
| Remove | Silent, mutual |
| Block | Hides each other everywhere: no requests, no invites, no shared custom rooms (blocked players can't join your room). Matchmaking avoids pairing blocked players when possible |
| Limit | 200 friends |

## Presence

`status`: online, away (no input for 5 min), in-queue, in-lobby, in-match (+ mode), offline. Users can also set **invisible**.

- Presence is held in server memory, keyed by userId, and pushed to **online friends only** via `presence.update`.
- Activity text examples: "In Campaign: Chapter 3", "Ranked: coding (Gold II)", "In lobby (3/8)". Join buttons appear when the activity is joinable (custom public room or party with space).

## Parties

- 1–4 players. The leader invites friends, and invites expire in 60 s.
- The party sees each other's status. The leader queues for **casual**, and the party is matched together. Ranked parties are disabled in v1 (D-12).
- The leader can also create a custom room, and the whole party joins automatically.

## Friends panel (UI)

A slide-out panel available from every screen:

```
Friends (12 online)            [+ Add]
▸ Party (2/4)   [Leave]
   maple_rows ★ leader
   you
▾ Online
   byte_farmer  ◆ Gold II   Ranked: coding      
   sproutling   Lv 7       Campaign Ch 3       [Invite]
▾ Offline (31)
▸ Requests (2)
```

## Communication

- v1 has **no free-text chat.** Quick-chat lines and emotes only, from a fixed list in `content`. This avoids needing chat moderation at launch and is safer for a 13+ audience.
- Post-v1 option: friends-only text chat with a filter, report and mute (D-13).

## Data

Tables: `friendships(user_a, user_b, created_at)` with `a < b`, `friend_requests`, `blocks`. See [data-model](data-model.md).
