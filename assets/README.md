# assets/

Source art and audio. Build outputs go to `apps/web/public/assets/` (git-ignored).

**Every shipped file needs a row in [`MANIFEST.csv`](MANIFEST.csv)** with its license. CI (`tools/asset-check`) fails otherwise.

Allowed licenses: `CC0-1.0`, `CC-BY-4.0` (credited automatically), `OFL-1.1`, `own-work`, `commissioned-exclusive`, `licensed-commercial`.
Not allowed: anything `NC`/`ND`, `CC-BY-SA`, GPL, or unknown.

| Folder | Contents |
|---|---|
| `voxel/src/` | MagicaVoxel `.vox` sources |
| `voxel/procedural/` | TypeScript generators that output `.vox` (crops by stage, fences, rocks, terrain) |
| `audio/sfx/` | `.wav` sources or `.sfxr.json` presets |
| `audio/music/` | Stems per track |
| `textures/` | Sky gradients, UI paper grain |
| `fonts/` | OFL fonts + their license files |

See [`docs/04-art-audio/`](../docs/04-art-audio/).
