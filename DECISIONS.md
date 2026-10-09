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
- **Phase 1 frame-time gate ruling (user decision, 2026-10-03):** the "no frame above median + 4 ms" gate counts **game-attributable** hitches only. The flight benchmark attributes every hitch to the work of the frame before it (CPU per system and render, GPU per pass, streaming, scroll and patch flags). A hitch is game-attributable if that frame's CPU or GPU time exceeds one refresh or correlates with a work flag. Across four target runs (170 Hz and 60 Hz) there were zero. The remaining drops come from outside the frame (Windows or Chrome presentation; 14 in 45.8k frames at 60 Hz) and are reported separately in every later benchmark. This mirrors the Phase 0 allocation-floor ruling.

### Phase 2 (2026-10-03), gate accepted by the user

- **Snow material** (`shaders/snow.wgsl.js`), procedural with no textures:
  - **detail normals:** four wind-stretched layers (5 cm grain, 18 cm × 75 cm ripples, sastrugi, drift texture), each faded by the pixel footprint (`fwidth`), so distance never aliases;
  - **landform masks:** rock, scoured ice and lake ice read a micro-free "coarse normal" (three clipmap levels up, bilinear), so sastrugi prows never count as cliffs;
  - **lighting:** wrapped diffuse, a blue back-scatter subsurface term, and the sky IBL shifted cold (BRIEF §5.3);
  - **glints:** one candidate facet per 1.4 cm world cell (stable hash), on a narrow lobe at grazing views only, faded below pixel size.
- **Render-only micro relief** (ripples and sastrugi) lives only on clipmap levels at ≤ 14 cm spacing. On coarser grids it aliased into moiré. Beyond that the shading normals carry it. Collision ignores it (≤ 11 cm; feet plant via readback in Phase 3).
- **Sky IBL:** the atmosphere's ambient pass projects the live sky (upper hemisphere) plus a ground bounce (lower) onto L2 spherical harmonics every frame, eased over ~0.5 s. Materials evaluate irradiance per normal.
  - BRIEF §5.2 asks for a time-sliced cubemap reprojection. 9 SH coefficients from 288 sky-view samples cost microseconds, so per-frame easing replaces the slicing. Reflections on ice sample the sky-view LUT directly.
- **PCSS:**
  - a 16-tap blocker search, then a penumbra sized by receiver–blocker distance (light tan 0.0065), and a 16- or 32-tap PCF;
  - a receiver-plane bias that grows with each tap's distance and the slope, which prevents acne on lit slopes;
  - a white-noise per-pixel rotation. Interleaved gradient noise left a diagonal hatch without TAA.
- **Deformation:**
  - the clipmap vertex shader adds (displaced mass − depression) on levels at ≤ 2 m spacing;
  - fragments take normals from the state field at its resolution: 2 cm in the fine window, 25 cm in pages;
  - the shadow casters share the vertex shader, so trails self-shadow.
- **WebGPU's 8 storage buffers per stage:** the page table now lives in the terrain-state params buffer (after the per-frame block), and compaction is read in the fragment stage only.
- **Writers:**
  - a swept-capsule brush: a near-flat floor, a ~45 % berm that breaks into granular clumps, and flattening of any berm it lands on;
  - a brush queue (8192 deep, 16 per frame);
  - the capsule player's alternating footprints (the Wraith's planted feet replace them in Phase 3);
  - photo spots can stamp a walked trail (`trail` polyline) once the world settles, and captures wait for the queue to drain.
- **Healing:** live healing remains decay only; live diffusion stays deferred (Phase 1 decision). The overlay's "Refill (healing) rate" scales it; "Deformation depth" scales footprint depth; "Glint intensity" scales glints.
- **Spindrift:**
  - stateless GPU streaks: 9000 quads in a 110 m camera tile, advected downwind and wrapped;
  - seated on the rendered terrain by reading the clipmap levels, with gust sheets;
  - lit by Henyey–Greenstein forward scatter plus the sky, and shadowed;
  - premultiplied alpha, drawn unsorted (the sort would allocate).
- **Rocks:**
  - one thin-instanced icosphere (642 vertices) displaced per instance in the vertex shader (no two alike, smooth normals by finite differences);
  - placement: deterministic hashing on camera-centred grids, rebuilt only when the camera crosses an 8 m cell, into a fixed-size buffer. Unused slots have size 0 and are discarded, so the snapshot-rendered draw count never changes;
  - seated on the rendered terrain, with frost biome and slope tested on the GPU;
  - no collision yet; it comes with the worker-side placement in Phase 3/4.
- **Fog:** Phase 2 relies on the Hillaire aerial perspective (3× Mie haze with height falloff) for depth haze. Low valley fog comes with the Phase 6 weather work.
- **Software-GPU captures got slow:** about 4 s per frame at 480×270 with PCSS and the new materials, and 10–15 min per 720p spot. Harness load timeout raised to 1 h. These are capture-time costs on machine W only; the GPU cost on T is measured by the flight benchmark.
- **Phase 2 gate accepted (user decision, 2026-10-03)** on the fourth set of gate shots taken on the target GPU (`screenshots/phase-02/`, `?shots=p2-`).
  - Carried forward as polish items:
    - distant exposed rock reads as soft-edged patches;
    - the noon foreground snow looks slightly streaky under flat light;
    - the sky has no clouds yet (Phase 6).
  - The flight benchmark at 60 Hz: GPU frame 7.4 ms median and 14.0 ms max, 0 game-attributable hitches.
- **Alpine relief:** shared JS/WGSL, so collision includes it. Warped ridged crests up to ~70 m and carved gullies on frost terrain above ~750 m macro height. Parity over the mountains: 0.65 mm.
- **Gate screenshots come from the target GPU** (`?shots=<prefix>` in Windows Chrome, uploaded by the preview server). Headless SwiftShader captures now take 10–17 min per spot and are kept for unattended error checks only.

## Phase 3 — The Wraith

- **CPU Verlet cloth, not GPU.** About 3,000 particles (~1,450 free) and 11k constraints, plus tethers (long-range attachments), capsule colliders with per-particle collider masks, and ground friction. Substeps run at 120 Hz with 6 iterations; collision runs twice per step. Cost on machine W (Node): median 1.6 ms per 60 Hz frame. It stays allocation-free, and the result is uploaded in one storage-buffer write per frame. The CPU leaves the GPU budget to the world, and it can be moved later if the CPU budget tightens.
- **Garments (one mesh, 11 grids):**
  - **Robe:** pleated and gathered at the waist by a cord, kinematic to the waist and free below. It is open at the front below the waist so a run parts it, with an uneven hem that trails at the back.
  - **Sash ends:** two free sash ends hang from the cord.
  - **Mantle:** a capelet gathered at the neck, pleated, with a ragged hem that is longer at the back.
  - **Sleeves:** bell sleeves pinned at the shoulder, elbow and wrist along the arm polyline. The cuff's bell hangs free.
  - **Cowl:** a deep hood whose front edges meet at a soft back-falling point. It closes under the chin, and its drape eases from the head frame to the body frame over the shoulders.
  - **Hands and feet:** wrapped; feet pitch toe-down in swing.
- **Feeding body motion into the cloth:**
  - Damping is mostly relative to the body, plus a small world air drag. Pure world damping made a run look like a gale.
  - The inertia scale is 0.4.
  - Leg and arm colliders are soft (0.3 and 0.5 push per pass) and push horizontally only. Legs are never rendered; hard leg capsules flung the hem to the waist at a run.
  - Facing is rate-limited to 9 rad/s.
  - The pelvis bob and running crouch are eased. A stop used to jerk every pinned row about 10 cm in one frame and threw the hem over the waist. That was the "flips up when stopping" defect.
- **Teleport detection lives in the Wraith:** any input jump over 2 m (vertical included) re-drapes every particle from its rest pose. The first in-browser build checked only horizontal distance, missed the spawn's 228 m vertical drop, and hung the robe upside down above the figure.
- **Shading:**
  - per-garment albedo and wear; twill micro-normal faded by pixel footprint;
  - Charlie sheen, Kajiya-Kay along the threads, back-lit thin regions;
  - per-particle fold occlusion (Laplacian along the normal) and layer occlusion (robe under the mantle, mantle under the cowl drape);
  - alpha-tested torn hems and cuffs; a snow-dusted wet hem; near-black hood interior.
- **The cowl light and fingertip glow are display-referred:** the same on screen by day and by night. They light the hood interior and fingertips with a soft inverse-square falloff and breathe on a 5.5 s period, plus additive glow sprites.
- **Shell fur:** 24 shells over the hood rim and the bell cuffs, reusing the cloth buffer (particle id + 4096 × shell). Strands use a jittered 2.6 mm grid with per-strand length and taper; dark roots run to grey tips; Kajiya-Kay lighting with self-shadow by height. Sub-pixel strands switch to stochastic coverage instead of sparkling.
- **Footfall spray:** analytic GPU particles in a 384-slot ring, written only when a foot lands. They use the same frame as the footprint stamp. On snow (biome weight read on the GPU) the spray is snow; elsewhere it is faint dust.
- **Photo spots can `walk`** (`{ speed, seconds, facing }`). Once the world settles, the Wraith is simulated walking into place with real footfalls (prints and spray), then held for the frozen-clock still.
- **Phase 3 gate accepted (user decision, 2026-10-03)** on the third set of target shots (`screenshots/phase-03/`) and the 60 Hz bench (walk GPU 7.7 ms median, 0 hitches).
  - Carried into polish:
    - the hood close-up reads slightly back-tilted from a low camera;
    - traversal whip (Phase 4);
    - low-health cowl guttering and frost creep (Phase 7);
    - pipeline warm-up when the Wraith is hidden during loading.

## Phase 4 — Frost bending and snow-surf

- **Terrain-state repack:** word 1 is now compaction, wetness, frozen and transform as four unorm8 values. Every surface-appearance channel then comes from one storage binding in the terrain fragment shader; WebGPU allows few per stage, and the terrain is at the limit. Thermal is split into frozen (word 1) and molten (word 2) so every channel rests at 0. 8-bit healing uses dithered (unbiased) rounding: plain rounding sticks one step above rest and never heals.
- **Brush programs:**
  - **PRESS:** footprints.
  - **PLOUGH:** a U-groove with clumpy berms and a side bias. Sweep and the surf wake use it.
  - **SCORE:** a thin wet line (Ribbon).
  - **FREEZE:** sets the permanent ICE transform (Crystallize).
  - **WET:** raises wetness only.

  All use max-blend, so repeated stamps along a path never dig in runaway fashion. Up to 48 brushes are applied per frame.
- **Snow-surf** is a mode of the capsule controller. The surf model owns the horizontal velocity; the controller keeps gravity, jumps and ground snapping.
  - The crest pushes toward cruise (13 m/s, 17 with W) and carries the drag up to cruise, so the flat settles there.
  - Gravity acts along the slope, with a 26 m/s cap.
  - Steering asks for a fraction of the grip (15 m/s² lateral). The turn rate follows with weight, and carving bleeds speed. The lean is atan(lateral acceleration / g).
  - Letting go brakes to walking speed before handing back.
  - The mouse steers through a recentring accumulator; the camera follows the heading, banks and widens.
  - Tuned by tests (cruise, slope, grip, eased exit) and then by hand. The user reports it "feels really good".
- **Wake:** a PLOUGH brush along each frame's path (groove 0.17–0.32 m deep, berms at 115 %, heavier on the outside by grip). Spray goes from the outside berm, plus a crest at the feet. A finished run reaches the coarse pages, so it stays visible from afar.
- **Spray look:** snow spray scatters skylight heavily (×2.2) at low opacity; at full opacity in shade it read as soot. It casts a dithered, alpha-tested shadow into the two near cascades (the cascade camera makes the billboards face the light).
- **Verbs:**
  - **Sweep (tap):** a 14 m crescent of slush ploughing a wet channel.
  - **Ribbon (hold):** a spine of water nodes from the hand to the aim, flying, arcing and skimming the ground. It scores where it skims (throttled to one stamp per 15 cm) and renders as a GPU-swept tube.
  - **Crystallize (F):** an 11-crystal formation of faceted prisms with overshooting growth, over a spreading permanent ICE transform.
  - Every verb eases in and out and emits a spell light.
  - The Wraith turns to face the aim and lifts its right arm.
- **Faked refraction:** water and crystals have no scene colour to refract (there is no scene-colour pass under snapshot rendering). They refract the sky, or lit snow below, through an absorption tint, with fresnel reflection, a glint and fracture planes. A real refraction pass belongs to the Phase 6 post work.
- **Spell lights** are display-referred, like the cowl light, so they read at night and are subtle at noon. They light the snow mostly from within, as subsurface. There are four slots, shared by the verbs.
- **Mouse input comes from pointer events.** Babylon prevents the default of pointerdown, which suppressed `mousedown` and `mouseup` (no mouse button ever registered) and `mousemove` while a button was held. Buttons now come from the `buttons` bitmask of every pointer event.
- **Camera shake** follows BRIEF §7: hard carves (grip above ~70 %) and Crystallize only, as smooth noise eased out.
- **Speed streaks:** camera-relative world-space streaks, moved by the distance travelled (a time × speed phase jumps when speed changes). They fade in above 7 m/s while surfing.
- **Phase 4 gate accepted (user decision, 2026-10-03)** on the target shots (`screenshots/phase-04/`: verbs, carve, field) and the bend bench (surf +1.2 ms, verbs ~0, 0 late pipelines). Carried into polish: refraction against scene colour, spell-light SSS beyond snow, element selection, a curling wave mesh for the wake, and the frost material's cost on the open snowfield.

## Phase 5 — Combat and the frost Shaped

- **The Shaped are procedural bodies clad in chunk rigs**, not skinned meshes. The spine is a rope-follow chain. Legs plan steps in trot groups, lock planted feet, and solve two-bone knees. Each creature hangs material chunks (packed snow, ice shards, a glowing core) on its bones. That is what makes rising (chunks surface lowest-first) and collapsing (chunks fall with momentum, settle and sink into a mound) literal. One mesh holds every chunk slot (snapshot rendering; empty slots collapse in the vertex shader).
- **The Warden is the same body at colossal scale** with its own chunk shader:
  - **Chunk shape:** each chunk is a noise-displaced, craggy ellipsoid with analytic normals.
  - **One mass, not a heap:** each vertex blends its crag normal (70 %) toward the gradient of a soft field over its own and its 16 nearest chunks' ellipsoids. Neighbours are measured once from the first live pose; the rig's topology never changes. Overlaps also give a contact term that darkens the creases where masses meet. Without this the Warden read as a pile of separate pebbles.
  - **Material:** matte snow, with a rough Fresnel kept low; a glossy look read as plastic.
  - **Mesh density:** subdivision 4 holds close-up silhouettes for climbing. It costs about +0.7 ms in shadows.
- **Climbing uses parametric surfaces**, not mesh collision:
  - legs are tubes foot→knee→hip (u, angle) and the body a tube around the spine (s, θ);
  - legs move along their axis directly, the body by projected camera-relative input;
  - radii come from the rig, so the grip sits on the visible surface.
  
  The camera pivot stands 1.6 m off the surface, and the arm treats the Warden's chunk ellipsoids as an occluder: the arm is blocked only after it has been outside, so a pivot inside the body is ignored.
- **Stilled / restored** is a grade (desaturate, warmth, flatten), wind strength and spindrift, driven by one restoration value. The release drives it directly over ~10 s. Stilled is flat, cool and windless; restored is warm, with wind and spindrift.
- **Release cinematic:** fracture light (0–3 s), the exhale (3 s: powder wave at 16 m/s, wind gust, shake), then lying down into a long drift (3–12 s) while the grade warms.
  - The camera swings from the player's view into a slow rising orbit (44 m, pulled back to 58 m for the wave), letterboxed, and is skippable.
  - Powder billows are spray particles over 0.5 m: long-lived and rolling. They are excluded from the shadow pass, because dithered cover from metre-wide puffs screen-doored the ground.
  - Mound lumps scale with the heap, so a hound's mound is clumpy while the Warden's drift is smooth.
- **Feedback without a HUD (BRIEF §12):**
  - focus is the brightness of the hand light;
  - health is the cowl light (it gutters when low) and frost creeping up the robe, with a cold vignette only at very low health;
  - a fight reads with the HUD hidden.
- **Diamond dust (stilled air)** consists of stateless GPU grains in a camera-centred volume.
  - **Motion:** they move only by an owner-integrated "moving time" whose rate is the restoration (plus the release gust). In stilled air they are literally motionless, then drift off and thin out as the land is restored, with no jump when the rate changes.
  - **Look:** each grain is a plate crystal with its own orientation, mostly near-horizontal. It flashes only where it mirrors the sun into the eye, so the frozen field twinkles as the camera moves.
  - **Rendering:** additive, sized to at least ~1.5 px, and dimmed when enlarged.

### Phase 5 rework (after the user's review, 2026-10-04)

- **Climbing is hold-to-hold.** Continuous surface sliding read as flying, so movement now comes only from a reach → pull → beat cycle. Holds are stored in the surface's own parameters, so they ride every step and buck. Hands reach them by two-bone IK, and the pelvis hangs on an underdamped spring (ω 12, ζ 0.42), which gives the weight. The climb surface is the visible one: a ray from the bone axis leaves the outermost chunk ellipsoid, with the smooth tube only as a floor. Bumps are holds, and the Wraith is never buried in a bulge.
- **The release never removes the Warden** (BRIEF: "settles into the land"). It rears, slams, sends a shockwave, then lies down under snow. Snow cover rides in the chunk records' alpha (1 bare … 0.51 buried) and smooths the crags toward drift. It rests for good (state RESTED) as a ridge with its spires standing.
- **The shockwave throws the Wraith** (character/knockdown.js). It goes through the climb's frame-override path (pelvis plus body frame), so no new animation system was needed. It is held down while the cinematic plays.
- **Scour grooves are laid end to end** (one stamp per 2.6 m segment per ray). Per-frame overlapping plough stamps left a tyre-tread ripple.
- **Hit feedback travels in the chunk records:** the hurt flash is the fractional part of `kind` (kind + 0.45 × hurt), which needs no new channel. Shaders round the kind down.
- **Audio is pulled forward from Phase 7,** procedural only (no samples yet), because the fight was mute.
  - A fixed pool of 20 voices (looping noise → filter, plus an oscillator, then a panner) is re-enveloped per sound, so nothing is created per sound.
  - It is silent in captures and benches, and starts on the first input (autoplay rules).
  - The wind bed follows the restoration-driven wind, so the stilled steppe is silent until the release.
- **Glacial blocks, not balls:** each Warden chunk's radius is clamped by 7 seeded planes (a convex cut), giving flat fractured faces and sharp edges with the crags left between them. The normal blend toward the smooth union dropped to 42 % so the faces read; it rises to 95 % as the snow covers the Warden.
- **Phase 5 closed (user decision, 2026-10-04):** "fix these issues and move on if it's good". The listed issues were fixed and verified on the target shots. Carried forward:
  - live feel of the climb and the fight (only the user can judge);
  - the procedural sounds are placeholders until CC0 samples are vendored (Phase 7 audio).

## Phase 6 — Post, weather and time polish (frost)

### Session context

- **This session ran in a cloud container, not on the target PC** (no GPU, no Windows Chrome). Everything was built and checked here with headless Chromium on SwiftShader (images valid for look review, timings not), at 480×270 because a software frame takes seconds. **Gate shots and benchmarks must be taken on T by the user** (`?shots=p6-&dir=phase-06&capture=1&res=2560x1440`, `?bench=weather&res=2560x1440`). The capture harness takes `WRAITH_CHROME=<path>` for a preinstalled browser build.

### Post chain (BRIEF §5.8)

- **Architecture:** the camera renders into an rgba16f scene target (`camera.outputRenderTarget`) with a sampleable depth32float reverse-Z depth texture. Every post pass is a **compute** shader with fixed bindings (bind groups never rebuilt per frame; the history ping-pong uses two pass instances, A/B), and one fragment pass (display) draws to the swapchain. Compute passes are encoded in order after the scene pass, so snapshot rendering is unaffected; only the display draw is a recorded bundle.
- **Materials write pre-exposed linear HDR** (`displayTransform` now only multiplies by the exposure and clamps non-finite/over-range values). Tonemap, grade and sRGB moved to the display pass; the per-material 8-bit dithers are gone (one dither at the end).
- **Order as built:** SSAO (½ res) → SSR (½ res) → weather volumes (¼ res: clouds, shaft ratio) → compose (scene × AO, + SSR, + clouds, + weather fog) → exposure meter → **TAA** → DOF (cinematic only) → bloom → display (tonemap → CAS sharpen → LUT grade → grain → dither). This differs from the BRIEF's listed order (TAA first) on purpose: AO, SSR, clouds and fog are noisy per-pixel estimates, and compositing them *before* TAA lets TAA integrate their noise for free, so each can run with few samples.
- **No MSAA:** the engine runs with `antialias: false`; TAA anti-aliases and also resolves shading aliasing (glints, detail normals, fur coverage, alpha-tested hems) that MSAA never could.
- **TAA:** Halton(2,3) 8-sample sub-pixel jitter added to the camera projection (m[8], m[9]); reprojection from depth through last frame's unjittered view-projection (nearest depth of the 3×3, so edges reproject with the foreground); Catmull-Rom history; variance clipping (γ 1.1) in YCoCg on 1/(1+luma)-compressed colour; feedback 0.9, lower under fast motion. **No per-object motion vectors:** moving characters rely on the clipping (their history is rejected rather than smeared). A velocity buffer would need an MRT output from every material; deferred unless ghosting shows on the target.
- **Captures with TAA:** spots reset the history once the world settles, then render 24 more frames; the jitter index restarts at the reset, so captures stay byte-identical across loads (verified on SwiftShader).
- **SSAO:** Alchemy AO from depth only (normals from the smaller depth difference), 8 taps on a 0.9 m disc, per-pixel/per-frame rotation, ½ res with a depth-aware upsample, faded out by 140 m. It multiplies the whole lit colour (there is no separate ambient buffer), so it is kept restrained (intensity 0.55): contact grounding, not dirt.
- **SSR:** reflective pixels are marked by the material in the scene target's alpha (the reflection weight: Fresnel × ice/wet gloss; only the frost clipmap writes it, every other opaque material writes 0). Half-res march (28 growing steps + 5-step refine) through depth; hits replace the material's own sky reflection by their weight; misses leave it. Transparent passes (spindrift, snow) blend into the alpha slightly; harmless because only hits are applied.
- **DOF:** only in the release cinematic (focus on the Warden), plus anything within ~1 m of the lens while it runs. Off in play. Both instances are warmed during loading.
- **Bloom:** 6-level compute mip chain (13-tap down, Karis average on the first; tent up), no threshold, 4.5 % energy-conserving mix.
- **Tonemapping: ACES stays the default** after an A/B of all 21 gate shots on T (`screenshots/phase-06` vs `phase-06-agx`): AgX visibly drains the golden hour (dawn and dusk lose their warmth) and flattens the warm-key / cold-shadow contrast BRIEF §5.3 asks for; ACES keeps it, and nothing clips under either (highlight roll-off is handled by exposure, the meter and the snow material). AgX remains a toggle (`?tonemap=agx`, overlay). Pending the user's own preference.
- **Grading (BRIEF §5.8 LUT system):** a 32³ LUT (1024×32 strip) baked in compute from a few parameters (desaturate, warmth, flatten/contrast, shadow tint, highlight gain) whenever the blended grade changes. Frost stilled and restored are the two looks (the Phase 5 grade moved into the LUT, plus cold shadow tint / warm highlight on restored). Other biomes add their looks to `post/grades.js` and blend by biome weight at the camera when they exist.
- **Eye adaptation (frame-metered):** a one-workgroup compute meter builds a centre-weighted log-luminance histogram of the composed frame (64×64 samples, converted back to absolute luminance), trimmed mean (drops the darkest 30 % and brightest 3 %). The atmosphere's ambient pass turns it into a **bounded correction of the analytic exposure (−1 … +0.75 stop)**, replacing the fixed frost-albedo compensation (kept as the fallback). Captures snap exposure every frame.
- **Film grain** (luminance-weighted, very light) and **CAS sharpening** (0.35) live in the display pass. Every pass has an overlay toggle (Systems & post).
- **Aerial-perspective LUT orientation fixed:** the froxel LUT was built with row 0 at the top of the view, but every material looks it up with Babylon's y-up fragment position, so the lookup was vertically mirrored since Phase 1 (subtle: haze of upward rays applied to the ground at the bottom of the frame). Row 0 is now the bottom.

### Weather (BRIEF §5.6)

- **State machine** (`world/weather.js`): clear, overcast, snowfall, blizzard, blended into continuous parameters (cloud cover, snowfall, wind multiplier, fog, gust) eased with τ = 13 s (≈ 40 s to settle; tested: no step over 1 % per 100 ms). Restored, the steppe cycles through all four on deterministic durations (2–12 min per step). **A stilled steppe only has clear and a still overcast** — no falling snow, no blizzard, no gusts: still air is the fiction of the stilled land, and the weather returning is part of the release's reward. A forced snowfall/blizzard while stilled falls back to overcast.
- **Override:** the overlay's weather select (and every photo spot's `weather`) forces a state; "auto" runs the cycle. `worldState.weather` is now the current state, `worldState.weatherOverride` the forced one.
- **What weather drives:** cloud cover → clouds, the sun/moon reaching sky, air and ground (dimmed to 4 % under a closed deck), and an overcast sky radiance (CIE overcast gradient) mixed into the IBL SH and hemispheric ambient; fog → the weather fog's density (visibility ~4 km overcast, ~1 km snowfall, ~150 m blizzard) and scale height; snow → falling snow particles and **terrain refill ×(1 + 5·snow)** (snowfall fills tracks; BRIEF §4.3 "weather writes too"); wind → cloth, spindrift (thicker in snow and gusts), falling snow's slant, cloud drift and the wind sound.
- **Clouds:** a raymarched volume layer (24 steps + 4-tap light march, Beer–powder, two-lobe phase, tiled Perlin–Worley noise baked at load), ¼ resolution, jittered and integrated by TAA (that is the "temporal reprojection" BRIEF §5.2 allows). The deck lowers and thickens with cover. "Clear" carries scattered cloud (cover 0.3); only the closed share of the deck (cover above 0.35) dims the sun (to ~4 % overcast, ~2 % snowing, 1.5 % closed) and fades the shadow maps (to 15 % under a closed deck), darkens the IBL toward overcast and lowers the exposure. It has to go that far: at a low sun even a tenth of the sun on slopes facing it outshines the dim overcast sky, so the first two target passes still showed hard, warm shadows at overcast dawn and dusk. Cloud density: two noise octaves sheared with height, and each column's top follows its coverage (flat bases, dome tops) — a purely 2D field read as vertical streaks on the target. Far and grazing samples blend to a 4×-box-filtered copy of the noise and drop the fine octaves, and a grazing path is capped at 14 km: the full-detail field aliased into radial streaks across the overcast deck. The march's 32 steps start at 60 m at the layer's entry and grow ×1.12 (what one sees of a deck from below is its first few hundred metres; equal steps banded into ladders), jittered over 64 frames. **No per-position cloud shadows on the ground yet:** the cloud deck dims the key light globally. Moving cloud shadows across the steppe need a shadow lookup in every lit material (a binding the terrain shader is short of); deferred.
- **Weather fog and light shafts:** an analytic exponential height fog at full resolution in the compose pass (based at the ground under the camera, eased), lit by the sky and by the sun with a ¼-res **shaft ratio**: the sun's in-scattering marched through the first three shadow cascades over the first 300 m. Storing a ratio rather than colour keeps silhouettes from haloing. In clear air the fog is near zero, so shafts appear only where there is something in the air (snowfall, overcast haze, blizzard) — restrained, as BRIEF §5.3 asks.
- **Falling snow:** 16 000 stateless GPU flakes in a camera-centred, wrapped column (same technique as the diamond dust); fall and wind travel are integrated on the CPU as vectors, so changes of wind never jump; flakes stretch along their motion (blizzard streaks), forward-scatter the sun, are shadowed and fogged.

- **Phase 6 gate accepted (user decision, 2026-10-04)** on the MacBook look shots (`screenshots/phase-06-mac/`, third re-shoot) and the target bench (`?bench=weather` on T at 175 Hz: GPU 12.3–12.6 ms median, 0 late pipelines). Carried forward: a 60 Hz bench on T and an in-motion check (falling snow, shafts, TAA on the moving Wraith, weather easing); per-position cloud shadows; real refraction for spell water/crystals; per-object motion vectors; the overcast deck's streaky grain. Condition from the user: cut `src/main.js` down before Phase 7 adds systems.

## Phase 7 — RPG layer (frost chapter)

### Decisions with the user (2026-10-04)

- **`src/main.js` split first** (user's condition for Phase 6): 1101 → ~180 lines; boot is in `src/boot/` (engine, world, actors, game facade) and the per-frame systems in `src/systems/`, registered in the same order as before. Verified against captures of the old build: same images (`p6-snowfall-dusk` within 2/255 on 1.4 % of channels; `p4-verbs-noon` differs only in glint/grain noise, same composition and marks).
- **Story: Claude drafts, the user reviews.** The frost chapter's quests, NPC lines and lore are drafted in `data/quests/frost.json` and marked for review.
- **Buildings: procedural Shaper stone** (no imported meshes), in keeping with the procedural-only art direction.
- **Audio — deviation from BRIEF §13:** the BRIEF asks for layered CC0 samples for footsteps, surf and spells. The CC0 samples the user found were too poor, so **sound effects stay procedural** (`audio/sfx.js`) for now; samples may replace them later. **Music is the user's own score** (generated by the user, see ASSETS.md), not procedural: nine cues — title, waking, shrine, Warden awakening, Warden fight, release, death, Echo, and a pilgrim's lyre at the camp.

### Music (BRIEF §13)

- **Sparse, as the BRIEF asks:** a director (`systems/audio.js`) picks one bed by priority — release, fight (Warden awake within 190 m), title, waking, shrine (within 30 m), camp lyre (spatial, within 90 m of the fire) — and silence otherwise. Stingers: the Warden waking, death, an Echo.
- **Streaming, not decoding:** the long cues play from media elements routed into WebAudio (decoding all of them would hold ~330 MB of PCM); loops crossfade between two elements over 3–5 s at their loop points (the generated tracks have intros and fade-outs, so the loop is cut inside them). Stingers are decoded once. Music has its own bus (not through the SFX compressor), a volume and a dialogue duck. Off in captures and benches, like the SFX.
- **The release cue** starts the frame the Warden enters its release; the piece builds over its first ~9 s while the Warden rears and slams, and resolves over the restoration.

### Save v2 (BRIEF §4.5)

- **Schema v2** with a v1 → v2 migration: the quest graph's state (quest states and steps, world flags), shrines, journal (lore, explored map), the world's entities (ice formations, the Warden) and the forced weather. Tested (round trip, migration, async collect).
- **Terrain pages:** a save first writes the whole fine window down into its coarse pages (the record is otherwise only refreshed as strips scroll out), then reads every resident page back **one page at a time** (async readback across frames) and copies the evicted pages from the worker's store; the save worker drops pages that have healed back to rest and deflates the rest. Pages are stored at the coarse 25 cm resolution the BRIEF specifies: a reloaded trail is the coarse record of it (as when the player walks away and back), not the 2 cm footprint detail.
- **Load** forgets every page and the window, hands the saved pages to the worker as evicted pages (their times shifted onto the new session's clock) and lets the normal reload path bring them back as the window approaches. A generation counter drops replies and evictions from before the load. Loading waits for nearby pages.
- **Fixed on the way:** a reused atlas slot kept the previous page's data where the new page lay outside the fine window (ghost marks far away). A fresh page's slot is now zeroed when it held another page.
- **Ice formations** (permanent) save their prisms with birth times relative to the save. **The Warden** saves as dormant or rested with its pose; a rested Warden is re-laid by stepping its release silently from the impact to rest (no terrain writes — the saved pages hold its crater, shockwave and drifts). A fight in progress saves as dormant (the fight restarts).
- **The Warden in live play:** it now waits dormant in its arena (`warden-frost`); until Phase 7 it only existed through photo spots and the dev overlay. Its ground is kept known from afar by an **anchor patch** (a 192 m collision patch the streamer keeps around a fixed place), so it stands on real ground before the player is near.

### The frost chapter (BRIEF §11)

- **Data, not code:** `data/quests/frost.json` holds places, NPCs, talk tables (first matching condition wins), dialogue (lines, at most one choice of two, `then` actions), quests, Echoes and lore. The quest graph (Phase 7 start) runs it; `game/chapter.js` adds talk, dialogue and progression; tests play the whole chapter from waking to first snow, the lost child, and a save round trip.
- **Story is a draft** for the user's review (user decision: Claude drafts, the user reviews). Proposed shape: wake in the monastery (Aud) → the shrine below the cliffs → the pilgrims' fire (Maren) → the watching stone (Varo) → release the Warden → first snow at the camp. Side: a child's trail to a frozen spring, freezing the spring and seeing it run after the release, the five shrines, the night songs.
- **New place: the pilgrims' camp** at (80, 2480), ~600 m, between the monastery and the arena: the only broad flat frost ground on that line (sampled from the bake).
- **Echoes are few and visible** (BRIEF §2.4): longer Ribbon reach, longer freezes, surf that keeps its speed, faster focus at rest. Found through quests, they are carried until **attuned at a shrine** (the BRIEF's shrine Echo upgrades); only then does the effect apply. Attunement is a world flag (`attuned:<id>`), so saves need no schema change. Shrines: rest (time skip, autosave), travel between rested shrines, attune Echoes.

### The Veiled (BRIEF §8.2)

- **Same robe system, parameter variations:** each NPC is a full Wraith figure (cloth, gait, body) — staff-bearer (1.1×), elder (0.9×, hunched), child (0.62×), lantern-keeper, monk — with dyed robes (a tint on the outer garments), a hunch and breathing in the body's lean, no cowl light.
- **Size by a similarity, not new rigs:** the figure is simulated at the Wraith's size in a scaled copy of the world (ground heights mapped through it) and its vertices are mapped back before upload. Feet plant exactly on the real ground at any size, and footprints land where they plant. No second gait or cloth tuning to keep in step.
- **Cost:** CPU cloth per figure; five named Veiled and one walker. Full rate within 60 m, every third frame to 260 m, hidden beyond. Measure on T (`?bench=` not yet extended to the camp).

### Architecture (BRIEF §11, §17)

- **Procedural Shaper stone** (user decision): primitives (blocks, drums, cones, slabs) built once on the CPU into one mesh in site-local metres, placed per site by a uniform array (anchor, seat, shown). Seats are the lowest ground under each site's footprint, found once its ground is known (anchor patches), re-seated only while far; foundations run 3 m into the ground so slopes never show a gap. One draw, two shadow cascades.
- **Collision:** `world/solids.js` — circles and oriented boxes that push the capsule out, platforms whose tops are floors. Field-based query on the substep path (no doubles across calls).
- **Material language:** pale warm ashlar in 0.55 m courses, carved glyph bands that hold a cold light at shrines the Wraith has rested at (the monastery's wake as the steppe is restored), felt tents lit through by the fire at night, bronze, timber, and the frozen pool writing the SSR weight.

### Screens (BRIEF §12)

- **Title over the living world** (the sim keeps running behind it), not a separate scene. Continue loads the newest save; Begin plays the waking.
- **One parchment codex** for every page (pause, journal, map, shrine, saves, settings): CSS gradients and an SVG turbulence grain, no image files; every control restyled. The world's clock stops under a page.
- **The map is drawn from the bake** (8 m overview heights → ink hill shading and contours), revealed in 125 m cells as the Wraith explores, saved as a bitmask in the save. Places are lettered once found.
- **Fonts:** Cormorant Garamond (text, subtitles) and IM Fell English (ink, titles), both OFL, bundled from npm (@fontsource) — no runtime font fetches.

### After the user's first play-through (2026-10-04)

- **Climbing rebuilt at the root** (user: "climbing is glitchy, it teleports you onto another part, it sent me through the ground"). The surface search took the farthest chunk along the climber's ray — through another leg or the body, 5–23 m away; on the lower flank the ray pointed down and put the Wraith under the snow (the camera followed: the view from under the world). Now: the body rides the smooth limb/body tube plus a fixed 0.35 m (no chunk can pull it away); only the hands look for holds, and only on chunks standing on the gripped surface (entered within 0.4 m of the tube, left within 1.3 m). The leg axis turns smoothly round the knee and the body frame is taken from the spine half a segment either side (both used to flip at the joint: 1–2 m snaps). Leg↔flank handoffs go to the nearest point of the new surface and ease the rest (no fixed landing spot). Climbing down to the snow, or the Warden kneeling the climbed limb into it, steps the Wraith off.
- **The Warden never folds:** its spine is a rope with a 26° bend limit per joint (it could fold back on itself when turning in place: the cause of the worst snaps), and while climbed it plants its feet and heaves instead of chasing the climber on its own back. The heave is slower and heavier (it moved the legs ~38 m/s: it read as a glitch).
- **Test:** `tests/climbStress.test.js` mounts every leg from either side and climbs at random for 30 s with the Warden awake: no frame moves the climber more than 0.6 m (worst 0.48 m over 40 random sessions, was 23 m), the feet never go under the snow.
- **Readability:** a single notice the first time it wakes (freeze the knees with Crystallize, Sweep through the ice, climb for the back joints); frozen joints hold 12 s (was 9); a Crystallize within 7 m of a knee freezes it (was 5).
- **Rocks ride the deformed snow** (user: "rocks look cut in half"): they were seated on the undeformed terrain, so a berm of displaced snow sliced through them and a trench beside one bared its buried underside. Each rock now follows the snow's offset at its centre (terrain-state read in the rock vertex shader and its shadow casters).
- **Monastery:** Aud stood inside the fallen roof slab (now beside the bier on the intact side; the fallen slabs are solid); the citadel's seat is the highest ground anywhere under its platform (a 1.5 m grid), so the summit's snow no longer shows through the hall floor; stone, felt and wood no longer take the snow's cold sky boost (the hall's shade was electric blue).

### Flow, navigation and quests (user request 2026-10-08)

- **Compass = deliberate deviation from BRIEF §12 ("no HUD by default").** The user asked for it. It is the one persistent element: a slim engraved-ink strip at the top (cardinals, intermediates, degree marks, heading), fading after 4 s idle, with a setting (Fades when idle / Always / Hidden); hidden in captures, title, menus and cinematics. §11 stands: **no minimap**; the map stays parchment. One registry (`game/nav.js`) feeds the compass, a small world waypoint over the tracked goal and the map; places are *known* by sighting radius or a quest reveal, Echo stones are sensed only up close, quest steps publish `goal`s (T cycles the tracked one).
- **Story layout compacted at the root (bake):** the monastery moved from a 1,545 m summit (a ~1 min rock-face fall) to a levelled shoulder at 730 m above the Warden's arena. Camp, spring, watching stone, five shrines, six Echo stones and the hounds' den sit within ~1 km. The descent is the **Shapers' Run**: a 493 m banked snow chute (138 m drop, max 20°) with nine gates, carved after hydrology so it follows the natural gully — the signature long curving surf run of BRIEF §2.2. The rest of the 8×8 km world is unchanged. There is no vehicle: the "buggy" is the Wraith's snow-surf.
- **Quests rebuilt around the existing verbs** (3 main, 5 side, per §11): wake stones that answer Crystallize/Sweep/Ribbon; rest at the first shrine (death re-forms at the last shrine rested at, §2.3); the Run (optional: under 38 s); clear the ridge hounds before Varo will talk; the Warden. Sides: *A Trail in the Snow* (a real decision: lead Tobin home → Echo of the Long Throw; let him listen → two hidden Echo stones revealed), *The Sleeping Spring* (Crystallize the spring), *The Stones Remember* (listen at hidden Echo stones; optional all five shrines), *Hounds of the Ridge* (den encounter), *The Slow Songs* (light three braziers, hear Isolde at night). Optional objectives live beside the steps (`optional`), numeric variables and `reveal` chains are quest-graph primitives.
- **Echoes stay few with visible effects (§2.4):** the new *Echo of the Open Hand* (Sweep reaches 20 % farther) is earned by waking all three verb stones. Echoes now come from quests, Echo stones and optional objectives, not from fetch errands.
- **Gameplay systems read by the quests as data** (`systems/trials.js`): events `use:<id>`, `run:done`, `encounter:<id>:clear`; flags `used:`/`lit:`/`cleared:`; vars `run.gates`, `run.fast`, `stones`, `braziers`, `verbStones`, `lastShrine`. Encounters arm themselves from the active quest step (so a load mid-quest re-arms) and respect the ≤ 8 Shaped cap.
- **Not yet built** (marked): in-world light beacons for distant POIs, the carried lantern, the bell, robes.
- Story text in `frost.json` remains a draft for the user's review.
- **Music deviation from BRIEF §13 (user, 2026-10-08):** "silence and wind" as the default felt bare, so exploring has a travelling score of the user's own cues: `plains-wanderer` (day), `plains-dusk` (dawn/dusk), `frost-ice-caves` (night and the spring's ice), `frost-highlands` (above 820 m), `frost-blizzard` (snowfall > 0.75), `plains-herd` (the Run or a fast surf). Whole-file loops crossfaded over 4–6 s, quiet under the wind; priority release > fight > title > waking > shrine > camp > travel. Latches stop flapping at thresholds.
- **Music calmed (user, 2026-10-08: it "changes way too much"):** the travel music now depends only on the time of day (day / dusk and dawn / night) and a real storm; height, speed, the spring and the Run no longer switch it. A change waits for the new condition to hold 20 s and for the current track to have played 3 min. The shrine cue only plays within 14 m of a shrine.

### Warden fight rework (user, 2026-10-08: "not fun and impossible")

- **No mandatory climb.** The back joints were only reachable by climbing a heaving 12 m body and hitting Heavy then Primary within 3.2 m, with nothing telling the player. Now all four seams are worked from the ground with the same two verbs, in four beats: knees (always open) → the Warden sags onto its forelegs → the **shoulder seam** (left flank) opens → the **hip seam** (right flank). A seam sinks to ~2.6 m above the snow once exposed. Climbing still reaches any seam at any time (a skilled shortcut), unchanged.
- **Kinder verbs:** Crystallize within 9 m (was 7) of a seam freezes it; a Sweep through a liquid seam chills it (a second Sweep breaks it); wider Sweep window; frozen seams hold 18 s (was 12); the kneel after a break lasts 8 s with a 4.5 s breather before it attacks again; the body sags 10 % more per broken seam.
- **Readable:** four pips under the compass (liquid / frozen / broken / sealed, the next one pulsing) with one line of what to do; the compass follows the next seam (`warden-joint` dynamic goal); a notice at each break.
- Test: `tests/wardenSeams.test.js`.

### Hybrid Warden fight (user design, 2026-10-09)

- **Phases (`game/warden/fight.js`, `systems/wardenFight.js`):** when it wakes, **six crystal pillars** (9 m Shaper columns, `world/architecture.js` ARENA) rise out of the snow 34 m round it, a crystal on each. While any crystal stands the Warden is **warded** (seams sealed) and **healed** (1.5 health/s per crystal). The Wraith climbs a pillar (hold RMB; the existing hold-to-hold climb on a new PILLAR surface in `climb.js`), mantles onto the capital and strikes the crystal (Primary, 3 strikes; no Sweep is cast there). All six broken → it rears (W.ROAR) and the seams open: the knee → shoulder → hip order stays, Crystallize then Sweep. **Health 100:** a seam takes 20, a Sweep through it 2.5, a Ribbon tick 0.6; at 0 it is released (the old "last seam releases" rule is gone). At **30 %** it roars and the Shaped rise at the arena's edge: 2 brutes, 2 hounds, 1 seer; a second seer only after the first falls, never more than two in the fight.
- **The barrage:** every **15 s start to start** (once the pillars stand) it stops (W.CHARGE, 3.5 s: head lifts, spires burn brighter, frost breath, a ring of powder creeping out, a rising glassy whine `SFX.CHARGE`, "GET BEHIND STONE"), then sheds spikes for 2 s (W.BARRAGE): aimed spikes at the Wraith every 0.27 s (5 each) plus ~24 wild ones a second across 46 m that stick in the snow (score + frost marks) and wound Shaped in the open. **Not dodgeable:** spike hits go through `combat.hurtRaw` (no bend-step immunity). An aimed spike homes on the Wraith while it has line of sight and flies straight once stone is between; it shatters on what it hits. **Cover:** `solids.segBlocked` (segment vs the built blockers at the height the line passes) — ten broken walls 22–25 m out, six more at 41 m between the pillars, the pillars themselves, and the Warden's own bulk (only for an aimed spike's homing look, so the per-frame cost stays small). Measured: shelter within ~16.8 m of any point 10–45 m from the centre (3.2 s at a walk; surf is faster). **Crystallize formations are not cover** (≈1.6 m tall; against a line from 10 m up they shelter almost nothing) — dropped from the plan.
- **Leash:** the Warden never strays more than 5 m from the arena centre, so the cover ring stays meaningful and its body does not walk through the walls.
- **Dying resets the whole fight** (user): at the moment the Wraith re-forms, the Warden is placed dormant where it was first found (same pose and heading), pillars sink, crystals return, its Shaped collapse, spikes clear. Also after 15 s more than 170 m away.
- **Readout (HUD deviation, like the compass):** a thin engraved health bar under the seam pips, six crystal markers during the ward, and one line of what to do (alarm style during a charge). Hidden in captures.
- **Rendering:** pillars and walls are architecture sites; pillars rise by animating their site's seat (`sink`). Crystals use a second instance of the Crystallize renderer; spikes a second Shaped-shader chunk view (glazed ice). No new pipelines (late-pipeline detector stayed at 0 throughout the browser runs).

### Quests rebuilt around play (user request, 2026-10-09)

- **Every step is an activity** built on existing mechanics: fights in waves (`systems/encounters.js`), an escort (Tobin follows at a child's pace and waits if left), a practice pillar with its own small barrage (the seedling by Varo's stone, teaching the Warden's mechanics safely), six Echo-stone gestures (`systems/echoTrials.js`: Crystallize marks, Ribbon on the stone, surf a circle, Sweep drifts, a guarded stone, Ribbon reach from the foot), a carried flame (`systems/flame.js`: gutters with time, faster surfing/running/in snow, a blow knocks 40 % out; draws hounds at night), Run medals (48/40/34 s on the best time), the bell.
- **Main story is 4 quests + an epilogue** (The Empty Robe → The Pilgrims' Fire → The Watching Stone → The Held Snow → First Snow), one more than BRIEF §2.5's 2–3, agreed with the user. 5 side quests.
- **Consequences carry into the Warden fight:** leaving Tobin to listen cracks one crystal (1 strike); clearing the den means one brute at a time and no hounds when it calls the Shaped; lighting the arena brazier makes it a place to re-form.
- **Death re-forms at the nearest safe place** (rested shrines, the camp once defended, the arena brazier once lit), not the last shrine.
- **Echoes reassigned** (still five, each earned by play): all hall stones → Open Hand; Varo after the seedling → Held Breath; Tobin led home → Long Throw; six Echo stones → Still Stone; Run gold → Running Water.
- **Den mother:** a new elite archetype (`denmother`: the brute ×1.32, 420 health, rime armour — unfrozen blows do 30 %).
- **Task line (HUD):** one quiet line under the compass for what is happening now (a challenge's clock, the child waiting, the flame, the Run's gate and time); owners claim it and release it.
- **Testing in the real browser:** `tools/winchrome/` drives the user's Windows Chrome (real GPU, headless) from WSL over the DevTools protocol through a reverse tunnel (WSL cannot reach Windows localhost; PowerShell dials back in per connection).

### After the user's play (2026-10-09)

- **Easier fight:** the barrage comes every 25 s (was 15), the first 20 s after the pillars stand.
- **Stone stops the small volleys too:** the Shaped's shard pool (the Warden's volleys, the seers') tests each flight step against the built solids and shatters on walls and pillars; a shard whose straight line to its target is blocked is thrown into the stone (a lob would otherwise drop over a wall). Measured: 28 damage in 20 s in the open, 0 behind a wall, 0 behind a pillar through a barrage.
- **The camp raid always starts:** reaching the fire completes the opening quest's remaining steps (stone, cloister, shrine) so the raid arms at once; Maren's "not now, the hounds" only plays while the raid is on (`fighting:<id>` flag), otherwise she says they will come again.
- **Rock collision:** `render/rocks.js` exposes the same deterministic placement on the CPU (`rocksNear`); `systems/rockSolids.js` rebuilds the rocks within 26 m every 4 m of travel into `solids.rocks` (an ellipse and a seated height, the shader's seating and frost/slope culling repeated). Rocks taller than 0.55 m above the feet block; lower ones are stood on (a dome). Camera and NPC floors use the same domes.
- **Rocks showed their insides** (user): the rock icosphere was wound counter-clockwise, so Babylon culled every outward face and each rock drew only the inside of its far half (a "sliced" look, worst seen from above or downhill). The indices are now wound clockwise; culling stays on (no new pipeline; turning culling off would have created one mid-game).
- **The Ribbon on a frozen Shaped froze the game** (user): each frame the stream touched it re-armed the 0.12 s shatter hit-stop; the stopped clock gave the stream zero damage per frame, so it never broke and the stop never ended, while the camera punch and shake added every frame spun the view. The Ribbon now strikes each Shaped in 0.18 s ticks (a fixed share of its damage per tick), and only a heavy blow or the killing blow on ice gets the big shatter stop. Regression test in `tests/combat.test.js`.

### Phase 7 visual pass (user, 2026-10-09: "extremely high graphics quality"; PLAN.md)

- **The art bar** is `screenshots/reference/forest-ruins-target.webp` (the user's reference): PBR-level surfaces, no repeats, layered depth, warm light over cool shade. PLAN.md "The art bar" holds the audit of where the frost chapter fell short.
- **Stilled without the grey veil** (the haze was the stilled state's contrast with the release; my alternative adopted): the stilled grade keeps its drained silver/steel palette (desaturate 0.68, cool) but no contrast flattening (it lifted black to ~25 % grey); **valley fog** of still air — a flat-topped layer at the lower quartile of the land within ~500 m (+20 m, never above the Wraith's feet − 8 m), closed-form in the compose pass, torn away by restoration; a **22° ice halo** with sun dogs, a low-sun pillar and a darker inner sky (sky shader, `artParams.y`, gone with the wind or under a deck); **snow hanging motionless** in a stilled overcast (the falling-snow field with its fall and wind travel at the restoration's rate). Frozen spindrift plumes on ridges: not built yet.
- **Robes read as wool:** base albedos raised (charcoal 0.135 instead of 0.088 — near-black wool against 0.9 snow read as a void); the sky SH's lower hemisphere uses snow's albedo (~0.78) on the steppe instead of 0.3, so folds, undersides and wall feet get the snow's bounce. Night floor tint less saturated.
- **Scans first, procedural on top** (user: "lets use scanned use a hybrid, however scanned looks sick"): CC0 Poly Haven scans packed by `tools/textures/build.mjs` into three WebPs per material (opaque: a canvas premultiplies alpha), uploaded straight to three GPU texture arrays with `copyExternalImageToTexture` and mipmapped per layer at load (`src/materials/library.js`; Babylon wraps the raw textures). ~24 MB on disk; GPU arrays uncompressed (8 × (2K + 2K + 1K) RGBA8 ≈ 380 MB) — BC7 later if memory asks. Shaders sample them through `shaders/materials.wgsl.js` (cotangent-frame normals, biplanar for unwrapped surfaces, `matRetint`: the scan's detail with an art-directed base colour — its 1×1 mip is the mean).
- **Masonry is laid, not drawn** (`world/masonry.js`): Shaper stone boxes become coursed walls of chamfered blocks (varied course heights and lengths, only visible faces emitted, chamfers darkened as recessed joints), plinths get walled edges and flagstone paving, stone columns become smooth-shaded drum stacks, ruined tops break off in steps with rubble at the foot. The big battered citadel foundations stay single faces with heavy courses drawn by the shader (they cost 700k vertices as blocks). Architecture: ~25k → ~560k vertices, ~250k triangles, one static draw (+2 shadow cascades); 0 late pipelines.
- **Snow drifts against stone** (geometry, material SNOW): a smooth parametric wedge with smooth normals along the foot of everything standing on the ground (small on raised floors, none on the parapet), so stone never meets snow on a hard line.
- **Quieter notices:** two at most at once, duplicates collapse, none in captures.
- **Monastery massing:** monumental courses (0.78 m, blocks ×1.35), aged blocks (chamfers 0.6–1.5× varied, ±2.5 cm proud/settled, ~2 % lost from the body of tall walls, showing the wall's thickness), buttresses and a cornice on the hall, timbers and drifted snow inside under the fallen roof. **Snow pillows** (smooth superellipse domes, shared vertices) on every exposed level top: wall crowns, column heads, rubble, the bier.
- **Camp:** felt tents are draped surfaces over 7 leaning poles (sag between ribs, flared hem, an open door bay, pole tips crossing above the smoke hole, guy ropes to stakes) instead of cones; `stick()` (a round, slightly crooked rod between two points) builds poles, ropes, logs, sled runners, staffs. Timber and felt boxes are chamfered and take the timber and wool scans.
- **Fire** (`render/fire.js`, `shaders/fire.wgsl.js`): stateless GPU particles like the snowfall — 8 fires × 112 quads (flame tongues, embers, smoke), all animated in the vertex shader from the clock; only 8 positions are written per frame. Flames and embers are additive (premultiplied, alpha 0), smoke alpha-blended and lit by the sky and the fire. The hearth always burns; a brazier once lit.
- **Spell light on materials:** the terrain's four point lights (spells, the carried lantern, the camp fire) now also light the cloth (robes, wrapped) and the architecture (stone, felt), sharing the clipmap's array (`SPELL_LIGHT_WGSL`). The camp fire's slot reaches 22 m and is brighter at night.
- **Rocks:** outcrops within 420 m use a dense icosphere (2562 vertices; boulders keep 642/162); the surface is the stratified and lichen scans, biplanar in world space (rocks never move), retinted cold grey, snow settling in the scan's hollows first. **Terrain cliffs** use the same scans at two scales (jointing from afar, grain near) through gradient sampling (`matBiplanarG` with derivatives taken once at the top of the clipmap shader: the rock branch is non-uniform).
- **Warden:** deep grey-blue glacier ice (not candy blue), dirt bands in its own frame, moraine debris on legs and underside, snow only on what faces up, deeper crevices, the ward glow gentler (it turned the whole body glassy blue).
- **Props:** carved staffs (crooked shaft, cord, bronze ferrule, a Shaper stone in the fork) and bronze-caged lanterns with a glowing pane, for the Veiled and the Wraith.
- **Robes (user: now, in Phase 7):** three, each earned by play — rime-hide (den cleared; Shaped blows ×0.85), runner's robe (Run gold, best ≤ 34 s; surf crest ×1.06), Isolde's ember robe (all braziers lit; carried flame ×1.4 life) — plus the wanderer. A robe is a dye on the outer garments, an embroidered hem band and/or a re-dyed sash (cloth shader uniforms), and one modest property (`game/robes.js`, test). Owned: quest flags `robe:<id>`; worn: the `robe` variable — both already saved, no schema change. Worn from the journal's Robes tab.
- **Not done in this pass (known):** frozen spindrift plumes over ridges; the far peaks' rock smudges (the terrain's slope mask at distance — Phase 2 look-dev, left alone); the lesser Shaped keep their glassy ice look; the monastery's plinth seen from below still reads as a slab on the slope; render scale + TAAU and LODs for 90 fps (PERF.md).
- **Temporal upscaling (PLAN.md Q6):** the scene and every pass before TAA run at `renderScale` (default 0.7; presets 0.55 / 0.67 / 0.8 / 1); TAA reconstructs the output from the jittered internal frames (Gaussian over the 3×3 nearest internal samples by their jittered positions, 32 Halton phases when upscaling, a wider variance clip and ~0.95 history), bloom and display run at the output. Materials read their pixel position at the internal size (`screenInfo`). The canvas is always the output size (render scale no longer shrinks it). Captures render at 1.
- **Found while doing it:** Babylon recomputed an unfrozen camera projection whenever the scene target and the engine differ in size, dropping the TAA jitter (at render scale < 1 the upscaler saw the same frame every time) — the jittered projection is now frozen per frame; the scanned material arrays were sampled nearest (their sampler lives on the internal texture) — now trilinear, anisotropic ×8; the shadow disk's per-pixel rotation was static — now re-drawn each frame for TAA to integrate. Known limit: no per-object motion vectors, so the Wraith's silhouette in motion is slightly stair-stepped at 0.7.
- **Barks:** ambient one-liners from the Veiled as the Wraith passes (data `barks` in frost.json, quest-graph conditions, 2 min per NPC, never in dialogue, fights or surfing) — draft lines.
- **Bestiary:** creature sketches from the creature's real body (chunk records, side-on along its principal axis), saved as quest variables, drawn as SVG ink (traced silhouette by marching squares, inner arcs, hatching) — instead of rendering creatures offscreen at load.
- **Echo stones:** stone 3 stands on wind-scoured ground no surf holds on (3 % snow within 20 m), so the surfed circle moved to stone 5 (all snow; "where the wind turns, I turned") and the guarded trial to stone 3.
- **Run medals** from scripted rides on the racing line (≈ 21 s): gold 23, silver 26.5, bronze 31 s (were guesses at 34 / 40 / 48).
- **Load mid-escort:** Tobin is put behind the Wraith once its load teleport lands, on every load; `systems/nav.js` had replaced the load-hook chain (`navSync`) instead of extending it.

### Phase 8 trees — cost and pops (2026-10-10)

- **Bark and leaves are separate draws.** The cut-out (and the leaf atlas) only where it is needed; leaves skip the bark scan. Leaves take the 4-tap shadow lookup: the cut-out edges already break the penumbra and TAA blends it (the 16-tap disk on overdrawn leaves cost ~4.5 ms).
- **Detail by time, not by distance.** A dithered crossfade driven by camera distance left trees standing in the band permanently speckled whenever the camera rested (both interleaved-gradient and white noise showed in captures). Instead, each placement compares every tree's state (near / far / absent, with 4 m hysteresis) with the last one. A changed tree is drawn in both sets for 0.6 s, its two copies dissolving complementarily (start time and kind in the instance data). A clean-up placement then drops the faded copies. A jump beyond 120 m (load, teleport) places fresh, with no fades. Placement every 20 m of travel costs 1.3–2.3 ms of CPU.
- **Tree shadows:** cascade 1 (to 140 m) is cast by shadow-only copies of every tree within 155 m in the far geometry, with their own instances, on a layer outside the view camera's mask. Previously only near trees cast there, so trees 80–140 m cast no shadow on the meadow. Casting the whole far set into cascade 1 instead cost +1.8 ms. Far trees cast in cascades 2–3 and dissolve with the edge fades. Cascade 0 has no tree casters: crowns overhead filled its fine map many layers deep (~1.4 ms in a grove). Instead, receivers in cascade 0 multiply in a 2×2 lookup of cascade 1, with the same normal offset and slope bias (`shadowTap4`). The shaft march does the same.
- **Leaf depth prepass.** Each leaf mesh has a depth-only twin (`treeZ-*`) that does the cut-out and the dissolve. It draws before every other opaque mesh (a group-0 order in front of Babylon's default by-material sort). The leaf colour pass then tests for equal depth and never discards, so each visible leaf pixel is shaded once: −5.4 ms of scene time inside a grove.

### Forest haze and god rays (PLAN.md M4b, 2026-10-10)

- A second exponential height fog (pad[3]: density, 1/22 m falloff, the ground under the camera) that exists only under a canopy. The density is 0.0032/m × canopy, where canopy is a smoothstep of the weighted tree count within 45 m (3 → 14; the open meadow measures ~0–5, groves 10–22). It is applied within 200 m only, so a grove never fogs the far mountains. It is lit by the key light through the shaft march's own ratio (shaftTex.g; the march is 24 steps over 160 m when the haze is on), with a strongly forward phase (g 0.72) and a faint sky term.
- **Shade lift:** under a full canopy, base exposure is raised up to +1.4 stops (scene materials and post). The meter's bounded correction (≤ +0.75 stop) left forest shade black at golden hour.
- The haze base is the ground under the camera, eased fast. The weather fog's base eases slowly and lagged 170 m below after a teleport, so it is not used.

### Forest floor, ground cover and the grass push (2026-10-10)

- **The canopy map is world-fixed and built once at load.** Tree placement is deterministic, so a 2048² R8 crown-cover map over the whole world (4 m texels; 97 ms at load, again only if tree exclusions change) needs no streaming and no uniform. It is sampled through the atmosphere's material textures (`canopyTex`; `canopyAt`, `canopySky`, `canopyFill` in `shaders/atmoMaterial.wgsl.js`), so every lit material already has it. A storage buffer would have pushed the clipmap past the per-stage limit.
- **Light under the crowns:** the sky IBL is scaled by 1 − 0.45·canopy, plus a fill of 0.13 × key colour × canopy (green-gold, stronger on up-facing surfaces) from the sunlit leaves. The camera's +1.4-stop shade lift stays.
- **Ground cover is stateless GPU cards like the grass**, not instanced meshes: one 564k-vertex mesh whose vertex shader picks the item for its world cell (canopy, meadow weight, noise patches, slope) and builds it from up to 8 atlas cards (flat drifts, radial arching fronds, stems with heads). Nothing is uploaded per frame; the same cell always grows the same thing. It receives shadows but does not cast them. The atlas is canvas-drawn at load (16 cells), like the leaf atlas.
- **Grass push:** an 8-point trail (the Wraith and where it was, dropped every 0.45 m, fading at 0.4/s) in a shared uniform array that the grass (rings 0–1) and the ground cover both read.
