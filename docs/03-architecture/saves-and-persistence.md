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
  - `POST /api/campaign/unlock { nodeId }`: checks prerequisites and cost, then deducts farm credits. It rejects with `409 { code: 'UNLOCK_REJECTED', reason }` (`reason` is `chapter_locked`, `prereq_missing` or `insufficient_credits`) when the server-side check fails, for example because another tab or device changed the save. The client shows "That didn't work: your save changed on another device. Reloading..." and refetches `GET /api/campaign`.
- Every run-receipt grant and every `POST /api/campaign/unlock` increments `campaign_save.version` (see [data-model](data-model.md)). Responses that change the save (`granted`, `mismatch`, unlock) return the new `version`, so the client's next `PUT` does not conflict with its own grant.
- A version conflict (two tabs) returns 409, and the client offers "Load newer save" or "Keep mine (overwrite files only)".

## Run receipts (anti-cheat for single-player)

### Receipts are bound to a server-issued attempt

The client never chooses the seed.

- **Contracts:** `POST /api/campaign/contracts/:contractId/start` inserts a `contract_attempt` row and returns `{ attemptId, seed }`. The seed is derived on the server from `(contractId, rulesVersion, attemptId)` with `splitmix32`, or is fixed per contract where the design wants identical layouts.
- **Free Farm:** `POST /api/campaign/free-farm/start` returns `{ sessionId, seed, startedAt }` and inserts a `free_farm_session` row (see [data-model](data-model.md)). There is **one active session per user**.
  - A session starts from an **empty farm** at the unlocked size on the issued seed. Crops don't carry over between sessions, credits do.
  - A session runs **one program**. Changing the program or pressing Reset ends the session and starts a new one.
  - Starting a session in a second tab supersedes the first. The first tab shows "Free Farm is running in another tab" with a **Use this tab** button, which starts a new session there. A receipt for an unknown or superseded session is rejected with `409 FREE_FARM_SESSION_STALE`.

A receipt contains `{ contractId | 'free_farm', attemptId | sessionId, source, seed, startStateHash, cycles, claimedResult }`. The server looks up the contract and seed from the attempt or session and uses its own seed, not the echoed one.

Free Farm receipts are **cumulative for their session** and also carry:
- `sequence`, strictly greater than the last accepted one for that session.
- `cycles`, counted from the session's cycle 0 (not from the previous receipt), so the server can replay the whole session from the issued seed. A farm is one continuous state, so a segment can't be verified on its own.
- `sellAllAt: number[]`, the cycle count (cycles simulated so far) at which each **Sell all** press happened, since the session began. A press is an out-of-band, zero-cycle action: it sells the whole silo at the chapter prices. The re-simulation applies each press after every program event with time ≤ that cycle and before any later one. Without this list, one press would make every receipt of the session mismatch.

### Server verification

1. Loads the attempt or session (it must belong to the caller and be unused or active) and the authoritative save, then checks `startStateHash` against the save (farm size, unlocks, drone upgrades). A contract `attemptId` that already has a `run_receipt` row, or a Free Farm `sequence` that is not greater than the last accepted one, is rejected with `409 RECEIPT_ALREADY_USED`.
2. Compiles with the player's unlocked features (`lockedFeatures` and `lockedNames`). A locked feature or name means the receipt is rejected.
3. Applies the caps.
   - **Contracts:** the contract's cycle budget bounds the claim. `Max` speed exists only here (and in showdown test runs).
   - **Free Farm:** the speed selector offers 1×, 4× and 16× only (`FREE_FARM_MAX_SPEED = 16` in `content`, so at `CYCLES_PER_SECOND = 100` that is 1,600 cycles/s). The receipt's cumulative `cycles` must satisfy `cycles ≤ (now − startedAt) × 1_600 + 5 % slack` (`now − startedAt` in seconds, from the `free_farm_session` row), so a client can't claim a week of farming from a 5-minute session. `cycles` must also exceed the last accepted receipt's. Because the server replays from cycle 0, `cycles` is capped at `FREE_FARM_RECEIPT_MAX_CYCLES = 200_000`; at that point the client ends the session and starts a new one.
   - The farm keeps running in a hidden tab and never catches up lost time, so the wall-clock cap is only ever under-run, never exceeded.
   - A receipt over any cap is rejected, not clamped.
4. Simulates `cycles` from the server-issued seed and compares results. On a match it grants. On a mismatch it grants the *server's* result and logs the anomaly with ids only (`userId`, `receiptId`, a hash of `sessionId`), never the source (see [observability](../06-infrastructure/observability.md#what-may-be-logged-pii-policy)).

For Free Farm, **credits already granted in the session** are the sum of `verified_credits` over that session's accepted `run_receipt` rows, so no extra column is needed. The grant is the server's total for the replayed session minus that sum.

Cost: a Free Farm receipt replays its session from the seed, so it is at most one VM run of ≤ 200k cycles, which is about 10 ms of CPU. Receipts are sent at most once per 60 s per user.

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
