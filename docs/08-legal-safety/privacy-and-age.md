# Privacy & Age

> Not legal advice. Have a lawyer review before public launch, especially if marketing to schools.

## Age

- **Launch audience: 13+.** The sign-in screen states it, and onboarding asks for a birth year (a neutral age gate that doesn't pre-fill or hint the "right" answer). Under 13 is told the game isn't available yet, and no account is created or stored.
- Why: a game that "teaches kids to code" will attract under-13s. Collecting their data (email, gameplay) triggers **COPPA** in the US (verifiable parental consent), and the **GDPR** age of digital consent is 13–16 depending on the EU country. Supporting that properly (parental consent flows, teacher-managed accounts) is a separate product: "Classroom mode", post-launch.
- Keep age-sensitive defaults for everyone anyway: no free-text chat, no public profile details beyond handle, level, rank and cosmetics.

## Data we collect (minimise)

| Data | Why | Retention |
|---|---|---|
| Email | Sign-in, account recovery | Until account deletion |
| Google account id | OAuth sign-in | Until deletion |
| Handle, cosmetics, progress, matches | Game function | Until deletion; match records anonymised after |
| Programs (source) | Replays, verification | Showdown programs kept with the match. Campaign files until deletion |
| IP address | Rate limiting, abuse | Logs ≤ 30 days |
| Analytics events | Product improvement | Aggregated; ≤ 13 months; no third-party ad trackers |

## User rights

- **Export:** a JSON download of profile, saves, match history and programs.
- **Delete:** soft-delete immediately (sign out everywhere, hide profile), hard-delete after 30 days. Match rows keep `user_id = null` and the handle "deleted player" so other players' replays still work.
- Cookie banner: only needed if non-essential cookies or analytics are used. Prefer cookieless analytics to avoid it.
