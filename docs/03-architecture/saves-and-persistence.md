# Saves & Persistence

## What is stored where

| Data | Location | Durability |
|---|---|---|
| Campaign save (unlocks, farm credits, program files) | `campaign_save` | Durable, versioned |
| Editor draft between saves | `localStorage` (per tab) | Best-effort, 3 s cadence |
| Showdown draft during coding | Server memory (room) + `localStorage` | For the duration of the match |
| Locked showdown programs | `match_program` | Durable, permanent (for replays) |
| Event logs | Regenerated from inputs. Optional object-storage cache | Cache only |
| Live rooms, queues, presence | Server memory | Lost on restart (acceptable v1) |

## Campaign save protocol

- `GET /api/campaign` returns `{ version, state, files, farm_credits }`.
- `PUT /api/campaign` with `If-Match: <version>` saves the editor files and settings only. **Clients can't write credits or unlocks directly.**
- State-changing operations are dedicated endpoints that validate server-side:
  - `POST /api/campaign/runs`: a run receipt. The server re-simulates, then credits farm credits and records contract completion.
  - `POST /api/campaign/unlock { nodeId }`: checks prerequisites and cost, then deducts farm credits.
- A version conflict (two tabs) returns 409, and the client offers "Load newer save" or "Keep mine (overwrite files only)".

## Run receipts (anti-cheat for single-player)

A receipt contains `{ contractId | 'free_farm', source, seed, startStateHash, cycles, claimedResult }`.

The server:
1. Loads the authoritative save, checks `startStateHash` against it (farm size, unlocks, drone upgrades).
2. Compiles with the player's unlocked features (`lockedFeatures`). A locked feature means the receipt is rejected.
3. Simulates `cycles`. **Free Farm cap:** `cycles ≤ (now − lastReceiptAt) × maxSpeed × cyclesPerSecond`, so a client can't claim a week of farming from a 5-minute session.
4. Compares results. On a match it grants. On a mismatch it grants the *server's* result and logs the anomaly.

Cost: a free-farm receipt is at most one VM run of ≤ 200k cycles, which is about 10 ms of CPU. Receipts are sent at most once per 60 s per user.

## Replays

`GET /api/matches/:id/replay` returns `{ seed, rulesVersion, languageVersion, settings, programs[] }`. The client imports the matching `lang` and `sim` version and regenerates the event log locally. To support old versions, the web build bundles the current major and lazy-loads older majors from `/engines/v<major>.js`.
