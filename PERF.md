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

| Run | Warm-up frames | Game code (`src/`) | Babylon engine | Report |
|---|---|---|---|---|
| final | 6000 | 12.5 B/frame | 1138 B/frame | `screenshots/phase-00/heap-profile.json` |
| long warm-up | 20000 | **0 B/frame** | 1068 B/frame | `screenshots/phase-00/heap-profile-warm20k.json` |

Breakdown of the engine residual (20k warm-up):
- **WebGPU API floor, ~380 B/frame:** `_startMainRenderPass` and `flushFramebuffer`. That's `getCurrentTexture`, `createView`, `beginRenderPass`, `createCommandEncoder`, `finish`, the submit array, and Babylon's per-pass template-string label. Every WebGPU renderer must allocate the wrapper objects; the label string is Babylon's and avoidable.
- **Babylon scene traversal, ~690 B/frame:** `for…of` iterators (`next`) in `scene._renderFrame`, `_renderForCamera`, `_evaluateActiveMeshes`, `_activeMesh` and `mesh.render`; `slice` in `_RenderSorted`; frozen `ShaderMaterial.isReady`; the uniform-buffer owner-key update; and the performance monitor.

Hot-path CPU code is checked in Node's V8 by `npm run alloc`: 2M calls per case, zero scavenges
required. All 9 cases pass (ground sampling, controller walking and idle, spring arm, environment
idle and time-flowing, clock, frame stats, pools).

At 90 FPS the engine residual is ~96 KB/s of short-lived garbage. That's a cheap scavenge every
several seconds, not a major GC, but it is not zero and the gate wording is strict. See PROGRESS.md.
