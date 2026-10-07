# Ranked Ladder

## Divisions and tiers

5 divisions × 3 tiers = **15 steps**, from lowest to highest:

```
Iron III → Iron II → Iron I →
Bronze III → Bronze II → Bronze I →
Silver III → Silver II → Silver I →
Gold III → Gold II → Gold I →
Diamond III → Diamond II → Diamond I
```

Each tier spans **100 RP**. At 100 RP you promote to the next tier with 0 RP carried plus any overflow.

- **RP never goes below 0 within a tier.** A loss that would take you below 0 leaves you at 0 and shows a **demotion warning** on your rank card. A further 3rd or 4th place while you are at 0 RP demotes you to the previous tier with 75 RP. Any RP gain clears the warning. (`rank_state.demotion_warning`.)
- **Demotion shield:** after **every** promotion (tier or division), the first 3 games can't demote you. Losses in those games still clamp at 0 RP, but they don't set the warning.
- **Iron III floor:** you can't go below Iron III 0 RP.
- **Diamond I** has no cap. RP keeps rising, and the top 100 Diamond I players are shown on a public leaderboard.

## "No hidden MMR": what that means here

The concept says matchmaking should not use hidden MMR. In this design:
- The **only rating is visible RP and division.** Matchmaking pairs on division and tier (see [matchmaking](../03-architecture/matchmaking.md)).
- RP gains and losses depend only on **placement and your current division**, not on a secret skill number.

**Trade-off, stated honestly:** without hidden MMR, a strong new player has to climb through every tier, and opponents along the way have a bad time. Mitigations that stay within "no hidden MMR":
1. **Placements:** your first 5 ranked games start you at Bronze III and double the RP you **gain** (losses are not doubled). Winning all five is worth 280 RP (5 × 2 × 28), plus the win-streak bonus (+45 over five wins, not doubled), which lands you at **Silver III with 25 RP**. Mixed-lobby adjustments are added after doubling, not doubled.
2. **Win-streak bonus:** a 1st place that follows *n* consecutive 1st places pays +5 × min(*n*, 3) RP, so +5, +10, then +15 at most. Any other placement resets the streak.
3. **Campaign prerequisite:** ranked unlocks at account level 10 *and* campaign Chapter 4 cleared. This filters out true beginners and gives everyone shared fundamentals.

*(D-11: if smurfing or stomping becomes a problem, add hidden MMR only as a matchmaking tiebreaker within the same division. Visible rank stays the source of truth.)*

## RP per game (4-player FFA)

| Placement | Iron | Bronze | Silver | Gold | Diamond |
|---|---|---|---|---|---|
| 1st | +30 | +28 | +26 | +24 | +22 |
| 2nd | +12 | +10 | +8 | +6 | +5 |
| 3rd | −8 | −10 | −12 | −14 | −16 |
| 4th | −15 | −18 | −21 | −24 | −28 |

- Higher divisions gain less and lose more, which makes the climb harder at the top.
- **Expected drift (25 % chance of each placement, before streak and lobby adjustments):** Iron +4.75, Bronze +2.5, Silver +0.25, Gold −2.0, Diamond −4.25 RP per game (the table's row sums are +19, +10, +1, −8, −17, divided by 4). This is intended. Everyone leaves Iron and Bronze with average play, **Silver is the resting point for an average player**, Gold needs roughly a 30 % first-place rate and Diamond roughly 35 %. The win-streak bonus is always positive and adds a little inflation on top. One game's standard deviation is about 18 RP, so single-tier moves are noisy by design. `[SIM-BAL]` re-check these values with the matchmaking metrics after the first season.
- **Mixed-division lobby adjustment:** for each opponent you beat who is 1+ tiers above you, +3 RP. For each opponent below you who beats you, −3 RP. This is visible arithmetic, shown in the results breakdown, so it still isn't hidden MMR.
- **Abandon/leave:** treated as 4th and adds the leaver penalty (see matchmaking).

## Seasons

- Seasons are about 3 months long, with names like "Season 1: Sowing". Season 1 is the first season.
- **Soft reset:** `newRank = max(rankIndex − 3, min(rankIndex, 2))`. Nobody is raised, and nobody drops below Iron I (Iron III and II players keep their tier). RP is set to 50, and the next **3 games are placements** that double gained RP like the initial 5.
- **End-of-season rewards** are by highest division reached (`peak_rank_index`): a drone decal, a profile frame and a badge, all cosmetic and season-stamped. They are granted automatically at rollover.
- Rules version can change between seasons. Mid-season balance patches bump the minor version only and are announced.

### Season UI

- **Season header** (ranked screen and results): "Season 1: Sowing · ends 14 Jan". In the last 7 days it turns amber and reads "Season ends in 3 days".
- **Season-end modal**, shown once on the first sign-in after rollover: "Season 1: Sowing has ended. Peak: Gold II. Rewards: Sowing drone decal, Gold frame, Gold badge [Equip]. You start Season 2 at Silver II with 3 placement games." [Continue]
- **Placement badge** on the rank card and in results: "Placement 3 of 5 · double RP" ("of 3" after a season reset). The results RP line reads "+52 RP (placement ×2)".
- **Shield line** in results when it applies: "Demotion shield used (2 games left)". **Demotion warning** on the rank card while the warning is set: "One more 3rd or 4th place demotes you."
- **Streak line:** "Win streak +10 RP". Mixed-lobby adjustments are listed as separate lines, e.g. "+3 beat higher-tier rival".

## Ranked integrity
- Ranked only comes from the **queue**. You can't create a ranked room by code, which prevents win-trading with friends.
- Parties can't queue ranked in v1, which also prevents boosting. *(D-12: allow duo queue later within ±1 division.)*
- Ranked rooms appear in the room browser **as spectate-only listings** once spectating ships (M6+).
