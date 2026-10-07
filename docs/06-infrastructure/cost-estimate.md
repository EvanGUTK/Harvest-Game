# Cost Estimate

Rough monthly figures to plan with. **Verify current prices on each provider's pricing page before committing.** Prices change, and Render recently restructured plans. The provider limits quoted here were not re-verified when this file was last edited, so check each one when you create the account (the owner checklist is [connections](connections.md)).

| Stage | Render | Neon | Resend | Domain | Sentry | Total (approx.) |
|---|---|---|---|---|---|---|
| Dev (M0–M2) | $0 until the M2 deploy (local + free previews), then 1 small always-on instance for `staging` (~$7) | $0 (free plan) | $0 (free plan; dev logs codes to the console and previews use test OTP) | ~$1/mo amortised | $0 | **~$1, then ~$8** |
| Closed beta (≤ 200 players) | 2 small always-on instances (staging + prod) ≈ $14–$20, + any workspace fee | ~$5–$20 (Launch plan, for the 7-day restore window; see [hosting](hosting.md)) | $20 (Pro). The free plan caps at 100 emails/day and then stops sending, which is too low for code sign-in | ~$1 | $0 | **~$40–$60** |
| Public launch (≤ 5k MAU, ~200 CCU peak) | 1 standard instance (2 GB RAM) for prod + staging | ~$20–$70 | $20 (Pro, 50k emails/mo, no daily cap) | ~$1 | $0–$26 | **~$80–$200** |

From the M2 deploy until the closed beta, a single `staging` Render service is the only deployed environment and doubles as the test "prod". The separate `prod` service is created when the first external testers join. Previews run on free instances (see [environments-and-ci](environments-and-ci.md)).

## Cost drivers to watch
- **Execution CPU** is tiny (≤ 100 ms per showdown).
- **Free Farm receipts:** capped at 1 per user per minute, about 10 ms each.
- **WebSocket memory:** about 50–100 KB per connection, so 5k sockets ≈ 0.5 GB at the top of that range, on top of the Node process itself. That fits a 2 GB instance (Render Standard) but not a 512 MB Starter, so the Public launch row assumes Standard or larger. The closed beta (≤ 200 sockets, about 20 MB) fits a Starter. Check the RAM of each instance type on Render's pricing page.
- **Email volume:** one email per code sign-in, per email verification and per password reset. Budget at least 3 emails per active player per month, and watch the per-day shape, not just the monthly total.
- **Egress:** event logs are about 30 KB gzipped per showdown per player, and assets about 4 MB per first visit (served with immutable caching).

## Quotas that bite early
- **Resend free plan:** 3,000 emails/month, **100/day**, and 1 verified domain. Above the daily cap sending stops, so sign-in codes silently fail for the rest of the day. A closed-beta evening with many code sign-ins can exceed it. Move to Pro ($20) before any beta invite wave (see [hosting](hosting.md) §Domains & email).
- **Neon free plan:** 100 CU-hours/month, 0.5 GB storage, 5 GB egress, and a restore window of only hours. Move to Launch before the closed beta (see [hosting](hosting.md) §Backups & restore).
- **Render instance RAM:** see WebSocket memory above.

## Asset budget (one-time)
| Item | Estimate |
|---|---|
| Hero voxel models (drones ×4, farmhouse, silo, avatar base) | $300–$900 commissioned |
| Adaptive music (3–5 tracks with stems) | $500–$2,500 commissioned, or a library license |
| SFX polish | $0 (CC0 + generated + self-recorded) to $300 |
