# Toward photorealism — plan (2026-11-14)

Goal: frames that read as close to real life as the browser allows. This plan follows the meadow
overhaul (docs/meadow-overhaul.md M1–M6) and the art-direction layer (docs/aesthetic.md).

## Where we honestly stand

The pipeline is not the problem. We already have TAA, SSAO, SSR, PCSS cascades, bloom, AgX,
a LUT grade, metered exposure, a physical sky with raymarched clouds, light shafts, 35 Poly Haven
scans and sculpted, baked hero meshes.

What still says "game" rather than "photo", most important first:

1. **There is no real indirect light.** The ambient term is the sky's SH, the same everywhere.
   Shade under the trees, valley floors and rock overhangs get as much sky as an open hilltop.
   Bounce light is a hand-tuned constant in some shaders. Our SSAO (Alchemy, no normals,
   8 samples) only darkens; it never adds coloured bounce. This is the biggest single gap, and it
   is what the reference's author meant by "SS + voxel GI".
2. **There is no shared, energy-correct BRDF and no specular IBL.** Fifteen shaders each roll
   their own Blinn `pow(N·H, 24)·0.04`. Only water, snow, the Ebbhold and waves use GGX. Nothing
   reflects the sky at grazing angles, so rough stone, bark, leaves and grass look chalky and
   matte. Real dielectrics always have a Fresnel sheen.
3. **The assets lack micro-detail.** Real ground is pebbles, twigs, litter, mixed grass species,
   seed heads and bare patches. Ours is a turf texture, coloured blades and some cards. The trees
   are procedural crowns of cards, which is fine at 200 m but not at 10 m.
4. **Foliage is shaded like an opaque surface.** Back-lit leaves and grass should glow
   (transmission). Leaves have a waxy sheen. There are no per-object motion vectors, so TAA smears
   or ghosts on swaying grass.
5. **Fine contact shadows are missing.** Cascades can't resolve a blade's shadow on the next
   blade, a pebble on soil, or a foot on the ground.
6. **The camera is too clean.** There's no lens response (vignette, slight CA, motion blur) and
   no white balance that follows the sun's colour temperature.

The honest ceiling: on WebGPU in a forward renderer, a realistic target is a good
last-generation open world on High/Ultra (around RDR2 or Horizon in daylight). UE5-style
Lumen/Nanite photogrammetry is out of reach. **The realism work targets High/Ultra on the
dev machine (RTX 3060, 1080p, 60 fps).** Low stays the i5-1235U floor (60 fps, the current look).
Every feature below is gated per preset and measured, as before.

## The asset track — the priority (user, 2026-11-14)

> "we want to create really detailed good looking assets which meet our Triple A criteria"

Reference bar: Horizon Zero Dawn's meadow (the user's screenshot, 2026-11-14) and Megascans-grade
scans. Rendering phases R1–R6 below now serve the assets. R1 (shared BRDF and sky reflections)
stays first, because without it any asset looks matte and plastic, however well it's made.

### What "AAA" means here (the checklist every asset must pass)

1. **Silhouette:**
   - no visible facets or straight edges at 2 m (hero assets) or 5 m (environment);
   - edges chipped, worn or rounded, never knife-sharp.
2. **Three scales of detail:**
   - macro (form and silhouette, from the sculpt);
   - meso (cracks, ledges, knots and seams: baked normal and AO);
   - micro (grain and pores: the tiling scans, through a detail normal).
   - Each must read at its own distance, and none may be missing.
3. **Texel density** (corrected 2026-11-14 against the stats; a 25 m scarp can't carry 512 px/m of
   unique bake, and AAA terrain-scale rock doesn't either):
   - unique baked maps (normal, AO, masks):
     - 200 px/m or more for props under 3 m (boulders, logs, stumps);
     - 1024 px/m or more for heroes and creatures;
     - 16 px/m or more for terrain-scale pieces (scarps, cliffs), where the bake carries the form and
       the masks;
   - everything gets tiling scan detail on top at 1024 px/m or more (2–4 px/mm) in the near field.
   - `<set>-stats.json` reports the minimum per set.
4. **Unique surface story:**
   - baked curvature and cavity drive edge wear, dirt in crevices, moss and lichen where water sits,
     and streaks below ledges;
   - no two instances alike (seeded variants, per-instance tint, weathering).
5. **No visible repetition:** across a 30 m view, no tile or variant repeat should be noticeable
   (art bar memory: "no repeats").
6. **LODs without pops:**
   - LOD0, LOD1 and LOD2 share UVs and maps, with a dithered crossfade at switches;
   - impostor or shadow LODs where they apply.
7. **Grounding:**
   - the asset sits into the terrain (buried foot, blend band, contact AO);
   - it takes the R2 bounce and the R3 contact shadows.
8. **Budgets (per preset, measured):**
   - triangles, pixel cost (prepass if overdraw), and VRAM;
   - KTX2/BC7 textures, so 4K atlases cost 1/4 of today's VRAM.
9. **Review:**
   - a Blender turntable (`tools/models/preview.py`), then in-game shots at 2 m, 10 m and 50 m;
   - then side by side with the reference, then user sign-off.
   - An asset that fails any point goes back.

### Pipeline upgrades (the Blender headless pipeline, `tools/models/`)

The Walker and the outcrops proved sculpt → LOD → Cycles bake → GLB+WebP. To reach the bar it needs:

- **More bake channels.** Today it bakes a normal and AO. Add curvature, cavity, thickness, height,
  and an albedo/material-ID mask, packed in a second atlas. The shaders then drive wear, dirt and
  moss from real geometry instead of noise.
- **Hand-painted and scanned albedo where scripts are weak:**
  - bake the scans onto the low mesh in Blender (triplanar in Blender, baked to UV);
  - near-field tiling detail then comes on top as micro detail only.
- **A shared asset shader** (`assetPiece` in `shaders/`):
  - one material for every authored mesh: baked maps, a detail normal, weathering masks, the R1
    BRDF, a dithered LOD crossfade;
  - `shaped.wgsl.js` and `outcrop.wgsl.js` fold into it.
- **Compression:** gltfpack/meshoptimizer for meshes, KTX2/BC7 for atlases (PLAN Q1).
- **A common driver** (`tools/models/build.py <asset>`): one entry point, quick/full modes, writes
  turntables and a stats JSON (tris per LOD, texel density, atlas fill). This turns the checklist's
  numbers into a check.

### Asset sources (all free)

| Class | Source |
|---|---|
| Rocks, cliffs, outcrops, ruins, creature hide | Scripted Blender sculpts, as for the Walker and the outcrops |
| Logs, stumps, small stones, some plants | CC0 scans: Poly Haven models, Smithsonian Open Access. Retopo/decimate and re-bake through the pipeline |
| Trees (oak, birch, pine), shrubs, ferns | Blender geometry nodes / Sapling: real branch geometry. Leaves and bark from Poly Haven/ambientCG scans |
| Grass and flowers | Blender-modelled blade and flower clusters, rendered to an atlas (normal, translucency, AO) |
| Village kit (walls, fences, bridges, roofs, props) | Modular Blender kits with weathering bakes, replacing the procedural masonry pieces in turn |
| Hero creatures, bosses, the Wraith | Scripted sculpts for the body masses. Faces, hands and the Listener need hand sculpting (the user or an artist), same bake pipeline |

AI-generated meshes stay out (BRIEF).

### Asset roadmap, in order of screen share in the meadow

| # | Assets | Variants | Notes |
|---|---|---|---|
| A1 | Pipeline upgrades + shared asset shader + checklist tooling | — | Re-bake the outcrops and the Walker through it as proof |
| A2 | Trees: oak, birch, pine | 4 each, LOD0–2 + new impostors | The biggest share of every meadow frame |
| A3 | Grass and flower atlas + ground clutter (stones, twigs, litter) | 3 grass species, 5 flowers, 20 clutter pieces | With R5 back-lighting |
| A4 | Logs, stumps, boulders (0.5–3 m) | 8 + 6 + 10 | Fills the mid-ground between grass and outcrops |
| A5 | Village kit | walls, fences, bridge, roofs, props | Replaces the procedural masonry, piece by piece |
| A6 | Creatures and bosses beyond the Walker | per creature | The Warden and the Bellwether only with explicit go-ahead (boss fights are off limits) |
| A7 | The Wraith (player character) | 1 hero | Needs hand sculpting for the face and hands; decide who does it |

### Decisions (2026-11-14)

- Imported meshes are allowed, and so are CC0 scanned models: **yes** (DECISIONS 2026-11-14,
  BRIEF amended).
- Faces and hands: the user asked for tools rather than a sculptor. See "Characters" below.

### Characters: tools for faces, hands and bodies without a sculptor (researched 2026-11-14)

Our characters need less face work than it seems:
- the Wraith is cowled, with wrapped hands (cloth, BRIEF §8);
- the Veiled are robed;
- the Shaped and the bosses are stone and sand, which the pipeline already does.

Exposed skin is limited to hands, wrists and the odd glimpse under a hood, plus the Listener and any
statues.

| Tool | Cost and licence | What it gives us | Fit |
|---|---|---|---|
| **MPFB 2** (MakeHuman for Blender) | Free. Plugin GPL; its generated models and bundled assets CC0 (user-contributed assets vary) | Parametric human bodies, heads and hands with clean topology, scriptable from Python | **Best fit.** Script-generated base bodies, hands and heads. Run through our pipeline: sculpt detail (wrinkles, pores, knuckles, wear) by script, bake, skin to our procedural rigs. Headless, so I can drive it |
| **Three D Scans** (Oliver Laric), **Scan The World**, Smithsonian Open Access | Free. Public domain / CC0 (Three D Scans claims no copyright; the legal footing is the project's own assertion) | Museum-grade scans of sculptures: heads, hands, drapery, reliefs | Statues, shrine figures, ruin reliefs, the Listener's stone or bronze, real hand and face forms to sculpt from |
| **RealityScan 2.x** (Epic, desktop, Windows) and **Meshroom** (AliceVision, open source) | RealityScan free under $1M revenue; Meshroom free | Photogrammetry from phone photos | Scan **your own** hands, faces, props, rocks and bark. A phone and ~100 photos per object. Runs on the 3060 |
| **RealityScan Mobile** | Free | On-phone capture | Quick capture for the above |
| **MetaHuman** | Free under $1M revenue. Epic's 2025 update says it may be used outside Unreal (Unity/Godot named); a 2026 secondary source disputes this | AAA human heads and hands | **Not recommended yet.** The licence for a WebGPU game is unclear, the export path is through Unreal, and rigged-human rules apply. Re-check if we ever need full faces |
| **Blender sculpt mode** | Free | Hand sculpting | For corrections on top of MPFB or scans |
| **ArmorPaint** (build from source), **Material Maker** | Free | Painting textures on meshes, procedural materials | Hand touch-ups on bakes |
| **Rigify** (Blender) | Free | Rig generation | Only if a part needs bones; motion stays procedural |

Plan for A7 and the Listener:

1. MPFB-generated hands and forearms. Scripted wrinkle and knuckle sculpting.
2. A skin bake: normal, AO, thickness for subsurface.
3. Skinned to the Wraith's existing hand chain, under the wraps.
4. Optionally, scan the user's own hands with RealityScan for the real thing.
5. Statues and reliefs come from public-domain sculpture scans.

**Decided (user, 2026-11-14):** MPFB bases are allowed for hands and bodies under cloth, on our own motion.

## The plan — phases in order of impact per millisecond

Each phase ends with:

- before/after shots from the fixed gate cameras (`tools/winchrome/gate-shots.mjs`);
- a frame-cost table (`tools/bot/view-costs.mjs`, with `gpuErrors` checked);
- an entry in this doc's log.

Perf is only measured when the GPU is otherwise idle; the user's games are never killed.

### R1 — One physically based shading model (foundation)

- `src/shaders/brdf.wgsl.js`, shared by all lit shaders:
  - GGX D, height-correlated Smith V, Schlick F, a Lambert diffuse term.
  - Multiscatter energy compensation (Fdez-Agüera).
  - Specular occlusion from AO (Lagarde).
  - A `Surface` struct (albedo, N, roughness, f0, ao, transmission). One `shade()` returns sun + sky
    + spec.
- **Specular IBL:**
  - A 128² sky cubemap rendered from the atmosphere LUTs in compute (the atmosphere pass already
    exists), GGX-prefiltered into 5 mips.
  - Re-baked every few frames, or when the sun or weather moves; `atmoArtTint` is already in the
    sky.
  - A DFG LUT (split sum).
- Port the 15 Blinn shaders, starting with the ones always on screen:
  - meadow/clipmap, grass, trees, impostors, outcrops, rocks;
  - then shaped/Walker, architecture and the rest.
- The scans' roughness channel finally drives specular. Up to now it was mostly ignored.
- Cost estimate: under 0.3 ms (the cubemap bake is amortised). On Low, keep the analytic sky and
  drop the IBL.

### R2 — Indirect light: three scales (the biggest win)

**a. Screen space: visibility-bitmask SSIL** (Therrien et al. 2023, "Screen Space Indirect
Lighting with Visibility Bitmask").

- It replaces Alchemy SSAO in `post/ao`.
- It outputs GTAO-quality AO, a bent normal for SH sampling, and one bounce of coloured light from
  the last frame's lit colour (TAA history), so grass greens the rock's foot and sunlit sand warms
  the walls.
- Half resolution, then the existing depth-aware upsample.
- Normals come from depth, as now. A normal/roughness MRT is a stretch goal; spike Babylon MRT plus
  snapshot rendering first.
- Cost estimate: 0.8–1.2 ms on High.

**b. Terrain scale: heightfield sky visibility and bounce.**

- A compute pass over the clipmap heights stores, per texel, 8 horizon angles, giving
  sky-visibility cones plus one bounce from the albedo of the visible ground.
- It is laid out as a world-space 2D texture beside the clipmap, updated incrementally as the
  rings scroll.
- Every shader samples `envVis(wp, N)`, which scales `shIrradiance` and the specular IBL.
- Results:
  - valleys, canyon floors and the rim's feet go dim and take colour from their walls;
  - hilltops stay open.
- The 2D "voxel GI" equivalent that fits our architecture. Cost estimate: about 0.2 ms amortised.

**c. Canopy scale: forest occlusion.**

- The tree placement already knows crown density, so it writes a coarse 2D canopy map: occlusion,
  plus green-tinted transmitted light.
- Forest floors, trunks and things under trees lose most of the sky and gain the green dapple.
- This generalises the Low "farShade" hack to every preset and every material.

### R3 — Contact shadows and shadow fidelity

- **Screen-space contact shadows:** a 16-step march toward the sun over the last 0.5–1.5 m, folded
  into the visibility term. They resolve blade-on-blade, pebble and foot contacts. About 0.3 ms.
- High/Ultra: a bigger first cascade and a tighter split, and the impostor shadows extended.

### R4 — Assets with real-world density (Blender pipeline, all free)

These reuse `tools/models/*` (sculpt → LODs → Cycles bake → GLB+WebP), with Poly Haven CC0 scans
for the textures.

- **Hero trees:** oak, birch and pine built in Blender (Sapling or geometry nodes).
  - Real branch geometry, with leaf clusters textured from scanned leaves.
  - LOD0 out to about 40 m, then the existing crowns.
  - The impostors re-baked from the new trees, so the far forest matches.
- **Ground clutter,** a new scatter layer on the existing `rocks.js` grid pattern:
  - pebbles and stones of 3–30 cm (sculpted, one atlas);
  - fallen branches, twigs, leaf litter decals under trees, and molehill/bare-soil patches.
  - Dense within 30 m, gone by 60 m.
- **Grass:** textured blades from a scanned grass atlas instead of flat colour.
  - Three species (fine sward, tall tussock, seed-head grass) plus clover, dandelion, buttercup
    and yarrow cards.
  - Mixed by noise and moisture.
- **Terrain near the camera:** parallax occlusion with the scans' height (matHgt is already
  loaded), inside 25 m.

### R5 — Foliage shading and motion

- Leaf and grass **transmission:** a wrapped back-lit term tinted by leaf colour and thickness, and
  shadowed (the shadow lookup is offset through the leaf).
- **Specular sheen:** leaf roughness 0.45, grass 0.55, through the R1 BRDF.
- **Per-object motion vectors:** grass, trees and characters write velocity, so TAA stops ghosting
  wind and motion blur becomes possible.
- **Wind:** travelling gust fronts visible across the grass (a shared wind field texture),
  instead of uniform sway.

### R6 — Camera and image

- White balance from the sun's colour temperature: the camera adapts, so noon isn't blue and dusk
  isn't neon.
- Physical exposure in EV100, with the existing meter as eye adaptation.
- Lens:
  - a natural vignette (cos⁴), lateral CA of at most 0.5 px at the corners;
  - per-object motion blur from R5's velocity;
  - bloom kept energy-conserving.
- TAA upscaling (render 67–77 % and reconstruct) to pay for R2–R5 on High.

### R7 — Validation: compare against reality

- **Photo-matching:** pick 4 Poly Haven HDRIs whose scenes match ours (a meadow at noon, a forest
  edge, a dusk field, overcast). Set the sun and sky to match, and compare our frame with the
  photo in luminance, saturation and contrast histograms, plus by eye. This replaces "looks good
  to me" with "matches a photo".
- Keep the fixed gate cameras. Each phase ships only if its numbers hold:
  - High 60 fps on the 3060 at 1080p;
  - Low still 60 fps on the i5-1235U target.

## Order and rough size

| Phase | What | Impact | Size |
|---|---|---|---|
| R1 | BRDF + specular IBL | high: every surface | 2–3 sessions (mechanical port) |
| R2 | SSIL + heightfield GI + canopy | **highest** | 3–4 sessions |
| R3 | Contact shadows | medium | 1 session |
| R5 | Foliage transmission, velocity, wind | high in the meadow | 2 sessions |
| R4 | Hero trees, clutter, grass atlas, POM | high close up | 4–6 sessions (asset work) |
| R6 | WB, lens, TAAU | medium; TAAU pays for the rest | 1–2 sessions |
| R7 | Photo-match harness | keeps it honest | 1 session, built first, alongside R1 |

Order, revised 2026-11-14 with assets as the priority:

1. **R1:** the shared BRDF plus sky reflections, which the assets need in order to look right.
2. **A1:** pipeline upgrades and the shared asset shader, with the outcrops and the Walker re-baked
   as proof.
3. **A2 (trees), then A3 (grass, flowers, clutter):** R5's foliage shading goes in with them.
4. **R2:** bounced light, so the new assets sit in the light correctly.
5. **A4 onwards**, interleaved with R3, R6 and R7.

## Log

- 2026-11-14 — plan written.
- 2026-11-14 — asset track added as the priority, with the AAA checklist, pipeline upgrades,
  sources and the A1–A7 roadmap.
- 2026-11-14 — **R1 done (first pass).**
  - `src/shaders/brdf.wgsl.js`: GGX with height-correlated Smith and Schlick; a sky reflection
    from the sky-view LUT blending into the SH by roughness (SH only on Low); Karis's analytic env
    BRDF; Lagarde's specular occlusion.
  - Foliage aggregate terms: `aggregateOcc`, where a reflection into the sward or crown hits
    leaves, and `aggregateMask`, which masks the sun highlight at grazing. Without them the meadow
    glared white toward the sun: GGX's forward lobe at grazing came out ×16 the diffuse.
  - Ported: meadow ground, grass, leaves, bark, impostors, rocks, outcrops, the Walker's pieces.
    Still Blinn: architecture, weapon, canyon, sand, drift and the boss shaders (Warden, untouched).
  - `?skyspec=0` / `?sunspec=0` for A/B; `tools/bot/look-set.mjs <tag>` is the fixed look-dev set
    (`screenshots/bot/look-r0-*` before, `look-r1-*` after).
  - Cost not measured: the GPU was busy with the user's game. By construction it adds two LUT
    taps per pixel on the ported surfaces.
  - Seen in the set:
    - the change is subtle (sheen on rocks and crowns);
    - golden hour toward the sun is still near-black in the foreground (R2 bounce, R5
      transmission);
    - the small procedural boulders (`render/rocks.js`) are the weakest asset in every meadow
      frame. They get sculpted replacements in A1.

- 2026-11-14 — **A1 (first pass): the shared asset pipeline, outcrops re-baked, sculpted boulders.**
  - `tools/models/assetkit.py` (shared by every piece script):
    - sculpt with a per-vertex feature mask (joints, seams, cracks), decimate, one atlas;
    - Cycles bakes the normal, AO (0.35 reach) and a second atlas `-mask.webp`: R convexity
      (pointiness), G cavity (0.035 reach AO), B the sculptor's feature mask;
    - LOD1/2, GLB, and `-stats.json` (triangles per LOD, px/m, atlas fill).
    - `tools/models/preview.py` renders the turntable, with the baked AO if given the atlas.
  - **The stats caught a defect at once.** The old unwrap (55°, margins 0.004/0.008) cut the
    outcrops into ~650 islands, and their gaps took 90% of the atlas: 9 px/m. At 66° with
    0.001/0.003 the fill is 38% and the density 18 px/m. The checklist's texel targets were also
    corrected (see the checklist).
  - Outcrop shader driven by the masks:
    - worn edges pale; grime in cracks, creases and joints;
    - moss in up-facing seams; lichen kept off the edges and joints;
    - roughness from the masks.
  - `tools/models/boulder_pieces.py`: 12 limestone boulders (rounded, angular, slab), 2,400
    triangles at LOD0, 310 px/m.
    - `render/outcrops.js` is now a piece field per family (`createOutcrops`, `createBoulders`).
    - Boulders: clusters of scree within 28 m of the scarps, a scatter on the slopes, rare
      erratics on the flat; 8,354 placed; LOD at 45/160 m, gone at 450 m (260 on Low); solid
      (rockSolids).
    - The meadow's procedural icosphere boulders are retired (`?boulders=0` brings them back);
      the frost keeps its own.
  - `render/clearance.js`: a toroidal 512² map at 0.5 m round the camera, so the grass and the
    ground cover no longer grow through rocks. Before it, every rock was buried in blades.
  - Architecture moved to the shared BRDF.
  - Cost (RTX 3060, scarp view, 240 frames, GPU otherwise idle):
    - High 14.15 ms vs 13.82 ms without boulders: **+0.33 ms**;
    - Low 7.19 vs 7.05 ms: **+0.14 ms**;
    - R1's specular within noise (14.22 off vs 14.15 on).
  - Shots: `screenshots/bot/look-r2-*` (`look-r2old-*` = `?boulders=0`).
  - Honest read:
    - the outcrops read as weathered limestone;
    - at eye height in knee-high grass, small boulders mostly hide (realistic, but their quality
      only shows from 2–5 m);
    - the turntable showed the first boulder shapes too blobby, re-sculpted blockier.
  - Not yet done in A1: the dithered LOD crossfade, KTX2/BC7 compression (24 MB of new WebP), and
    re-baking the Walker through assetkit.
- 2026-11-14 — **A2 (first pass): scanned-leaf sprays for oak and birch.**
  - **Diagnosis.** The drawn atlas put about 200 leaves on each 2 m card (a whole bush per card),
    so every crown was a stack of puffballs.
  - `tools/models/leaf_atlas.py` (Blender) models each atlas cell as one spray:
    - a woody stem with side shoots;
    - oak: 60–80 real lobed leaves crowded at the shoot tips;
    - birch: 70–110 toothed leaves along arching, drooping shoots;
    - each leaf a curled, folded blade turned off the card.
    - The photographs are ambientCG LeafSet016 / LeafSet014 (CC0, credited in ASSETS.md).
  - Outputs: colour + alpha, and a card-space normal + thickness, written to
    `data/textures/leaf-broadleaf*.webp`. `render/leafAtlas.js` lays them over rows 1–2 of the drawn
    atlas; the scans are scaled ×0.62 toward living-leaf albedo, and `?leafscan=0` keeps the drawn rows.
  - Generator (oak, birch):
    - cards of 1.05–1.5 m and 0.85–1.15 m, from 1.5–2.3 m and 1.0–1.5 m;
    - 5.5 sprays per metre, spread from 15% along the twigs and also along the level above;
    - turned every way off the shoot;
    - far LOD cards ×1.9 at 3 per metre.
  - **Coverage through the mips** (Golus):
    - the depth prepass, the shadow cut-out and the impostor bake scale alpha by mip level;
    - without it the open sprays averaged away, and every tree past ~60 m and the whole far forest
      went to bare twigs.
  - Result:
    - crowns have individual leaves, gaps and sky through them;
    - the masses are kept;
    - the far forest is unchanged in density.
  - Cost (RTX 3060, scarp view): High 14.5 → 15.2 ms (+0.45 geometry, +0.23 atlas); Low +0.13 ms.
    The trimmed density (7 → 5.5) saved only 0.1 ms, so the rest is cut-out pixels, not triangles.
  - The first attempt (smaller cards with the old drawn sprite) was reverted: the puffs stayed and the
    distant trees went bare (the mip problem above).
  - Still to do in A2:
    - pine needles (LeafSet019 is cypress, not pine);
    - bark: real branch taper, gnarl and root flare;
    - wind on the sprays;
    - leaf colour variety per tree in the scans' own hues.
- 2026-11-14 — **A2 (second pass): gnarl and fuller far crowns.**
  - Per-species `gnarl` in the generator (oak 0.34, birch 0.18, others 0.12 as before): per-node
    wander plus a slow sinuous bend, with finer segments on LOD0. Oak limbs are crooked now, not
    straight sticks.
  - The far LOD's sprays are ×2.0 and 4.2 per metre, so trees past 55 m no longer read as saplings.
  - Meadow view, High: 13.85 ms.
  - **Flaky, still open:** in some `look-set` runs a far-set tree stays invisible after the shot
    sequence's camera jumps (its shadow and litter still draw). A fresh pose shows it. It looks
    like a dissolve fade-in that never completes (`render/trees.js` kinds 2/4; `treeLod.w` against
    the stamp). It predates A2, and A2's shot comparisons tripped over it twice. To investigate.
- 2026-11-14 — **A2: pine.**
  - `tools/models/needle_atlas.py` models the pine row in Blender. Scots pine shoots: paired needles
    7 cm long at 40–72° round each shoot, the older wood bare, a tuft at the bud, blue-green with
    per-needle tone, orange-brown stems.
  - The first try was too dense (spruce-like pipe-cleaners) and was thinned to ~640–760 fascicles
    per unit of shoot.
  - Loaded into atlas row 0 (`data/textures/leaf-pine*.webp`).
  - Pine form: crown from 42–58% of the height (it was 25–40%), 16–26 whorl branches (26–40),
    gnarl 0.24. The 'spider' of straight spokes under the crown is gone.
- 2026-11-14 — **Exposure and contrast.**
  - `tools/bot/look-set.mjs` takes `restored`. Every earlier shot was the meadow *stilled* (the
    game's drained grade, 45% desaturated), so realism is now judged in both states.
  - Dusk: a field in a ridge's shadow went near black. The meter may now open up to +1.5 stop
    (was +0.75) (`atmosphereCompute`).
  - The day shadow lift goes 2.6 → 1.6 (`post/chain.js`), so the darks are kept deeper.
  - **Diagnosis of the "milky" look against the reference:**
    - It isn't the haze (fogDensity 6 → 1.5 barely changes it), nor bloom, LUT or grain (all off:
      still there).
    - The frame lacks deep darks: inner crowns, the shade inside the sward and the forest's depth
      are lit flat, because there is no real occlusion or bounce. R2 is the fix.
  - Also seen against the reference:
    - the distant mountain ring is low-poly white cut-outs (an asset to replace);
    - the flowers are an even carpet (to thin and cluster in A3).
- 2026-11-14 — **Distant mountains.**
  - The white low-poly peaks in the meadow's views are the continent's own terrain at the
    clipmap's coarse levels (not the ring, which was hidden to check).
  - `clipmap.wgsl.js` `farDetail()` adds erosion to the normal every material reads, from 600 m,
    full by 1.5 km: four octaves of ridged-noise gradients (320 m → 27 m), stronger on steep faces.
    The snow and rock shading then follow the gullies and ribs.
  - The ring (`ring.wgsl.js`) gets the same detail (900 → 25 m), plus strata, ribs and
    gully-bedded snow.
  - Shots: `screenshots/bot/look-lg-meadow-e` (before) / `look-mt2-meadow-e` (after).
  - Also this round:
    - canopySky 0.45 → 0.82 (a closed canopy passes 10–20% of the sky);
    - leaf gain 0.62 → 0.48 (canopy albedo; the forest now reads deep against the meadow, as in
      the reference).
