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
| **Badge** | See above | Player card |
| **Emote / quick-chat set** | "gg", "nice loop!", "🌽", "hmm…" | Lobby + results |
| **Editor theme** | Soil, Dawn, Midnight, High-contrast | Only you |

## Shop

- A weekly rotating shop with 6 items, plus a permanent catalogue. Everything is priced in **wallet credits** only.
- Rarity tiers set price and visual flair: Common ₵200, Uncommon ₵500, Rare ₵1,200, Legendary ₵3,000.
- **No loot boxes.** Every item is a direct purchase at a visible price. This is deliberate for player trust and to stay clear of gambling-regulation scope.
- Pricing goal: an engaged player (about 5 showdowns plus 2 contracts per day) can buy one Rare a week.

## Unique crop *skins* vs. crops

The concept mentions "different crops may yield more money". Crop *types* with different values are campaign **skill-tree unlocks** (gameplay), and every crop is available in multiplayer. Crop *skins*, like golden corn or striped melon, are cosmetic only.

## Data model

Every cosmetic is a row in `packages/content/cosmetics` with an `id`, `slot`, `rarity`, `price`, `assetRef`. Ownership lives in `user_cosmetics`, and the equipped loadout lives in `profiles.loadout` (jsonb, validated by zod). See [data-model](../03-architecture/data-model.md).
