# Tech Stack

## Summary

| Layer | Choice | Why |
|---|---|---|
| Language (all code) | **TypeScript** (strict) | One language for client, server, VM and sim, so the *same* simulation code runs in both places. That property is what makes the whole design work. |
| Package manager / monorepo | **pnpm workspaces** (+ Turborepo later if builds get slow) | Simple, fast, strict dependency boundaries |
| Client build | **Vite** | Fast dev server, good Worker and Wasm support if ever needed |
| UI | **React 19** + **Tailwind CSS** | Huge ecosystem, matches the earlier concept |
| 3D | **three.js** via **React Three Fiber** + **drei** | Mature WebGL/WebGPU renderer. Voxel meshes are cheap. R3F lets 3D scenes compose with React state |
| Post-processing | `postprocessing` / `n8ao` (SSAO) | Soft ambient occlusion is what keeps voxel art from looking flat and toy-like |
| Editor | **CodeMirror 6** + custom **Lezer** grammar for Sprout | Lightweight, accessible, mobile-friendly. Monaco is heavier and weak on touch |
| Blocks mode (tablets/beginners) | **Blockly** generating Sprout *text* | One source of truth (text). Blocks are just an input method |
| Client state | **Zustand** | Small, works well with R3F |
| Routing | **TanStack Router** | Typed routes |
| Audio | **Howler.js** (SFX) + Web Audio stems for adaptive music | Simple, robust autoplay handling |
| Server HTTP | **Fastify** | Fast, typed, good plugin story |
| WebSocket | **ws** with our own typed protocol (zod) | Our real-time needs are small and turn-based. A framework adds more than it saves (see alternatives) |
| Validation | **zod** (shared in `packages/protocol`) | One schema, used for client types and server validation |
| Auth | **Better Auth** (Google OAuth + email OTP via Resend + email/password) | Self-hosted in our server and Postgres, TypeScript-native. Neon Auth is built on it, so either path works |
| Email | **Resend** | Already in your toolbox. Good DX for OTP and magic-link emails |
| DB | **Neon Postgres** | Already in your toolbox. Branching gives a DB per PR preview |
| ORM / migrations | **Drizzle** | SQL-first, light, great with Neon |
| Hosting | **Render** (static site + web service) | Already in your toolbox. Supports long-lived WebSockets |
| Tests | **Vitest** (unit), **Playwright** (e2e + cross-engine determinism) | |
| Errors / telemetry | Sentry (free tier) + structured logs (pino) | |

## "JS/TS might be a hurdle — should we use Wasm?"

There are two separate questions in there.

### 1. Is TypeScript a hurdle for *players*?
No, because players never see it. Players write **Sprout**, which our TypeScript VM interprets. The engine's language is invisible to them.

### 2. Should the *engine* be Wasm (Rust/Go/C++ compiled to WebAssembly)?

**Recommendation: no, not for v1.** Here's how it compares:

| Concern | TypeScript | Rust → Wasm |
|---|---|---|
| Performance needed | Our sim is integer ops on ≤ 12×12 grids. Every costed VM instruction takes at least 1 cycle, so a full 8-player 30k-cycle showdown executes at most ~240,000 costed instructions (8 players × 30,000 cycles; zero-cost `LINE` markers add at most as many again). Realistically it is far fewer, because each action costs 20–30 cycles on its own. Add O(actions) lazy world updates and the total is a few milliseconds in V8 at the VM's 30M ops/s target. **TS is fast enough by a wide margin.** | Faster, but solving a problem we don't have |
| Determinism | Integer-only TS is deterministic across V8, SpiderMonkey and JSC. We verify this with cross-browser golden tests | Also deterministic |
| Shared client/server code | Trivial: the same package is imported in both | Possible, but adds a build toolchain plus JS↔Wasm glue for every sensor and action call |
| Debuggability | Source maps, browser devtools, one stack trace | Two languages, two debuggers |
| Hiring and AI-assist friendliness | Highest | Lower |
| Build complexity | Low | wasm-pack/wasm-bindgen, CI toolchains, bundle loading |

**When Wasm would become right:**
- If we wanted players to write **real Python** (via Pyodide/CPython-in-Wasm). We reject that: it's about 10 MB of download, hard to meter per instruction, and nondeterministic around floats and hashing (see ADR-0002).
- If profiling shows the VM is the bottleneck for something like 10,000+ concurrent executions per server. The VM is isolated in `packages/lang` behind a small interface (`compile`, `createVM`, `step`), so it can be rewritten in Rust/Wasm later without touching the rest of the code.

See [ADR-0001](../adr/0001-typescript-everywhere.md).

### What about *you* as the developer?
If TypeScript itself is the hurdle, the stack above is still the right call. It has the most learning material, and Claude/AI assistants are strongest in TS. The monorepo is laid out so you can work on one package at a time with its own tests.

## Alternatives considered

| Instead of | We considered | Rejected because |
|---|---|---|
| ws + own protocol | **Colyseus** | Gives rooms, reconnection and a lobby listing out of the box. But its state-sync model is built for 20–60 Hz games, and we'd still write custom matchmaking. Worth revisiting if room code grows large. |
| ws + own protocol | **Socket.IO** | Extra protocol layer and fallbacks we don't need in 2026 browsers |
| three.js | **Babylon.js** | Also excellent. three.js has the larger ecosystem, plus R3F |
| three.js | **Godot web export** | Large download, awkward React UI integration, harder to share TS sim code |
| Better Auth | **Neon Auth** (managed Better Auth) | Viable. We keep Better Auth self-hosted so the session lives with our WS server and we control email templates. Switch if managing auth becomes a burden |
| Better Auth | **Clerk / Auth0** | Cost per MAU, external dependency for every WS auth check |
| Drizzle | **Prisma** | Heavier, slower cold start, and Drizzle is closer to SQL |
| Render | **ChatGPT Sites** | See [hosting](../06-infrastructure/hosting.md). Wrong runtime for a stateful WebSocket game server |
| Custom DSL | Real Python via Pyodide | ADR-0002 |
