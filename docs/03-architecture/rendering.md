# Rendering (`apps/web/src/render`)

## Stack

three.js (WebGL2, with the WebGPU renderer as an opt-in later) through **React Three Fiber** and **drei**. Post-processing uses `postprocessing` + **N8AO**.

## Scene graph

```
<Canvas>
  <Lighting />           sun (directional, soft shadows), sky hemisphere, time-of-day driven
  <Backdrop id=… />      distant terrain/skybox per cosmetic backdrop (low-poly voxel, fog-faded)
  <Farm grid=… >         one per player (1 in SP, up to 8 in finale)
    <Ground />           single greedy-meshed chunk; tilled/grass/rock via vertex colors
    <Moisture />         darkening decal per tile (shader uniform array)
    <Well />, <Silo />
    <Drone />            animated model + trail + shadow blob
  </Farm>
  <Crops />              InstancedMesh per crop kind × stage (4 growth + withered), shared by all farms;
                         each instance carries its farm's offset
  <Effects />            SSAO, mild bloom, tone mapping (ACES/AgX), optional tilt-shift DOF
  <CameraRig />          orbit (SP), scripted (finale)
</Canvas>
```

## Voxel models

- Authored in **MagicaVoxel** (`.vox`). The build step `tools/voxel-bake` greedy-meshes each model, bakes **per-vertex ambient occlusion**, and outputs compact **glTF (.glb)** with vertex colors and no textures. See [asset-pipeline](../04-art-audio/asset-pipeline.md).
- Scale: **1 tile = 16 voxels**. Crops are 4–16 voxels tall per stage. The drone is about 10×10×6.
- Each crop has **4 growth-stage models** (sprout, young, mature, ripe) plus a withered variant. Stage = `floor(growth% / 25)`. A small scale-pop animation plays when the stage changes.

## Performance budget

| Target | Budget |
|---|---|
| Single farm (12×12), mid laptop iGPU | 60 fps, ≤ 60 draw calls |
| Finale (8 × 8×8 farms) | 60 fps desktop, ≥ 30 fps tablet, ≤ 150 draw calls |
| Initial JS (gzip) | ≤ 350 KB before 3D; 3D chunk lazy-loaded |
| Initial assets to first farm | ≤ 4 MB |

Techniques: instancing for crops (one set of instanced meshes shared by every farm, so crop draw calls are 5 × crop kinds regardless of player count: 15 with the three launch crops, 40 with all eight), one merged mesh for ground per farm (ground, silo and well draw once per farm, 3 × 8 = 24 in the finale), shadow map only for the active farm in the finale (others use blob shadows), and `frameloop="demand"` when nothing animates (editor idle). A device-tier detector reduces SSAO and shadows on low-end GPUs.

## Animation sources

- **Live test runs (SP and coding phase):** the Worker streams `SimEvent`s, and the renderer interpolates drone position over each action's cycle duration at the chosen speed.
- **Finale/replay:** the full event log plays at about 600 cycles per second of real time (the 30,000-cycle budget fits the 50 s simulation segment below; the rate is always `cycleBudget / 50`), with camera choreography (see audio-design and screen-flow).
- **Drone action animations:** move (tilt toward direction), plant (seed drop + dust puff), water (droplet particles), harvest (crop pops up and arcs into the drone, +₵ floater), sell (coins fly toward the silo), error (red spark + stutter).

## Finale sequence (target ~75 s)

1. **0–5 s:** "Time's up!" Programs lock. Camera pulls up from your farm to reveal all farms in a ring around a central market.
2. **5–55 s:** Accelerated simulation, all drones working at once. Each farm's silo grows into a **money tower** proportional to credits. Market price tickers float above the market stall. Music intensifies.
3. **55–65 s:** Simulation ends. Towers settle. The camera sweeps from last place to first.
4. **65–75 s:** Podium. Winners' farmer avatars and drones stand on a podium, confetti made of crop voxels, awards fly in.

Players can press **Skip** to jump to results after 5 s. The server proceeds when all clients ack or 120 s pass. A player who skips goes straight to the results screen in a waiting state: the standings table shows at once with the header "Waiting for other players to finish watching… (m:ss)" counting down to the 120 s cap. Rewards, RP and the rematch vote animate in when `match.results` arrives.

## Accessibility hooks

- "Reduce motion" removes camera sweeps, particles and screen shake. The finale becomes a cross-fade between states.
- High-contrast crop markers: each crop also has a distinct **silhouette and icon**, not just color.
