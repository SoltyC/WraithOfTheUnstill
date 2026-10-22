# Village rendering/performance plan

## Baseline facts
- Meadow bench (perf/runs/2026-10-21T19-2*, render scale 0.7, 2560x1440 out): GPU 13.8-16.5 ms median; cascades+scene 10.7-12.9, post/compute 2.2-3.3, display 0.66. No headroom for a village yet.
- Architecture: ONE draw, 593k verts. The 9 meadow sites are only 75.7k verts (8.4k/site); ~517k is frost, still vertex-processed (collapsed by `shown=0`) in the main pass and cascades 0-1 while in the meadow. Boot build is synchronous (meadow sites 56 ms).
- Lights: 16-slot per-pixel loop (4 spell + nearest 12), CPU-sorted. Fire: 8 x 112 stateless quads.

## 1. Scaling architecture (100 buildings + manor, budget ~450k visible verts)
1. Chunk `buildArchitecture` (frost / hub / districts / manor): separate meshes with real bounds, frustum-culled, per-chunk cascade ranges (`addCaster` min/max). Frost stops costing in the meadow: about -0.5 to -1 ms, before any village work.
2. Instanced kits: ~10 house kits (~8k verts each) built once, placed as thin instances (matrix, site index, seed/tint). Variation: yaw, scale 0.9-1.15, tint, shutters/awnings/props toggles, prop clusters. Build cost goes O(kits) (~100 ms; move to a worker). Raise `ARCH_SITES` 96 to 384 (12 KB uniforms).
3. LOD: each kit has a hull (150-300 verts, same material ids) used beyond ~120 m, and ALWAYS in cascade 1. Manor: near mesh (<250 m, per wing) plus hull. No impostors: from the stair the village is 20-40 px houses.
4. Estimate: 35 near houses x 8k + 65 hulls + manor near ~150k = ~450k main, ~100k per cascade; +0.8-1.2 ms main (pixel-bound scanned PBR), +0.3 ms shadows.
5. CPU: `solids.js` is linear over all blockers (and `floorAnyQ` skips the near-cull for NPCs); needs an 8 m hash grid at 120 sites. Houses on a hill need terraced pads (terrain edit).

## 2. Night lighting
No screen-space tiled/clustered compute: five forward materials plus transparent grass/cloth would all need it, plus a depth prepass. Use a **world-space light grid**:
- Static lanterns/candles/windows (300-600) baked on CPU into a 4 m cell grid over the ~400 m village (10k cells x 8 u32 = 330 KB storage buffer; strongest 8 per cell); per-frame 256 x vec4 level/flicker array (4 KB). Shader: cell lookup, <=8 lights; outside the village, the existing 16-slot set. Spell slots stay exact.
- Cost: 8 lights x ~30 ALU x ~2.7M shaded px = ~0.65 GFLOP, about 0.2-0.35 ms on the 3060; grass +0.1; total ~0.5 ms. (Even 16 lights is only ~0.4 ms: the arithmetic is cheap, the design problem is data access.)
- Windows: emissive leaded-pane material id driven by a night uniform and hash flicker; one grid light per ~2 windows (5 m, warm) for street spill. Lanterns/candles: grid light + additive glow card (400 instanced billboards, ~0.1 ms, feeds bloom). No shadows from them.
- Real nearest-12 slots only for fire hot spots, torches, NPC-carried lanterns.

## 3. Fire/smoke at scale
- `FIRES` 8 to 64 emitters (1 KB uniform), distance LOD 112 / 40 / 12 particles, far fires as one tall flame+smoke column card (visible from the hill at 500 m+). Cap ~14k quads (now 896); additive overdraw ~1.0-1.5 ms. Render smoke to a half-res alpha target (~0.3 ms, saves more).
- Lighting: each burning building owns 1-2 grid lights, level = burn state, per-light flicker in-shader; `siteGlow.y` already drives wall fire tint, extend to char/emissive cracks. Extinguished fires compact out of the active list (vertex shader still runs for w=0).

## 4. Stutter diagnosis
- Walk presented p95 24-29 ms vs GPU p95 < 18. Hitches cluster at 17.6 / 23.5 / 29.4 = 3/4/5 x 5.88 ms: ~170 Hz display, GPU frame (14-16.5 ms) straddling refresh boundaries. PERF.md shows game CPU 0.3 ms median, and fly (no tile work) has 235 hitches, more than walk. Mostly pacing, not CPU.
- Walk-only suspects: `trees.js rebuild` every 20 m plus a second "clean" rebuild after fades, each doing `thinInstanceBufferUpdated` on every species/variant/LOD mesh and `snapshotRenderingReset()` (re-records bundles); streamer's per-frame O(tiles^2) nearest-tile scans (2 passes) and full `resident` array re-upload per tile; patch structured-clone (193^2 + 129^2 floats) every 10 m.
- Fix order: (1) re-bench at fixed 60 Hz with hitch flags; (2) dynamic render scale holding GPU <= 11 ms (170 Hz) / 15 ms (60 Hz); (3) amortise tree rebuild (sliced, double-buffered, no snapshot reset); (4) streamer candidate list, dirty-range uploads, transferable patches; (5) worker result pools.

## 5. Frame budget (3060, 0.7 scale, 60 fps floor, target 14 ms)
Terrain 5.5, trees/grass 3, village 1.5, village shadows 0.5, lights 0.5, fire+smoke 1.2, post 2.4-3, display 0.7 = 14-15 ms. Free ~1.5 ms first: frost chunk culling (-0.7), cascade-1 hulls, cached far cascades. Night is cheaper (weak moon: skip cascade 2-3 casters, ~-1 ms).

## 6. Effort (sessions)
Chunks+frost culling+sites 384+solids grid 1; instanced kits+hulls+variation 2; light grid+window/glow cards 1; fire LOD/half-res smoke/burn state 1.5; stutter work 1; hill/manor LOD+target perf pass 1. Total ~7.5.

## 7. Risks
Material arrays already 380 MB uncompressed (each new scanned set ~+50 MB: compress or cap); hill exposes the whole village at once; additive fire overdraw; grid cannot light moving NPC lanterns; the user's real display refresh may differ; locked-PC bench numbers suspect.
