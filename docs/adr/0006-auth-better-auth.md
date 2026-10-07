# ADR-0006: Better Auth (Google OAuth, email OTP via Resend, email+password)

- **Status:** proposed
- **Date:** 2026-10-07

## Context
Required: OAuth, an email-code flow via Resend, and email+password with verification.

## Decision
Self-host **Better Auth** inside the game server with the Drizzle adapter on Neon. Plugins: `emailOTP`, `emailAndPassword` (verification required), Google social provider. Sessions are DB-backed with an HTTP-only cookie. WebSockets authenticate with one-time tickets.

## Consequences
- Sessions live in our DB, so WS auth needs no third-party round-trips.
- We own email templates and rate limits.
- Neon Auth is built on Better Auth, so migrating to the managed offering stays possible.

## Alternatives considered
- **Neon Auth (managed):** viable and lower maintenance, but less control over the WS session binding.
- **Clerk/Auth0:** per-MAU cost and an external dependency.
- **Auth.js:** fine, but weaker built-in email OTP + password story.
