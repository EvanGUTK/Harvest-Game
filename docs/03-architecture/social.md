# Social: Friends, Presence, Parties

## Identity

- Every account picks a **unique handle** at first sign-in: 3–16 chars from `[a-z0-9_]`, case-insensitive unique, profanity-filtered, and changeable once per 30 days.
- The display name is the handle. There is no separate free-text display name in v1, to reduce moderation surface.

## Friends

| Action | Rules |
|---|---|
| Send request | By handle search (exact or prefix ≥ 3 chars), or from the [player card](#player-card) (results screen, lobby or room player list). Max 20 pending outgoing |
| Accept / decline | Declines are silent (the sender sees "pending" until it expires after 30 days) |
| Remove | Silent, mutual |
| Block | Hides each other everywhere: no requests, no invites, no shared custom rooms (blocked players can't join your room). Blocking also removes any friendship and cancels pending requests in both directions. Matchmaking avoids pairing blocked players when possible. Unblock from the blocked-players list in Settings |
| Limit | 200 friends |

## Player card

Tapping any handle (lobby card, results table, replay, room browser host, friends panel, leaderboard) opens a **player card** overlay on any screen. It shows the handle, level, rank emblem, equipped badges and equipped drone. Actions:

- **Add friend** (becomes **Pending**, then **Friends ✓**)
- **Invite to party** (friends only, when your party has space)
- **Block**
- **Report**, which opens the shared report sheet in [moderation](../08-legal-safety/moderation.md)

Your own card shows no actions. Match history is never shown on another player's card.

**Block** asks for confirmation: *"Block maple_rows? You won't see each other's rooms, invites or requests. This also removes them from your friends."* Blocking a party member removes them from the party. Blocking someone who is in your current room or match takes effect from the next room: it never removes anyone from a match in progress.

A blocked player who joins a room you host by code or link sees *"This room isn't available."* The server never says "you are blocked".

## Presence

`status`: online, away (no input for 5 min), in-queue, in-lobby, in-match (+ mode), offline. Users can also set **invisible**.

- Presence is held in server memory, keyed by userId, and pushed to **online friends only** via `presence.update`.
- Activity text examples: "In Campaign: Chapter 3", "Ranked: coding (Gold II)", "In lobby (3/8)". Join buttons appear when the activity is joinable (custom public room or party with space).

## Parties

- 1–4 players. The leader invites friends, and invites expire in 60 s.
- The party sees each other's status. The leader queues for **casual**, and the party is matched together. Ranked parties are disabled in v1 (D-12).
- The leader can also create a custom room, and the whole party joins automatically.

**Party UI states**

- **Incoming invite:** a toast on any screen: *"maple_rows invited you to a party"* with [Join] and [Ignore]. It dismisses itself at 60 s, when the invite expires. Accepting while you are in a queue leaves the queue ("Left queue to join party").
- **Leader, Find Match:** the Casual button reads *"Search as a party of 3"* (the actual party size).
- **Member, Find Match:** the Casual button is disabled and reads *"Only the party leader can start the search"*. Every member sees the queue pill while the party is searching.
- **Ranked card, in a party of 2 or more (leader or member):** *"Ranked is solo-only for now. Leave the party to queue ranked."* (D-12).
- **Member goes offline:** `party.state` arrives with that member marked offline, and the party's queue ticket is cancelled (see [matchmaking](matchmaking.md)). The remaining members see the toast *"Search stopped: sproutling went offline."*
- **Party full:** the Invite button is disabled and reads *"Party is full (4/4)"*.

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

Tables: `friendship(user_a, user_b, created_at)` with `a < b`, `friend_request`, `block`. See [data-model](data-model.md).
