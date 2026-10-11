# Moderation

## Surfaces that need moderation

| Surface | v1 control |
|---|---|
| Handles | `[a-z0-9_]` only, profanity/slur filter (leetspeak-normalised), reserved words (admin, mod, staff, official…), report button |
| Custom room names | Same filter, 32 chars, report button |
| Program source shown in results | `print` strings and comments can contain text. Apply the filter when **displaying** other players' code (mask matches with `***`). Players can report code |
| Quick-chat / emotes | Fixed list, so no content filter is needed. Spamming them at someone is still reportable as `harassment` |

## Report sheet (player-facing)

One sheet for every surface, opened from:

- the **player card** (lobby, friends panel, results),
- the room-name row in the **room browser** or lobby header,
- the **⚑ Report** link above a player's code in Results and Replay.

| Field | Rule |
|---|---|
| Title | "Report maple_rows" for a player, "Report room 'Lunch break showdown'" for a room name |
| Category | Required, exactly one of the values below |
| Note | Optional, ≤ 500 chars (matches `report.note`) |

Categories (stored as `report.category`):

| Value | Label shown | Use for |
|---|---|---|
| `offensive_handle` | Offensive handle | A player's handle |
| `offensive_room_name` | Offensive room name | A custom room name (the report targets the host who named it) |
| `offensive_code_text` | Offensive text in code | `print` strings or comments in a displayed program |
| `cheating_or_collusion` | Cheating or collusion | Ranked collusion, suspected tampering, sharing code mid-match |
| `harassment` | Harassment | Targeted abuse, including emote or quick-chat spam |
| `other` | Something else | Anything else; the note is encouraged |

Behaviour:

- Submit shows the toast "Thanks. We'll review this report."
- One report per reporter per target per 24 h. A repeat shows "You've already reported this player today." (A room-name report counts against the host.)
- `report.match_id` is filled automatically when the report starts from Results or Replay, so the moderator can open the exact program. It is `null` otherwise.

## Report flow

Report → `report` row → moderator queue (simple admin page, M8) → action: warn, force handle change, temp ban (queue + rooms), or permanent ban. Every action is logged in the `moderation_action` table ([data-model](../03-architecture/data-model.md)); bans are `profile.banned_until` / `ban_reason`; force handle change sets `handle_change_required`.

## Automated signals

- Repeated reports against a user within 24 h raise priority
- Ranked collusion signals (see security doc)
- Excessive queue declines are already handled by cooldowns
