# Moderation

## Surfaces that need moderation

| Surface | v1 control |
|---|---|
| Handles | `[a-z0-9_]` only, profanity/slur filter (leetspeak-normalised), reserved words (admin, mod, staff, official…), report button |
| Custom room names | Same filter, 32 chars, report button |
| Program source shown in results | `print` strings and comments can contain text. Apply the filter when **displaying** other players' code (mask matches with `***`). Players can report code |
| Quick-chat / emotes | Fixed list, so no moderation needed |

## Report flow

Report → `report` row → moderator queue (simple admin page, M8) → action: warn, force handle change, temp ban (queue + rooms), or permanent ban. Every action is logged.

## Automated signals

- Repeated reports against a user within 24 h raise priority
- Ranked collusion signals (see security doc)
- Excessive queue declines are already handled by cooldowns
