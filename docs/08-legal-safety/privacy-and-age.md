# Privacy & Age

> Not legal advice. Have a lawyer review before public launch, especially if marketing to schools.

## Age

- **Launch audience: 13+.** The age gate runs **on the landing screen, before sign-in**, so an under-13 never reaches a sign-in option and we never receive their email or Google id. Players with a live session skip the landing screen and never see the gate.
  1. The landing screen asks "When were you born?" with a **month and year** picker. It is neutral: no default, no hint, no highlighted "right answer".
  2. The client computes the age in whole years from the birth month and year and the current month and year, and passes when `age ≥ 13`. Month granularity means a visitor can be at most a few weeks younger than computed, which is why the gate asks for the month and not only the year (year alone would admit a 12-year-old born late in the year). The day is not asked, because it adds no privacy cost worth the extra friction beyond the month. The lawyer confirms this rule before public launch.
  3. If `age < 13`: show "Code Harvest isn't available for your age yet." and set a client flag (cookie plus localStorage, 24 h) so the question can't be re-answered straight away. **Nothing is sent to the server**: no account, email or Google id is ever received.
  4. If `age ≥ 13`: the sign-in options (Google, email) appear. The browser keeps only the boolean pass and sends it with the handle claim at first sign-in; the server sets `profile.birth_year_confirmed_13plus` and rejects a claim without it (see [auth](../03-architecture/auth.md)).
  5. The birth year is discarded in both branches. It is never sent, stored or logged. The only thing we keep is the boolean `profile.birth_year_confirmed_13plus` (see [data-model](../03-architecture/data-model.md)).
- There is no "abandon account" endpoint, because an under-13 never has an account to abandon.
- The gate is a self-declaration, not age verification, and the 24 h flag is a speed bump rather than enforcement. Real verification (parental consent) belongs to the post-launch "Classroom mode" product.
- **Onboarding after the first sign-in** is: pick a handle, then accept the Terms and Privacy Policy. Acceptance is versioned: we store the accepted version and the time, so a later version can be shown again.
- Why: a game that "teaches kids to code" will attract under-13s. Collecting their data (email, gameplay) triggers **COPPA** in the US (verifiable parental consent), and the **GDPR** age of digital consent is 13–16 depending on the EU country. Supporting that properly (parental consent flows, teacher-managed accounts) is a separate product: "Classroom mode", post-launch.
- Keep age-sensitive defaults for everyone anyway: no free-text chat, no public profile details beyond handle, level, rank and cosmetics.

## Data we collect (minimise)

Retention values are v1 defaults, and the published privacy policy must match them.

| Data | Where | Why (lawful basis) | Retention |
|---|---|---|---|
| Email, verified flag | `user` | Sign-in, account recovery (contract) | Until deletion |
| Google account id | `account` | OAuth sign-in (contract) | Until deletion |
| OTP hash + email | `verification` | Sign-in (contract) | 10 min TTL; expired rows purged hourly |
| Session id, IP address, user agent | `session` | Security, "sign out everywhere" (legitimate interest) | Session lifetime (≤ 30 days idle), then deleted |
| Age confirmation (13+ boolean only, never the birth year) | `profile.birth_year_confirmed_13plus` | Legal obligation | Until deletion |
| Terms / Privacy acceptance (`consent_event`: user, document, version, timestamp; mirrored as `profile.terms_version` and `privacy_version`) | `consent_event`, `profile` | Proof of consent (legal obligation) | Until account deletion |
| Handle, level, cosmetics, loadout, settings | `profile`, `user_cosmetic` | Game function | Until deletion |
| Campaign save + program files | `campaign_save` | Game function | Until deletion |
| Run receipts (include program source) | `run_receipt` | Anti-cheat | Source text cleared after 90 days. The row (hashes, cycles, credits, status) stays for replay protection and ledger audits, and is deleted with the account |
| Contract attempts | `contract_attempt` | Curriculum analytics | 12 months, then deleted (aggregates kept) |
| Showdown programs (source) | `match_program` | Replays, verification, shown to rivals at results | With the match. At the author's hard-delete the `#` comments are blanked in place (line numbers kept, execution unaffected); replays then show "deleted player" and hide the copy-to-sandbox link for that slot |
| Match results, rank, ledger | `match`, `match_player`, `rank_state`, `credit_ledger` | Game function | Until deletion; match rows kept with `user_id = null` ("deleted player") so replays still work |
| Queue penalties | `queue_penalty` | Fair play | 30 days |
| Reserved handle (the handle only, no link to a person) | `reserved_handle` | Stops impersonation of a deleted player | 90 days after hard-delete, then released |
| Reports (including the free-text note) | `report` | Safety (legitimate interest) | 12 months after resolution |
| IP address, in rate-limit and abuse log lines only (logs never carry cookies, WebSocket tickets, program source or email addresses; see [observability](../06-infrastructure/observability.md#what-may-be-logged-pii-policy)) | pino logs on the host | Security, rate limiting | ≤ 30 days (confirm the host's log retention; ship to a log drain with a 30-day limit if its default is longer) |
| Error events (user id, URL, breadcrumbs; IP not collected) | Sentry (processor) | Reliability | Vendor setting, target ≤ 90 days |
| Email delivery events | Resend (processor) | Deliverability | Vendor retention (verify; target ≤ 30 days) |
| Email suppression entry (SHA-256 of the address, reason, date) | `email_suppression` | Stop sending to bounced or complaining addresses (legitimate interest) | 12 months (provisional) |
| Product analytics | Plausible Cloud (cookieless, EU-hosted; decision D-25 in [decisions-needed](../00-overview/decisions-needed.md)). Events carry no user id, handle or email | Product improvement (legitimate interest) | Aggregated; ≤ 13 months; no third-party ad trackers |

- **Real player data lives only in the Neon `main` branch** (and its point-in-time-restore history). Dev, preview and staging databases hold only synthetic seed data: `dev` was branched from `main` while it was still empty, and everything else is branched from `dev`. Any temporary prod-shaped clone for load testing is anonymised and deleted within 24 h (see [hosting](../06-infrastructure/hosting.md#neon-specifics)).
- **Program source may contain personal text** (comments, `print` strings), and showdown source is shown to rivals after the match (D-05). The coding phase warns: *"Your code is shown to rivals after the match. Don't put personal info in comments."* Replays require sign-in, and custom-private and practice replays are readable by participants only (see [saves-and-persistence](../03-architecture/saves-and-persistence.md)).
- **Processors:** Render, Neon, Resend, Sentry, Google (OAuth), Cloudflare (Turnstile), and Plausible. The privacy policy lists each with its region and a link to its data-processing agreement.
- **Cookies:** we use only strictly-necessary cookies and local storage (the session cookie and the 24 h age-gate flag) plus cookieless analytics, so no consent banner is shown. Adding any non-essential cookie or tracker means adding a banner first.

## User rights

- **Export:** a JSON download of profile, saves, match history and programs (Settings → Account → Export my data). The player sees "We're preparing your export", then `codeharvest-export-<handle>-<date>.json` downloads (profile, campaign save including program files, match history, locked programs). One export per 24 h: "You can export again tomorrow."
- **Delete:** soft-delete immediately (sign out everywhere, hide profile), hard-delete after 30 days. Match rows keep `user_id = null` and the handle "deleted player" so other players' replays still work.

### Delete flow (Settings → Account → Delete account)

1. A dialog asks: "Delete your account? Your campaign, cosmetics, credits and rank will be permanently deleted after 30 days. Your past matches stay visible to other players as 'deleted player'. Type your handle to confirm." Buttons: [Cancel] [Delete account].
2. On confirm: set `deleted_at = now()`, sign out everywhere, hide the profile. Friends see the player as offline, and the player is removed from every friend list at hard-delete.
3. **Signing in during the 30 days cancels the deletion.** The sign-in shows "Your account was scheduled for deletion on {date}. Welcome back: deletion has been cancelled." This is the only recovery path, so there is no separate restore screen.
4. After 30 days the retention job (backlog DB-06) hard-deletes `user` and its dependants, sets `match_player.user_id` to null and blanks comment text in the player's `match_program` source.

### What the hard delete removes

One sentence per table, mirroring [data-model](../03-architecture/data-model.md#account-deletion-db-06-job-runs-nightly):

- **Sign-in records** (`user`, `account`, `session`, `verification`): deleted, including the Google account id.
- **Profile:** deleted. The handle goes into `reserved_handle` for 90 days so nobody can impersonate a deleted player, then it is released.
- **Campaign saves, contract attempts, run receipts (with their source) and Free Farm sessions:** deleted.
- **Credit ledger, cosmetics, rank state and queue penalties:** deleted. Economy totals read a daily aggregate written before deletion.
- **Friendships and blocks:** deleted, in both directions.
- **Match results** (`match_player`): `user_id` is set to null and the slot shows as "deleted player"; placement, score and stats stay so rivals' history and replays still work.
- **Showdown program source** (`match_program`): kept so replays reproduce, with the text of `#` comments blanked. Replays hide the copy-to-sandbox link for that slot.
- **Reports:** the reporter link is removed. Reports about the player lose the link and are purged 12 months after resolution (provisional). Moderation actions are kept without the user link.
- **Sentry events, logs and Resend records:** not deleted one by one; they expire by the retention periods in the table above.
- **Backups:** encrypted database backups are kept 30 days, and a restore re-applies pending hard deletions, so a deleted account is gone from backups within 30 days of the hard delete.

Signing in during the 30-day grace period cancels the deletion (step 3 above).

## Security contact and breaches

- Security reports go to `security@<domain>` (published in `/.well-known/security.txt`, see [observability](../06-infrastructure/observability.md)); we reply within 3 days.
- **Personal-data breach:** contain, assess and record it. Unless the breach is unlikely to put players at risk, notify the supervisory authority within 72 hours of becoming aware, and notify affected players without undue delay when the risk is high. The lawyer confirms this wording before public launch.
