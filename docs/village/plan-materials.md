# Village materials plan

## Current pipeline (findings)
- `data/materials/sources.json` lists 19 Poly Haven scans (layers 0-18, append-only). `tools/textures/build.mjs` fetches the 2K diffuse, nor_gl, arm and displacement maps and packs them into `data/textures/<id>.{alb,nrm,hgt}.webp`. Albedo and normal+rough are 2048². Height+AO is 1024². There is one global `size`.
- `src/materials/library.js` makes three `texture_2d_array`s (rgba8, full mip chains), one layer per material. `MAT_<ID>` WGSL constants are generated from the json. **Adding a layer = one json entry + `node tools/textures/build.mjs <id>` + an ASSETS.md row.** No code change.
- Cost is about 50 MB VRAM per layer (22.4 albedo + 22.4 normal + 5.6 height, mips included), so 19 layers is about 0.96 GB. Disk is about 3.4 MB per layer (65 MB now). Layers cannot differ in resolution inside one array. A second 1K array would cost 3 more sampler bindings per shader (check the binding limit). Not worth it.
- Capacity: +12 layers (31 total) is about 1.56 GB VRAM, fine on 12 GB (the arrays are only sampled, so per-frame bandwidth does not grow). Load grows by about 40 MB of WebP decode plus 12 layers x 3 mip generations, roughly +1.5-3 s behind the loading screen. The array limit is 256 layers, so layers are not the cap. The load-time budget is the cap, and about 12-14 more is sensible.
- Architecture: `info = (site, mat, seed, carve)`. `mid = 0..7` (STONE, GLYPH, CANVAS, WOOD, ICE, EMBER, METAL, SNOW). The layer is picked once with `select()`, then a single `matUvG` is sampled in uniform flow (cheap, keep that). It uses per-block uv offsets, `matRetint` to art-directed colours, lichen/wear/snow passes and per-site `siteGlow` (fire y, embers w). Terrain: `meadowSurface()` in `meadow.wgsl.js` blends turf / grass-ground / soil height-aware, with near+far scales, forest floor driven by the `canopyTex` world map (8192 m), and rock on slopes.

## New materials (all Poly Haven, CC0, 2K; thumbnails visually checked)
| Need | Asset (URL = https://polyhaven.com/a/<name>) | Layer id | MAT |
|---|---|---|---|
| Cream plaster | `plastered_wall` - fine uniform stucco, retint cream; stains are procedural | plaster | PLASTER 8 |
| Thatch | `reed_roof_03` (thatch_roof_angled and riet_01 are darker/bristly alternates) | thatch | THATCH 9 |
| Slate | `grey_roof_tiles` (dark, mossy-gold flecks) | roof-slate | SLATE 10 |
| Terracotta / clay tile (and pots) | `clay_roof_tiles_02` (strong orange: keepHue high, desaturate) | roof-clay | TILE 11 |
| Wood shingle / clapboard | `weathered_plank_siding` (horizontal lapped boards; shingles get procedural cuts) | siding | SHINGLE 12 |
| Doors, crates, shutters, stalls | `weathered_planks` (vertical boards) | planks | WOOD 3 (new layer) |
| Beams / timber frame | existing `rough_wood` (layer 5), retinted dark | timber | WOOD 3 |
| Cobbled streets | `cobblestone_floor_03` (small tight setts, reads at 1-5 m) | cobble-setts | ground + COBBLE 13 |
| Courtyards, stream edge | `cobblestone_floor_08` (large rounded cobbles) | cobble-river | ground + COBBLE 13 |
| Flagstone path | `rock_path` (big irregular flags, dark: retint warm grey) | flagstone | ground + FLAG 14 |
| Packed earth tracks | `dirt_floor` (warm, even) | earth | ground + EARTH 15 |
| Mossy cobbles / bridge | `mossy_cobblestone` (moss in joints) | cobble-mossy | ground + COBBLE 13 |
| Iron | `rusty_metal_04` (retinted dark, rust kept in the AO/edges) | iron | METAL 6 |
| Mossy stone, walls, arch | existing layers 13/14/15 (moss, rock-mossy, stone-mossy) plus stone-pale | - | STONE |
| Canvas awnings | existing linen (7) / wool (6) with procedural stripes and colours | - | CANVAS 2 |
| Leaded glass | procedural (no scan) | - | GLASS 16 |

That is 11 new layers (19-29), +0.55 GB. The raw `.jpg` downloads are cached outside the repo. Only packed WebPs are vendored, as now. I could not open ambientCG (WebFetch/WebSearch only gave Poly Haven's API listing), so it is not used. Poly Haven has no wood-shingle roof scan. The siding plus procedural cuts, or a later ambientCG Shingles scan, covers it.

## Shader work (architecture.wgsl.js)
- Replace the `if (mid==2)...` layer pick with a small const table `mid -> layer` (still a single `matUvG`). Add MAT 8-16 to `world/architecture.js` MAT and one `else if` branch each. Roof MATs use texScale about 1.2 on slope uv. Retint colours per `seed` so houses vary (cream, ochre, pale grey; reds/greys for tiles).
- **Timber framing: geometry, not shader.** Beams as real boxes (`b.box(..., MAT.WOOD)`) 4-6 cm proud of the plaster face, from a JS generator (posts, sills, plates, diagonal braces, jettied upper storey on corbel brackets, `rng`-seeded layouts). This gives shadows, silhouettes and a correct look at 1-5 m. Beam ends can use `chamferBlock`. Shader-only framing would look painted-on and could not cast shadows. Plaster panels sit between the beams, with the shader giving AO in the corners (uv-based) and a dirty base (the existing `vLocalY` darkening).
- **Glowing windows (MAT GLASS 16).** A leaded-quarry grid is drawn procedurally from uv (diamond or square cames, 1.5 cm lines, subtle per-pane tint hash). `emit` is warm (1.0, 0.62, 0.28) x night factor x per-window on/off hash x 0.85+0.15 flicker, using the existing display-referred `emit/ex` path. Daytime glass is dark with sky reflection (rough 0.1). Do not give every window a point light (16 slots in total): use emissive plus a soft warm spill via `emit` on the plaster/cobbles near it (`siteGlow`-style falloff, no shadows), and spend the 12 world lights on the nearest street lamps, stalls and the burning building.
- **Thatch.** Reed scan plus a vertex-bulged eave (geometry: rounded ridge roll, thick eaves) plus procedural moss (existing moss layer) in the lower third and shade side. Uses the existing ember logic to glow when burning: `siteGlow.y` with char (albedo x0.3, rough up) for the fire quest.
- **Moss and weathering (shared).** Extend the existing `lich` and `vLocalY` passes. Moss = `smoothstep` of (upward normal + noise + (1-ms.ao) + near-ground + north), blended to the moss layer sampled at the same uv (extra tap, only when the mask > 0). Add rain streaks below sills and eaves (`uv.y` noise stretched along y). Stone edges get wear (existing). Lanterns and candle glass (CANVAS or GLASS with `emit`).
- ARCH_SITES is 96. The village needs more, so raise to about 256 (the sites and siteGlow uniforms stay under 8 KB) and group houses per street/block.

## Roads on the terrain (not decals, not geometry)
- **Recommended: a village surface-mask texture**, the same pattern as `canopyTex` (CPU-built, one `Texture.update`). A 512 m x 512 m R8G8 map at 0.25 m (2048², 8 MB) around the hub, painted at load by rasterising the road/path splines (distance field with noise-jittered edges; R = surface type: 0 grass, 1 earth, 2 setts, 3 flagstone, 4 river cobble, 5 plaza; G = wear/edge width). Plazas and market floors are painted too.
- In `meadowSurface()`: sample the mask once and early-out when 0. Otherwise `mdLayer()` the chosen layer(s) (planar, near+far scale, already handled) and height-blend them against turf so stones poke through grass and cobbles ragged-edge into turf (the existing technique). Fade grass blades and groundcover where the mask is >0 (`grass.wgsl.js` / `groundcover.wgsl.js`, same mask) and moss/dirt at the edges.
- **Grade the terrain** under roads in the height generator (`world.worker.js`/`terrain`) so streets follow contours and the collision patches match. Geometry only for kerbs, steps, parapets, bridge (architecture.js). Decals would z-fight, cost overdraw and cannot carry height blending.
- Roads can wear into the ground by the existing terrain-state texture (footprints) for free, since `state.x` already darkens ground.

## Budget summary
VRAM +0.55 GB (to about 1.5 GB of materials, plus the surface mask 8 MB). Load +2-3 s, disk +40 MB. GPU frame: the architecture shader gains about 3-4 more branches (not taps), plus the moss tap and the mask tap. Expect +0.5-1.5 ms in dense street views on top of the 14-16.5 ms, mostly overdraw from many more triangles and sites rather than the materials.

## Effort (dev-days)
Pipeline and 11 layers 0.5; new MAT branches and retints 2-3; timber-frame/roof/window geometry generators 3 (architects' side); glowing glass, spill and fire char 1.5; surface mask + painting + shader + grass suppression 2-3; terrain grading along roads 1-2; tuning 2. About 12-15 days.

## Risks
- Scan colour: `clay_roof_tiles_02` is saturated orange and `grey_roof_tiles` is dark. Both need retint tuning (keepHue) to avoid breaking the existing look. Check `plastered_wall` is not too blank at 1 m (add the stain passes).
- Cobble repeat on long roads: two-scale sampling helps; add a low-frequency tint and a wear mask so it never repeats visibly.
- Load time and VRAM are fine at 31 layers, but check the loading screen. Stop at about 32 layers, or drop `size` globally (changes the look of all scans).
- Uniform arrays and draw cost at 150+ sites, plus the 16 light-slot cap (emissive-only windows and spill, no real lights).
- The first and last asset thumbnails were checked visually, but only as spheres. Verify tiling on a flat quad in-engine before locking. The reed scan may need tile rotation on roofs.
