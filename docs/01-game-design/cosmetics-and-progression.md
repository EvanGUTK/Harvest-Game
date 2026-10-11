# Cosmetics & Progression

Everything here is **visual or social only**. Nothing bought affects simulation stats in multiplayer.

## Account progression

| System | Earned by | Shows as |
|---|---|---|
| **XP / Level** (1–100) | Contracts, showdowns (more for placing well), daily first game | Level number + profile frame color band every 10 levels |
| **Badges** | Achievements, awards, season rewards, campaign ★★★ | Up to 3 equipped badges on the player card |
| **Rank emblem** | Ranked ladder | Next to name in lobbies and the friends list |

## Cosmetic slots

| Slot | Examples | Visible to rivals where |
|---|---|---|
| **Drone body** | Classic quad, Harvester (heavier, boxy), Dragonfly, Weather balloon | Lobby card, finale, replay |
| **Drone paint** | Solid colors, two-tone, weathered copper, season decals | Same |
| **Drone trail** | Seed sparkles, dust puff, pollen, none | Finale, replay |
| **Farmer avatar** | Head / hat / outfit / accessory (voxel character at the farmhouse) | Lobby card, podium |
| **Farm backdrop** | Valley, Mesa, Pine ridge, Rice terraces, Autumn orchard, Night market | Your own farm in finale & replays, plus the profile page |
| **Silo skin** | Wooden, tin, brick, glass greenhouse | Finale money-tower animation |
| **Profile frame** | Level-band frames (free, every 10 levels), season-stamped frames (ranked reward), premium shop designs | Player card, lobby card |
| **Emote / quick-chat set** | "gg", "nice loop!", "🌽", "hmm…" | Lobby + results |
| **Editor theme** | Soil, Dawn, Midnight, High-contrast | Only you |

The **High-contrast** editor theme is owned by default (it is an accessibility feature, not a purchase).

**Badges are never sold.** Badges are earned only (achievements, awards, season rewards, campaign ★★★) and are not catalogue cosmetics. They live in `profile.equipped_badges`, not in `packages/content/cosmetics` or `profile.loadout`. The vision's "credits buy level badges" maps to **profile frames**: level and season frames are free unlocks, and premium frame designs are bought with wallet credits like any other slot (decision D-26).

## Shop

- A weekly rotating shop with 6 items, plus a permanent catalogue. Everything is priced in **wallet credits** only.
- The 6-item weekly rotation flips every Monday at 00:00 UTC (the shop screen counts down to it).
- **Purchases are idempotent:** the client sends a UUID `Idempotency-Key`; owning the item already returns `409 ALREADY_OWNED`; an insufficient wallet returns `409 INSUFFICIENT_CREDITS` (see Wallet invariants in [data-model](../03-architecture/data-model.md)).
- Rarity tiers set price and visual flair: Common ₵200, Uncommon ₵500, Rare ₵1,200, Legendary ₵3,000.
- **No loot boxes.** Every item is a direct purchase at a visible price. This is deliberate for player trust and to stay clear of gambling-regulation scope.
- Pricing goal: 5 showdowns a day plus the daily first win earns about ₵1,600 (all casual) to ₵2,200 (all ranked) a week, i.e. one Rare every 4–5 days or a Legendary every 9–13 days. Contracts pay a one-time wallet bonus (₵30 per contract, ₵80 for a ★★★ challenge; see [campaign-and-skill-tree](campaign-and-skill-tree.md)). That is a boost, not an income, because the campaign has only about 30–50 contracts in total. `[SIM-BAL]` revisit prices with real play data.

## Unique crop *skins* vs. crops

The concept mentions "different crops may yield more money". Crop *types* with different values are campaign **skill-tree unlocks** (gameplay), and every crop is available in multiplayer. Crop *skins*, like golden corn or striped melon, are cosmetic only.

## Data model

Every cosmetic is a row in `packages/content/cosmetics` with an `id`, `slot`, `rarity`, `price`, `assetRef`. Ownership lives in `user_cosmetic`, and the equipped loadout lives in `profile.loadout` (jsonb, validated by zod). Badges are the exception: they are an enum in `packages/content/badges` with no price, and equipping writes `profile.equipped_badges` (max 3). See [data-model](../03-architecture/data-model.md).
