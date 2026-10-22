# Terrain plan: the central hill, stair and village ground

## 1. What I found
- Terrain = bake only. `tools/bake-world/index.mjs` builds a 4 m macro grid, then hydrology (rivers/lakes), then `carveStory(h4,...)` (story.mjs: levelled pads with smooth skirts + the Shapers' Run corridor), then biomes/surface/hydro/2 m tiles all derive from the carved h4. Runtime has no terrain edit hook: `WorldData` (CPU) and the clipmap WGSL read the same 2 m tiles + `meso.js` (meadow adds only +-1.1 m noise), so CPU/GPU parity is automatic for anything baked.
- Bake cost: full scale 22 s, scale 4 = 1.9 s. A carve adds under 1 s. Output is deterministic (carveStory uses only + - * / sqrt). `npm run bake:verify` compares SHA-256 of all 16x16 height tiles; any carve changes the hashes of the touched tiles only (water/lake/hydro files change only if I touch h4 before hydrology, so carve AFTER hydrology like carveStory does).
- Hard limit: height texel is 2 m (4 m macro, bicubic). Steps, vertical walls and a stair cannot live in the heightfield. Max usable terrain slope is about 55-60 deg with ringing.
- Meadow is NOT flat: every candidate I tested has a regional ramp of 10-17% rising north to the frost (plane-fit max residual 28-60 m over r=260 m). Honest consequence: any village disc needs a real regrade.

## 2. Recommended site (primary)
**Hill centre (200, 990), natural ground about 272 m.** Meadow weight 0.9+, dry within r=260 (lake edge about 310 m west at x~-110; stream mouth (-30,1040) about 230 m away). Reasons: the existing hub's lake and stream are beside it; the stream (x~-10, z 1260->1060, drops 298->256 m over 220 m = about 19%, 4-8 m wide) is a natural cascade for the mossy arch bridge; it is the sector that faces the lake and the south approach.
- Hill: irregular oval about 380 x 300 m footprint (long axis NE-SW), summit pad elevation about 412 m (+140 above the stair foot at 272). Summit pad: flat ellipse 120 x 90 m (manor 80 x 60 + forecourt), skirt 25 m with a rock-cliff drop on the S/W sides (the "terrain falls away" look). Flank profile: terraced - 6 benches of 8-12 deg (30-45 m deep) separated by 50-58 deg faces (rock/retaining-wall zone, +20 m each). Natural max walkable slope is 46 deg (`maxSlopeCos`), steeper slides, so these faces stop straight-line climbing.
- Village ground: a **horseshoe**, not a ring: south/west/east foot, regraded to a plane that tilts about 3% toward the lake (datum about 272 +- 6, keeps 35% of the original rolling via low-passed residual), blended out over 150 m. North and east of the hill the land is already 330-450 m (foothills of the frost): the hill is unioned (max-blend) into them. Cut up to about 45 m on the north-east side forms a natural cliff band behind the village (matches reference image 4). Earthwork zone about 700 m across but only about 60k cells of the 4 m grid.
- Fallback if the user wants a truly freestanding, symmetrical hill: **(100, 300)** (flattest found: gradient 4%, residual 29 m, meadow 0.99, no frost behind; but 730 m from the hub, no stream; would need a bake-made stream/bridge or none). A West site (-850,850) is bowl-shaped, no water near.
- Not verified: line of sight from the frost border (z 1350-1650); the hill sits in rising land, so from the north the summit (412) is roughly level with foothills (z 1360: 437 m). It reads against sky only from S/W/E and across the lake. Needs a viewshed check (reuse search4.mjs `los`) before committing.

## 3. How to build (bake, not runtime)
New `tools/bake-world/hill.mjs`, `carveHill(h4,n4,c4,half)` called right after `carveStory`:
1. Regrade the village horseshoe (plane + 35% low-passed residual, smooth skirt, exactly the pad idea of story.mjs, larger).
2. Add the hill: union of rotated-ellipse radial profile with terrace noise, `max(natural, profile)` outside the foot.
3. Summit pad + skirt (`smooth(r0,r1,d)` like FROST_SITES.pad).
4. **Stair corridor** reuses the Run machinery (densePath, per-cell nearest centreline, bank/wall skirt): floor graded to a constant 25 deg ramp, 18 m wide at the foot to 10 m at the top, landings as flat pads (14-20 m deep). The ramp is real, walkable terrain (46 deg limit), so even if stair solids fail the route stays passable.
5. Emit a `routes` entry (id `manor-stair`: centreline every 12 m, flights, landings) and fixed POIs (manor, forecourt, foot gate, bridge) in `pois.json`; the old `warden-meadow` arena (-540,484) must move to the manor pad via a fixed story POI (check `placePOIs` ordering so shrine positions do not shift).
Hydrology stays untouched, so rivers/lakes in `render/water.js` stay valid, **provided the carve stays dry**: the hydro/lake layer is baked from pre-carve h4; any carve over a river cell would leave water on dry hill. Keep the footprint clear of the stream (x -20..0) and lake; if the village needs to straddle the stream, mask hydro cells inside the carve.

## 4. Stair route geometry
Walk speed 5.2 m/s horizontal, no uphill slowdown in the controller. Step logic: grounded snap is 0.45 m; a platform top counts as floor if <= feet+0.7 m; stair treads of 0.17 rise are safe (0.45 absolute max).
- Treads 0.17 rise / 0.36 run (25.3 deg), about 820 steps for 140 m. Horizontal flight length about 300 m.
- Route: foot gate (broad paved ramp, 6 m rise, 6%) -> F1 24 m rise (centre axis, 18 m wide) -> terrace 1 (vista over roofs, 20 m deep) -> F2 22 m (switch NE) -> terrace 2 -> F3 20 m (switch SW, long diagonal) -> F4 18 -> terrace 3 -> F5 16 -> F6 14 (width tapers to 12 m) -> upper terrace (formal, symmetrical) -> F7 12 + F8 8 straight on the manor axis, 10 m wide, through a gate into the forecourt. About 8 landings, with turns the walked path is about 900 m, about 3 minutes at walk speed. Longer than that needs more switchbacks, not steeper steps.
- Collision: do NOT add 800 `platforms` (`solids.floor` scans every platform of near sites per query at 120 Hz). Add a new analytic **stair-run solid** (centreline segment, half-width, rise, tread; floor = stepped height) plus blocker boxes for parapets. Allocation-free, like existing platforms. Tread top >= ramp under it, so no sinking. `ARCH_SITES` is capped at 96 in the shader (frost 58 + hub 9): a 40-house village will exceed it; raise the limit or instance (separate task).
- Shortcuts: gliding and Gale updrafts (liftMax 13 m/s) can go up the cliff faces; gliding down from the summit is a feature. The steep faces + terrain slide stop walking shortcuts. Decide whether to accept the gale shortcut or gate the manor forecourt (open question).

## 5. What breaks / must be re-checked
- Data pins: `tests/bake.test.js` (manifest, 6 warden arenas), `tests/data.test.js`, `tests/chapter.test.js`, `tests/architecture.test.js` (reads pois.json; hub offsets), snapshot-pinned noise tests unaffected. Regenerate `data/world` and `manifest.json`; run `npm run bake:verify`, full `npm test`.
- Hub (-30,1030) is within 250 m of the hill centre: sites are seated on the lowest ground under footprint, so re-seat or move HUB. The mill/sails, market, shrine move with `meadowSites(origin)`.
- Photo spots near the meadow and `tools/capture/parity-check.mjs`, map (`ui/menus/map.js` overview from the 8 m tile - hill is automatic), water at the stream mouth and lake shore, trees/rocks/grass placement (driven by baked surface slope/material: the 55 deg faces will turn to rock, grass on benches: good, but re-tune density), `streamer.js` anchors (fine patch 48 m @ 0.25 m, coarse 256 m @ 2 m: a 400 m hill with 55 deg faces is fine, but add an anchor at the summit for the boss).
- Rendering: 55 deg faces at clipmap coarse levels (128 m max spacing, geomorph) may shimmer or silhouette-pop; check LODs 5-8 from the lake. Four shadow cascades (24/140/800/4500 m) handle a 140 m landmark; the long terrace shadows on the village at dusk need a look. Far mountain ring: foothills to the north exceed the summit, so the hill is part of the skyline rather than above it.
- Perf: terrain cost unchanged; the extra cost is manor/stair meshes and trees on slopes (meadow already 14-16.5 ms GPU).

## 6. Effort
1 session: site viewshed + hill/regrade carve + re-bake + tests/pins. 1 session: stair corridor, route data, stair-run solid + tests (reuse `climb`/`nav`/`controller` tests). 1 session: village roads/seating on the new ground, trees/rocks/water re-tune, captures on the target PC. Total about 3-4 sessions before any buildings.

## 7. Open questions
1. Freestanding symmetric hill at the flat fallback (100,300), or the foothill/lake site (more natural, half-embedded)?
2. Summit +140 m ok? A stair of about 3 min walking: longer wanted?
3. Accept gale/glide shortcuts to the manor, or gate the forecourt?
4. Move the hub (-30,1030) and the meadow Warden arena (-540,484) here?
5. Can the stream be moved/reshaped (needs a hydro edit) or must the carve avoid it?
