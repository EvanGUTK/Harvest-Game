# Privacy & Age

> Not legal advice. Have a lawyer review before public launch, especially if marketing to schools.

## Age

- **Launch audience: 13+.** The age gate runs **on the landing screen, before sign-in**, so an under-13 never reaches a sign-in option and we never receive their email or Google id. Players with a live session skip the landing screen and never see the gate.
  1. The landing screen asks "What year were you born?" It is a neutral picker: no default, no hint, no highlighted "right answer".
  2. The client computes `age = currentYear − birthYear`. We don't ask for month or day, so the check is conservative.
  3. If `age < 13`: show "Code Harvest isn't available for your age yet." and set a client flag (cookie plus localStorage, 24 h) so the question can't be re-answered straight away. **Nothing is sent to the server**: no account, email or Google id is ever received.
  4. If `age ≥ 13`: the sign-in options (Google, email) appear. The client attaches only the boolean pass result to the sign-in request, and the server doesn't create an account without it.
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
| Terms / Privacy version accepted + time | `profile` | Legal obligation | Until deletion |
| Handle, level, cosmetics, loadout, settings | `profile`, `user_cosmetic` | Game function | Until deletion |
| Campaign save + program files | `campaign_save` | Game function | Until deletion |
| Run receipts (include program source) | `run_receipt` | Anti-cheat | Source text cleared after 90 days. The row (hashes, cycles, credits, status) stays for replay protection and ledger audits, and is deleted with the account |
| Contract attempts | `contract_attempt` | Curriculum analytics | 12 months, then deleted (aggregates kept) |
| Showdown programs (source) | `match_program` | Replays, verification, shown to rivals at results | With the match. Comment text is blanked in place (line numbers kept, execution unaffected) when the author deletes their account |
| Match results, rank, ledger | `match`, `match_player`, `rank_state`, `credit_ledger` | Game function | Until deletion; match rows kept with `user_id = null` ("deleted player") so replays still work |
| Queue penalties | `queue_penalty` | Fair play | 30 days |
| Reports (including the free-text note) | `report` | Safety (legitimate interest) | 12 months after resolution |
| IP address + request metadata | pino logs on the host | Security, rate limiting | ≤ 30 days (confirm the host's log retention; ship to a log drain with a 30-day limit if its default is longer) |
| Error events (user id, URL, breadcrumbs; IP not collected) | Sentry (processor) | Reliability | Vendor setting, target ≤ 90 days |
| Email delivery events | Resend (processor) | Deliverability | Vendor retention (verify; target ≤ 30 days) |
| Product analytics | Cookieless PostHog (EU) or Plausible | Product improvement (legitimate interest) | Aggregated; ≤ 13 months; no third-party ad trackers |

- **Program source may contain personal text** (comments, `print` strings), and showdown source is shown to rivals after the match (D-05). The coding phase warns: *"Your code is shown to rivals after the match. Don't put personal info in comments."*
- **Processors:** Render, Neon, Resend, Sentry, Google (OAuth), Cloudflare (Turnstile), and PostHog or Plausible. The privacy policy lists each with its region and a link to its data-processing agreement.
- **Cookies:** we use only strictly-necessary cookies and local storage (the session cookie and the 24 h age-gate flag) plus cookieless analytics, so no consent banner is shown. Adding any non-essential cookie or tracker means adding a banner first.

## User rights

- **Export:** a JSON download of profile, saves, match history and programs (Settings → Account → Export my data). The player sees "We're preparing your export", then `codeharvest-export-<handle>-<date>.json` downloads (profile, campaign save including program files, match history, locked programs). One export per 24 h: "You can export again tomorrow."
- **Delete:** soft-delete immediately (sign out everywhere, hide profile), hard-delete after 30 days. Match rows keep `user_id = null` and the handle "deleted player" so other players' replays still work.

### Delete flow (Settings → Account → Delete account)

1. A dialog asks: "Delete your account? Your campaign, cosmetics, credits and rank will be permanently deleted after 30 days. Your past matches stay visible to other players as 'deleted player'. Type your handle to confirm." Buttons: [Cancel] [Delete account].
2. On confirm: set `deleted_at = now()`, sign out everywhere, hide the profile. Friends see the player as offline, and the player is removed from every friend list at hard-delete.
3. **Signing in during the 30 days cancels the deletion.** The sign-in shows "Your account was scheduled for deletion on {date}. Welcome back: deletion has been cancelled." This is the only recovery path, so there is no separate restore screen.
4. After 30 days the retention job (backlog DB-06) hard-deletes `user` and its dependants, sets `match_player.user_id` to null and blanks comment text in the player's `match_program` source.
