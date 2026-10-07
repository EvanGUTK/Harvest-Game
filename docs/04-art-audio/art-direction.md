# Art Direction: "Grounded Voxel"

## Brief

Voxel, but not a toy. Think of a **miniature diorama photographed at golden hour**: chunky readable shapes, with a lighting and color treatment that feels warm, tactile and slightly realistic.

| Do | Don't |
|---|---|
| Earthy, desaturated base palette (soil browns, sage greens, straw yellows) with **saturated accents only on ripe crops and UI highlights** | Primary-color candy palette |
| Soft ambient occlusion, real shadows, gentle fog/depth | Flat unlit colors |
| Proportional, believable objects (a tractor-ish drone, a real-looking silo) | Big-eyed mascots, faces on crops |
| Subtle per-voxel color noise (±3 % value) to avoid plastic look | Perfectly uniform faces |
| Weathering: worn paint on drones, wood grain via 2-tone voxels | Glossy materials |
| Day-to-dusk lighting tied to sim time | Static midday light |

**Reference touchstones** (for mood, not to copy): the lighting of *Teardown*, the diorama framing of tilt-shift photography, the warmth of rural landscape painting, and Minecraft with a modern shader pack. **Avoid** the look of *Crossy Road*: too cartoonish for this brief.

## Palette (initial)

| Role | Hex |
|---|---|
| Soil dark / light | `#4A3A2C` / `#7A5E44` |
| Tilled soil | `#5B4433` with `#3E2F23` furrow lines |
| Grass | `#6F8B4E` / `#8CA563` |
| Water / moisture tint | `#3F6E8C` at 35 % multiply |
| Wood | `#8A6A4A` / `#A9875F` |
| Metal (drone) | `#9AA3A8` / `#5E6669` |
| Radish (ripe accent) | `#C8384B` |
| Corn (ripe accent) | `#E8C24A` |
| Melon (ripe accent) | `#5E9E4A` rind / `#E86A5A` flesh |
| Sky gradient (golden hour) | `#F2C48D` → `#8FB3C9` |
| UI ink / paper | `#1F1A16` / `#F4EDE1` |

## UI style

- "Field notebook" aesthetic: paper-toned panels with slight grain, ink-dark text, and stamp-like badges.
- Typography: a sturdy humanist sans for UI (e.g. **Inter** or **Atkinson Hyperlegible** for accessibility) and a monospace with good ligature-free clarity for code (e.g. **JetBrains Mono**, OFL). Both are open-licensed and self-hosted.
- Icons: a custom voxel-rendered icon set (16×16 voxel sprites rendered to PNG) for crops and commands, plus Lucide for generic UI icons.

## Models needed for MVP (asset list)

| Asset | Variants | Voxel size (approx.) |
|---|---|---|
| Ground tile set | grass, tilled, rock, well tile | 16×16×4 |
| Radish | 4 stages + withered | up to 8×8×8 |
| Corn | 4 stages + withered | up to 10×10×16 |
| Melon | 4 stages + withered | up to 14×14×8 |
| Drone (Classic Quad) | 1 + rotor animation (separate rotor meshes) | 10×10×6 |
| Silo | wooden (default) | 12×12×24 |
| Market stall | 1 | 24×16×16 |
| Farmhouse (home hub) | 1 | 48×40×32 |
| Farmer avatar | base body + 3 hats + 3 outfits | 8×6×16 |
| Backdrop: Valley | terrain ring + trees + fence | large, low detail |
| Particles | dust, droplets, seeds, coins | 1–2 voxels |
