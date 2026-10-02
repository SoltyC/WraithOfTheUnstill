# Progress

Session handoff log. Update at the end of every session (see BRIEF §0).

## Current state

- **Phase:** 0 (Foundation and tooling). Built and verified except one gate item; see "Gate status".
- **Gate status (Phase 0):** **met on game code; one engine item and one user decision open.**
  - ✅ The overlay works: 8/8 automated checks in `tools/capture/overlay-check.mjs`.
  - ✅ Captures are reproducible: all 5 photo spots are byte-identical across two fresh loads at 2560×1440, and unchanged by the session 2 engine work.
  - ◐ Zero allocations per frame. After a 20k-frame warm-up:
    - **Game code: 0 B/frame.**
    - **Avoidable engine code: 0 B/frame** with the clock frozen; 29 B/frame when a uniform buffer changes. That's Babylon's UBO slot path, site not yet pinned.
    - **Unavoidable WebGPU API wrappers: ~225 B/frame**, 7 objects every WebGPU renderer must create.
    - Was 1.1 KB/frame of Babylon overhead at the end of session 1.
  - **Decision needed from the user:** accept the WebGPU wrapper floor as outside the "zero allocations" gate (recorded as pending in DECISIONS.md). Strict zero is impossible for any WebGPU program.
- **Machine used this session:** Windows + WSL2, RTX 3060 (**not** the target). Captures and profiles ran in Playwright's bundled Chromium with WebGPU on SwiftShader (CPU). Images are valid; timings are not. No target-machine performance numbers exist yet.
- **Exact next step:** see "Next step" at the bottom. In short: get the user's ruling on the WebGPU floor, pin the 29 B uniform-upload site, then take target-machine numbers.

## How to run

```
npm install
npm run dev                 # http://127.0.0.1:5173  (F1 or ` = dev overlay)
npm test                    # Vitest logic tests (34)
npm run alloc               # zero-allocation check of hot CPU paths in Node's V8
npm run capture             # build + 1440p photo-spot captures ×2, reproducibility + clipping report
npm run heap                # build + idle-loop heap profile (game vs engine split)
npm run overlay-check       # dev overlay functional check + screenshots
npm run perf -- --channel=chrome --headed   # frame-time run on the target machine
```

URL options: `?spot=<id>` applies a photo spot. `&capture=1` freezes the clock and skips the
loading fade. `&overlay=1` opens the overlay. `&snapshot=0` disables snapshot rendering. `&grid=N`
uses a coarser test terrain (dev only).

**WSL/Linux without a GPU:** the harness adds the SwiftShader flags automatically (DECISIONS.md).
The bundled Chromium needs libgbm, libasound and libwayland-server. On this box they were unpacked
without root into `~/.local/wraith-libs/root/usr/lib/x86_64-linux-gnu`, and the harness picks that
up automatically (override with `WRAITH_CHROME_LIBS`). With sudo: `npx playwright install-deps chromium`.

## Session log

### Session 2 — 2026-10-02 (same day, continuation) — Phase 0

**Built / changed**
- Pushed session 1 to GitHub. The remote is now SSH: `git@github.com:SoltyC/WraithOfTheUnstill.git`. HTTPS had no credentials in WSL.
- `src/render/babylonTweaks.js`, which removed ~850 B/frame of Babylon allocation (rationale in DECISIONS.md):
  - `installFastStages()`: scene stages become real arrays. `for…of` over Babylon's `Object.create(Stage.prototype)` stages allocated 88–168 B per loop (measured in Node).
  - `renderOpaqueUnsorted()` walks the SmartArray directly, with no `slice`.
  - `disableBabylonInstrumentation()`: PerfCounters, PerformanceMonitor and `_measureFps` are off. The overlay computes triangles itself.
  - `installConstantLabelFramePath()`: copies of `_startMainRenderPass` and `flushFramebuffer` with constant labels, version-guarded to 9.29.0.
  - `fastFrozenIsReady()`: avoids the closure-context allocation in `ShaderMaterial.isReady`.
- `tools/capture/heap-profile.mjs`:
  - frame-loop detection survives `_frame` being inlined;
  - `babylonTweaks.js` is counted as engine;
  - full-stack `topStacks`;
  - `--query` and `--out` options.
- `tools/capture/frame-alloc-probe.mjs`: synchronous-warm-up diagnosis of allocation sites (not for gate numbers).

**Measured** (machine W, 20k-frame warm-up; see PERF.md):

| Run | Total | Game | Avoidable engine | WebGPU floor | Browser idle |
|---|---|---|---|---|---|
| Clock running | 265 B/frame | 0 | 29 | 224 | 12 |
| Clock frozen | 236 B/frame | 0 | 0 | 225 | 11 |

Captures are still byte-identical. Tests 34/34, alloc check 9/9, overlay check 8/8.

**Unfinished**
- The 29 B/frame when uniforms change. It's attributed to `UniformBuffer._updateOwnerKeyed` but doesn't reproduce in isolation. Next probe: run the real loop with only the capsule's `bodyParams` changing and the others static, then bisect `_updateOwnerKeyed`'s change branch (`_takeFreeSlot`, `bindUniformBuffer`, `updateUniformBuffer`) by temporarily overriding each on the instance.
- Target-machine numbers (unchanged from session 1).

### Session 1 — 2026-10-02 — Phase 0

**Built**

- Vite + Babylon.js 9.29 WebGPU boot (`src/main.js`). Without `navigator.gpu` it shows one styled line and stops. All shaders are WGSL; GLSL compiler fetches are disabled.
- GPU instrumentation (`src/core/gpuInstrument.js`), installed before device creation:
  - late-pipeline detector, which arms after warm-up and logs in red with a screen flag;
  - draw counter, including render-bundle replays;
  - GPU memory tally.
- Frame loop (`src/core/loop.js`), clock with time of day (`clock.js`), object pools (`pool.js`), scratch math stacks and helpers (`scratch.js`), tunable params with a change version (`params.js`), and the system/post toggle registry (`systems.js`).
- Action-mapping input layer (`src/input/actions.js`): every BRIEF §7 binding, pointer lock, and edges per frame. Gamepad can slot in later.
- Spring-arm camera (`src/camera/springArm.js`):
  - over-the-shoulder offset with a lagged pivot that lags more under acceleration;
  - eased zoom, and FOV that widens with speed;
  - terrain collision that pulls in fast and releases slowly;
  - free-camera and photo-spot pose modes.
- Capsule controller (`src/character/capsuleController.js`): camera-relative movement, slope limit with sliding, jump, ground snapping, and fixed 120 Hz substeps. The player system is `playerSystem.js`.
- Test heightfield:
  - deterministic integer-hash noise (`src/terrain/noise.js`), the same definition Phase 1 ports to WGSL;
  - rolling field, wind-directional drifts and ridged mountain ring (`testHeightfield.js`);
  - mesh built on a worker as a 640² non-uniform grid (`testTerrainBuild.js`, `testTerrain.worker.js`);
  - collision sampled from that grid in the drawn triangles (`testGround.js`).
- Phase 0 "clay" look (`src/shaders/*.wgsl.js`, `src/render/environment.js`, `testScene.js`):
  - analytic sky with sun and moon, stable point stars, and height fog with aerial perspective;
  - wrapped diffuse with a blue hemispheric ambient, wind-stretched detail normals, cavity, and a player contact blob;
  - ACES display transform with a night exposure lift.
- Dev overlay (`src/ui/overlay/*`), hidden by default and toggled with F1 or `:
  - frame graph with 90/60 FPS and median+4 ms lines;
  - FPS, 1% low, avg/median/p99/max, hitches, draws, triangles, GPU MB, JS heap, stream queue, pipeline count, resolution and adapter;
  - late-pipeline log;
  - system toggles and quality presets;
  - art and world sliders (time of day, time flow, sun azimuth, fog, exposure, wind, glint/deformation/refill placeholders, grading, render scale);
  - teleport to POIs, photo spots (go, and copy current view as a spot);
  - weather override and stilled/restored per biome (state only), free camera, god mode, spawn (disabled until Phase 5), and save/load buttons.
- Photo spots (`data/photo-spots.json`) and POIs (`data/pois.json`).
- Save system skeleton (`src/game/save/*`):
  - versioned schema with a migration table and validation;
  - binary container compressed with deflate-raw, encoded and decoded on a worker;
  - IndexedDB slot store (`auto`, `slot1–3`) with summaries;
  - manager with periodic and requested autosave, collect/apply hooks, and lazy DB and worker.
- Tooling (`tools/`):
  - Playwright harness with build + preview, the SwiftShader recipe and a library-path fallback;
  - photo-spot capture with a byte-identical reproducibility check and clipping/luma report;
  - heap profiler with V8 warm-up by frame count, sourcemap-resolved sites and a game/engine split;
  - overlay functional check;
  - perf run;
  - Node allocation checker for hot paths.
- Logic tests (Vitest, 34): save round-trip, compression, corruption, migrations, validation, the IndexedDB store, the manager and autosave; pool, frame stats, input edges and bindings, math helpers, param versioning; noise and heightfield golden snapshots; grid/mesh collision parity; controller movement, slope limit, jump arc and determinism; photo-spot data validity.

**Screenshots** (`screenshots/phase-00/`, 2560×1440, machine W / SwiftShader)

| File | Spot | Mean luma | Clipped |
|---|---|---|---|
| `p0-start-golden.png` | over the shoulder, 17:24 | 161.9 | 0% |
| `p0-ridge-noon.png` | toward the ridge, 12:00 | 206.4 | 0% |
| `p0-vista-dusk.png` | free cam at 45 m, 18:36 | 108.7 | 0% |
| `p0-dawn.png` | low dawn light, 06:24 | 147.9 | 0% |
| `p0-night.png` | moonlit, 23:30 | 127.0 | 0% |
| `overlay-open.png`, `overlay-late-pipeline.png` | dev overlay clean, then with a deliberate late pipeline flagged | | |

Reports: `capture-report.json`, `overlay-check.json`, `heap-profile.json` (final),
`heap-profile-warm20k.json` (20k-frame warm-up).

**Measured performance:** see PERF.md. There are no target-machine numbers yet. Structure: 3 draws, 832k triangles, ~133 MB GPU at 1440p, 5 pipelines (all during loading), 0 late pipelines.

**Allocation result (the open gate item)**
- Game code: **0 B/frame** in the browser profile after a 20k-frame warm-up (12.5 B/frame after 6k frames: a small not-yet-optimised remainder below the top-15 sites), and 0 scavenges over 2M calls per hot path in `npm run alloc`. Getting there required a calling convention, now documented in DECISIONS.md: no doubles passed to calls, ground queries through fields, systems read `clock.dt`, and an integer params version.
- Babylon engine: **1138 B/frame** in the final run (6000-frame warm-up); 1068 B/frame after 20k frames.
  - About 380 B/frame is the WebGPU API wrapper floor plus Babylon's per-pass label string.
  - About 690 B/frame is Babylon's scene traversal: `for…of` iterators, `slice`, `isReady`, owner-keyed UBO update, and the performance monitor.
  - Freezing materials, an unsorted single group and snapshot rendering already removed the rest.

**Unfinished**
- Zero-allocation gate for the engine side (above).
- No timings from the target machine.
- Overlay sections for systems that don't exist yet are placeholders by design: post toggles (Phase 6), spawn (Phase 5), streaming queue (Phase 1), and weather/restoration visuals.
- Saving terrain pages is wired in the schema and codec, but nothing produces pages until the terrain state exists (Phases 1–2).
- The save worker codec is exercised by the overlay buttons, not by an automated browser test.

**Known defects (visual, all inside the Phase 0 clay view, which Phases 1–2 replace)**
- No shadows (CSM is Phase 1), so noon reads flat and high-key (mean luma 206, nothing clipped).
- Distant ridge peaks still show slight facets from the coarse outer grid spacing (~20–45 m).
- The dusk foreground goes flat lavender: the key light is near zero and there is no sky IBL.
- Close-range detail normals read as soft blotches under a low sun.
- The player is a placeholder capsule (the Wraith is Phase 3). Its contact blob is subtle.
- Golden hour isn't very golden yet; warmth shows mostly in the sky halo and on the capsule.

**Next step:** superseded; see session 2 above and the final "Next step" section below.

## Next step (current)

1. Ask the user to rule on the WebGPU wrapper floor (DECISIONS.md, "Allocation floor"). If accepted, the allocation gate is met except for item 2.
2. Pin and remove the 29 B/frame uniform-upload allocation (method in session 2 "Unfinished"). Verify with `npm run heap -- --settle-frames=20000`, and with `--query=capture=1 --out=heap-profile-frozen.json`.
3. On the target machine:
   - `npm run perf -- --channel=chrome --headed`;
   - `npm run capture -- --channel=chrome --headed --out=screenshots/phase-00-target`;
   - record the results in PERF.md.
4. Then Phase 1.
