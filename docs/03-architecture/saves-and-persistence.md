# Saves & Persistence

## What is stored where

| Data | Location | Durability |
|---|---|---|
| Campaign save (unlocks, farm credits, program files) | `campaign_save` | Durable, versioned |
| Editor draft between saves | `localStorage` (per tab) | Best-effort, 3 s cadence |
| Showdown draft during coding | Server memory (room) + `localStorage` | For the duration of the match |
| Locked showdown programs | `match_program` | Durable, permanent (for replays) |
| Event logs | Regenerated from inputs on demand: by the client for replays, by the server when it streams the live run for the finale. **No object storage and no server-side cache in v1** | Not stored |
| Live rooms, queues, presence | Server memory | Lost on restart (acceptable v1) |

If replay or finale load ever becomes measurable, the first option is a `match_event_log (match_id, gz bytea)` table in Neon (about 30 KB gzipped per match, see [simulation-engine](simulation-engine.md)). An S3-compatible store would need a new ADR and an entry in the [connections inventory](../06-infrastructure/connections.md) first.

## Campaign save protocol

- `GET /api/campaign` returns `{ version, state, files, farm_credits }`.
- `PUT /api/campaign` with `If-Match: <version>` saves the editor files and settings only. **Clients can't write credits or unlocks directly.**
- State-changing operations are dedicated endpoints that validate server-side:
  - `POST /api/campaign/contracts/:contractId/start`: issues a contract attempt (`{ attemptId, seed }`).
  - `POST /api/campaign/free-farm/start`: issues a Free Farm session (`{ sessionId, seed, startedAt }`).
  - `POST /api/campaign/runs`: a run receipt for one of those attempts or sessions. The server re-simulates, then credits farm credits and records contract completion.
  - `POST /api/campaign/unlock { nodeId }`: checks prerequisites and cost, then deducts farm credits.
- A version conflict (two tabs) returns 409, and the client offers "Load newer save" or "Keep mine (overwrite files only)".

## Run receipts (anti-cheat for single-player)

### Receipts are bound to a server-issued attempt

The client never chooses the seed.

- **Contracts:** `POST /api/campaign/contracts/:contractId/start` inserts a `contract_attempt` row and returns `{ attemptId, seed }`. The seed is derived on the server from `(contractId, rulesVersion, attemptId)` with `splitmix32`, or is fixed per contract where the design wants identical layouts.
- **Free Farm:** `POST /api/campaign/free-farm/start` returns `{ sessionId, seed, startedAt }`. There is **one active session per user**. Starting a new one invalidates the old, and the old tab shows "Free Farm is running in another tab". A receipt for an unknown or superseded session is rejected with `409 FREE_FARM_SESSION_STALE`.

A receipt contains `{ attemptId | sessionId, source, startStateHash, cycles, claimedResult }`. Free Farm receipts also carry a `sequence` that must be strictly greater than the last accepted one for that session. The server looks up the contract and seed from the attempt or session.

### Server verification

1. Loads the attempt or session (it must belong to the caller and be unused or active) and the authoritative save, then checks `startStateHash` against the save (farm size, unlocks, drone upgrades). A contract `attemptId` that already has a `run_receipt` row, or a Free Farm `sequence` that is not greater than the last accepted one, is rejected with `409 RECEIPT_ALREADY_USED`.
2. Compiles with the player's unlocked features (`lockedFeatures`). A locked feature means the receipt is rejected.
3. Applies the caps.
   - **Contracts:** the contract's cycle budget bounds the claim. `Max` speed exists only here (and in showdown test runs).
   - **Free Farm:** the speed selector offers 1×, 4× and 16× only (`FREE_FARM_MAX_SPEED = 16` in `content`, so at `CYCLES_PER_SECOND = 100` that is 1,600 cycles/s). Cycles are counted per session: the total of the session's accepted receipts plus this one must satisfy `cycles ≤ (now − startedAt) × 1_600 + 5 % slack` (`now − startedAt` in seconds), so a client can't claim a week of farming from a 5-minute session. Each receipt is also capped at `FREE_FARM_RECEIPT_MAX_CYCLES = 200_000`.
   - A receipt over any cap is rejected, not clamped.
4. Simulates `cycles` from the server-issued seed and compares results. On a match it grants. On a mismatch it grants the *server's* result and logs the anomaly.

Cost: a Free Farm receipt is at most one VM run of ≤ 200k cycles, which is about 10 ms of CPU (at the 16× cap and one receipt per 60 s it is about 100k cycles). Receipts are sent at most once per 60 s per user.

### Payout rules

- The wallet reward and XP of a contract are paid **once per `(user, contractId)`**, on first completion, with ledger key `contract:<contractId>:<userId>`. The ★★★ reward uses `contract-star:<contractId>:<userId>`.
- A repeat completion pays no wallet credits or XP, but `contract_attempt.succeeded` is recorded every time.
- Free Farm receipts credit farm credits only and never touch the wallet.

### Outcomes and player-facing copy

| Status | Response | Player sees |
|---|---|---|
| `granted` | `200 { granted }` | Nothing; farm credits update |
| `mismatch` | `200 { granted: serverCredits, mismatch: true }` | Credits update to the server value, with a toast: "Credited ₵312. We recalculated this run on the server (your browser showed ₵340). If this keeps happening, reload the game to get the latest rules." |
| `rejected` | `409 { code, reason }` | "This run couldn't be verified, so no credits were added. Your program uses something that isn't unlocked yet, or your save is out of date. Reloading your save…" |
| Rate cap hit | `429` with `Retry-After` | "Verifying your farm… next check in 42 s." The client paces itself, so players should not normally see this |

`code` is `RECEIPT_REJECTED` (with a `reason` of `locked_feature`, `start_state` or `over_cap`), `RECEIPT_ALREADY_USED` or `FREE_FARM_SESSION_STALE`. 409 is reserved for receipts that could not be verified. A contract completion on a `mismatch` still counts if the server result meets the goal, and the results panel shows the server's cycles.

## Replays

`GET /api/matches/:id/replay` returns `{ seed, rulesVersion, languageVersion, settings, programs[] }`. The client imports the matching `lang` and `sim` version and regenerates the event log locally.

**Old engine versions.** The web build bundles the current engine and lazy-loads archived ones from `/engines/v<lang>.<rules>.js` (the `LANGUAGE_VERSION` and `RULES_VERSION` majors the bundle ran under). Archived bundles are single ESM files (`lang` + `sim`) built by the `engines.yml` workflow when a major bump retires an engine, then committed under `apps/web/public/engines/`. They are git-tracked and immutable, an explicit exception to the "build outputs are gitignored" rule. See Release process in [environments-and-ci](../06-infrastructure/environments-and-ci.md). If a match's `(languageVersion, rulesVersion)` matches no bundled engine, the endpoint returns `410 ENGINE_RETIRED` and the client shows "This replay is from a retired engine".

**Access.**
- Sign-in is required.
- Participants can always open their match's replay.
- Matchmade (casual, ranked) and `custom-public` replays are readable by any signed-in player, because seeing how the winner did it is the teaching payoff. `custom-private` and `practice` replays are readable only by their participants.
- Blocked users can't open each other's replays.
- Responses are `Cache-Control: private, max-age=3600`.
- Match ids are UUIDv4, and there is no listing of other players' matches. Match history shows your own.

**Deleted players.** Their `match_program.source` stays, because replays must reproduce, but `#` comments are stripped at hard-delete. The results UI shows "deleted player" and hides the "copy into my sandbox" link for that slot.
