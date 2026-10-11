# Asset Sourcing: art, music, SFX, animation

Strategy: **placeholder fast, ship original.** Use CC0 packs to prototype, generate what can be generated from code, and hand-author or commission the hero assets that define the game's identity.

## By asset type

| Need | Prototype (M1–M3) | Ship (M7) |
|---|---|---|
| **Crops, terrain, props** | Procedural `.vox` generators (`assets/voxel/procedural`) + Kenney voxel packs (CC0) | Procedural generators refined by an artist pass in MagicaVoxel |
| **Drones, farmhouse, silo, avatars** | Kenney / OpenGameArt CC0 voxel models (cartoony, acceptable as placeholders) | Hand-authored in MagicaVoxel or **commissioned** voxel artist (Fiverr, ArtStation, r/gameDevClassifieds, itch.io). Budget about $30–$120 per hero model |
| **UI icons** | Lucide (ISC) + voxel renders of our own models | Same |
| **Fonts** | Inter / Atkinson Hyperlegible / JetBrains Mono (OFL) | Same |
| **SFX** | **Generated with jsfxr/sfxr presets** (stored as `.sfxr.json`, regenerable) + Kenney audio packs (CC0) | Mix of the above + Freesound **CC0 only** + a short recording session (seeds, soil, coins, wood) for organic texture |
| **Music** | CC0 tracks from OpenGameArt or Kenney, or silence | **Commissioned** adaptive score (3–5 tracks × stems), or a licensed royalty-free library track with commercial-use terms |
| **Animations** | Procedural in code (tweens, particles, rotor spin, bobbing) | Same. Voxel games rarely need skeletal animation, and hand-tuned procedural motion fits the style |

## Sources (check each file's license on download, and record it in `MANIFEST.csv`)

| Source | Typical license | Notes |
|---|---|---|
| **Kenney** (kenney.nl), including Voxel Pack, UI audio, interface sounds | CC0 | Gold standard for placeholders. The style is cartoony, so use only as placeholder in hero slots |
| **OpenGameArt.org** | Mixed (CC0, CC-BY, GPL, …) | Filter by CC0 or CC-BY. Avoid GPL and CC-BY-SA for bundled assets |
| **Freesound.org** | Mixed per sound | **CC0 only** for simplicity, or CC-BY with attribution captured |
| **jsfxr / ChipTone** | Output is yours | Great for UI blips. Tune away from pure chiptune to fit the grounded style (lower pitch, longer decay, some noise) |
| **MagicaVoxel** | Free tool, output is yours | The authoring tool for all voxel models |
| **AI image/3D/music generators** | Varies by provider and plan | Only use tools whose terms grant commercial rights on your plan, and record the tool, plan and date in the manifest. Treat output as a draft to be hand-cleaned. Text-to-voxel quality is currently inconsistent, so prefer procedural generation for consistency |

## What Claude can generate directly in this repo

- **Procedural voxel generators** (TypeScript producing `.vox`) for crops at every growth stage, fences, rocks, terrain rings and particles
- **sfxr presets** for UI and action sounds
- **Shaders and particle effects**, plus the finale choreography in code
- **Placeholder icons** rendered from the voxel models

Not generated here: final music, hero character art, and any asset that needs a human artist's eye. Those are commission or licensing tasks in the backlog (`ART-*`, `AUD-*`).
