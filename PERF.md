# Performance

Measured cost per system, per biome (BRIEF §14). Every number states the machine it came from.
Only numbers from the target machine (Windows 11, RTX 5070 Ti, Chrome stable, 2560×1440) count
toward gates.

## Machines

| Id | Machine | Browser / GPU path | Valid for |
|---|---|---|---|
| **T** | Target: Windows 11, RTX 5070 Ti, Chrome stable | real GPU | everything |
| **W** | Dev box used in session 1: Windows + WSL2 (Ubuntu 22.04, 4 GB / 4 cores to WSL), RTX 3060 | Playwright Chromium 153 headless shell, WebGPU on **SwiftShader (CPU)** | allocation profiles, image captures; **not** timings |

## Frame budget (BRIEF §14 starting allocation, 90 FPS = 11.1 ms)

| System | Budget | Phase 0 measured (T) |
|---|---|---|
| Terrain | 1.5 ms | not measured (no T session yet) |
| Vegetation | 1.5 ms | — |
| Sky, atmosphere, clouds | 1.0 ms | not measured |
| Shadows | 1.8 ms | — (none yet) |
| Water and spell VFX | 1.5 ms | — |
| Characters, Shaped, cloth | 1.0 ms | not measured |
| Post-processing | 2.0 ms | — (none yet) |
| Reserve | 0.8 ms | — |

## Phase 0 measurements (machine W, 2026-10-02)

### Frame time: indicative only, software GPU

| Scene | Resolution | Avg FPS | Notes |
|---|---|---|---|
| p0-start-golden, full test terrain (819k tris), 3 draws | 2560×1440 | ~1.6 | SwiftShader rasterisation bound; meaningless for the target |
| same, `?grid=96` | 640×360 | ~29 | used only to warm V8 for heap profiling |

**To measure on T:** `npm run perf -- --channel=chrome --headed --spot=p0-start-golden --seconds=20`
(prints median, p99, 1% low, hitches > median+4 ms, draws, late pipelines). Or open the dev overlay
(F1) in `npm run dev`.

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
