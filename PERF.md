# Performance

Measured cost per system, per biome (BRIEF §14). Every number states the machine it came from.
Only numbers from the target machine (Windows 11, RTX 5070 Ti, Chrome stable, 2560×1440) count
toward gates.

## Machines

| Id | Machine | Browser / GPU path | Valid for |
|---|---|---|---|
| **T** | **Target (since 2026-10-02):** Windows 11, NVIDIA RTX 3060 12 GB, 3840×2160 monitor, Chrome stable | real GPU, via the in-page benchmark (`?bench=1`) | everything |
| **W** | Same PC, inside WSL2 (Ubuntu 22.04, 4 GB / 4 cores): Playwright Chromium 153 headless shell, WebGPU on **SwiftShader (CPU)** | software | allocation profiles, image captures; **not** timings |
| ~~5070 Ti~~ | Original BRIEF target, no longer available (DECISIONS.md) | — | — |

## Frame budget (re-based for target T: 2560×1440 at 60 FPS = 16.7 ms)

BRIEF §14's allocation scaled ×1.5. Refine per biome as systems land.

| System | Budget | Phase 0 measured (T) |
|---|---|---|
| Terrain (clipmap, state passes) | 2.25 ms | see "Target runs" |
| Vegetation | 2.25 ms | — |
| Sky, atmosphere, clouds | 1.5 ms | (in main pass) |
| Shadows | 2.7 ms | — (none yet) |
| Water and spell VFX | 2.25 ms | — |
| Characters, Shaped, cloth | 1.5 ms | (in main pass) |
| Post-processing | 3.0 ms | — (none yet) |
| Reserve (streaming, weather spikes) | 1.2 ms | — |

Rules: 60 FPS sustained, 1% lows ≥ 45 FPS, no frame above median + 4 ms.

## Target runs (machine T)

How: `npm run build && npm run preview` in WSL, then open
`http://localhost:4173/?bench=1&res=2560x1440` in Windows Chrome (fullscreen, tab focused). Results
are saved to `perf/runs/<date>.json`.

- **Presented** time is the rAF interval. It's capped at the display refresh rate, so it shows smoothness and hitches but not headroom.
- **GPU** time is the main render pass measured with timestamp queries. That's the real cost; Chrome quantises it to 0.1 ms.

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
- Next: one more benchmark run. If the frames really drop, take a Chrome performance trace (DevTools → Performance) during the walk phase.

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
