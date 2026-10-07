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

Each tier spans **100 RP**. At 100 RP you promote to the next tier with 0 RP carried plus any overflow. At below 0 RP you demote to the previous tier with 75 RP.

- **Demotion shield:** right after promoting to a new *division*, the first 3 games can't demote you.
- **Iron III floor:** you can't go below Iron III 0 RP.
- **Diamond I** has no cap. RP keeps rising, and the top 100 Diamond I players are shown on a public leaderboard.

## "No hidden MMR": what that means here

The concept says matchmaking should not use hidden MMR. In this design:
- The **only rating is visible RP and division.** Matchmaking pairs on division and tier (see [matchmaking](../03-architecture/matchmaking.md)).
- RP gains and losses depend only on **placement and your current division**, not on a secret skill number.

**Trade-off, stated honestly:** without hidden MMR, a strong new player has to climb through every tier, and opponents along the way have a bad time. Mitigations that stay within "no hidden MMR":
1. **Placements:** your first 5 ranked games start you at Bronze III and pay **double RP**. Winning every placement game puts you around Silver II.
2. **Win-streak bonus:** +5 RP per consecutive 1st place, max +15.
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
- **Mixed-division lobby adjustment:** for each opponent you beat who is 1+ tiers above you, +3 RP. For each opponent below you who beats you, −3 RP. This is visible arithmetic, shown in the results breakdown, so it still isn't hidden MMR.
- **Abandon/leave:** treated as 4th and adds the leaver penalty (see matchmaking).

## Seasons

- Seasons are about 3 months long, with names like "Season 1: Sowing".
- **Soft reset:** each player drops 3 tiers at season start, with a minimum of Iron I, and plays 3 placement games.
- **End-of-season rewards** are by highest division reached: a drone decal, a profile frame and a badge, all cosmetic and season-stamped.
- Rules version can change between seasons. Mid-season balance patches bump the minor version only and are announced.

## Ranked integrity
- Ranked only comes from the **queue**. You can't create a ranked room by code, which prevents win-trading with friends.
- Parties can't queue ranked in v1, which also prevents boosting. *(D-12: allow duo queue later within ±1 division.)*
- Ranked rooms appear in the room browser **as spectate-only listings** once spectating ships (M6+).
