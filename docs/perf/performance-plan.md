# Performance plan: shorter loads, more FPS, Low at 60 fps on an i5-1235U (2026-10-31)

Goal (user): graphics presets Low / Medium / High / Ultra, with the least loss of look; **Low must hold a steady 60 fps on an Intel i5-1235U with no dedicated GPU** (Iris Xe, 80 EU, shared memory); and loading must be shorter.

Status: the presets exist (`src/core/graphics.js`, Settings → Graphics). On the 3060 they scale cleanly. **Low is not yet near 60 fps on the i5-1235U by estimate (≈ 20–30 fps); it has not been measured on that machine.** This plan is how to close the gap and how to measure it.

## 1. What we measured (3060, headless Windows Chrome, 2560×1440)

### What each lever costs (render scale 0.7, everything else on): `docs/perf/graphics-costs.json`

| Lever | Meadow (14.6 ms) | Canyon (13.4) | Dunes (8.9) | Frost (9.0) |
|---|---|---|---|---|
| Shadows (all cascades) | 2.32 | 2.82 | 0.83 | 0.91 |
| Trees | 2.04 | — | — | — |
| Grass | 1.71 | 0.54 | 0.58 | 0.54 |
| Rock outcrops | 1.02 | 1.31 | 1.19 | 1.36 |
| Canyon walls | — | 1.34 | 0.21 | — |
| Light shafts / clouds + weather fog | 0.03 / 0.08 | 0.60 / 0.69 | 0.05 / 0.13 | 0.05 / 0.18 |
| Sharpening / bloom | 0.32 / 0.22 | 0.41 / 0.26 | 0.41 / 0.25 | 0.42 / 0.25 |
| SSAO, SSR, heat, mirage, dust, spindrift | ≤ 0.1 each | | | |
| Render scale 0.7 → 0.5 | −2.06 | −2.70 | −1.02 | −1.09 |

**Most of the frame does not scale with resolution.** Halving the pixels saves 1–3 ms of 9–15. The rest is geometry, shadow passes and compute: the terrain clipmap (12 levels of 256²), rocks, trees, grass, canyon walls, the shadow cascades that redraw them, and the terrain-state and atmosphere compute.

### The presets as built: `docs/perf/preset-perf.json`

Each preset is measured at its own render scale, with dynamic resolution off. The median GPU frame is in ms.

| View | Low (0.5) | Medium (0.67) | High (0.8) | Ultra (1.0) |
|---|---|---|---|---|
| Canyon at dawn | 8.15 | 10.88 | 14.73 | 18.60 |
| Meadow, golden hour | 7.86 | 10.83 | 15.43 | 18.32 |
| Dunes | 5.88 | 7.48 | 9.35 | 10.69 |

No late pipelines at any preset. In a Low frame the compute passes are about 0.9 ms.

### Loading (High, the meadow spot): `window.__wraith.loadTimes`

| Phase | Ends at (s) |
|---|---|
| Engine | 0.4 |
| World built (data, meshes, architecture) | 4.7 |
| Actors and systems | 6.7 |
| First frame | 7.4 |
| **Frames 2–4** | **27.7** |
| Streaming settled near the Wraith | 33.0 |

A trace of the GPU process during those frames (`tools/winchrome/load-trace.mjs`) shows Dawn spending 24.4 s on our commands:

- **render-pipeline creation: 17.8 s;**
- **compute-pipeline creation: 4.1 s;**
- **of which shader compiles (DXC): 9.8 s.**

The pipelines are made one at a time, synchronously; 99 of them average about 220 ms each. The disk cache barely hits: a second load in the same Chrome profile was no faster. On the main thread (`tools/winchrome/load-profile.mjs`) the next costs are the Wraith's first cloth steps (about 1.3 s), tree placement (about 1.2 s), water (0.6 s) and architecture building (about 0.6 s).

**GPU memory: about 3.1 GB** (2.3 GB of textures, 0.8 GB of buffers). That is too much for shared-memory laptops: it competes with system RAM, and every frame's sampling contends for the same bandwidth.

## 2. The target: Low on an i5-1235U

**The hardware.** Iris Xe with 80 EU at up to about 1.2 GHz gives roughly 1.5 TFLOPS. Its memory is shared DDR4/LPDDR4x at 50–68 GB/s. The 3060 has 12.7 TFLOPS and 360 GB/s. For this kind of renderer, expect the i5 to be **7–9× slower**.

**The budget.** 60 fps is 16.7 ms on the laptop. That is about **2.0–2.4 ms of today's 3060 frame**, at the laptop's resolution. A 1080p panel on Low renders 960×540, which is 0.52 MP against the 0.92 MP measured above.

**Where Low stands.** It costs 5.9–8.2 ms on the 3060, perhaps 5.5–7.5 ms at 960×540. On the laptop that is **≈ 40–65 ms, about 15–25 fps**. To reach 60 fps, Low must lose about two-thirds of its fixed cost.

**Also: the CPU.** The i5-1235U has 2 performance cores, up to 4.4 GHz, and 8 efficiency cores. A whole frame's JS (systems, cloth, Shaped, NPCs, readbacks) must stay well under about 8 ms there. It is unmeasured.

## 3. FPS: what to do, in order (each step measured on the 3060 and, as soon as possible, on the laptop)

**Step 0: measure on the laptop (the user, 10 minutes).**

Run `npm run playtest`, then open `/playtest.html`, then *Benchmark: Low* (`?bench=1&gfx=low`). Chrome's WebGPU runs on Iris Xe. If timestamp queries are unavailable there, the panel shows presented frame times, which are enough. Send the results (they are also written to `perf/runs/`). Every estimate here is replaced by that number.

**Step 1: free wins (no visual cost), about −1.5 to −2 ms on the 3060 at every preset.**

1. **Rocks: draw only the slots in use.**
   - Today 700 + 1700 + 160 instances are always drawn. Unused ones are discarded in the vertex shader, but still cost about 1.1 M vertices per pass, plus their shadow passes. That is 1.0–1.4 ms everywhere.
   - Fix: set the thin-instance count, rounded up to buckets of 64, so the recorded draws only change when a bucket does.
   - Also fill by distance, so a full budget drops the farthest rocks, not arbitrary ones.
2. **Grass only where it can grow.** Done this session: grass and ground cover are switched off over the frost, the canyon floors and the heart of the erg (they cost about 0.55 ms there drawing nothing). Ground cover could go further: off beyond the meadow.
3. **Shadow casters by distance.** Every caster is drawn into each cascade it is listed for, without culling. Cull rocks, trees and architecture per cascade by its bounds: one sphere test per thin-instance group, or GPU culling.
4. **Clouds, fog and shafts at half resolution**, upsampled with depth: 0.7–1.3 ms in the canyon today.

**Step 2: what Low gives up (judge each by eye against High).**

1. **Terrain clipmap on Low:** 10 levels instead of 12, and 192² instead of 256². That is about 45% fewer vertices in the main pass and in every shadow pass. Distant terrain keeps its silhouette (the mountain ring stands in).
2. **Shadows on Low:** two cascades, to 140 m and 800 m, drawn at 1024², with far terrain unshadowed. The far cascades redraw only every second frame (keeping the old matrix with the old map).
3. **Compute on Low:** terrain-state relaxation and healing at half rate. Atmosphere and cloud look-up tables update only on time-of-day or weather change (or every N frames).
4. **Post on Low:** TAA kept (it upscales from 0.5 and steadies the image). Bloom, SSAO, SSR and sharpening are off (as now). Fog and cloud march at quarter resolution.
5. **Trees on Low:** impostors (one quad, a baked atlas) beyond 120 m instead of the far LOD.
6. **Textures on Low:** half-size material library (2.3 GB → about 0.6 GB). This cuts bandwidth, which is what an integrated GPU is short of.

**Step 3: the CPU on the laptop.**

1. Profile a frame with `?sysprof=1` on the laptop.
2. Likely costs: cloth (the Wraith and the Veiled), the Shaped AI, NPC updates, terrain readbacks.
3. On Low, cut cloth substeps for anyone but the Wraith, and update distant systems at lower rates (the budgets already exist for NPCs).

**Step 4: a floor.**

1. If after steps 1–3 the laptop holds 45–55 fps rather than 60, Low gets dynamic resolution down to 0.4 (it now stops at 0.45).
2. A "Steady 30" frame target (already a slider) stays available for older machines.

**What it should come to (on the 3060, Low):**

| | Saving (ms) | Low (ms) |
|---|---|---|
| Today | | 6–8 |
| Step 1 | −1.5 to −2 | |
| Clipmap | −1 to −1.5 | |
| Shadows | −0.5 to −1 | |
| Compute and post | −0.5 to −1 | |
| **After** | | **≈ 2.5–3.5** |

That is about 18–30 ms on the laptop. The last stretch to 16.7 ms depends on the measured numbers: memory bandwidth and the CPU are the unknowns. A steady 60 is plausible after step 2 at 960×540, with dynamic resolution doing the rest. **It is not promised before step 0's numbers exist.**

## 4. Loading: what to do, in order

1. **Make the pipelines in parallel and in advance (the 22 s).**
   - Dawn compiles `createRenderPipelineAsync` and `createComputePipelineAsync` on worker threads. Babylon creates pipelines synchronously at their first draw, one at a time.
   - At the start of loading, replay last session's pipeline descriptors (shader code, layouts, states; recorded on the first run, stored per build in IndexedDB) through the async calls, in parallel with the world build.
   - Dawn's in-memory cache then hands Babylon's later synchronous creations the already-built pipelines.
   - Expected: 22 s → 4–6 s on an 8-thread CPU. The first run of a build stays slow, so record and replay from the second load on.
2. **Fewer, smaller pipelines.**
   - Several shadow-depth materials are identical per cascade. Share one pipeline: the light and origin go in a buffer, not a new material.
   - Very large WGSL (the clipmap, the post chain) splits into variants per preset, so Low compiles less.
   - Also check why Dawn's disk cache does not hit on the second load: `DawnCachingInterface::CacheHit` shows 0 ms.
3. **Settle sooner.**
   - Today loading also waits for every detail tile in a radius, the terrain-state pages and both relaxations near the spawn point.
   - Lift the curtain once the ground under the Wraith and the near clipmap levels are in. Far tiles keep streaming behind fades, as they do in play.
   - Expected: −2 to −4 s.
4. **Main-thread work at boot:**
   - Pre-bake the architecture sites' merged geometry at build time (it is deterministic) instead of building it in the browser.
   - Defer tree placement beyond the first ring, and the Wraith's first cloth steps, until after the curtain lifts.
   - Expected: −2 s.
5. **Data:**
   - The world files load at about 4 s. Fetch the region around the spawn point first and compress the rest.
   - Low loads half-size textures.

Expected load on the 3060 after steps 1–4: about **8–12 s** (from 33 s). The first load of a new build is longer until its pipelines are recorded.

## 5. How we check, each step

- `node tools/bot/graphics-costs.mjs`: each lever's cost at fixed views.
- `node tools/bot/preset-perf.mjs`: each preset's GPU frame.
- `window.__wraith.loadTimes`, `tools/winchrome/load-trace.mjs` and `tools/winchrome/load-profile.mjs`: load phases, GPU-process time, main-thread time.
- On the laptop: `?bench=1&gfx=low` (the user).
- No step may add late pipelines or per-frame allocations, and each is judged against High by screenshots at the review spots.
