# Performance

Measured cost per system, per biome (BRIEF §14). Every number states the machine it came from.
Only numbers from the target machine T (Windows 11, RTX 3060, Chrome stable, 2560×1440; see
DECISIONS.md) count toward gates.

## Machines

| Id | Machine | Browser / GPU path | Valid for |
|---|---|---|---|
| **T** | **Target (since 2026-10-02):** Windows 11, NVIDIA RTX 3060 12 GB, 3840×2160 monitor, Chrome stable | real GPU, via the in-page benchmark (`?bench=1`) | everything |
| **W** | Same PC, inside WSL2 (Ubuntu 22.04, 4 GB / 4 cores): Playwright Chromium 153 headless shell, WebGPU on **SwiftShader (CPU)** | software | allocation profiles, image captures; **not** timings |
| ~~5070 Ti~~ | Original BRIEF target, no longer available (DECISIONS.md) | — | — |

## Frame budget (re-based for target T: 2560×1440 at 60 FPS = 16.7 ms)

BRIEF §14's allocation scaled ×1.5. Refine per biome as systems land.

| System | Budget | Phase 0 measured (T) | Phase 1 measured (T) |
|---|---|---|---|
| Terrain (clipmap, state passes) | 2.25 ms | see "Target runs" | compute 0.26 ms (incl. atmosphere) + share of main 1.8–2.0 ms (flight run 1) |
| Vegetation | 2.25 ms | — | — |
| Sky, atmosphere, clouds | 1.5 ms | (in main pass) | in compute 0.26 ms + main pass |
| Shadows | 2.7 ms | — (none yet) | **1.44–1.64 ms** median (4 cascades) |
| Water and spell VFX | 2.25 ms | — | — |
| Characters, Shaped, cloth | 1.5 ms | (in main pass) | — |
| Post-processing | 3.0 ms | — (none yet) | — |
| Reserve (streaming, weather spikes) | 1.2 ms | — | — |

Rules: 60 FPS sustained, 1% lows ≥ 45 FPS, no frame above median + 4 ms.

## Target runs (machine T)

How: `npm run build && npm run preview` in WSL, then open
`http://localhost:4173/?bench=1&res=2560x1440` in Windows Chrome (fullscreen, tab focused). Results
are saved to `perf/runs/<date>.json`.

- **Presented** time is the rAF interval. It's capped at the display refresh rate, so it shows smoothness and hitches but not headroom.
- **GPU** time comes from timestamp queries on every pass of the frame (since Phase 1): `gpu.frame` is the span from the first pass's start to the last pass's end, broken down into `gpu.main`, `gpu.shadow` (render-target passes) and `gpu.compute`. Phase 0 runs recorded the main pass only, as `gpuMainPass`. Chrome quantises to 0.1 ms.

### Phase 0 test field, 2026-10-02 (production build, 3 draws, 832k triangles, render locked to 2560×1440)

Chrome 153 on Windows. The adapter reports "nvidia / ampere", with timestamp queries available. The display refresh is ~170 Hz (5.9 ms presented frames), so presented FPS is capped near 170.

**Run 2** (`perf/runs/2026-10-02T09-47-14-077Z.json`, fullscreen 1920×1080 window, no focus or resize events):

| Phase | GPU main pass median / p99 / max | Presented FPS | 1% low | Max frame | Hitches > median+4 |
|---|---|---|---|---|---|
| idle | 1.64 / 1.97 / 2.03 ms | 170.0 | 158.7 | 8.1 ms | 0 |
| walk | 1.77 / 1.97 / 2.49 ms | 169.8 | 158.7 | 11.9 ms | 2 (single missed refresh each) |
| fly | 1.18 / 1.77 / 1.97 ms | 170.0 | 161.3 | 7.0 ms | 0 |

**Run 1** (`perf/runs/2026-10-02T09-43-59-513Z.json`, windowed 1920×945, before event logging existed):
- GPU numbers match run 2: idle 1.57 / 2.75 / 6.0, walk 1.90 / 2.43 / 2.6, fly 1.05 / 1.70 / 2.0 ms.
- The idle phase had 15 hitches, max 52.6 ms. They didn't reproduce in run 2 and can't be attributed (no event log in run 1).

**Reading:**
- The Phase 0 frame costs ~2 ms of GPU against the 16.7 ms budget.
- All late-pipeline counts are 0.
- The walk phase's two 11.9 ms frames are one missed 170 Hz refresh each, with a GPU max of 2.5 ms.

**Runs 3–4** (`…09-50-21-380Z.json` with `gpuTimer=0`, `…09-52-27-509Z.json` timing every 4th frame), both fullscreen 1920×1080 with no page events:

| Run | Idle | Walk | Fly | GPU median / p99 / max |
|---|---|---|---|---|
| timer off | 0 hitches (max 7.6) | 3 (11.5–11.9 ms) | 1 (11.1 ms) | — |
| timer 1/4 | 0 (max 8.0) | 1 (11.9 ms) | 0 (max 7.0) | idle 1.64/2.03/2.43, walk 1.77/2.03/2.16, fly 1.18/1.51/1.97 ms |

**Open defect:** about one frame in 1,500 (~0.07%) lands one 170 Hz refresh late (~11.8 ms), mostly while moving.
- It happens with the GPU timer off and with a flat JS heap, so neither the measurement nor GC explains it.
- The GPU never exceeds 2.5 ms.
- Not yet determined: a real dropped frame vs a late rAF callback that the next frame absorbs. The benchmark now records each hitch's neighbouring frames and the minimum frame time to settle that.
- **Run 5** (`…10-00-52-258Z.json`), with neighbouring frames recorded:
  - Idle: 2 late callbacks (10.5 ms then 1.3 ms; 14.9 ms then 0.6 ms). The next frame catches up, so nothing presents late.
  - Walk: **3 real drops**, at 11.4, 17.2 and 12.1 ms, with normal ~5.8 ms frames on both sides.
  - Fly: clean. The GPU stayed ≤ 2.3 ms throughout.
  - Verdict: real CPU/compositor-side drops while walking, about 1 frame in 570, worst 17.2 ms. **Carried into Phase 1 as an open defect.** Take a DevTools Performance trace of the walk phase once Phase 1's per-frame systems exist.

### Phase 1 gate flight, run 1 (2026-10-03, `perf/runs/2026-10-02T19-57-36-036Z.json`)

`http://localhost:4173/?bench=flight&res=2560x1440` in Windows Chrome: window 1920×1080, render locked to 2560×1440, ~170 Hz display, adapter "nvidia / ampere". The flight crosses the continent (10.2 km) at surf speed (20 m/s, 12 m up), then at glide speed (40 m/s, 45 m up).

| Phase | Frames | Presented median / p99 / max | Over median + 4 ms | GPU frame median / p99 / max | main / shadow / compute (median) | Tiles | Late pipelines |
|---|---|---|---|---|---|---|---|
| surf | 86,337 | 5.9 / 6.7 / **29.1 ms** | **198** (0.23 %) | 4.13 / 4.72 / 5.77 ms | 1.97 / 1.64 / 0.26 ms | 99 | 0 |
| glide | 43,223 | 5.9 / 6.8 / **17.7 ms** | **55** (0.13 %) | 3.87 / 4.33 / 4.65 ms | 1.84 / 1.44 / 0.26 ms | 0 (already resident) | 0 |

**Gate: NOT MET.** The rule is no frame above median + 4 ms (9.9 ms at 170 Hz), and 253 frames exceed it.
- **GPU:** never above 5.8 ms, a quarter of the 16.7 ms budget. Shadows cost 1.4–1.6 ms against their 2.7 ms budget; compute (atmosphere, clipmap, terrain state) costs 0.26 ms. None of this is the cause.
- **Hitches:** on the CPU, compositor or presentation side. This is the Phase 0 walk defect (about 0.07 % of frames) at roughly 3× the rate in surf, which streams 99 tiles and patches; glide sees fewer.
- **Run 1 couldn't attribute them:** the flight bench recorded only presented intervals.
- **Instrumented since:** each frame now records systems and `scene.render` CPU time plus tile-upload, state-scroll, clipmap-rebuild and patch flags. Each hitch is classified as absorbed (a late callback) or a real drop, against the base rate of each flag. Run 2 attributes them.

### Phase 1 gate flight, run 2 (2026-10-03, `perf/runs/2026-10-02T20-16-42-646Z.json`, instrumented)

| Phase | Over median + 4 ms | Worst | Typical hitch | CPU of the frame before (systems + render) | Tile / patch / scroll before | Absorbed by next frame |
|---|---|---|---|---|---|---|
| surf | 118 / 86,416 | 29.4 ms | 11.7 ms (one missed 170 Hz refresh) | 0.2–1.2 ms | 0 / 0 / – | 13 |
| glide | 80 / 43,212 | 17.9 ms | 10.5–11.8 ms | 0.2–1.1 ms | 0 / 1 / – | 28 |

**Reading:**
- **Not our CPU work.** The game's CPU work is tiny: systems 0.1 ms and `scene.render` 0.2 ms median, both under 1.2 ms on every hitch frame. Hitches have nothing to do with tile uploads or collision patches.
- **The gate test is harsh at 170 Hz:** they are refreshes missed between submission and presentation. At 170 Hz a refresh is 5.88 ms, so one missed vsync already exceeds median + 4 ms. The GPU frame is 4.1 ms median, but its sampled max (5.6–6.0 ms) reaches a whole refresh. The working hypothesis is that GPU spikes over 5.88 ms, ours or the compositor's, miss vsync.
- **The terrain-state window never scrolled in runs 1–2:** it follows the player, who stands still during the flight.

**Instrumented since:**
- the flight samples GPU time every frame and matches it to each hitch (`gpuPrevMs`, plus the base rate of frames over one refresh);
- the terrain-state window follows the flight.

### Phase 1 gate flight, run 3 (2026-10-03, `perf/runs/2026-10-02T20-34-52-649Z.json`, GPU timed every frame)

| Phase | Over median + 4 ms | Worst | GPU frame median / p99 / max | GPU of the frame before the hitches (min / median / max) | Hitches with GPU > one refresh | All frames with GPU > one refresh | Scroll before the hitch (vs base rate) |
|---|---|---|---|---|---|---|---|
| surf | 145 / 86,383 | 23.4 ms | 4.19 / 5.37 / 7.67 ms | 3.54 / 4.19 / 5.24 ms | **0 / 145** | 11 / 86,382 | 53 % (53 %) |
| glide | 80 / 43,193 | 29.3 ms | 3.93 / 5.24 / 5.77 ms | 3.54 / 4.00 / 5.18 ms | **0 / 80** | 0 / 43,193 | 92.5 % (91.5 %) |

**Reading:** this refutes the GPU-spike hypothesis.
- The GPU time before each hitch is an ordinary frame, the same distribution as every other frame.
- No hitch follows a GPU frame longer than a refresh.
- Terrain-state scrolling (now exercised) appears before hitches exactly at its base rate.
- CPU is 0.3 ms median, under 1.2 ms on every hitch frame.

Neither the game's CPU work nor its GPU work explains the missed refreshes. They are presentation stalls outside the frame: compositor, browser GPU process or OS scheduling, about 1 frame in 500–600. The render is locked to 2560×1440 in a 1920×1080 CSS window, so the compositor also scales every frame. **Gate status: NOT MET on the strict rule. The cause is outside the game; see PROGRESS.md for the decision this needs.**

### Phase 1 gate flight, run 4 at 60 Hz (2026-10-03, `perf/runs/2026-10-02T20-51-18-667Z.json`)

The display was set to 60 Hz (the target refresh). Same flight, same build as run 3.

| Phase | Frames | Presented median / p99 / max | Over median + 4 ms (20.7 ms) | Of those, absorbed by the next frame | Real drops | GPU frame median / p99 / max | main / shadow / compute | Hitches with GPU > refresh | CPU before the hitches |
|---|---|---|---|---|---|---|---|---|---|
| surf | 30,530 | 16.7 / 17.8 / 35.9 ms | 30 (0.10 %) | 19 | **11** | 6.03 / 7.08 / 7.93 ms | 2.62 / 2.10 / 1.18 ms | 0 / 30 | ≤ 0.9 ms |
| glide | 15,267 | 16.7 / 17.5 / 48.8 ms | 13 (0.09 %) | 10 | **3** | 6.03 / 6.88 / 8.19 ms | 2.56 / 1.90 / 1.44 ms | 0 / 13 | ≤ 0.6 ms |

**Reading:**
- **Real drops are rarer at 60 Hz:** 14 in 45.8k frames (1 in 3,300), against 1 in 550 at 170 Hz. Most over-limit intervals at 60 Hz are late callbacks that the next frame absorbs.
- **The signature is the same as at 170 Hz:**
  - every hitch follows an ordinary frame (CPU ≤ 0.9 ms, GPU ≤ 8.2 ms against a 16.7 ms refresh);
  - no GPU frame in the whole run exceeded a refresh;
  - nothing correlates. Scroll is 100 % because the window scrolls every frame at flight speed, and no tiles or patches appear before any hitch.
- **Some drops come in pairs** (frames 851–852 and 10056–10057, each ~33 ms twice), as an external ~50 ms stall would.
- **The GPU frame grows from ~4.2 to ~6.0 ms at 60 Hz:** with more idle time per refresh the GPU clocks down. That's power management, not extra work. It is still 36 % of the 16.7 ms budget.

**Verdict:** the game causes none of the hitches. **Gate met under the user's ruling of 2026-10-03:** only game-attributable hitches count (DECISIONS.md), and there are 0. Stalls from outside the game (14 real drops in 45.8k frames at 60 Hz, 1 in ~550 frames at 170 Hz) are reported separately and re-checked in every later phase's benchmark.

### Phase 2 flight, run 1 at 60 Hz (2026-10-03, `perf/runs/2026-10-03T04-04-04-009Z.json`)

First measurement of the Phase 2 frame: snow material, PCSS, rocks, spindrift and deformation.

| Phase | GPU frame median / p99 / max | main / shadow / compute (median) | Frames with GPU > 16.7 ms | Over median + 4 ms (presented) | Hitches the game caused |
|---|---|---|---|---|---|
| surf | 9.9 / 17.1 / 18.2 ms | 5.0 / 3.8 / 0.9 ms | **787 (2.6 %)** | 22 (18 absorbed) | **2** (GPU frame over a refresh) |
| glide | 9.6 / 14.9 / 16.7 ms | 4.6 / 3.6 / 1.0 ms | 1 | 9 (7 absorbed) | 0 |

**Over budget:**
- Shadows cost 3.8 ms against 2.7 ms.
- The main pass spikes to 11–12 ms while surfing low over snow, which is fragment-bound.
- Rock casters ran a 9-noise finite-difference vertex shader in all four cascades.

**Fixes since:**
- rock LOD (near mesh 642 vertices, far mesh 162 beyond 140 m);
- a normal-free rock shadow vertex shader, and rocks cast into cascades 0–2 only;
- far cascades use plain PCF (no blocker search);
- the snow shader skips rock work where there is no rock.

Re-measure with run 2.

### Phase 2 flight, run 2 at 60 Hz (2026-10-03, `perf/runs/2026-10-03T05-56-20-370Z.json`), after the fixes

| Phase | GPU frame median / p99 / max | main / shadow / compute (median) | Frames with GPU > 16.7 ms | Over median + 4 ms | Hitches the game caused |
|---|---|---|---|---|---|
| surf | **7.4 / 13.0 / 14.0 ms** | 4.0 / **2.2** / 0.9 ms | **0** | 20 (15 absorbed) | **0** |
| glide | **7.1 / 11.9 / 13.2 ms** | 3.6 / 2.0 / 1.0 ms | 0 | 4 (2 absorbed) | 0 |

**Reading:**
- The Phase 2 frame fits the 16.7 ms budget with at least 2.7 ms to spare at its worst frame. Shadows (2.2 ms) are back under their 2.7 ms budget.
- No hitch is game-attributable, so the frame-time rule (as ruled for Phase 1) holds.
- No late pipelines.

## Phase 1 measurements (machine W, 2026-10-03)

### Scene cost (structure, any machine)

From `screenshots/phase-01/overlay-check.json` at 2560×1440 (spot p1-monastery-golden):
- Draw calls per frame: **12**:
  - sky;
  - clipmap (one thin-instanced draw for 12 levels);
  - capsule;
  - mountain ring;
  - 4 cascades × (clipmap + capsule).
- Triangles: **2.11M** across the main and shadow passes. The clipmap is 12 × 131k triangles; the ring is 520k.
- GPU memory (live buffers and textures): **678 MB**. Mostly:
  - terrain-state fine window, 3 × 67 MB;
  - coarse page atlas, 3 × 50 MB;
  - shadow cascades, 4 × 2048² R32F plus depth;
  - the clipmap level data;
  - world storage buffers;
  - MSAA targets.
- Pipelines: **20**, all created during loading. **Late pipelines: 0** (the terrain-state passes warm up as no-ops).
- Passes per frame: about 3 compute passes (atmosphere, plus clipmap and terrain state when they have work), 4 shadow passes, 1 main pass. Before the fix each cascade took 2 passes; see DECISIONS.md.

### GPU timing on software (indicative only)

A SwiftShader frame at 320×180 spans ~3.0 s: main 1.34 s, shadows 1.56 s, compute 0.07 s. That's CPU rasterisation, so it says nothing about T beyond the fact that the shadow passes are the largest vertex load: 4 × the full clipmap. If `gpu.shadow` is high on T, cull clipmap levels per cascade.

### Allocation

**Not re-measured this session.** With four 2048² cascades, a 786k-vertex clipmap and the mountain ring, a SwiftShader frame takes ~3 s even at 640×360. The heap profiler's 3000-frame warm-up would take hours, and a short warm-up isn't a valid V8 steady state. The new per-frame CPU code follows the Phase 0 rules:
- no doubles as arguments: the shadow, terrain-state and clipmap updates read fields;
- pre-allocated typed arrays;
- integer change detection.

What it adds to the API floor is one `writeBuffer` each for shadow data, atmosphere params, terrain-state params (only while it has work) and clipmap params (only when a level moves): about 30 B each (DECISIONS.md). `npm run alloc` passes 9/9.

## Phase 0 measurements (machine W, 2026-10-02)

### Frame time: indicative only, software GPU

| Scene | Resolution | Avg FPS | Notes |
|---|---|---|---|
| p0-start-golden, full test terrain (819k tris), 3 draws | 2560×1440 | ~1.6 | SwiftShader rasterisation bound; meaningless for the target |
| same, `?grid=96` | 640×360 | ~29 | used only to warm V8 for heap profiling |

**To measure on T:** see "Target runs" above. (`npm run perf -- --channel=chrome` drives an installed Chrome with Playwright; it isn't usable here, because WSL can't automate Windows Chrome.)

### Scene cost (structure, any machine)

- Draw calls per frame: **3** (sky, terrain, player), replayed from render bundles (snapshot rendering).
- Triangles: **832k**, of which the terrain is 819,200 (640² grid). That's deliberately dense for the test field; Phase 1's clipmap replaces it.
- GPU memory (tally of live buffers and textures): **133 MB** at 2560×1440, mostly MSAA colour/depth targets and the terrain vertex buffers.
- Pipelines created: **5**, all during loading. **Late pipelines: 0.**

### Allocation (Phase 0 gate: "a heap profile of the idle loop shows zero allocations per frame")

Tool: `npm run heap`, which boots normally, waits N frames for V8 to optimise, then runs V8's
sampling heap profiler (16-byte interval, including objects collected by minor and major GC) and
attributes every sample to the frame loop and to game vs engine code via sourcemaps.

| Run | Warm-up | Game code (`src/`) | Avoidable engine code | WebGPU API floor | Browser idle | Total | Report |
|---|---|---|---|---|---|---|---|
| Session 1 baseline | 20k frames | 0 | 1068 (Babylon traversal, labels, iterators) | (included) | — | 1279 B/frame | `heap-profile-baseline-warm20k.json` |
| Final, clock running | 20k frames | **0** | **0** | 253 (incl. 31 for one `writeBuffer`) | 12 | **265 B/frame** | `heap-profile.json` |
| Final, clock frozen (`capture=1`) | 20k frames | **0** | **0** | 225 | 11 | **236 B/frame** | `heap-profile-frozen.json` |

**What the floor is:** each frame Chrome creates JS wrappers for the swap-chain GPUTexture, its GPUTextureView and the GPURenderPassEncoder (~142 B, all inside `_startMainRenderPass`), plus 2 × GPUCommandEncoder and 2 × GPUCommandBuffer (~82 B, inside `endFrame`). These were measured in isolation: `createCommandEncoder()` + `finish()` costs 42 B per pair. No WebGPU program can avoid them. "Browser idle" is `(IDLE_EXTERNAL)`, outside JS.

**`writeBuffer`:** each upload to a buffer that in-flight GPU work references costs ~31 B. With the clock running, only the capsule's uniform buffer changes, so there is one upload per frame. I tried three JS call shapes (Babylon's `setSubData`, an overridden `setSubData`, an overridden `updateUniformBuffer`), and the bytes always sat at the `writeBuffer` call site. A warm `writeBuffer` to an unused buffer costs nothing. That makes it part of the API floor, and it's why the design rule in DECISIONS.md is to batch per-frame uniforms into one upload.

**Gate verdict (user ruling, 2026-10-02):** game code 0 and avoidable engine code 0, so the Phase 0 allocation gate is **met**. The WebGPU API floor is reported above and is accepted.

Steady state needs V8 to optimise Babylon's large frame functions. Before that (the first few thousand frames) the engine allocates ~1 KB/frame. `tools/capture/frame-alloc-probe.mjs` gives fast site-level diagnosis.

Hot-path CPU code is checked in Node's V8 by `npm run alloc`: 2M calls per case, zero scavenges
required. All 9 cases pass (ground sampling, controller walking and idle, spring arm, environment
idle and time-flowing, clock, frame stats, pools).

At 90 FPS the steady-state residual is ~24 KB/s of short-lived wrapper objects. That's a young-generation scavenge roughly once a minute, well under 1 ms, and never a major GC.

### Phase 3 — the Wraith on T (2026-10-03, `?bench=1&res=2560x1440`, 60 Hz, run `perf/runs/2026-10-03T08-52-34-462Z.json`)

RTX 3060, Chrome 153, production build, spot p1-monastery-golden. The walk phase drives the
Wraith live (gait, CPU cloth, fur, effects) while the camera orbits.

| Phase | Presented (median / p99 / max) | FPS | GPU frame (median / p95 / max) | Main / shadow / compute (median) | Hitches |
|---|---|---|---|---|---|
| idle | 16.7 / 17.8 / 36.9 ms | 59.9 | 6.16 / 6.36 / 6.75 ms | 3.67 / 1.97 / 0.26 ms | 1 (frame 27, right after the spot is applied: the cloth's 120-step settle on teleport) |
| walk | 16.7 / 17.8 / 18.3 ms | 60.0 | 7.73 / 9.90 / 10.36 ms | 4.92 / 2.10 / 0.39 ms | 0 |
| fly | 16.7 / 17.5 / 23.1 ms | 60.0 | 5.96 / 6.29 / 6.55 ms | 3.34 / 1.77 / 0.59 ms | 1 (23.1 ms, presentation; GPU max 6.6 ms) |

- Draw calls 22, pipelines 25, late pipelines 0, GPU memory 679 MB, JS heap 314–337 MB.
- The walk phase at 60 Hz has no drops, and the GPU frame stays below 10.4 ms (budget 16.7 ms).
- On W (Node), the cloth simulation costs a median 1.6 ms and p95 2.0 ms per 60 Hz frame. The idle hitch matches the one-off 120-substep settle that runs when the Wraith is teleported (~0.15 s on W). It is a candidate for spreading over several frames.

### Phase 4 — surf and frost verbs on T (2026-10-03, 1440p, monitor at 170 Hz)

Runs were driven remotely in a separate Chrome instance (no-throttle flags) with every other browser closed. A first attempt measured 25–28 ms GPU frames while earlier game windows were still rendering in the background; those runs are discarded. Same spot for all rows (p3-wraith-walk-noon, the open snowfield, the heaviest view: the frost material).

| Run | Phase | GPU frame median / p95 / max | Main | Shadow | Compute | Presented median / p99 | Hitches |
|---|---|---|---|---|---|---|---|
| `12-07-55` `?bench=1` | idle (standing) | 11.6 / 12.6 / – ms | 7.6 | 3.3 | 0.52 | – | – |
| | walk (camera orbits) | 9.6 / 10.6 ms | 5.7 | 3.1 | 0.59 | – | – |
| `12-05-06` `?bench=bend`, before the spray fix | surf | 14.4 / 18.7 / 23.5 ms | 9.9 | 3.1 | 0.72 | 14.4 / 23.0 ms | 46 |
| | cast | 11.7 / 12.6 / 13.2 ms | 7.6 | 3.3 | 0.52 | 11.8 / 13.9 ms | 2 |
| `12-06-52` `?bench=bend`, spray with cheap shadow lookup | surf | 12.8 / 14.0 / 14.5 ms | 8.2 | 3.2 | 0.72 | 12.6 / 15.1 ms | 1 |
| | cast | 11.5 / 12.5 / 12.8 ms | 7.5 | 3.3 | 0.52 | 11.6 / 13.7 ms | 3 |

- **Verbs cost ~0** over standing in the same view (cast 11.5 vs idle 11.6 ms).
- **Surfing costs ~+1.2 ms** (wake brushes, spray, crest, streaks, spray shadows). That is after moving the spray off the PCSS shadow path: each spray fragment ran up to 48 shadow taps under heavy overdraw, and surf p95 was 18.7 ms, over the 16.7 ms budget. The spray now uses `shadowVisibilityFast` (4 taps), and puffs within ~2 m of the camera fade out.
- **First cast:** 0 late pipelines across both bend phases. Every verb's pipeline exists from loading, so there is no first-cast hitch.
- The open snowfield at 1440p sits at 11.6 ms standing. The frost material is the main cost; worth a pass in Phase 6 post / scalability.

### Phase 5 — the Warden, climbing and a pack on T (2026-10-03, 1440p, monitor at 170 Hz)

Run `13-37-17` with `?bench=fight`, every other browser closed. Phases:
- `warden`: p5-warden-golden; the Warden awake and advancing, the camera orbiting.
- `climb`: p5-climb-flank, gripping and climbing.
- `pack`: p5-pack-afternoon, a pack of Shaped fighting.

| Phase | GPU frame median / p95 / max | Main | Shadow | Compute | Presented median / p99 |
|---|---|---|---|---|---|
| warden | 10.7 / 11.0 / 11.9 ms | 6.2 | 3.8 | 0.46 | 10.6 / 12.2 ms |
| climb | 11.2 / 13.1 / 13.8 ms | 6.2 | 3.8 | 0.72 | 11.2 / 14.3 ms |
| pack | 13.2 / 13.8 / 14.4 ms | 8.4 | 4.1 | 0.52 | 13.3 / 14.7 ms |

- Draw calls 39, pipelines 34, **late pipelines 0**, GPU memory 689 MB.
- Every phase stays under the 16.7 ms budget at 1440p. The Warden at subdivision 4 (~1 M vertices, each blending 16 neighbour ellipsoids, in the main and cascade passes) adds about +0.7 ms of shadow over Phase 4.
- The pack is the heaviest view: up to 8 Shaped × 96 chunks, plus the frost material on the open snowfield.

- **Re-runs later the same day** after the release cinematic and diamond dust (`20-39-45`, `20-40-39`):
  - warden 10.8–10.9 ms median;
  - climb 11.9–12.1 ms median;
  - pack 14.1–14.5 ms median, 16.3–16.5 ms p95, which is at the edge of the budget.

  An A/B in the same session settles the cause. The earlier build (4f16ed4, which produced the 13.2 ms run above) measured pack 14.0 / 16.1 ms, the same as the new build. The rise therefore comes from the machine's load at the time, not from the new code. The diamond dust adds ~0.2 ms where it is visible (stilled warden spot) and is culled in restored air.
- **Watch item:** the pack view has the least headroom (p95 near 16.7 ms when the PC is busy). Candidates for the Phase 6 scalability pass: the frost material on the open snowfield and Shaped chunk counts at distance.

- **After the Phase 5 rework** (`21-24-49`: hold-to-hold climb, release rebuild, combat feel, audio):

  | Phase | GPU median | GPU p95 |
  |---|---|---|
  | warden | 10.9 ms | 12.5 ms |
  | climb | 9.1 ms | 11.1 ms |
  | pack | 13.0 ms | 14.5 ms |

  Late pipelines 0, draw calls 40. Still within the 16.7 ms budget at 1440p. The climb's chunk ray casts (up to ~8 rays × 380 ellipsoids a frame) do not show up.

## Phase 6 (post chain and weather) — target T, 2026-10-04

`?bench=weather&res=2560x1440` (`perf/runs/2026-10-04T09-54-39-706Z.json`), Chrome on the RTX 3060,
**display at 175 Hz** (the user's run). Draw calls 42, pipelines 49, **late pipelines 0**, GPU memory
785 MB (+96 MB over Phase 5: the post targets).

| Phase | GPU frame median / p95 / max | Scene (RTT passes) | Display | Compute | Presented median / p99 / max | > median+4 |
|---|---|---|---|---|---|---|
| clear | 12.3 / 12.8 / 13.1 ms | 8.9 | 0.66 | 2.36 | 12.3 / 13.5 / 13.9 | 0 |
| overcast | 12.5 / 13.0 / 13.6 | 9.0 | 0.66 | 2.43 | 12.4 / 13.8 / 14.4 | 0 |
| snowfall | 12.5 / 12.9 / 13.6 | 9.0 | 0.66 | 2.36 | 12.4 / 13.9 / 19.8 | 1 |
| blizzard | 12.6 / 13.0 / 13.4 | 9.1 | 0.66 | 2.36 | 12.5 / 13.8 / 14.8 | 0 |
| clear → blizzard (live) | 11.9 / 13.2 / 13.3 | 8.8 | 0.66 | 2.23 | 11.8 / 13.9 / 14.9 | 0 |
| pack in a blizzard | 12.4 / 12.8 / 13.0 | 9.2 | 0.66 | 2.16 | 12.3 / 19.3 / 22.9 | 10 |

**How to read the columns since Phase 6:** the GPU timer's "shadow" category is every render-target
pass, which now includes the **scene itself** (the camera renders into the HDR target), so the
"Scene" column is the shadow cascades + the main scene. "Main" is now only the display pass
(tonemap, CAS sharpen, LUT, grain: 0.66 ms). "Compute" is the atmosphere + terrain state + every
post pass (SSAO, SSR, clouds/shafts, compose, meter, TAA, bloom): ~2.4 ms, inside the 3.0 ms post
budget even counting the atmosphere.

**Reading:**
- Every weather, the live transition and the 8-Shaped pack in a blizzard stay at 12–12.6 ms GPU
  median, p95 ≤ 13.2 ms, against the 16.7 ms budget at 1440p. The transition costs nothing extra.
- The full frame is about the Phase 5 cost (pack was 13.0–14.5 ms median before): dropping MSAA
  paid for most of the post chain.
- The pack's 10 presented hitches are not GPU (GPU max 13.0 ms): a ~12 ms frame on a 175 Hz display
  is presented on alternating 2- and 3-refresh boundaries (11.4 / 17.1 ms), and 3–4-refresh frames
  (17–23 ms) cross the median + 4 line. The Phase 5 pack run had 12 of the same kind. A 60 Hz run is
  the gate configuration (DECISIONS, Phase 1 ruling) and should be repeated there.

## Phase 7 visual pass — target T, 2026-10-09

Windows Chrome headless on T's RTX 3060 (driven from WSL, `tools/winchrome/`), 2560×1440, render scale 1, GPU frame median from the timestamp queries over ~240 frames. Same spots, same build settings; "before" is commit 44b850d (before the visual pass), "after" is 2bf8f48.

| Spot | Before | After | Δ |
|---|---|---|---|
| `p5-steppe-stilled` (open steppe) | 14.9 ms | 16.0 ms | +1.1 |
| `p7-camp-dusk` (camp, fire) | 17.6 ms | 18.8 ms | +1.2 |
| `p7-monastery-approach` | 18.4 ms | 20.3 ms | +1.9 |

- `?bench=1&spot=p7-monastery-approach` (idle / walk / fly): GPU 21.3 / 18.9 / 13.4 ms median (run `perf/runs/2026-10-09T07-40-59-715Z.json`). 0 late pipelines in every run.
- Disabling the architecture, the outcrop mesh, all rocks or the fire one at a time moved the frame by < 0.5 ms each: the visual pass's cost is spread (scanned materials on terrain cliffs, architecture and rocks in the shadow cascades, the valley fog term in compose).
- Architecture: ~510k vertices / ~250k triangles in one static draw (+ the first cascade). GPU memory: the material arrays are ~380 MB (uncompressed RGBA8).
- **Honest reading:** at native 1440p this machine was already over the 11.1 ms (90 fps) budget before this pass on these views (15–18 ms). Reaching 90 fps on the 3060 needs PLAN.md Q6: render scale ~0.7 with temporal upscaling (TAAU on the existing TAA), plus per-site LOD for the masonry and shadow LOD for outcrops. Not done yet.

### Temporal upscaling and culling — target T, 2026-10-09 (later the same day)

GPU frame median at 2560×1440 output, RTX 3060, Windows Chrome headless:

| Spot | Render scale 1 (before) | Render scale 0.7 + culling |
|---|---|---|
| `p5-steppe-stilled` | 16.0 ms | **10.7 ms** (93 fps) |
| `p5-warden-golden` | — | 11.8 ms (85 fps) |
| `p5-pack-afternoon` | — | 12.1 ms (83 fps) |
| `p7-camp-dusk` | 18.8 ms | 12.7 ms (79 fps) |
| `p7-monastery-approach` | 20.7 ms | 13.2 ms (76 fps) |

- Per-pass at scale 0.67 (monastery): scene 6.9 ms, shadow cascades 1.6 / 1.5 / 1.3 / 0.9 ms, compute 2.0 ms, display 0.7 ms. The terrain clipmap is the largest single cost (scene + its shadows ≈ 6.3 ms); it is unchanged by this pass.
- Culling: the dormant Warden was drawn at full detail into every cascade from anywhere (≈ 2 ms) — now a coarse copy beyond 180 m (far cascade only), nothing beyond 1.4 km; the Shaped and spike pools draw only while used; rock tiers cast only into the cascades their distances reach.
- 60 fps floor met everywhere measured; 90 fps on the open steppe, 76–85 fps at the monastery, camp, Warden and pack. Further: cached far cascades, terrain shadow LOD (Phase 14 hardening).
- 0 late pipelines (culled meshes draw 30 frames first, so their pipelines exist from loading).

### Phase 8 meadow trees — 2026-10-10

GPU frame median at 2560×1440 output, render scale 0.7, RTX 3060, Windows Chrome headless:

| Step | `p8-meadow-noon` | `p8-meadow-golden` |
|---|---|---|
| Grass only (before trees) | 11.1 ms | — |
| Dense mature trees, first cut | 23.4 ms | — |
| Bark / leaf split | 21.7 ms | — |
| Leaves: 4-tap shadow lookup | 17.1 ms | — |
| Near trees cast from far geometry, near detail to 55 m | 15.1 ms | 15.9 ms |
| Full cascade-1 tree shadows to 140 m, time dissolves | 16.0 ms | 15.9 ms |
| + forest haze; leaf depth prepass; no trees in cascade 0 (current) | **14.5 ms** (69 fps) | **15.0 ms** (67 fps) |

`p8-forest-shafts` (inside a grove, toward a low sun): 24.4 ms with the cascade-0 tree copies and no prepass → **16.3 ms** now. Unchanged elsewhere: `p5-steppe-stilled` 10.7 ms, `p7-monastery-approach` 12.9 ms.

- Before the prepass, trees cost ~5 ms at noon: scene ~3 ms (mostly leaf overdraw, pixel-bound: the scene part fell 8.2 → 4.5 ms going from scale 0.7 to 0.45 before the split), cascade-1 shadow copies ~1 ms, far trees in cascades 2–3 ~1 ms.
- Still over the 11.1 ms (90 fps) budget, inside 60 fps. Next levers: impostors for far trees (beyond ~150 m), fewer leaf cards on the near crowns' interior, cached far cascades.

Forest floor pass (2026-10-10, render scale 0.7): `p8-forest-floor` 15.8 ms, `p8-forest-shafts` 16.7 ms, `p8-meadow-noon` 14.9 ms. Ground cover ~0.6 ms; canopy-map build 97 ms once at load. In a grove the terrain costs ~7 ms in all (~4.9 ms of it scene shading), trees ~4.1 ms (shadows ~2.2 ms of that), grass ~0.6 ms.

Understory, motes, border (2026-10-10, 0.7): `p8-forest-shafts` 17.0 ms, `p8-meadow-noon` 15.3 ms. Experiment: the terrain on the 4-tap shadow lookup instead of the full soft filter changed `p8-forest-floor` by +0.2 ms (within noise), so the terrain's shadow filter is not its cost.

Terrain profile (2026-10-10, `p8-forest-floor`, 0.7): toggling the terrain at render scales 0.7 and 0.4 splits it into pixel shading ~2.6 ms, geometry ~0.8 ms and shadow casting ~2.1 ms (4 cascades, nearly all vertex work).
- **Shadow-only terrain vertex shader** (position only: no normals, biome, wind, lake or footprints): shadows ~2.2 → ~1.75 ms.
- **Per-cascade levels** (cascade 0 levels 0–6, cascade 2 levels 4–11, cascade 3 levels 7–11; skipped levels exit before any data read): ~1.5 ms.
- **Meadow layers skipped where their landform mask is ~0.**
- **Result:** `p8-forest-floor` 16.4 → 15.6 ms, `p8-meadow-noon` 15.3 → 14.05 ms.
