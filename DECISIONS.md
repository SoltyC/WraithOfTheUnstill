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
