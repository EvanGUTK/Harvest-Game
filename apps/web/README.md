# apps/web (planned: M1)

Vite + React 19 + React Three Fiber client.

```
src/
  app/        routes, layout, providers
  features/   auth, home, campaign, editor, showdown, lobby, matchmaking, rooms, friends, shop, profile, settings
  render/     Farm, Tile, Crop, Drone, Silo, Backdrop, Finale (R3F)
  workers/    sim.worker.ts: runs @harvest/lang + @harvest/sim off the main thread
  net/        WebSocket client, reconnect, clock sync, REST client
  audio/      SFX registry, adaptive music director
  ui/         design-system components
```

See [`docs/03-architecture/rendering.md`](../../docs/03-architecture/rendering.md), [`docs/05-ux/`](../../docs/05-ux/).
