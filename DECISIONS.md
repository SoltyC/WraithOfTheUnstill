# Decisions

Every deviation from BRIEF.md, one line each, with rationale.

## Pre-production (decided with the user, already reflected in BRIEF.md)

- Engine stays Babylon.js WebGPU (agent-buildable, everything is text, shareable by link).
- Art direction: stylized realism, not photoreal — achievable across six biomes.
- Characters are procedural/cloth-driven only; no rigged humans, no AI-generated meshes. Fiction (the Wraith, the Veiled, the Shaped) is built around this.
- One seamless ~8×8 km continent; biome = element progression; minimal diegetic UI.
- Tests cover game logic only (save, quests, reactions, parity); rendering is validated by screenshots.
- Wardens are climbable (quality-gated per Warden). Keyboard and mouse only; gamepad out of scope for now.

## Build-time deviations

### Target machine change (user decision, 2026-10-02)

- **The target is now the dev PC:** Windows 11 + WSL2, NVIDIA RTX 3060 12 GB, Chrome stable, 3840×2160 monitor. The RTX 5070 Ti is no longer available. This supersedes BRIEF §3's target and measurement-machine rows.
- **Frame target re-based for the 3060:** **2560×1440 output, 60 FPS sustained, 1% lows ≥ 45 FPS.** That's a 16.7 ms budget, and the hitch rule (no frame above median + 4 ms) is unchanged. This replaces 90 FPS sustained / 60 floor. The per-system budget table in PERF.md is scaled ×1.5 from BRIEF §14.
- **Gate captures stay 2560×1440.** On the 4K monitor at Windows' 150% scaling that's also the browser's CSS viewport.
- **How target numbers are taken:** the real GPU is reachable only through Windows Chrome, and remote-debugging automation from WSL isn't permitted here. So perf runs use the in-page benchmark: open `http://localhost:4173/?bench=1&res=2560x1440` in Windows Chrome while `npm run preview` runs. Results are POSTed to the local server and written to `perf/runs/`. Headless SwiftShader stays the tool for captures and allocation profiles.

### Phase 0 (2026-10-02)

- **Machine:** this session ran on an RTX 3060 under WSL2, not the 5070 Ti target. All timings are indicative only; see PERF.md.
- **Capture browser:** Playwright's bundled Chromium headless shell, with WebGPU on SwiftShader (CPU Vulkan). It needs `--enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader --disable-vulkan-surface --use-angle=swiftshader`. Without them, `getCurrentTexture()` destroys the device ("no SharedImageBackingFactory … Webgpu"). Images are valid for look review; timings are not. Pass `--channel=chrome --headed` on the target.
- **No GLSL, no CDN:** every shader is WGSL. The glslang/twgsl paths are set empty, so an accidental GLSL compile fails loudly instead of fetching a compiler.
- **Collision samples the rendered grid:** the Phase 0 controller interpolates the built mesh grid inside the same triangles the GPU draws, so feet sit exactly on the drawn surface. Phase 1 replaces this with the shared JS/WGSL macro+meso definition (BRIEF §4.2).
- **Test terrain:** a single 640² grid whose spacing grows with distance (0.35 m at centre → ~45 m at 3.2 km), built on a worker. It's a stand-in for the Phase 1 clipmap and has no geomorphing.
- **Hot-path calling convention (zero-GC):** hot code never passes doubles as call arguments, because V8 boxes them (16 B each) whenever the call isn't inlined, and TurboFan's inlining budget runs out in large functions. Ground queries use a query object (`qx/qz` in; `h`, `nx/ny/nz` out). Systems take no arguments and read `clock.dt`. The controller and camera get `dt` through a field. Param changes bump an integer `params.version`, so idle change-detection never loads a double. `tools/alloc/alloc-check.mjs` enforces this.
- **Babylon tweaks (src/render/babylonTweaks.js and testScene.js):** all materials are frozen, which skips the per-frame `isReady` defines-string build. There is a single rendering group drawn unsorted, by overriding the private `_renderOpaque` to call `_RenderSorted` with a null comparator. Snapshot rendering is on in standard mode after warm-up. All three remove per-frame engine allocations.
- **Babylon frame-path tweaks, round 2 (src/render/babylonTweaks.js):**
  - (a) `Stage.Create` returns real Arrays carrying the two Stage methods. Babylon's version, `Object.create(Stage.prototype)`, is not an Array, so every `for…of` over a scene stage took V8's generic iterator: 88–168 B per loop, dozens of loops per frame.
  - (b) The opaque group renders by walking the SmartArray directly, with no sort and no `slice`.
  - (c) Babylon's PerfCounters, PerformanceMonitor and `engine._measureFps` are disabled. The overlay has its own stats and computes triangles from mesh index counts.
  - (d) `_startMainRenderPass` and `flushFramebuffer` are replaced by copies with constant debug labels, removing three per-frame template strings. They are copied from Babylon 9.29.0 and skipped with a warning on any other version.
  - (e) Frozen ShaderMaterials get an instance-level `isReady` fast path. Babylon's `isReady` holds a capturing arrow callback, so V8 allocates a closure context on every call, even on the early return.

  Rendering is unchanged: all five captures stay byte-identical.
- **`queue.writeBuffer` cost:** each upload to a buffer that in-flight GPU work references costs ~30 B on the JS heap inside Chrome. Across three different JS call shapes the bytes always sit at the `writeBuffer` call site, and a buffer no pass uses costs nothing. This is part of the API floor. **Design rule from Phase 1 on:** pack all per-frame uniform data into one buffer and upload it with one `writeBuffer` per frame, so the floor doesn't grow with object count.
- **Allocation floor:** per-frame WebGPU API wrapper objects can't be avoided by any WebGPU renderer. They are a new GPUTexture from `getCurrentTexture`, a GPUTextureView, a GPURenderPassEncoder, 2 × GPUCommandEncoder and 2 × GPUCommandBuffer, about 225 B/frame in Chrome. The Phase 0 heap gate is evaluated as "zero allocations from game code and from avoidable engine code"; the wrapper floor is reported separately. **Accepted by the user, 2026-10-02.**
- **Display transform in-material:** each WGSL material applies exposure → ACES (Narkowicz fit) → sRGB itself until the Phase 6 post chain exists. A night exposure lift stands in for eye adaptation.
- **Analytic sky and fog:** a gradient sky plus exponential height fog with sun inscatter. It's a stand-in for the Phase 1 Hillaire LUT atmosphere. Stars are jittered ~1 px Gaussian points shown only in deep night.
- **No shadows yet:** cascaded shadow maps are Phase 1. Phase 0 has a soft contact blob under the player and a mesh cavity term.
- **GPU memory figure:** WebGPU has no memory query, so the overlay tallies the sizes of live `GPUBuffer`s and `GPUTexture`s by wrapping `createBuffer/createTexture/destroy`. It's an estimate.
- **Draw-call counter:** wraps the pass and bundle-encoder draw methods. Bundle draws are counted when `executeBundles` runs, because snapshot rendering replays bundles.
- **Late-pipeline detector:** wraps `GPUDevice.create{Render,Compute}Pipeline[Async]` before the engine requests its device, and arms after warm-up (4 rendered frames behind the loading screen).
- **Photo-spot reproducibility check:** strict, requiring byte-identical PNGs across two fresh page loads (`capture.mjs --repeat=2`). The capture report also records the percentage of clipped pixels and mean luma per shot, to watch highlight roll-off (BRIEF §5.8).
- **Saves:** a binary container (JSON metadata plus raw page blobs), deflate-raw via `CompressionStream`, encoded and decoded on a worker. IndexedDB holds one record per slot (`auto`, `slot1–3`) plus a summary for menus. Migrations are a version-step table.
- **Dev overlay scope:** weather and stilled/restored are world state only, since nothing renders them until Phases 5–6. Spawn is disabled until the Shaped exist (Phase 5). Post-process toggles appear when the post chain exists (Phase 6).
- **Profiling tools:** `heap-profile.mjs` is the gate measurement. It uses the real rAF loop, warm-up counted in frames, and `--query`/`--out` options. `frame-alloc-probe.mjs` is for diagnosis only: it drives `loop._frame` synchronously for a fast warm-up, but V8 tiers that differently, so its numbers aren't used for gates.
- **`?grid=N` URL option:** a dev-only coarser test terrain, so the heap profiler reaches steady state on software GPUs. Captures never set it.

### Phase 1 (2026-10-02 → 03)

- **Bake arithmetic:** only IEEE-exact operations (+ − × ÷, sqrt, floor, min/max). Gradient noise builds its 16 gradients with sqrt, never sin/cos, so the bake is byte-identical on any machine (`npm run bake:verify`). `src/terrain/gnoise.js` is shared by the bake and the runtime mountain ring.
- **Layout:** the BRIEF's biome table is adjusted so it composes: frost plateau to the north, meadow uplands in the centre, mire to the west, the dune basin to the east and the volcano to the south-east. The sea runs to the bake edge on the south and west. Ranges stand along the north and east edges.
- **Height definition (BRIEF §4.2):**
  - the macro layer is Catmull-Rom over the 2 m bake texels, falling back per texel to the 8 m overview while a tile is not resident;
  - the meso layer is per-biome directional noise, shared by JS (`src/terrain/meso.js`) and WGSL (`terrainNoise.wgsl.js`);
  - GPU micro detail is render-only.

  Parity is measured, not assumed: `tools/capture/parity-check.mjs`, max 0.58 mm over 4096 points.
- **Collision is computed on the world worker:** it holds `WorldData` and computes 193² fine patches at 0.25 m and 129² coarse patches at 2 m. The main thread interpolates them (`PatchGround`). A tile counts as resident for collision only after its GPU upload, and patches carry the residency version, so the CPU and GPU always use the same texels. Teleports wait for an up-to-date patch.
- **Clipmap:**
  - 12 levels × 256² grid, 6.25 cm to 128 m spacing, 16 km wide, drawn with one thin-instanced draw so snapshot rendering stays valid;
  - heights and normals are written by compute only for levels that moved or whose tiles changed;
  - geomorphing collapses odd vertices onto the parent grid;
  - a coarse level hides the area its finer level covers by sinking those interior vertices 200 m, rather than discarding fragments (no precision cracks, and early-z keeps working);
  - terrain beyond the bake falls off to a −60 m sea floor.
- **Depth:** reverse-Z with a 40 km far plane, which reaches the mountain ring from anywhere on land.
- **Atmosphere (Hillaire 2020):**
  - the transmittance and multi-scattering LUTs are rebuilt when haze changes;
  - sky-view LUTs for both sun and moon, plus a 32³ aerial-perspective froxel atlas, are updated every frame;
  - an ambient compute pass writes key colour, sky irradiance and the adapted exposure into a buffer the materials read, with no CPU readback.

  Moonlight is stylised: cool tint, 0.11 illuminance and a night floor, so night reads deep blue rather than black. Haze defaults to 3× Mie for heavy aerial perspective. Eye adaptation is clamped tightly and snaps for captures.
- **Display transform:** still per material (exposure → ACES → sRGB) until the Phase 6 post chain exists.
- **CSM:**
  - 4 cascades with splits at 24, 140, 800 and 4500 m;
  - each cascade is a 2048² R32F target of linear light-space depth;
  - cascades are fitted to bounding spheres and snapped to whole texels, so shadows don't shimmer;
  - casters sit 4 km back toward the light;
  - 16-tap Poisson PCF, rotated per pixel, with normal-offset and slope-scaled bias in texel units;
  - 15 % blends between cascades.

  This is PCF, not yet PCSS contact hardening: Phase 2 adds that when berms need it. Babylon renders WebGPU render targets Y-flipped, so receivers use `v = 0.5 + 0.5·clip.y`. The flipped convention produced mirrored false shadows at high sun until it was fixed.
- **Distant mountain ring (BRIEF §2.3):**
  - a static impostor mesh (2048 × 129 polar grid, 264k vertices) from 12 to 28 km around the centre, built on its own worker in about 0.25 s during loading;
  - snowy ranges to the north, dark massifs to the east, middling ranges to the west and open sea with a few islands to the south;
  - valleys drown below sea level, so it reads as distant coasts rather than one shore;
  - lit by the atmosphere and fogged by aerial perspective, with no shadow receive (it lies beyond the last cascade).
- **Terrain state (BRIEF §4.3):**
  - **fine window:** 4092² texels at 1/48 m (85.25 m), toroidal. It uses 4092 = 341 × 12 rather than 4096 so the window edges, which snap to whole 25 cm coarse texels, always align with coarse texels;
  - **coarse pages:** 128 m at 25 cm (512²) on a 64 × 64 page grid over the bake, with 48 resident slots;
  - **packing:** 3 u32 words per texel (f16 pairs and unorm8 quads), stored planar so each plane fits WebGPU's 128 MiB binding limit (fine 3 × 67 MB, atlas 3 × 50 MB). Every channel rests at 0, so zeroed buffers are untouched ground; thermal is a signed f16.
- **Terrain-state streaming:**
  - outgoing strips are downsampled 12×12 → 1, but only under pages that hold a slot;
  - incoming strips always refill from the coarse record, or from rest;
  - writers must claim the pages under them. Unclaimed pages are implicitly rest, so the atlas is sparse;
  - when free slots drop below 6, the least-recently-used page more than 320 m away is evicted. It is read back from the GPU and serialised with its game time on `state.worker.js`;
  - pages within 128 m of the window edge reload, healed in closed form for the elapsed time: exact per-material decay, plus diffusion as a Gaussian with σ² = 2Dt. Tests compare this against an explicit step simulation (`tests/terrainState.test.js`).
- **Terrain-state healing:**
  - live healing is decay only: one 1/16 band of the window and one resident page per frame, each with its own elapsed time;
  - live diffusion needs ping-pong copies of the 200 MB window, so it is deferred to Phase 2, when real writers exist. Until then an evicted page diffuses but a resident one doesn't;
  - a fresh write on a page that is still stored drops that page's history (rare, because pages reload ahead of the window).
- **Terrain-state writers and saves:**
  - Phase 1 has only a debug writer: the "stamp trail" toggle, which writes round stamps with rims. The clipmap's clay view tints by depression and rim;
  - evicted pages live in the worker's memory for the session. Writing them into save slots comes with the Phase 2 writers.
- **One params buffer per compute system:** Babylon records every dispatch of a frame before submitting, so per-dispatch parameter uploads would collide. Terrain-state jobs share one params buffer, written once per frame, and each pass picks its job with `workgroup_id.z`.
- **`writeBuffer` count:** per-frame uploads now total about five buffers: atmosphere params, shadow data, terrain-state params (only while it has work), clipmap params (only when a level moves) and the scene/material uniforms. Each costs about 30 B of API floor (Phase 0 ruling).
- **Pipeline warm-up:** compute passes that are idle at start are dispatched as no-ops until they have run once, so no pipeline is created after loading (the late-pipeline detector stays at 0).
- **Captures stay in the clay view** (BRIEF §17, Phase 1 gate). The dark clay-view sea and the dark dusk on ash are clay-view limits, not final looks.
