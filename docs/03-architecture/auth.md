# Authentication

## Sign-in methods (all via Better Auth)

| Method | Flow | Notes |
|---|---|---|
| **Continue with Google** | OAuth 2.0 / OIDC redirect | Most players will use this. Email comes pre-verified |
| **Email code** (passwordless) | Enter email → 6-digit code via **Resend** → enter code | Better Auth `emailOTP` plugin. Code TTL 10 min, 5 attempts max |
| **Email + password** | Sign up → verify email with a 6-digit code → sign in | `emailAndPassword` with `requireEmailVerification`. Password ≥ 10 chars, checked against a breached-password list (HIBP k-anonymity API) |
| Password reset | Email code → new password | Revokes other sessions |

Accounts are linked by verified email. Google and email sign-ins for the same address are the same account.

*(Optional later: GitHub OAuth for the programmer audience, and passkeys via Better Auth's passkey plugin.)*

## Sign-in screen

```
┌──────────────── CODE HARVEST ────────────────┐
│     (voxel farm idling in the background)     │
│                                               │
│   [ G  Continue with Google ]                 │
│   ─────────────── or ───────────────          │
│   Email  [______________________]             │
│   [ Send me a code ]   [ Use a password ]     │
│                                               │
│   By continuing you confirm you're 13+ and    │
│   agree to the Terms and Privacy Policy.      │
└───────────────────────────────────────────────┘
```

First sign-in leads to **onboarding**: pick a handle, confirm age (13+ gate, see privacy doc), pick a starter drone color, then the tutorial contract.

## Sessions

- Better Auth database sessions in Postgres, sent as an **HTTP-only, Secure, SameSite=Lax cookie**.
- Session length 30 days, rolling. "Sign out everywhere" in settings.
- **Domain layout matters for cookies:** serve the client and API under one registrable domain, e.g. `play.codeharvest.example` (static) and `api.codeharvest.example` (server), both as Render custom domains. Then the cookie is first-party and SameSite=Lax works. The alternative is to serve the built client *from the game server itself*, same origin, which is simplest of all (see hosting, option A).
- WebSocket auth uses one-time tickets (see [realtime-protocol](realtime-protocol.md)).

## Email (Resend)

- Verified sending domain (SPF, DKIM, DMARC records) such as `mail.codeharvest.example`.
- Templates: sign-in code, verify email, password reset, "new sign-in from a new device" (optional).
- Rate limits: 3 codes per email per 10 min, 10 per IP per hour. Codes are hashed at rest.
- Dev: Resend test mode, or log codes to the console when `NODE_ENV=development`.

## Security checklist

- [ ] CSRF: Better Auth's built-in origin checks. All mutating REST routes require same-site cookies plus an `Origin` header allowlist
- [ ] Rate limiting on all `/api/auth/*` routes (Better Auth rate limiter + Fastify rate-limit)
- [ ] Generic error messages ("If that email exists, we sent a code")
- [ ] Account deletion (GDPR): soft-delete immediately, hard-delete after 30 days, anonymise match records (keep the replay with "deleted player")
- [ ] Admin role column for moderation tools, never settable via API
