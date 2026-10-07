# Authentication

## Sign-in methods (all via Better Auth)

| Method | Flow | Notes |
|---|---|---|
| **Continue with Google** | OAuth 2.0 / OIDC redirect | Most players will use this. Email comes pre-verified. Hidden when `GOOGLE_CLIENT_ID` is unset (preview environments: Google redirect URIs cannot be wildcards, so previews use the email-code flow) |
| **Email code** (passwordless) | Enter email → 6-digit code via **Resend** → enter code | Better Auth `emailOTP` plugin. Code TTL 10 min, 5 attempts per code. The first successful code for an unknown address creates the account, so there is no separate sign-up for this method |
| **Email + password** | Create account → verify email with a 6-digit code → sign in | `emailAndPassword` with `requireEmailVerification`. Password ≥ 10 chars, checked against Have I Been Pwned (see [Breached-password check](#breached-password-check)) |
| Password reset | Email code → new password | Revokes other sessions |

**Account linking.** A social sign-in links to an existing user only when **both** sides are verified: the provider reports `email_verified = true` **and** the existing user has `emailVerified = true`. If the existing user is unverified (a dangling password sign-up for an address the signer may not own), the server deletes that user and its `credential` account and creates a fresh user for the Google identity. This closes the pre-hijack path: an attacker signs up with the victim's address and a password, the victim later clicks "Continue with Google", and without this rule the attacker's password would end up attached to the victim's account. Verified email-code and email + password sign-ins for the same address are one account. Users that are still unverified, or have no `profile` row because onboarding never finished, are deleted by a job 24 h after creation. Implementation: Better Auth account linking limited to Google, plus a `databaseHooks.user.create.before` hook for the purge. An SRV-02 test replays the attack sequence and asserts the attacker's password cannot sign in.

**Abuse protection.** Every route has a rate limit (one table: [security-anti-cheat](security-anti-cheat.md#rate-limits)). The email flows (send code, create account, reset) can additionally sit behind Cloudflare Turnstile, a feature flag that is off at M2 and switched on when sign-up floods or Resend quota burn appear. Google sign-in never needs it: Google is the bot filter.

**Google Cloud setup (OPS-03).** The OAuth client, redirect URIs and consent screen are set up as described in [hosting](../06-infrastructure/hosting.md#domains--email) and tracked in the owner checklist [connections](../06-infrastructure/connections.md). One consequence for this doc: while the consent screen is in **Testing**, only the listed test users (at most 100) can sign in with Google, so it must be published to **Production** before the closed beta (LEG-02b). Previews have no Google client; they sign in with the email-code flow (test OTP).

*(Optional later: GitHub OAuth for the programmer audience, and passkeys via Better Auth's passkey plugin.)*

### Breached-password check

Passwords are checked against Have I Been Pwned on sign-up, password change and reset (never on sign-in) with Better Auth's `haveIBeenPwned` plugin (`import { haveIBeenPwned } from 'better-auth/plugins'`).

- It calls the free, keyless Pwned Passwords range endpoint `https://api.pwnedpasswords.com/range/{first 5 hex of the SHA-1}` with `Add-Padding: true`. Only the 5-character prefix leaves our server.
- No account, API key or env var is needed. The server needs outbound HTTPS to `api.pwnedpasswords.com` (Render allows this by default).
- **Failure mode: fails closed.** The stock plugin throws `INTERNAL_SERVER_ERROR` ("Failed to check password. Please try again later.") when HIBP is unreachable or returns a non-2xx status, so the sign-up or password change is rejected. We accept this for v1: HIBP uptime is high and the check only runs on sign-up, change and reset. The client shows "Couldn't check that password. Try again in a moment." and the server counts `hibp_unavailable` in metrics. If fail-open is ever wanted, wrap the check in a custom `password` hook instead of using the plugin as is. Verify the plugin's behaviour against the installed Better Auth version in SRV-02.

## Landing screen: age gate, then sign-in

The landing screen is the first thing a signed-out visitor sees. The **13+ gate runs here, before any sign-in control is usable**, so an under-13 visitor never reaches Google, Resend or our database (see [privacy-and-age](../08-legal-safety/privacy-and-age.md)).

```
┌──────────────── CODE HARVEST ────────────────┐
│     (voxel farm idling in the background)     │
│                                               │
│   What year were you born?  [ Select year ▾ ] │
│                                               │
│   [ G  Continue with Google ]                 │
│   ─────────────── or ───────────────          │
│   Email  [______________________]             │
│   [ Send me a code ]   [ Use a password ]     │
│                                               │
│   Terms · Privacy Policy                      │
└───────────────────────────────────────────────┘
```

**Age gate rules**

- A neutral picker: no default value, no hint of the "right" answer, years listed newest first. The sign-in controls stay disabled until a year is picked.
- The answer is evaluated in the browser. The year is never sent to the server, logged or stored.
- **Under 13:** the sign-in controls are replaced by "Code Harvest isn't available for your age yet." and the browser sets a 24 h flag that keeps this message up if the visitor reloads or picks a different year. Nothing is sent to the server, so **no account, email address or Google id is ever received** from this visitor.
- **13+:** the browser remembers the pass (a flag, never the year), so returning players aren't asked again and the answer survives the Google redirect back to onboarding.
- This is a neutral self-declaration, not age verification. The server stores only the boolean `birth_year_confirmed_13plus` (see Onboarding).

The footer links to the current Terms and Privacy Policy. Acceptance is recorded in onboarding, not by pressing a sign-in button (see [Terms & privacy acceptance](#terms--privacy-acceptance)).

**Password variant** (after *Use a password*):

```
│   Email     [______________________]          │
│   Password  [______________________]          │
│   [ Sign in ]  [ Create account ]              │
│   Forgot password?                             │
```

**Code entry screen** (after *Send me a code* or *Create account*):

- "We sent a 6-digit code to e***@gmail.com". Six boxes with auto-advance and paste support.
- *Resend code* is disabled with a countdown ("Resend in 0:58"): one resend per 60 s and 3 codes per 10 min. At the limit: "Too many codes sent. Try again in 8 minutes, or check your spam folder."
- Wrong code: "That code isn't right (3 tries left)". After 5: "Too many tries. Request a new code." Expired: "That code expired. Request a new one."

**Password screen**

- *Sign in* with wrong credentials: "That email and password don't match." The text is the same whether or not the address has an account.
- *Create account* sets the password, then goes to the code entry screen, then to onboarding. If the address already has an account, no second account is made, the screens are identical, and the email that arrives says an account already exists, with a sign-in link. Sign-in and create account never reveal whether an address is registered.
- A hint under the field says "At least 10 characters". On submit, a breached password shows "This password appeared in a data breach. Choose another."
- *Forgot password?* → email code → "Choose a new password" → "Signed out of other devices."

## Onboarding

The first sign-in leads to **onboarding**, in this order:

1. **Handle:** 3–16 chars `[a-z0-9_]`. Live states: "Available ✓", "Taken: try maple_rows_2", "Not allowed: pick another name" (profanity or reserved word). The handle claim carries the browser's age pass, and the server sets `profile.birth_year_confirmed_13plus = true`. It rejects a claim without it and never receives a year. If the browser has no pass at this point (storage cleared mid-flow), the client signs out and returns to the landing screen. There is no "abandon account" endpoint: a user row left without a `profile` is removed by the 24 h purge job above.
2. **Terms & Privacy:** an explicit "I agree" step (see [Terms & privacy acceptance](#terms--privacy-acceptance)).
3. **Starter drone colour.**
4. **Tutorial contract 1-1.**

## Sessions

- Better Auth database sessions in Postgres, sent as an **HTTP-only, Secure, SameSite=Lax cookie**.
- Session length 30 days, rolling. "Sign out everywhere" in settings.
- **Domain layout matters for cookies:** serve the client and API under one registrable domain, e.g. `play.codeharvest.example` (static) and `api.codeharvest.example` (server), both as Render custom domains. Then the cookie is first-party and SameSite=Lax works. The alternative is to serve the built client *from the game server itself*, same origin, which is simplest of all (see hosting, option A).
- WebSocket auth uses one-time tickets (see [realtime-protocol](realtime-protocol.md)).
- **Revocation closes sockets.** Sign-out, "Sign out everywhere", password reset, account deletion and moderator bans delete the session rows, and the server closes every WebSocket bound to those sessions with `session.revoked` (see [realtime-protocol](realtime-protocol.md#authentication)). A hijacked session therefore stops playing the moment the victim revokes it.

## Terms & privacy acceptance

- The legal documents are versioned by date. `/terms` and `/privacy` serve the current version, each version is also reachable at a dated URL (`/terms/2026-10-07`, `/privacy/2026-10-07`), and each page ends with a changelog. The current versions are the constants `TERMS_VERSION` and `PRIVACY_VERSION` in `apps/server` config (not in `content`). Dated strings compare lexicographically.
- Acceptance is the onboarding step "I agree to the Terms and Privacy Policy", a button with links to the current versions (nothing pre-ticked). The server inserts one `consent_event(user_id, doc: 'terms' | 'privacy', version, accepted_at)` row per document and sets `profile.terms_version` and `profile.privacy_version`. Both are null until accepted. The 13+ answer is not part of the Terms step: it is the landing-screen gate.
- If `profile.terms_version < TERMS_VERSION` (or the same for privacy), or either is null, the server answers gameplay routes (`/api/campaign/*`, `POST /api/ws-ticket`) with `428 TERMS_OUTDATED`. The client then shows a blocking "We've updated our Terms" interstitial with a summary of the changes and an "I agree" button (during onboarding, this is step 2). Sign-out, data export and account deletion are never blocked.
- Material changes are announced in-game and by email at least 14 days before the new `TERMS_VERSION` takes effect.
- `consent_event` rows are deleted with the account at hard-delete.

## Account security

- **Email change** is not offered in v1: the verified email is the account key. If it is ever added, it must require a fresh sign-in (≤ 10 min), a code sent to the **new** address, and a notice to the **old** address with a one-click "This wasn't me" link that revokes all sessions.
- **Password change and reset** revoke all other sessions and close their sockets.
- **New-sign-in notice** (a sign-in from a browser or device the account hasn't used before) is **on** by default, with a one-click "sign out everywhere" link. It can be turned off in settings.
- The **breached-password check** runs on sign-up, change and reset (see above).

## Email (Resend)

- Verified sending domain `mail.<domain>` with SPF, DKIM and DMARC (records: [hosting](../06-infrastructure/hosting.md#domains--email)). **DMARC progression:** `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` for the first 2 weeks, then `p=quarantine`, then `p=reject` before launch. `From: Code Harvest <login@mail.<domain>>`, `Reply-To: support@<domain>`. The owner creates the `support@`, `dmarc@`, `security@` and `privacy@` aliases at the registrar or mail provider (tracked in [connections](../06-infrastructure/connections.md)).
- Templates: sign-in code, verify email, password reset, account-already-exists notice, new-sign-in notice (default on), terms-update notice, account-deletion scheduled.
- Rate limits: 3 codes per email per 10 min, 1 per address per 60 s, 10 per IP per hour. Codes are hashed at rest. Turnstile sits in front of the send endpoints when its flag is on.
- **Plan.** Pro from the closed beta onward. The free plan caps at 100 emails/day and then stops sending, which would silently stop sign-in codes (see [hosting](../06-infrastructure/hosting.md#domains--email) and [cost-estimate](../06-infrastructure/cost-estimate.md)).
- **Bounces and complaints.** `POST /api/webhooks/resend` verifies the Svix signature with `RESEND_WEBHOOK_SECRET` and handles `email.bounced` (hard bounces) and `email.complained` by inserting into `email_suppression ( email_hash, reason, created_at )`, keyed by a SHA-256 of the lowercased address, so no address is kept in the clear. Sends to a suppressed address are skipped server-side while the UI still says "If that email exists, we sent a code" (no enumeration). The one exception is **create account**: after a hard bounce the code screen's *Resend* shows "We couldn't deliver to that address. Check for typos.", because the player just typed it. Soft bounces are retried by Resend and we do nothing. A wrongly suppressed address is cleared by support. Continuing to send to bouncing or complaining addresses damages domain reputation, and Google and Yahoo's bulk-sender rules expect complaint rates well under 0.3 %.
- **Quota and metrics.** The free plan's daily cap and when to upgrade are in [hosting](../06-infrastructure/hosting.md#domains--email). Metrics: `email_sent`, `email_bounced`, `email_complained`. Alert when daily sends pass 70 % of the plan's daily cap, and when the complaint rate passes 0.1 % per day.
- **Dev and test.** In `development`, codes are logged to the console and nothing is sent. Resend has no test-mode toggle; integration tests that must hit its API use its test recipients `delivered@resend.dev`, `bounced@resend.dev` and `complained@resend.dev` (they support `+label`).
- **Test OTP (development, preview, staging only).** When `AUTH_TEST_OTP_SECRET` is set and `APP_ENV` is `development`, `preview` or `staging`, the `emailOTP` `sendVerificationOTP` hook skips Resend for addresses ending in `@e2e.test`, and the accepted code is derived from the secret and the address (HMAC-SHA256, truncated to 6 digits; exact derivation in [environments-and-ci](../06-infrastructure/environments-and-ci.md#test-sign-in-local-preview-and-staging-only)). These sign-ins keep the normal TTL and attempt limit but are exempt from the 10-per-IP-per-hour send limit. The server refuses to boot if the secret is set and `APP_ENV` is `production` or unset. The landing-screen age gate and onboarding are not bypassed. Previews carry no Resend key and no Google client.

## Security checklist

- [ ] CSRF: Better Auth's built-in origin checks. All mutating REST routes require same-site cookies plus an `Origin` header allowlist (`ALLOWED_ORIGINS`)
- [ ] Rate limiting on all `/api/auth/*` routes (Better Auth rate limiter + Fastify rate-limit), numbers in [security-anti-cheat](security-anti-cheat.md#rate-limits)
- [ ] Generic error messages ("If that email exists, we sent a code"). Sign-in and create account never reveal whether an address is registered
- [ ] Account linking only when both sides are verified, with a test for the pre-hijack sequence
- [ ] Account deletion (GDPR): soft-delete immediately, hard-delete after 30 days per the table in [data-model](data-model.md#account-deletion-db-06-job-runs-nightly) (match records are anonymised, replays keep "deleted player"); signing in during the 30 days cancels the deletion (see [privacy-and-age](../08-legal-safety/privacy-and-age.md) Delete flow)
- [ ] **Roles.** `profile.role` changes only by an owner-run SQL statement over the direct Neon connection or by an existing admin via `POST /api/admin/users/:id/role` (writes a `moderation_action`). PUT schemas (`/api/profile`, `/api/campaign`, `/api/settings`) are allowlists that reject unknown keys, so `role`, `wallet_credits`, `level`, `xp`, `farm_credits` and `banned_until` never arrive from a client.
- [ ] **Admin routes** live under `/api/admin/*`, require `role in (moderator, admin)`, a Google-authenticated session, a sign-in within the last 10 min (step-up) and a stricter rate limit (60/min). Exception: the release-workflow endpoints `/api/admin/drain` and `/undrain` ([hosting](../06-infrastructure/hosting.md), SRV-14) authenticate with the CI credential instead of a user session. The admin UI is same-origin behind the same CSP.
- [ ] **Bans** are enforced at `hello` (socket refused with `error{code:"BANNED", until}`), at `queue.join` / `room.join`, and by deleting the user's sessions when applied. Temp bans expire by comparing `banned_until` to `now()`.
- [ ] Every moderation action and role change inserts a `moderation_action` row; the admin page is read-only on that table
