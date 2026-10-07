# tools/

Planned build and dev tools. Each becomes a workspace package with its own `package.json`.

| Tool | Milestone | Purpose |
|---|---|---|
| `run` | M0 | CLI: `pnpm sprout run file.sprout --seed 42 --players bots/grower.sprout`. Workspace package `@harvest/tool-run` exposing bin `sprout`; the root `package.json` gets a `sprout` script (`pnpm --filter @harvest/tool-run exec sprout`) when the tool lands (M0) |
| `balance` | M0 | Balance harness: bots × seeds × rule tweaks → score report (`SIM-BAL`) |
| `voxel-bake` | M1 | `.vox` → greedy-meshed `.glb` with baked AO + PNG icons (`ART-02`) |
| `asset-check` | M1 | Fails CI on assets missing from `MANIFEST.csv` or with disallowed licenses (`LEG-04`) |
| `audio-build` | M3 | Loudness-normalise, encode `.ogg`/`.m4a`, build SFX sprite (`AUD-02`) |
