# Cost Estimate

Rough monthly figures to plan with. **Verify current prices on each provider's pricing page before committing.** Prices change, and Render recently restructured plans.

| Stage | Render | Neon | Resend | Domain | Sentry | Total (approx.) |
|---|---|---|---|---|---|---|
| Dev (M0–M2) | $0 (local + free previews) | $0 (free plan) | $0 (free tier) | ~$1/mo amortised | $0 | **~$1** |
| Closed beta (≤ 200 players) | 1 small always-on instance (+ any workspace fee) | $0–$20 | $0 | ~$1 | $0 | **~$10–$40** |
| Public launch (≤ 5k MAU, ~200 CCU peak) | 1 standard instance + staging | ~$20–$70 | ~$20 (if > free quota) | ~$1 | $0–$26 | **~$80–$200** |

## Cost drivers to watch
- **Execution CPU** is tiny (≤ 100 ms per showdown).
- **Free Farm receipts:** capped at 1 per user per minute, about 10 ms each.
- **WebSocket memory:** about 50–100 KB per connection, so 5k sockets ≈ 0.5 GB.
- **Egress:** event logs are about 30 KB gzipped per showdown per player, and assets about 4 MB per first visit (served with immutable caching).

## Asset budget (one-time)
| Item | Estimate |
|---|---|
| Hero voxel models (drones ×4, farmhouse, silo, avatar base) | $300–$900 commissioned |
| Adaptive music (3–5 tracks with stems) | $500–$2,500 commissioned, or a library license |
| SFX polish | $0 (CC0 + generated + self-recorded) to $300 |
