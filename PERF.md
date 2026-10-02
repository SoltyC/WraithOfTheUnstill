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

**Verdict:** the game causes none of the hitches. Under the strict rule the gate is still not met (43 intervals over the limit, 14 real drops), all of them stalls outside the frame. **Awaiting the user's ruling** on whether the gate counts game-attributable hitches only (as the Phase 0 allocation floor did).

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
