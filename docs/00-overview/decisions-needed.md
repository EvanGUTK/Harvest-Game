# Decisions Needed

Every open question has a **recommended default** that the docs already assume. To approve, tick it. To change it, edit the row and update the linked docs.

| ID | Question | Recommended default | Alternatives | Affects |
|---|---|---|---|---|
| D-01 | Names: game **Code Harvest**, language **Sprout** | Keep both as working titles. Run a trademark and domain search before M7 | Rename later | Branding, domain |
| D-02 | Is typed code central, or are blocks enough? | **Typed Python-style text is primary.** Blocks are an input mode for tablets and Ch1–3 that generates text | Blocks-first | editor-ux, curriculum |
| D-03 | One currency or two? | **Two:** farm credits (campaign) + wallet credits (cosmetics) | One shared currency (simpler, but lets showdown winners skip the curriculum, or idle farms print cosmetics) | economy, data-model |
| D-04 | What does "efficiency" mean? | **Max credits within a fixed cycle budget.** Fewer cycles only breaks ties and earns the ⚡ award | Score = credits ÷ cycles (rewards tiny programs that halt early, which is weird) | scoring |
| D-05 | Can players see rivals' code? | **Only after the match** (results + replay) | Never; or live (kills private experimentation) | multiplayer-modes |
| D-06 | Three rounds (original concept) or one 10-minute round? | **One 10:00 round** for casual and ranked (as you described). "Best of 3 Sprints" as a casual variant later | 3 × 2-minute rounds | multiplayer-modes |
| D-07 | Do grid edges wrap? | **Yes.** Fewer beginner "stuck at wall" errors, elegant sweeps | Walls (adds a sensor + more errors) | farm-simulation |
| D-08 | Ready-check window | **20 s** | 30 s (your original idea) | matchmaking |
| D-09 | "Search rooms for casual **or ranked**" | Casual and custom rooms are joinable in the browser. **Ranked shows spectate-only** listings, because joinable ranked rooms invite win-trading | Ranked custom rooms that give no RP | rooms-and-lobbies |
| D-10 | Ranked format | **4-player FFA**. Add a 1v1 Duel queue when ranked concurrency > ~200 | 1v1 only; 8 FFA | ranked-ladder |
| D-11 | "No MMR" | **Visible RP/division only**, with placements, streak bonus and a campaign gate to soften smurfing | Hidden MMR as a within-division tiebreaker | ranked-ladder, matchmaking |
| D-12 | Parties in ranked | **No (v1).** Duo within ±1 division later | Allow | matchmaking |
| D-13 | Text chat | **None in v1.** Quick-chat + emotes | Friends-only filtered chat | social, moderation |
| D-14 | Minimum age | **13+** | Under-13 with parental consent (needs a whole compliance project) | privacy |
| D-15 | Monetisation | **None at launch.** Later: optional cosmetic-only supporter packs. **Never** loot boxes or pay-to-win | Ads (bad fit), subscriptions | economy, legal |
| D-16 | Hosting topology | **Render single service** (serves client + API + WS) + **Neon**. Not ChatGPT Sites | Split static/API; other clouds | hosting |
| D-17 | Runtime error during a showdown | **Drone stops for the rest of the match** (crops keep growing, nothing more is harvested) | Auto-restart program from the top (forgiving but confusing) | errors, scoring |
| D-18 | `random()` in ranked | **Disabled** | Allowed with per-player seeded stream | stdlib |
| D-19 | Offline Free Farm earnings | **No (v1)** | Server-side idle sim (compute cost) | campaign |
| D-20 | Unsold crops at match end | **Liquidated at 50 % of final price** | 0 (harsh), 100 % (removes selling skill) | economy |
| D-21 | Phones | **Spectate, replays, profile, shop, and Blocks-mode campaign.** Text coding is optimised for keyboard and tablet | Full phone coding support | screen-flow |
| D-22 | Project priority | The original note said **Paper Trading Arena** is the active project. This repo is design-only until you say otherwise | Start M0 now | roadmap |
