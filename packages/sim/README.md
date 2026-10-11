# @harvest/sim

Deterministic farm world, host functions (actions/sensors), shared market, and the discrete-event scheduler that interleaves every drone.

- Design: [`docs/03-architecture/simulation-engine.md`](../../docs/03-architecture/simulation-engine.md)
- Rules: [`docs/01-game-design/farm-simulation.md`](../../docs/01-game-design/farm-simulation.md)
- Backlog: `SIM-01` … `SIM-08`, `SIM-BAL` (milestone M0)

**Purity:** integers only; no `Date`, `Math.random`, DOM or Node APIs.
