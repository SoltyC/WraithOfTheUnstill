# Handoff — 2026-10-27 (full)

> **Latest — 29 October, storm cloak response verified separately:** `codex/desert-storm` in `/home/sol/wraith-light` is pushed at **43d12d2**,810tests/build. The real player mantle and robe now respond to short gusts/crosswinds in the shared CPU/GPU field, with normal-air cloth motion unchanged in the matched simulation. Two native480-frame close-ups show clear wind versus storm; comparison on that branch: `screenshots/d6-storm-cloak/cloak-comparison.mp4` (left clear/right storm), with `cloak-storm-comparison.mp4` copied into the chat workspace. Actual cloth probes, corrected real-mantle regression, CPU/GPU parity and live1440p/.7 checks pass; full body/movement/shelter/art/allocation gates remain open. Read that branch's `docs/phase-9/storm-cloak-review.md`.
>
> Main remains805tests through18bd3ba/fc134bf; **storms are still dormant and unintegrated**. Next D6: shared spatial terrain erasure/re-rippling/persistence, sound, real Ridge shelter and the remaining graphics/combined gates. Full handoff remains unfinished; goal usageLimited/manual continuation authorized. Owned GPU bots stopped; C: only, no D:.


> **Latest — 29 October, collision healing fixed and storm streak checkpoint pushed:** Main includes **18bd3ba**: Stone collision accumulates healing rate over new elapsed time, honors zero refill and avoids retroactive Ridge-height jumps when weather/refill changes. **805tests pass (800tracked +5preserved local-LLM tests)** and production build passes. Five regressions and a fresh main1440p/.7/180-frame smoke pass; actual bundled CPU owner exactly holds aged height at refill0 and matches piecewise decay. Main still has128post/24wind floats and no storm model. See `docs/phase-9/stone-healing-review.md`.
>
> Separate `codex/desert-storm` worktree `/home/sol/wraith-light` is pushed through **5ccdc95** (streaks a15ee78, wind d3d8df5),808tracked tests/build. Shared wind/water-SSR, readable low-Sun diffuse air and FOV-capped precipitation-geometry grains are verified in bounded scenes, with480-frame native motion/decoded QA, depth/zero-gate/snapshot/resize checks. The720p60 review film is `screenshots/d6-storm-streaks/streaks-inside.mp4` on that branch; a Windows review copy is in the chat workspace. Failed fixtures and all timing samples are retained. **Storms remain dormant/unintegrated.**
>
> Next: shared spatial terrain erasure/re-rippling with resident/evicted/save/collision agreement, audio/cloth feel and real Ridge shelter, then Sun-disc/actors/moving-camera/border/allocations/combined gates and saved anchored meso migration. `storm-erasure-contract.md` maps ownership and unresolved contracts; no renderer-only density shortcut. D2 still fails unchanged cold.4ms, D3/D9b and D7–D12 remain open. Full handoff/goal unfinished; usageLimited/manual continuation authorized. Owned GPU bots stopped; all files C:, no D:.


> **Latest — 29 October, storm-front prototype saved:** `codex/desert-storm` is pushed at **9fdca58**, worktree `/home/sol/wraith-light`, preview4181. **Unintegrated and dormant**; main source remains the verified dry-weather/crest/light work through2224f79,800tests/build. Prototype799tracked tests/build pass. Fixed world-anchored finite face/tail, shared CPU/GPU density, existing quarter weather/compose volume and local warm diffuse lighting; post block128→140floats, existing biome buffer, no new draw/pass/texture.26136density parity points max4.7471e-6,0mismatches; actual core optical visibility~200m; pinned2224f79 compose-off RGBA16F bit identity at720p; five native1440p poses0clipping/GPU/late errors. Nine matched239sample1440p/0.7 pairs add+.031–.117ms. Corrected native720frame arrival film has12nonempty exported near-ground samples with0clipping; prior exposure/lighting/empty-canvas fixtures are retained and labelled. Read that branch's `docs/phase-9/storm-front-review.md` before implementation. No full D6/gameplay/human signoff.
>
> Next primary work: shared CPU/GPU storm wind, sand streaks using precipitation tech, terrain erasure/re-rippling, cloth/sound and real Ridge shelter; then Sun-disc/golden-night/actors/camera/allocations/combined review before enabling the reserved weather cycle. D2 collision/solver gates remain open, so do not fake shelter or sheet transport with another brush model. One read-only helper inspected installed Babylon APIs: current composed storage texture supports render attachment; an existing-color/depth wrapper could draw streak geometry after compose/before TAA without a new full-screen texture. That rendering approach is **not implemented/tested yet**; verify reference ownership, resize, depth, snapshot and warm-up. Main full handoff remains unfinished; goal usageLimited/manual continuation authorized. All owned GPU bots stopped, files stay C:, no D:.


> **Latest — 29 October, dry desert weather integrated:** Main includes **c0416b8**: a separate seeded Dunes clear/heat-haze machine, continuous frost/meadow/Dunes blending and the stilled-air correction. The erg no longer inherits frost precipitation targets or flat grey cold-valley fog lakes. No new renderer resources/draw/pass. **800tests pass (795tracked plus5preserved local-LLM tests)** and locked build passes. Four new tests verify unchanged frost/meadow targets at Dunes0, dry restored/stilled aliases, continuous borders and deterministic7200s cycles. Six native1440p views (stilled/clear/haze/wet/golden/night) report0opaque clipping/GPU/late errors/steady LUT rebuilds; wet remains24.6%darker. Matched fog control changes only old/new inversion density, preserving its top; final fresh snapshot-disabled test starts/ends0GPU errors. Rejected unsettled/snapshot-enabled fixtures are retained and labelled. Review: `docs/phase-9/dry-weather-review.md`, `screenshots/d6-dry-weather-review/`.
>
> **Storm capability remains false.** A reserved sandstorm slot maps to heat-haze until real front/visibility/streak/terrain consumers pass review; no unfinished random storms are enabled. The developer menu exposes available heat-haze, no sandstorm option. Next implementation is a fixed, world-anchored leading/trailing storm face with CPU/GPU shared density, then its existing quarter-resolution weather-volume/compose consumers, sun/streak/wind/erasure/audio/shelter behavior; only enable after verification. Saved CPU/GPU meso migration and far crest coverage follow. The full D2/D3/D9b/D5 exposure/D6/D7–D12 handoff remains unfinished, with prior technical/human limits unchanged. Goal usageLimited/manual continuation remains authorized. All owned GPU bots stopped after dry-air review; work/captures stay C:, no D:.


> **Latest — 29 October, crest air integrated:** Main gameplay includes the near-crest suspended/released dust slice through **76446ce**, in addition to integrated D5 shimmer/mirage/aerosol. **796tests pass (791tracked plus5preserved local-LLM tests)**; locked production build passes. One existing sand draw now3136fixed quads, one newvec4, no new draw/storage binding/texture/pass. Rendered-height ridge detection supports transverse/seif/diagonal ridges; world-cell seeds remain stable, raw Dunes weight and88–120m range fade bound coverage. Stilled pose is exactly unchanged across100raw/wind seconds; released integrated time drives wind/gust travel. Actual GPU wet/off/outside-biome zeros, local freeze suppression and synthetic flat/slope/basin/ridge cases pass. Fine-state frozen rejection is limited to valid fine-window metadata.
>
> Corrected full geometry-cost off/on repeats at2560x1440 output/1792x1008 internal add **.088484/.081253/.052213ms**,239GPU samples each,0GPU/late errors. A diagnostic shortened-submesh bounds failure produced0samples and is retained as explicitly invalid; the corrected harness binds bounds and rejects incomplete timing. Native A/B360/360frames and separate release480/480frames,0failed/GPU/late errors. Final still matrix checks180actual scene frames per phase. Review: `docs/phase-9/crest-air-review.md`; captures: `screenshots/d6-crest-review/`. Fixed-scene technical acceptance only: no full-path allocations, combined D2/D3/D9b, far combat readability, sustained D12 or human art signoff.
>
> **Full todo remains unfinished.** This bounded near field is not every distant crest and does not implement the sandstorm front or dune migration. Next D6: third-biome clear/heat-haze/sandstorm machine plus its actual wall-front/visibility/streaks/erasure/wind/audio/shelter consumers, then saved CPU/GPU shared migration with anchored ruin/camp zones. Do not switch on random dune storms with only a weather-table change. D5 interior/cave-mouth exposure awaits actual D7 interiors; optional Milky Way deferred. D2e44d9af remains disabled for .492544ms cold compute failure/allocations/seif art; D3e5d4555 and D9b0dc2fa3 remain unintegrated with their documented gaps. D7/D7b,D8,D10,D11,blade/trade/forge and full D12 still require implementation/review. Goal remains usageLimited with manual continuation authorized; never mark it complete from these slices. Owned GPU bot4181 is stopped. All data stays C:, no D:.


> **Latest — 29 October, desert light integrated:** Main gameplay now includes D5 heat shimmer, projected playa mirage and low warm aerosol through **035482c** (heat ff6ce23, mirage fc216fe). **796 tests pass (791 tracked plus five preserved local-LLM tests)** and locked production build passes. New effects reuse TAA/atmosphere resources; no extra full-screen copy/draw/texture. GPU zero-effect baselines match exactly, near/sky/non-sand masks have zero leaks, actual mirage colour changes only far flat sand. Native noon/wet/golden/night aerosol views have0opaque clipping and0steady LUT rebuilds. Matched1440p/0.7 mean GPU costs: heat+.109–.140ms, mirage+.016–.035ms, aerosol+.003–.010ms in their controlled views. Three native1440p60 A/B films each360/360frames;0GPU/late errors in those checks. Review: docs/phase-9/heat-review.md and screenshots/d5-{heat,mirage,aerosol}-review/. D5 still needs interior/cave-mouth exposure verification once D7 interiors exist, broader moving-camera/telegraph review; optional Milky Way deferred. D6 storm/front/veil/crest plumes/migration are not built by this atmosphere slice. No whole-world or human signoff.
>
> **D2 updated separately:** codex/dune-relaxation is pushed at **e44d9af**,819tests/build. Conservative1/8 Jacobi rate fixes the sampled full-overlapping-Ridge oracle:34.005504758degrees now passes unchanged34.1degree tolerance after246simseconds. Actual dry/wet/frozen GPU/CPU parity and100cycle packed drift pass. Three synthetic32m/s/8-body stress repeats have compute maxima~.187ms and snapshot age<.163s, but a fresh-browser repeat reaches **.492544ms**, still failing the unchanged.4ms worst-case gate. Keep D2 disabled/unintegrated; allocations and steep seif art remain open. Review that worktree's relaxation-review.md/crest-review.md. D3 remains e5d4555 based on older D2 1c98263, default sand grant locked; D9b remains0dc2fa3 unintegrated. Do not claim their earlier captures include the new rate or D5 effects.
>
> Full handoff/Phase9 goal remains unfinished and automatic runner usageLimited; user authorizes manual continuation. Keep all work/captures on normal C:, never D:. Recording remains stopped. Latest committed progress supersedes historical notes below. Next independent implementation: D6 crest air/restoration signature while preserving shared terrain/material/wind ownership; storm and migration still require their full consumer/persistence contracts.


> **Latest — 29 October, sound and three-line review checkpoint:** D3 `codex/sand-surf` is pushed at **`e5d4555`**, after procedural audio `9f5740a`. New grain hiss/low rush use six fixed AudioNodes and the existing noise/effects master; speed/carve/wet/frozen/contact drive eased targets. Full suite833tests/build passed; affected wake/sound8tests and later production build/browser checks also pass. Six deterministic browser offline renders verify speed/wet/silence/stop-tail behavior; WAVs retained. Actual dry/wet/frozen running-mixer routes pass with0GPU/readback/late errors. AUDIO=1 only opts the owned headless test browser into autoplay; normal gesture policy unchanged. Frozen photo clock now releases friction targets; failing and corrected reports retained. Human listening/balance remains NOT ASSESSED.
>
> Three CPU-field-selected slip-face starts now have12s/native720p60 films with the actual spring-arm camera and identical normal inputs from rest: **2160/2160frames**,719active/720grounded each, all sand1,0failed/GPU/readback/late errors. Film peaks24.635/17.509/16.937m/s. MP4s/contact sheet: `/home/sol/wraith-surf/screenshots/d3-slipfaces-first/`. Separate actual2560×1440 output/1792×1008 internal real-input600-frame runs average61.16/61.06/60.40fps;GPU means16.118/16.193/16.324ms, rAF p9919.7/19.6/20.4ms;600/600active/grounded and max snapshot ages0.1665/0.1606/0.1757s. Little60fps headroom; these short clear runs do not pass sustained D12, allocations,32m/s collision stress or human feel. Reviewed samples retain ridged wake/head and distant terrain defects; no aesthetic signoff.
>
> **Sheets remain unimplemented.** Architecture review found PLOUGH/MOUND combine berms by max; a visual curtain plus extra landing MOUND would create mass. Couple a bounded sheet transport to actual source debit/solver transfer and matching landing deposit before claiming avalanches; singing boom awaits that mass event. Remaining D3: sheets/landing/boom, crest streams, art polish, local wet/freeze seams, distant/reload run memory, real world chains and human review; D2 convergence/timing/seif-quality gates remain open/default disabled. Default sand grant stays locked, no main gameplay integration. Detailed evidence/design review: newest sections of `/home/sol/wraith-surf/docs/phase-9/sand-surf-review.md`. Source/captures stay C: only, no D:; owned GPU bot4180 stopped after checks. Full HANDOFF/Phase9 todo and goal remain unfinished; manual continuation is authorized despite the automatic goal runner's usageLimited state.


> **Latest — 29 October, sand surface checkpoint:** D3 `codex/sand-surf` is now pushed at **`0996ef4`** (`/home/sol/wraith-surf`), **830tests/build pass**. Includes the prior self-wake collision fix and adds global-wet loose-spray suppression/shallow cuts, frozen metadata in the existing collision snapshot, periodic frozen refresh and a GPU frozen-crust PLOUGH guard. Corrected wet input run:180/180active/grounded,167cuts,0loose grains at measured wetness1. Final frozen run:180/180active/grounded/covered,0cuts/grains,max snapshot age0.1477s. Actual five-point GPU probes: frozen height change0 versus0.199951m dry;0GPU/readback/late errors. Wet/frozen stills reviewed; failed direct-weather forcing trial retained and labelled invalid. Default sand grant stays locked; D2 stays disabled and unintegrated. Frozen CPU spray suppression requires valid collision coverage; local-only wet patches and moving material/freeze edges remain open.
>
> Next D3 work: falling ribbon sheets with landing state writes, crest streams and wake/head art polish, procedural hiss/rush/singing avalanche sound, whole-run distant/reloaded visibility, real world chains and three authored slip-face films. Allocation/performance headroom and human feel still require acceptance. D2's unchanged convergence/timing/seif-quality blockers and all later Phase9/D12 tasks remain unfinished. D9b remains pushed at0dc2fa3 with its documented allocation/refraction/readability gaps. Review the newest sections in `/home/sol/wraith-surf/docs/phase-9/sand-surf-review.md` before historical notes below. Owned GPU bot4180 stopped after checks; source/footage stays C:, no D:. This is a verified prototype checkpoint, not full todo completion or main gameplay integration.


> **Latest — 29 October, enemy review and sand-surf continuation:** D9b `claude/dune-shaped` is pushed at **`0dc2fa3`**: dedicated Whirler core warning, accepted archetype/trig caches, **792tests/build**. Thirty latest-grade day/golden/night captures and two caster films of420/420frames each; zero GPU/late errors. Six live eight-body clear day/night runs at2560×1440 output/0.7 TAAU measure71–75fps and1%low63–66fps. Warm3000-frame allocation protocol still attributes28.49B/frame to the feature (whole game much more); zero-allocation gate fails. Packed brush/typed blind getter experiments were rejected/reverted, evidence retained. Shared-scene refraction and D3/D6 readability remain open; no integration yet. Read `/home/sol/wraith-shaped/docs/phase-9/dune-casters-review.md`.
>
> D3 is pushed at **`12744b2`**, `codex/sand-surf`, `/home/sol/wraith-surf` (based on D2 `1c98263`, no D9b). Shared material controller, default-locked sand grant, momentum-preserving glide landing and material wake; **828tests/build**. Controlled actual-input tests found and fixed riding the wake's own front berm: peak5.05→13.36m/s with collision retained. Corrected600-frame run stays600/600 active/grounded,593collision coverage,max age0.1597s, zero GPU/readback/late errors. Actual2560×1440/1792×1008 short-run GPU mean16.505ms/rAF16.6645ms leaves little60fps headroom; not sustained D12 acceptance. Eight-second fixed60Hz720p input film:480/480frames, reviewed in samples. Ridged wake/head still needs polish; falling sheets, crest streams, procedural audio, wet/frozen response, three authored slip-face films, distant persistence, allocations and human feel remain open. See that worktree's `docs/phase-9/sand-surf-review.md`. D10 must wire lending/save grant; it is not granted in normal play.
>
> D2 remains disabled/unintegrated at `1c98263`:34.10289239° still exceeds unchanged34.1° convergence tolerance; robust timing/allocation/seif-quality gates remain open. Main gameplay unchanged from `46ddc16`; this update records prototype progress. The goal remains unfinished and its automatic runner reports usageLimited; the user authorized manual continuation. No local-model contribution or human signoff is claimed. Storage remains C: only. Next: finish D3 surface response and sheet/crest feedback while resolving D2 blockers, then remaining Phase9 items and D12; preserve all failed trials.


> **Latest — 29 October saved checkpoint:** D2 is pushed on `codex/dune-relaxation` at `1c98263`: tight directional brush bounds and reusable readback pool, **818tests/build pass**. Disabled experimental scheduler now32steps/512slots/240s. Verified loaded-build fixed60fps overlapping-Ridge oracle reaches34.10289239degrees, still FAILING unchanged34.1degree tolerance (zero GPU/readback/late errors); earlier43.29/36.90/34.59degree trials and a clearly invalid stale-runtime run are retained. Robust compute spikes, allocations and steep boundary seif aesthetics remain open. Do not enable/integrate D2 or claim all todo complete. D9b branch `claude/dune-shaped` now includes latest main/D1b via c026ccc; **792tests/build pass**. Day/night/heap/eight-body GPU tools are prepared but NOT yet run. Next independent work: run/review that enemy matrix and profiles, then return to residual D2 convergence/timing/graphics. Automatic goal usage limit reached; full HANDOFF/Phase9 remains unfinished. Owned test bots stopped; storage stays C:, no D:.

> **Latest — D2 final crest/readback checkpoint, 29 October:** `codex/dune-relaxation` at `a144854` (`/home/sol/wraith-relax`) is pushed, unintegrated. Denser centre-first clipmap and analytic crest normals retain CPU heights; final4096-point parity maxima0.317/1.131mm. Reviewed sampled720p crest sweeps; steep boundary seifs still fail aesthetic approval. Fixed GPU readback staging reduces measured inclusive D2 allocation stacks602→274B/frame;814tests/build pass. Final-shader pre-pool shipping0.7 stress passes three runs, but fresh pool runs retain compute spikes0.573/3.262ms (later0.185/0.187ms). Ridge walking remains360/360 grounded/covered, max age0.1392s; hidden-player photo cold start reveals four late Wraith fur/FX variants. **New decisive failure:** overlapping full-size Ridge writes leave up to43.29degree disturbed sand after30s scheduler expiry. D2 stays disabled/default32; correct large-writer capacity/expiry/convergence next, keep failed timing evidence. Browser allocations are measured, not zero; whole-world/human gates remain open. Full details: that branch's `docs/phase-9/crest-review.md`. Expanded full HANDOFF/Phase9 goal remains active. All storage stays on C:, no D:.

> **Latest — D2 collision continuation, 29 October:** `codex/dune-relaxation` at `858854c` includes latest main/D1b and a bounded three-read/four-array collision pipeline (25 Hz maximum). Three verified1440p synthetic26 runs now keep snapshot age0.1834/0.1853/0.1835 s with >98% coverage and zero errors/late pipelines; 32-step Ridge walking is360/360 grounded/covered, 8.03 mm asynchronous comparison error, max age0.1994 s. **808 tests/build pass.** Combined compute maxima0.528/0.539/0.499 ms still fail the unchanged0.4 ms gate, so D2 remains disabled, default32, unintegrated. Review: that worktree's relaxation-review.md. Primary is now investigating actual seif-crest silhouettes with CPU-field-selected, GPU-depth-checked500 m/2 km cameras; denser-grid/morph changes are experiments, not accepted. The expanded goal is active for all remaining agent-verifiable Phase9/HANDOFF todo items; do not stop at D1b or sign off human feel/story/aesthetic gates.



> **Latest — D1b integrated, 28 October:** Main merge `a17d1e8` includes the reviewed dune grade/far-normal/sandstone implementation from `codex/dune-grade` (`5516a6f`). Wet/dry regression, zero surface clipping including sunset bloom, actual 2–4 km GPU-depth views at noon/golden/night, irregular strata and fixed-scene 1440p timing are recorded in `docs/phase-9/dune-grade-review.md`. Main: **789 tests pass (784 tracked + five preserved local-LLM tests)**, locked build passes, fresh 2560×1440 cold launch has zero GPU errors/late pipelines. Static medians close/mid/canyon ~15.1/11.3/12.6 ms; this is not sustained combat/weather/streaming acceptance. D2 crests/relaxation remain disabled/unintegrated; D9b remains unintegrated pending allocations/performance/readability. Next: D2 collision-readback latency and the unchanged technical gates. Canyon sawteeth (D7b), cold-erg transition, human aesthetics and whole-phase D12 gates remain open. All owned bots stopped after checks; temporary profiles stay on C: and are disposed, never moved to D:.


> **Latest continuation — 2026-10-28 evening:** D9b is implemented and reviewed on claude/dune-shaped at 7f4e82f (/home/sol/wraith-shaped): 786 tests/build, five cold stills, corrected 420-frame film, 3/3 staff/Frost clears per new single/mixed fight, and both alternate live material answers; zero GPU errors/late pipelines in these checks. Keep it unintegrated while full allocations/performance and wider readability gates remain open. D1b independent grade fix is pushed as d461993 on codex/dune-grade (/home/sol/wraith-dune-grade, preview 4178); its far-normal/strata pass is currently under GPU review, not accepted. D2 stays disabled on codex/dune-relaxation through 67597d8. Read the feature worktrees' latest review notes before historical status below.

> **Disk constraint:** the user explicitly wants normal C: storage and clearing disposable data, not moving it to D:. Temporary test profiles briefly archived to D: have been removed. 561 inactive Wraith Chrome profiles were identified on C:; cleanup has recovered more than 90 GiB free so far. Game captures/projects are preserved. Medal's actual user-scope app uninstaller exited successfully; recording remains stopped. C:\adobeTemp (~5.6 GiB) is protected by administrator/TrustedInstaller permissions and remains. Capture launchers now clean inactive profiles through tools/winchrome/cleanup-profiles.ps1; keep future tests on the normal temporary path. No trailer files changed.

## Current continuation — 2026-10-28 (supersedes branch status below)

The user's complete handoff goal continues. Main `1978f46` includes reviewed **D1a sand**, the **encounter audit/lifecycle fixes and three isolation films**, and **D9a Skitters/Plate-backs**. Main and both feature branches are pushed. Main validation: **775 tests pass**, locked production build passes; snapshot capture, hidden carried-weapon and free-camera lens fixes are also integrated. The detailed operational tracker is `docs/phase-9/implementation-status.md`; read it before following historical worktree/port notes below.

- Encounter target review: `docs/encounter-audit.md` §9. Staff + starting Frost clears cloister/stair/ring 3/3 each. Barley bot detours fix collision stalls: 3/3 repeated clears, all six spawned, 60 s calm. Failed pre-fix bot runs are preserved. Surf (120 s), glide (60 s) and combat (12 s) films are committed at 720p/60 under `screenshots/isolation/`; human enjoyment and surf-speed/night/blizzard telegraphs remain open.
- Sand D1a: wet absorption corrected after exposure readback. Revised dry/wet foreground YAVG 148.337 / 106.712. Fixed-view headless GPU delta +1.55 ms; this does not pass the sustained-performance gate. Review and raw measurements: `docs/phase-9/sand-review.md`. Raw screenshot history was excluded from main.
- D9a lead fixes: one filling MOUND brush replaces the hollow Ridge; GPU readback confirms +0.355 m relief. Frozen warnings do not stamp/emit. Dust now spills above the mound. Six fresh 1280 px captures are committed. Removing an unused boxed rig return reduces mixed-pool collections 608 → 19 / 100k simulated frames; **full-path zero allocation remains open**. `docs/phase-9/dune-shaped-review.md` distinguishes measured checks and remaining gates.
- **Requested sand-dust visual addition (2026-10-28): implemented on main**, independently of D2. Low wind-driven sand wisps plus rising puffs from completed footprints/terrain brushes; sand-only, gradual wet suppression, zero fully wet/frozen/non-sand emission in the live-buffer GPU oracle. One 2,112-quad static draw. Five stills and a reviewed 6 s 720p/60 diagnostic film are in `screenshots/sand-dust-review/`; review and repeatable tools: `docs/phase-9/dust-review.md`, `tools/bot/sand-dust*.mjs`. Fixed-view 1440p indicative median cost +0.201/+0.215 ms; baseline ~17.96 ms already exceeds 60 fps, so no sustained gate is claimed. Zero GPU errors/late pipelines, **783 tests pass** (778 tracked plus five preserved local-LLM tests), locked build passes. The original image-only suppression check was inconclusive; the direct shader/body oracle is the accepted material check. D2 remains disabled/unintegrated, and the next physics work stays in `/home/sol/wraith-relax`. WSL access recovered after Ubuntu restart; no local administrator interaction is needed now. Existing raw captures/local model files remain untouched.
- **Now D2**, primary in `/home/sol/wraith-relax`, `codex/dune-relaxation`, pushed **`6d583b0`**, preview 4176. **794 tests and locked build pass.** Conservative fine/coarse relaxation, collision readback, wind healing, persistence and safe empty-work retirement are built. The disabled prototype now defaults to **32 steps / 30 s lifetime**. Isolated mound settles to **34.0102°** (diagnostic tolerance 34.1°); reload resumes without a brush. CPU/GPU max error 1.658e-7 m, packed drift 0.34 ppm; dune height parity and two crest standing checks pass. Real minute-old trail and IndexedDB/fresh-page/groove persistence pass. Reviewed 32 s 720p/60 film is from the older eight-step protocol, not current settling proof. **Not integrated or enabled:** robust timing still fails some repeats (single-renderer maxima 0.538 ms at 32 steps / 0.500 ms at 16), with moving/slumping collision, allocations, overlapping-writer settling, wet/frozen targets and knife-edge crest/motion review open. See that branch's `docs/phase-9/relaxation-review.md`. Surf currently enables only snow (`systems/wraith.js`); sustained sand-surf gameplay is D3, not passed by seeded-speed profiling. A stale legacy port-4174 screenshot Chrome was stopped; all raw captures were preserved. Screenshot launchers now clean up on interruption.
- Global pipeline gate: forest haze compute warm-up works. Five cold-entry late render variants remain; `src/core/gpuInstrument.js` now records WGSL shader names to identify them. No world-wide zero-late or sustained 1440p/60 acceptance is claimed.
- Latest delegation rule: primary writes most code; only extremely easy/light tasks may go to Terra/Luna, and primary verifies all written code. Earlier Sonnet/Opus identity/trailer and delegate-all guidance is historical.
- Full Windows Chrome/GitHub access works. Only one Windows GPU workload at a time; primary uses 4176; its Chrome is stopped at this checkpoint to release GPU/RAM. Restart with `PORT=4176 WIN=1280,720 tools/bot/play.sh` and wait for its fresh handshake before sending commands. Preserve untracked captures. Builds use `/tmp/wraith-build.lock`. Continue D2 → D9b → D1b → D3 → D5/D6 → D7/D7b → D8 → D10 → D11 → glass blade/trade/forge → D12. Human-only gates are prepared, never falsely signed off.


## Codex continuation — 2026-10-27

**Later access update:** the user enabled full access in Codex CLI. Windows commands, GitHub fetch/push and headless Windows Chrome now work. All checkpoints below were pushed; the sand branch now ends at **`e573210`** after saving six fresh 1280 px rain-stage captures in `/home/sol/wraith-sand/screenshots/sand-review-codex-1280/`. The bot reported `gpuStats.late: []` on the wet scene; the screenshot runner completed **6/6**. Fully wet sand still looks too close to dry sand, so fix its material/lighting response next. The earlier environment limitation below is historical and no longer blocks films or GPU review. Encounter films, full transition/pipeline checks and star-field comparison remain to do.

The original handoff below is retained. These updates supersede its branch status and delegation guidance:

- **Latest user instruction:** do most implementation yourself; delegate only very easy code to a Luna subagent when useful for usage. No subagents were used in this continuation. The earlier Sonnet/Opus workflow and Claude session trailers describe the previous session; do not claim that identity or reuse its session URL for new Codex work.
- **Main gameplay remains at `139ead6`.** Baseline: **687 tests passed**, locked production build passed. Existing untracked screenshot folders were preserved.
- **Encounters:** `claude/encounters` now ends at **`b0955cc`**, with local main merged. Fixed whole-wave capacity (including FALLING slots), Barley calm after clear, abandoned/load telemetry and fresh-run health baselines. **749 tests passed**, locked build passed. Review: `/home/sol/wraith-encounters/docs/encounter-audit.md` §8. Main integration is pending the existing GPU review and glide/combat films. The design heading now accurately says review is pending.
- **Sand:** `claude/sand` now ends at **`39613c8`**, with local main merged. Preserved main's **229 photo spots verbatim**, appending eleven sand spots (251 added lines, none removed against main). Fixed independent rain/wetness/puddle forcing and bounded drying in CPU and WGSL. **696 tests passed**, locked build passed. Review: `/home/sol/wraith-sand/docs/phase-9/sand-review.md`. Six existing 1280 px captures were inspected: fully wet sand still needs a fresh visual check for clearly uniform darkening. Existing dirty `sand-raw8` captures were left untouched. Use a squash and omit raw capture iterations when eventually integrating.
- **Dune Shaped:** unchanged at `0770ec6`; D9a remains to build.
- **Environment limitation:** Windows executables fail inside this restricted execution environment (`cmd.exe /c ver`: `UtilBindVsockAnyPort: socket failed 1`). GitHub fetch and push fail because `github.com` cannot resolve. The commits above exist **locally and are not pushed**. No new GPU play, films, frame timing or late-pipeline results were obtained or claimed.
- **Exact next step:** restore the existing Windows Chrome/bot path, finish encounter films and review, verify fully wet sand darkening and star-field cost, then integrate and push these branches. D9a can be developed independently; D2 must still wait for sand integration. Both branch worktrees contain their own updated progress/review notes.

This is the complete state of **The Wraith of the Unstill** at handoff, written for a new agent with **no prior context**. It covers:

- what the game is and how the user wants work done (§0–§2);
- the machine and its tooling (§3);
- everything built so far (§4);
- the three unfinished branches, and how to finish them (§5);
- the next work, with briefs ready to paste (§6);
- open issues (§7);
- a map of the code and data (§8–§9);
- the agent workflow (§10) and pitfalls already learned the hard way (§11).

Other source documents, in reading order:

1. `BRIEF.md`: the spec, owned by the user. Don't edit it.
2. `DECISIONS.md`: architecture decisions and the user's direction.
3. `docs/gameplay-design.md`: the gameplay design, with a "— Done" note per built system.
4. `docs/phase-9/plan.md` and `docs/phase-9/dunes-design.md`: the current phase.
5. `PLAN.md` (phase plans up to Phase 8) and `PROGRESS.md` (the session log up to Phase 7). `PROGRESS.md` defers to this file.

---

## 0. Quick start (the first 15 minutes)

1. Run:
   ```bash
   cd /home/sol/WraithOfTheUnstill
   git status
   git log --oneline -5
   git worktree list
   ```
   - The main branch is `claude/wraithoftheunstill-phase-7`, and it should be clean apart from untracked `screenshots/*` folders, which are old local captures. Leave them.
   - Expect three extra worktrees (§5).
2. Run `npx vitest run --maxWorkers=2`; expect **687 passed**. Then run `flock /tmp/wraith-build.lock npx vite build`; it should pass.
3. Nothing should be listening on ports 4173–4178 (`ss -ltnp | grep 417`). If something is, it's stale: kill it by PID.
4. Read §1 (the user's rules) and §5 (unfinished work), then start on §6, item 1.
5. Use your own session URL in commit trailers (§1).

## 1. The user's rules and preferences (follow all of them)

These were stated by the user over many sessions. Quotes are the user's words.

- **"Don't change the graphical style."** New surfaces and fixes must match the existing look: procedural Shaper stone, cloth Wraith, painterly vegetation, ACES grade. Improve readability; never restyle.
- **Fixed difficulty.** No world-tier scaling and no difficulty selector. Each biome has a fixed level (frost 0, meadow 0, mire 1, dunes 1, ember 2, coast 3; `docs/cross-biome.md`). Accessibility assists are separate settings.
- **Open biome order after the frost.** A biome's critical path needs only Frost plus that biome's own element.
- **Don't modify the trailer** (`tools/bot/trailer*.{mjs,py}` and its output).
- **Commit and push after each part.** Usage limits cut sessions off at random. Push often, and checkpoint the agents' worktrees when a limit is near (§10.5).
- **Supervise long jobs; never stall silently.** The user watches the clock. Stream progress, and wait up to about 25 minutes on captures with a monitor that reports each line.
- **Play the game with the bot** (§3.4) to find gameplay problems, and look at the screenshots critically. The bot has found real bugs that screenshots missed.
- **Save usage** (user, 2026-10-24 and 2026-10-27):
  - **Sonnet subagents build** in git worktrees, and **the lead (you, Opus) reviews**: diffs, two or three key shots, numbers. Then the lead merges, tests, builds and pushes.
  - **"You need to create the agents"**: delegate the hands-on building, including an agent merging main into its own branch, instead of doing it yourself.
  - **"If the agent cannot do things by itself … you should fix it yourself"**: when an agent reports something it couldn't solve, the lead fixes it. Don't re-send it or leave it untested.
  - **At most 2–3 agents at once.** Each is scoped to finish in about an hour, with a brief that lists exactly what to read. Parallel agents don't save usage; they only spend it faster.
  - **A fresh agent beats resuming a long one** after a limit reset: the resume re-reads the whole transcript with a cold cache. Resume only short or mid-edit ones.
  - Agents downscale shots to **1280 px before looking**, and commit only 1280 px shots.
- **"Do what you think is best and will achieve the best graphical result"** (2026-10-26): for design calls the user delegates to you, decide and record the decision. Don't ask.
- **The dunes are puzzle-based, unlike the frost** (2026-10-26), **with ravines.** See `docs/phase-9/dunes-design.md`.
- **The Long Walker** (the dune Warden) must feel unlike the other Wardens (`docs/gameplay-design.md` §5.1).
- **Rain on sand** (2026-10-27): it should look like real life. Individual drop dots appear first, then spread and merge until the sand is uniformly darker; it dries unevenly. This is built on `claude/sand` and needs review (§5.2).
- **The Bell-mace** (2026-10-27): like a falling-damage mace, an Updraft paired with a plunge for more damage, plus unique combos. Built and merged (§4).
- **Never commit `node_modules`** (§11).
- **The user's email** is context for attribution only. Never send it anywhere.
- **Commit trailer:** end every commit with these lines. A new session uses its own session URL in place of this one.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017jhdvvBvrzx8cfqxy6tEiT
  ```
  Agents use `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the same session line.

## 2. The game in one page

The pitch is in `BRIEF.md` §2. An elemental-bending action RPG where **the ground is the canvas**:

- Snow, grass, sand, mud and ash all remember. Feet, spells, creatures and weather write into one shared **terrain state** that slowly heals.
- The player is **the Wraith**, an empty Shaper robe animated by the world's last motion.
- In each biome a colossal **Warden** holds the element in stillness. The Wraith **releases** it rather than killing it. The biome is then **restored** (wind, weather and moving dunes return), and the Wraith learns the element.
- The world is one seamless map of about 8 × 8 km.

| Biome | Element (verbs) | Traversal | Status |
|---|---|---|---|
| Frost Steppe (north) | Frost: Sweep, Ribbon, Crystallize | snow-surf | **Built.** Frost Warden, monastery, camp, quests, side quests, restored state. |
| Highland Meadow (centre) | Gale: Gust, Vortex, Updraft | glide | **Built.** Hearn village hub, the Bellwether (Warden), side quests, restored state. |
| Glass Dunes (east basin) | Stone: Shard, Ridge, Bloom | sand-surf | **Phase 9, in progress.** Geography and Stone verbs merged; sand material, enemies, crests, surf, ruins, Warden and quests to do. |
| Mirefen, Ember Waste, Coast | Tide, Ember, all | skim, ash-skate, wave | Later phases (10–12). |

**Controls** (`docs/gameplay-design.md` §11.1; the action map is in `src/input/actions.js`):

| Input | Action |
|---|---|
| LMB tap / hold | Weapon light combo / charged heavy |
| LMB in the air with the Bell-mace | The plunge |
| Q tap / hold | Element quick / sustained verb |
| F | Element heavy verb |
| RMB hold | Traverse: surf, or glide in the air. While locked on: guard. |
| Ctrl | Bend-step dodge |
| 1–5 | Select element |
| Wheel / X | Cycle the two carried weapons |
| R / C | Use / cycle consumable |
| Tab | Lock-on |
| E | Interact |
| Space | Jump |
| M | Map |
| J | Journal |
| Esc | Pause codex |
| F1 or ` | Dev overlay |

**Systems built so far, with their specs:**

- **Flow** (§3): movement and combat momentum, shown on the body, never a HUD.
- **Six weapon families** (§11.2): staff, sickles, maul, glaive, lantern flail, Bell-mace. The glass blade is due in Phase 9.
- **The economy** (§11.3–11.8): marks, materials, traders Corin and Osk, the smith Garrow's forge tiers I–V with infusion, consumables, threads, robes as armour, a death drop, save v3.
- **Remembrance and nooks** (§6): 50+ entries and 39 nooks.
- **Restored-world play** (§7).
- **Side quests and quest direction on the compass.**
- **Rain and storm.**
- **The calm-after-fights rule and the encounter audit** (§5.1, unmerged).

Pillars and the design-review checklist live in the project skill `.claude/skills/wraith-design/`. Run it (the `WraithOfTheUnstill:wraith-design` skill) before designing or reviewing any gameplay.

## 3. The machine and the tooling

### 3.1 Hardware and OS

- Windows 11 PC with an **RTX 3060 (12 GB)**. **WSL2 Ubuntu is capped at 4 GB RAM and 4 CPUs** (`/mnt/c/Users/soltc/.wslconfig`).
- The target is **2560×1440 at 60 FPS sustained**, with 1% lows ≥ 45. This supersedes BRIEF §3; the user decided it.
- WSL has no sudo and no GPU Vulkan. Headless Chromium in WSL only works on SwiftShader, which is slow and useless for timings. **Real-GPU shots and bot play use Windows Chrome**, launched from WSL by the scripts below.
- **The PC is often locked** (the user works through Claude Code Remote Control), so **headless Windows Chrome** is used. It renders on the real GPU at about 10 s per shot. Bench numbers taken while the PC is locked are suspect.
- **ffmpeg** is a Windows exe at `/mnt/c/ffmpeg/bin/ffmpeg.exe`. Give it output paths through `$(wslpath -w path)`. There's no PIL in WSL.

### 3.2 Build, test, serve

| Task | Command |
|---|---|
| Build | `flock /tmp/wraith-build.lock npx vite build` (always under the lock; RAM is tight and agents share it) |
| Test | `npx vitest run --maxWorkers=2`. The `architecture.test.js` checksum test can time out under load: rerun before you believe a failure. |
| Preview | `npx vite preview --port <P> --host 0.0.0.0`. **Main uses 4173; worktrees use 4174–4178, one each.** Restart it after `vite.config.js` changes, and **rebuild after editing `data/photo-spots.json`.** |
| Bake the world | `npm run bake` / `npm run bake:verify`, under the build lock |
| Allocation check | `npm run alloc`. `controller.update`, `springArm.update` and `weapons.update` fail; that predates this work. |
| Kill a server | **by PID only**: `ss -ltnp \| grep 4174`, then `kill <pid>`. **Never `pkill -f`** with a pattern that matches your own shell. |

### 3.3 Screenshots (real GPU)

- `PORT=<P> tools/capture/win-shots.sh <spot-prefix> <dir>` captures every photo spot whose id starts with the prefix into `screenshots/<dir>/`, at 2560×1440 PNG (about 7 MB each).
  - It kills old capture Chromes, uses a fresh profile, relaunches on a stall, resumes at the first missing file, and runs headless.
  - It skips files that already exist, so delete them or use a new dir to reshoot.
  - An empty prefix fails.
- **Photo spots** live in `data/photo-spots.json` (about 216 of them). The fields include `id`, `biome`, `time`, `weather`, `player`, `camera` (`follow`: yaw, pitch, dist; or `free`: pos, yaw, pitch, fov; **positive pitch looks down**), `restoration`, `bend`, `weapon` and `shaped`.
  - Edit this file with **minimal text edits**: Python `json.dump` reformats the whole file and causes merge conflicts.
  - Ids must stay unique.
- **Downscale before looking:**
  ```bash
  /mnt/c/ffmpeg/bin/ffmpeg.exe -loglevel error -y -i in.png -vf scale=1000:-1 -q:v 4 "$(wslpath -w out.jpg)"
  ```

### 3.4 The bot (playing the game)

- **Launch:** `PORT=<P> tools/bot/play.sh [spot]` opens headless Windows Chrome on the preview with `?bot=1`. `PORT=<P> tools/bot/play.sh stop` closes it.
- **Commands:** `WRAITH_URL=http://localhost:<P> node tools/bot/bot.mjs <cmd> '<json>'`. They include:
  - `state`;
  - `eval {"js": "..."}`: the async body sees `g`, the game context;
  - `hold`, `press`, `look`, `face`, `aim`;
  - `walkTo {x, z, roads}`, `talkTo {id}`, `follow`;
  - `teleport {x, z}`, `spot {id}`;
  - `shot {name}`, which saves `screenshots/bot/<name>.png` with the HUD;
  - `perf`;
  - `film`, which renders fixed 1/60 s steps to JPEG frames (see `filmRun` in `src/core/bot.js`).
- **Useful handles in `eval`:**
  - `g.controller` (pos, vel, grounded, glide, lift);
  - `g.arm` (yaw, pitch, zoomTarget);
  - `g.ground` (qx, qz, `sample()`, h): terrain only, and only where it's loaded;
  - `g.wraithGround`: terrain plus built solids;
  - `g.gale`, `g.shaped`, `g.combat`, `g.flow`, `g.inventory`, `g.weaponFinds`, `g.elements`, `g.chapter`.
- **Rules:**
  - Keep a single eval under 240 s, because undici times out at 5 minutes.
  - **Never run two bot processes on one page.**
  - Grip inputs must be held inside an in-page eval loop, because `hold` releases its keys.
- **Scripts in `tools/bot/`:**

  | Script | What it does |
  |---|---|
  | `fight.mjs` | auto-fighter: spawns foes, logs time, damage taken and Flow |
  | `mace.mjs` | `iso`, `fight`, `dunk`, `ice`, `down`, `glide`, `ledge` (use `DIRECT=1 START=8` for the ledge) |
  | `encounters.mjs` | on the encounters branch |
  | `restored-*.mjs` | the restored-world courses |
  | `side-*.mjs` | the side quests |
  | `weapons-film.mjs` | films weapon moves |
  | `trailer.mjs`, `trailer-cut.py` | **don't modify** |

- **Films:** encode with the Windows ffmpeg. Send videos to the user as **720p two-pass** copies, because SendUserFile caps at 30 MB.

### 3.5 Target-perf runs (only when the user asks for numbers)

The user opens `http://localhost:4173/?bench=1&res=2560x1440` in Windows Chrome while `npm run preview` runs. Results land in `perf/runs/`. In-game, `?bench=weather` and the F1 overlay show GPU timings, and `gpuStats.late` must stay `[]`: no pipeline may be created mid-play.

## 4. Done and merged on `claude/wraithoftheunstill-phase-7` (newest first)

Each row says where its spec and "— Done" note live. Everything here is pushed.

| Work | Key facts | Where |
|---|---|---|
| **Effects readability** | Stone's Bloom throws dark earth with a dust burst. **Snow pits deeper than 0.45 m show earth (all craters).** The Bell-mace toll is a powder ring scaled by height. The dunk shot is a low side view. The Ridge trench seams are fixed. | `src/shaders/stoneFx.wgsl.js`, `snow.wgsl.js`, `wraithFx.wgsl.js`, `game/weapons/plungeFx.js`; `screenshots/fx/` |
| **Phase 9 D4, Stone verbs** | Shard (Q tap, 9 focus): a torn plate, staggers, shatters frozen foes. Ridge (Q hold, 12/s plus 0.5/m): walkable at once (a CPU brush copy), blocks shots, pushes swarmers. Bloom (F, 26): a crater of 1.7 m by 5.2 m that pins foes for 1.8 s. A full Stone reaction column; sand, mud and ash are stubs. Ridge+Frost and Shard+Ribbon are built. Flow 2+ is cheaper and bigger; at Flow 3 the Shard skims and carries you. **Dev-gated: `?stone=1` or "Grant stone" in F1** until the dune Warden grants it. | `plan.md` "D4 — Done"; `src/game/bending/stone.js`, `stoneMass.js`, `combat/stoneHits.js`, `render/stoneFx.js`; `tests/stone.test.js`; `screenshots/stone/` |
| **Phase 9 D0, the erg** (squash-merged) | 8.1 km² dune-dominant, of which 5.2 lies west of x = 3300. Frost and meadow are byte-identical west of x = 1000 (`tests/d0Diff.test.js`). Dune-type map `dunes.rg8` at 32 m: barchans at the margin, transverse in the basin, star dunes of 45–80 m at the heart near (2700, 1300), seifs south. Ravines: the Red Galleries canyon, the Needle and Hourglass slot trenches, the Dry Braids wadis, the Stride rift. The Dry Stair road (906 m at 12 %). The cold erg. No grass on sand. Seats (positions only) for the camp, ruins, glass, echoes, caves and the arena ring. CPU/GPU parity under 2 mm. | `plan.md` "D0 — Done"; `tools/bake-world/{dunemap,ravines,ravinesData,seats,pinned}.mjs`, `src/terrain/dunes.js`, `src/shaders/duneTypes.wgsl.js`; `screenshots/phase-09-d0/` |
| **Polish** | Threshing floor cleared; Ketil's lantern moved to (28, 974) and lit; ember tea reads at noon; **glide rings: a pier up to 22 m, above that a carved plumb-stone and no pier**; the dropped-marks glow reads at 60 m; cobbles lighter; rain visible through doorways (`rainShelter`); **maul poise window of 1.2 s per weapon** (no stagger-lock). | `screenshots/polish2/`; `src/world/sideSites.js` (`PIER_MAX`) |
| **The Bell-mace** | Found on the Bell Ledge, a 9.5 m bastion behind the monastery at about (1136, 2787), reached by Updraft (needs Gale). Plunge damage is 18 + 3.2h (h = stored fall, cap 20 m), with a toll radius of 1.6 + 0.16h, crown strikes (ignores plates and shields), and a 0.55 s kneel on a miss. Rebound 0.5h with 30 % decay. Inside an Updraft column: +4 m. The dunk drives an airborne foe into the ground (second impact at 60 %). The ice star shatters frozen foes on ice. Downdraft (a Gust in the fall): +5 m. Glide plunge. Flow 2/3 effects and tiers I–V. **Two whole-game changes by the lead:** the Updraft lifts at full strength across a 1.4 m core (`gale.js` `liftAt`), and air control is 0.7 inside rising air (`capsuleController.js` `liftControl`). Bot results: the ledge was reached and taken, then a plunge killed a hound (2 of 3 runs). In frost fights the mace is slower than the others with this bot, which is unproven. | `docs/mace-design.md`, §11.2 "Bell-mace — Done", `docs/weapons-playtest.md`; `src/game/weapons/plunge*.js`, `defs3.js`, `shaped/airborne.js`, `world/bellLedge.js`, `systems/bellLedge.js` |
| **Restored-world play** | Wind streams lift the glide when restored. The Shelf Stream course (frost, Varo): 6 rings, medals at 180/130/100 s. The Wind Road (meadow). Hearn requests: Wyl's flight, Dunn's chaff, Ketil's lantern. 150 marks in total. | §7 "Restored world — Done"; `data/restored.json`, `src/game/restored/`, `src/systems/restored/` |
| **Glaive and lantern flail** | The glaive pins along a lane. The flail burns (spreads, hotter on sedge) and thaws frozen foes. Found at the Ring of Nine and at Isolde's fire. | §11.2 |
| **Economy** | Marks (about 1,212 across frost and meadow), traders, the forge (I/III/V change moves), consumables, flask, threads, robes, death drop, save v3. | §11.3–11.8 |
| **Weapons framework** | Staff, sickles and maul; the state machine, poses, trails, affinity, finds. | §11.2; `src/game/weapons/` |
| **Remembrance and nooks** | 50+ entries (`data/remembrance.json`, flags `rem:<id>`; the tests cap the count at 60) and 39 nooks. | §6 |
| **Flow; side quests and compass direction; rain and thunderstorm; Phases 0–8** | | §3; `PROGRESS.md` |
| **Design docs** | `docs/gameplay-design.md`; `docs/cross-biome.md`; `docs/phase-9/plan.md` and `dunes-design.md`, with figures in `docs/phase-9/figures/` (generators in `tools/world/dunes*.mjs`, renderer `tools/world/renderFigures.mjs`, which needs `LD_LIBRARY_PATH=$HOME/.local/wraith-libs/root/usr/lib/x86_64-linux-gnu`); `docs/mace-design.md`; `docs/encounter-audit-plan.md`; `docs/weapons-playtest.md`. | |

## 5. Unfinished work: three pushed WIP branches with local worktrees

All three agents were **stopped mid-task** at handoff. Each branch ends with a commit `… WIP: checkpoint for handoff (agent stopped)`, and everything is pushed to origin.

**To work on one:**

1. `cd /home/sol/wraith-<name>`
2. `git status`
3. Check that `node_modules` is a symlink (`ls -la node_modules`). If it's missing: `ln -s /home/sol/WraithOfTheUnstill/node_modules node_modules`.

### 5.1 `claude/encounters`: worktree `/home/sol/wraith-encounters`, port 4177, about 90 % done

- **Plan:** `docs/encounter-audit-plan.md`.
- **Changes (21 files):**
  - `docs/encounter-audit.md` (166 lines): the inventory of every hostile spawner, the before and after numbers from `docs/encounter-runs/*.jsonl`, a verdict per encounter, a smell walk, NOT ASSESSED;
  - `src/systems/encounters.js`: role mixes, new meadow encounters, a storm surge, `arena` and `kind` fields;
  - `src/systems/calm.js`: the calm-after-peaks rule;
  - `src/systems/encounterLog.js`: telemetry with `?bot=1`;
  - small hooks in `bellwetherFight.js`, `flame.js`, `side/flock.js` and `chapter.js`;
  - `tests/encounters.test.js`;
  - the §4.2 "Encounter audit — Done" note;
  - the tools `encounters.mjs`, `isolation-film.mjs` and `isolation-encode.sh`, and `tools/world/arena.mjs`.
- **Left:**
  1. **Isolation films** (§9 of the design):
     - surf an empty slope for 2 minutes: done, `screenshots/isolation/surf-720p.mp4`;
     - **glide** off a ridge, with a stream lift if restored: not done;
     - **frost combat**, 3 hounds with staff and Frost, including a Sweep, a freeze and a shatter: not done.

     Use `tools/bot/isolation-film.mjs` and `isolation-encode.sh`. Make 720p two-pass mp4s under 15 MB, and keep the frames (`screenshots/isolation/frames/`) uncommitted. Look at sample frames; reshoot clipping or dead stretches.
  2. Merge `origin/claude/wraithoftheunstill-phase-7` (expect small conflicts), then run the tests and the build.
  3. **Lead review:**
     - read the audit's verdicts;
     - check that no encounter is a single role (Wardens and named hunts are listed exceptions);
     - check the calm rule (60 s, 120 m) doesn't block story-forced waves;
     - check the meadow encounters sit on existing quest steps.
  4. Merge into main, then **send the three films to the user** (SendUserFile, 720p). They are for the user to judge feel.

### 5.2 `claude/sand`: worktree `/home/sol/wraith-sand`, port 4174, D1a built, needs review

- **Spec:** `plan.md` D1. The user's rain requirement is in §1.
- **Built** (commit `87668cb`, then the WIP commit):
  - `src/shaders/sand.wgsl.js` (197 lines), wired in `clipmap.wgsl.js`;
  - scans `data/textures/sand-{fine,rippled}.{alb,nrm,hgt}.webp`, documented in `ASSETS.md` and `data/materials/sources.json`;
  - three-scale normals, self-shadowed wind ripples, rare quartz glints;
  - the wet, compacted and frozen states;
  - **rain on sand:** `src/world/sandRain.js` (62 lines) plus hooks in `weather.js`, `environment.js` and `worldState.js`, and `tests/sandRain.test.js`;
  - photo spots `p9s1-*`.
- **Shots** in `screenshots/sand/` (check they are 1280 px):
  - `p9s1-close-noon`, `p9s1-close-golden`;
  - `p9s1-star-mid` (the star field);
  - `p9s1-trail` (compacted);
  - `p9s1-frozen`;
  - the rain sequence `p9s1-rain-1-dry`, `-2-first`, `-3-many`, `-4-merge`, `-5-wet`, `-6-drying`.
- **Left:**
  1. **Review the shots yourself:**
     - The sand must read as fine sand, not clay or plastic, with ripples raked by a low sun.
     - No blown whites at noon.
     - Blue shadows on the warm sand.
     - **The first rain dots must read as individual raindrops**, not noise or glitter. They should merge to an evenly dark wet surface and dry from the crests.
     - If anything fails, fix it yourself (§1).
  2. **Warning:** `data/photo-spots.json` shows 339 changed lines, so it was probably reformatted. Before merging, re-apply only the new `p9s1-*` spots onto main's file with a minimal text edit. Otherwise every later merge conflicts.
  3. Measure the frame cost at the star field (2700, 1300) before and after, with the bot's `perf`. Confirm `gpuStats.late` is `[]`.
  4. Write the "D1a — Done" note in `plan.md` with NOT ASSESSED. Merge main, test, build.
  5. Check the history size before merging:
     ```bash
     git rev-list --objects origin/claude/wraithoftheunstill-phase-7..HEAD \
       | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' \
       | awk '$1=="blob" && $2>1e6'
     ```
     If it's heavy (full-size PNGs), use `git merge --squash`.
- **Not in D1a** (D1b, a later job): dune shading at 2–4 km, the stilled and restored grade for sand, sandstone strata on the canyon walls.

### 5.3 `claude/dune-shaped`: worktree `/home/sol/wraith-shaped`, port 4175, D9a barely started

- **Done:** `src/game/shaped/rigDune.js` (121 lines), a dune rig start, plus small edits to `rig.js` and `shaped.wgsl.js`.
- **Recommended:** start a **fresh agent** in this worktree with the D9a brief in §6.1. It can keep or rewrite `rigDune.js`.

## 6. What to do next, in order, with briefs

1. Finish §5.1, §5.2 and §5.3 (the D9a brief is below). Run **at most three agents**.
2. **D2, crests and avalanching sand** (brief §6.2). **Start it only after `claude/sand` is merged**, because both touch `terrainState.wgsl.js`, `clipmap.wgsl.js` and the surface shading.
3. **D9b, Whirlers and the Glass-sworn** (brief §6.3), after D9a.
4. **D1b, the far field and grade**, after D1a.
5. Then, following the plan's order and parallel tracks (`plan.md`, "Order, estimate and checkpoints"):
   - **D3, sand-surf.** The user plays it to judge feel.
   - **D5 and D6:** heat shimmer and mirage, the sandstorm, the moving erg.
   - **D7 and D7b:** ruins and glass; the ravine wall kit, which also fixes the sawtooth canyon walls; sandfalls; arches and hoodoos.
   - **D8:** scrub, the margin, the oasis.
   - **D10, the Long Walker.** Follow `gameplay-design.md` §5.1, **not** the old D10 text.
   - **D11, the camp and quests.** Use the **puzzle design** in `dunes-design.md`: the sand grammar G1–G9; Into the Erg; the Silent Instruments hub (Sun Gate, Hourglass, Singing Dunes); Follow the Glass; The Well Rises; the five side sites; the people Sarai, Hesper, Iven, Nadra and Pell.
   - **The glass blade weapon** and the caravan trader and smith.
   - **D12, the gate.**
6. At the end of Phase 9, the user plays the gate.

### 6.1 Brief: D9a, Skitters and Plate-backs (paste into a fresh Sonnet agent; worktree `/home/sol/wraith-shaped`, branch `claude/dune-shaped`, port 4175)

> Build Phase 9 D9a: the first two dune Shaped, about 1.5 h.
>
> **Read only:**
> - `docs/phase-9/plan.md` D9 (the spec);
> - `docs/gameplay-design.md` §4.1 (each enemy pushes the player one way; the material decides the right element, with at least two valid answers) and §11.2 (affinity, glances);
> - `.claude/skills/wraith-design/references/encounter.md`;
> - the existing Shaped: `src/game/shaped/{archetypes,behaviours,body,rig,shaped,airborne,rigDune}.js` (`rigDune.js` is a WIP start; keep or rewrite it);
> - how hounds, brutes, seers, sedgerunners and hedgewardens telegraph and armour;
> - `src/game/weapons/affinity.js`, `src/game/combat/{reactions,combat,stoneHits}.js`.
>
> **Build:**
> 1. **Skitters (swarmer).** They travel *under* the sand as a moving bulge, through the terrain-state brush path. Sand streams off the bulge before they erupt to lunge. A Gust strips their cover (they surface stunned). Frozen or frost-bound ground stops them burrowing. Stone's Shard or Bloom erupts them. Hound-tier health.
> 2. **Plate-backs (bruiser).** A slow scarab with a ruin-stone shell. Frontal weapon hits glance. To pop the plate: frozen seams (Ribbon then Crystallize) plus a strike, which needs no Gale; or Gust the seams then Shard; or attack the flank or rear. The Bell-mace plunge ignores plates. Once the plate is off, it's faster and vulnerable.
> 3. Both rise from and slump back into the sand. They're built from packed sand, sandstone and ruin fragments in the existing Shaped style.
> 4. Bestiary and Remembrance entries.
> 5. Tests for each answer, stability at 8 active, and zero-alloc steps.
>
> **Bot fights near (1900, 900):** 4 Skitters; 1 Plate-back plus 2 Skitters; 2 Plate-backs. Run each with staff plus Frost, then with Gale. Log time, damage taken and which answer was used. Every fight must be winnable with Frost only.
>
> **Shots:** 1280 px `p9d9-*` into `screenshots/dune-shaped/`: the bulge travelling, sand streaming before the lunge, a Plate-back from the front and the side, a plate popping, both rising.
>
> **Rules:** put new behaviour in new files (`shaped.js` is about 750 of its 800 lines). Don't touch the sand shader files. Plus the standard rules in §10.2.

### 6.2 Brief: D2, crests and avalanching sand (after the sand merge; new worktree)

> Build Phase 9 D2, the risky tech.
>
> **Read only:** `docs/phase-9/plan.md` D2; `dunes-design.md` G1 ("sand flows") and §7 (ravines); `src/shaders/terrainState.wgsl.js`, `src/terrain/state/` (healing); `src/terrain/meso.js`, `dunes.js`; `src/shaders/clipmap.wgsl.js`, `sand.wgsl.js`; `tools/capture/parity-bot.mjs`.
>
> **Build:**
> 1. **Knife-edge crests.** No stair-stepping or sawtooth on sharp crests. This is the D0 defect: see `screenshots/phase-09-d0/after-p9d0-canyon-floor.png` and the star field at (2700, 1300). Sharpen the analytic crest normal in the fragment shader, geomorph between rings, and tune the far-ring LOD bias for silhouettes. Check a dusk crest silhouette at 500 m and 2 km.
> 2. **Collision parity.** The Wraith stands on crests correctly, and `parity-bot.mjs` passes.
> 3. **The granular relaxation pass.** On sand texels, where the slope of depression plus displaced exceeds 34°, mass moves downhill. It must be conservative, stable and deterministic, run in a dirty rectangle around active writers for a few iterations per frame, and cost **under 0.4 ms** (measured). Snow doesn't relax; mud keeps its shape. Use a cheaper closed form on the coarse pages.
> 4. **Sand healing.** Prints soften and re-ripple over minutes, driven by the wind, and a trail still reads after 60 s.
> 5. **Tests:** mass conservation, no slope left above repose after N iterations, determinism.
> 6. **A film** of an avalanche in motion (720p) for the user.
>
> Standard rules as in §10.2.

### 6.3 Brief: D9b, Whirlers and the Glass-sworn (after D9a)

> **Whirlers (caster):** a spinning sand column around a glass core. They throw blinding sand blasts (a screen dust burst) and call small dust devils. Vortex reverses their spin and holds them. Frost binds them into a brittle pillar that shatters.
>
> **The Glass-sworn (elite):** half-fused to glass, refractive and very hard. Immune to Shard until frozen (thermal shock), then it shatters spectacularly.
>
> Same reading, tests, bot fights and shot rules as D9a.

## 7. Known open issues and NOT ASSESSED items

- **Needs the user's hands** (bot results are only indicative):
  - the **Phase 7 gate**: play from waking to the Frost Warden's release, save, reload, and sign off in `PROGRESS.md`;
  - the feel of weapons, the plunge and Stone;
  - whether the Bell-mace is too slow in frost fights (the bot plays it badly);
  - the Shelf's last two rings and the Wind Road finish (medal times come from a simulation);
  - Flow tier 3 in natural play;
  - whether the mace's hum pitch reads.
- **Allocations** (`npm run alloc`):
  - `controller.update`, `springArm.update` and `weapons.update` fail; that predates this work;
  - `stone.update` has a residue of 12 scavenges per 2M calls;
  - the plunge has a residue of about 1.1 MB per 3300 plunges.
- **Not wired:** the Bell-mace's Warden cap of 56 exists only in `plungeDamage(P, h, warden)`, because weapons don't hit Wardens yet. Wire it when a Warden takes weapon hits.
- **Pipelines:** one atmosphere god-ray compute pipeline appears late after a weather change, independent of recent work. Chase it; the rule is `gpuStats.late == []`.
- **Visuals:**
  - the aloft lantern is only a faint glow;
  - the toll ring reads as haze;
  - storm-cloud undersides are blotchy in a flash;
  - the robe isn't heavier when wet;
  - **sawtooth edges on sharp dune crests and canyon walls** (D2 and D7b);
  - Stone's Shard plate is small at distance.
- **D0:**
  - only 5.2 of the 8.1 km² lies west of x = 3300;
  - frozen sand staying firm waits for the sand state;
  - the cold-erg shot shows the snow slope meeting sand rather than filled hollows;
  - the canyon's south end follows the escarpment, not x 1470–1540.
- **Stone:**
  - walking and surfing on a Ridge has only been unit-tested;
  - the Warden's breath against a Ridge;
  - the Flow-3 Shard in play;
  - sand slump, mud and ash are stubs.
- **Phase 6 and 7 leftovers** are in `PROGRESS.md` ("Phase 6 open", "Phase 7 open").

## 8. Code map (`src/`)

| Dir | What's there |
|---|---|
| `main.js`, `boot/` | Startup: `engine.js`, `world.js` (world and keep-outs), `actors.js`, `game.js` (the game facade `g`). `main.js` registers systems in run order. |
| `core/` | The loop, systems, params, pools and scratch (allocation-free helpers), `bot.js` (the bot and `filmRun`), `bench*.js`, gpu instrumentation, dynamic resolution, shots. |
| `systems/` | One module per concern, run each frame: `bending.js` (frost, gale, stone, and the Updraft lift → controller), `weapons.js`, `weaponView.js`, `encounters.js`, `chapter.js` (quests and talk), `economy.js`, `economyDrop.js`, `flow.js`, `remembrance.js`, `restored/`, `side/`, `storm.js`, `environment.js`, `npcs.js`, `villagers.js`, `villageFire.js`, `wardenFight.js`, `bellwetherFight.js`, `bellLedge.js`, `macePhoto.js`, `nooks.js`, `trials.js`, `echoTrials.js`, `audio.js`, `nav.js`, … |
| `game/` | Rules and state: `bending/` (`frost.js`, `gale.js`, `stone.js`, `stoneMass.js`), `combat/` (`combat.js`, `reactions.js` (the reaction table), `stoneHits.js`), `weapons/` (`defs*.js`, `machine.js`, `pose.js`, `weapons.js`, `plunge*.js`, `tiers.js`, `finds.js`, `affinity.js`, `burn.js`), `shaped/` (`archetypes.js`, `behaviours.js`, `body.js`, `rig.js`, `airborne.js`, `shaped.js`), `economy/`, `save/` (v3), `quests/`, `warden/`, `bellwether/`, `fire/`, `restored/`, `flow.js`, `elements.js` (`BUILT`), `inventory.js`, `remembrance.js`, `nav.js`, `echoes.js`, `robes.js`. |
| `character/` | `capsuleController.js` (movement, gravity 24, `airControl` 0.25, `liftControl` 0.7, `liftMax` 13), `glide.js`, `surf.js`, `surfWake.js`, `veiled.js` (NPCs), `wraith/` (cloth). |
| `terrain/` | `meso.js` (CPU mesoscale height, mirrored in WGSL), `dunes.js`, `state/` (terrain-state healing). |
| `world/` | `worldData.js` and `world.worker.js` (baked data), `streamer.js`, `architecture.js` (the procedural Shaper stone builder: box, drum, frustum), `sideSites.js` (glide rings), `restoredSites.js`, `bellLedge.js`, `nookSites.js`, `blobStone.js`, `village*.js`, `manor.js`, `stair.js`, `camp.js`, `solids.js`, `weather*.js`, `wind.js`, `lightning.js`, `sandRain.js` (on the sand branch). |
| `render/` | The Babylon/WebGPU renderers: `clipmap.js`, `grass.js`, `trees.js`, `water.js`, `rain.js`, `atmosphere*.js`, `wraith.js`, `weaponGeo*.js`, `weaponBuilder.js`, `stoneFx.js`, `galeFx.js`, `shapedView.js`, `architecture.js`, … |
| `shaders/` | WGSL as JS modules: `clipmap.wgsl.js`, `snow.wgsl.js`, `meadow.wgsl.js`, `sand.wgsl.js` (sand branch), `terrainState.wgsl.js` (brushes, including RIDGE and CRATER), `duneTypes.wgsl.js`, `weapon.wgsl.js`, `cloth.wgsl.js`, `wraithFx.wgsl.js`, `stoneFx.wgsl.js`, `shaped.wgsl.js`, `rain.wgsl.js`, `post/`, … |
| `post/` | The HDR post chain: TAA, bloom, fog, compose, grades (ACES chosen). |
| `ui/` | `hud/` (the compass), `menus/` (the parchment codex: journal, map, trade, forge, Remembrance), `overlay/` (the F1 dev overlay, flowTools), `photoSpots.js`. |
| `input/actions.js` | The action map. |
| `audio/` | `music.js` (the user's nine cues), `sfx.js` (procedural cues, including the toll). |

## 9. Data, tools and docs

- **`data/`:**
  - `world/`: the baked world (`manifest.json`, height tiles, biome, surface, hydro and wind maps, `dunes.rg8`, `pois.json` with routes and seats, `village.json`). It's regenerated by `npm run bake`; never hand-edit it.
  - `quests/`: `frost.json`, `frost-restored.json`, `meadow.json`, `meadow-side.json`, `meadow-restored.json`. Text is drafts for the user's review.
  - `photo-spots.json`, `remembrance.json`, `nooks.json`, `restored.json`.
  - `textures/` (scans as webp) and `materials/sources.json`; `audio/`.
- **`tools/`:**
  - `bake-world/` (the bake);
  - `bot/` (§3.4);
  - `capture/` (`win-shots.sh`, `capture.mjs`, `harness.mjs`, `parity-check.mjs`, `parity-bot.mjs`, `perf-run.mjs`, `save-gate.mjs`, `frame-alloc-probe.mjs`, `heap-profile.mjs`);
  - `alloc/` (`alloc-check.mjs`, behind `npm run alloc`);
  - `world/` (`sample.mjs`, `route.mjs`, `payoff.mjs`, `nookfind.mjs`, `placeNooks.mjs`, `courseSim.mjs`, `lift.mjs`, and the dune figure generators);
  - `textures/build.mjs`;
  - `winchrome/` (the Windows Chrome bridge);
  - `audio/`.
- **`docs/`:** listed in §4. Also `docs/village/` and `docs/phase-9/world-map.png`.
- **Root:** `BRIEF.md` (the user's spec; don't edit), `PLAN.md`, `PROGRESS.md`, `DECISIONS.md`, `PERF.md`, `ASSETS.md` (every external asset with its licence; CC0 scans).
- **Skill:** `.claude/skills/wraith-design/`: `SKILL.md` plus `references/` (`smells.md`, `systems.md`, `encounter.md`, `warden-brief.md`, `quest-template.md`, `playtest.md`).

## 10. Agent workflow (how the lead runs Sonnet agents)

### 10.1 Setting up a job

```bash
cd /home/sol/WraithOfTheUnstill
git worktree add -q -b claude/<area> /home/sol/wraith-<area>
```

Give each worktree its own preview port (4174–4178), and keep **at most three running**. Spawn the agent with the Agent tool: model `sonnet`, `run_in_background: true`.

### 10.2 What every brief includes

- The worktree, branch and port; "never touch `/home/sol/WraithOfTheUnstill`"; which other agents run on which ports and files.
- **"Read only:"** a precise list of doc sections and source files.
- Numbered build items, with acceptance criteria and measurements.
- Bot playtests with numbers. Shots at **1280 px only** (downscale before looking, commit only 1280 px), read critically.
- **The rules:**
  - zero per-frame allocations;
  - no doubles as call arguments in hot code;
  - one params write per system per frame;
  - warm pipelines at load (`gpuStats.late` `[]`);
  - files of 200–400 lines, 800 at most;
  - WGSL `array<vec4f,8>`;
  - the build under `flock`;
  - `vitest --maxWorkers=2`;
  - kill servers by PID, never `pkill -f`;
  - **never commit `node_modules`**: explicit `git add <paths>` and `git diff --stat` before each commit;
  - commit and push after each item, with the Sonnet trailer;
  - timebox a blocker to about 20–30 minutes, then write NOT ASSESSED;
  - **merge the latest `origin/claude/wraithoftheunstill-phase-7` before reporting**;
  - write a "— Done" note with a NOT ASSESSED list;
  - **report in 10–15 lines**, and make no claim without a measurement.

### 10.3 Reviewing a report

1. Check for `node_modules`: `git diff --name-only HEAD origin/claude/<b> | grep -c node_modules` must print 0.
2. Check the history size (the command in §5.2, step 5). Squash-merge if it's heavy.
3. Look at **two or three key shots**, downscaled. Check that the feature actually shows: in D0 the agent's shots missed the dunes entirely, so the lead shot them.
4. Read the numbers against the targets. Question anything that "can't be reached" or "is slowest everywhere".
5. Fix what the agent couldn't (§1). Examples from this session:
   - the Bell Ledge was unreachable because the Updraft's axis core was too thin;
   - the glide rings sat on pylon-like piers;
   - the Stone shots were badly timed.

### 10.4 Merging

From the main checkout:

```bash
git fetch -q origin
git merge --no-ff origin/claude/<b>   # or --squash, then commit
npx vitest run --maxWorkers=2
flock /tmp/wraith-build.lock npx vite build
git push origin claude/wraithoftheunstill-phase-7
git worktree remove --force /home/sol/wraith-<b>
git branch -d claude/<b>              # -D after a squash
```

Then update this file. If `data/photo-spots.json` conflicts, take main's file and append the branch's new spot objects with a minimal edit, keeping ids unique. If `screenshots/phase-01/bake-preview.png` blocks a merge, it's a generated file: back it up, then `git checkout -- <file>`.

### 10.5 When a usage limit is near or hits

1. Checkpoint every worktree:
   ```bash
   git status --porcelain | cut -c4- | grep -v node_modules | xargs git add --
   ```
   Check that nothing over 15 MB is staged and no `node_modules`, then commit `WIP: checkpoint …` and push.
2. Kill the previews by PID.
3. After the reset, resume short agents with a message, or start fresh agents with a status note.

## 11. Pitfalls already learned

- **`node_modules` symlink:** `.gitignore` once said `node_modules/`, which doesn't match a symlink. An agent committed its link, and merging it deleted the real `node_modules` in main, after which vitest silently exited 216. Now `.gitignore` says `node_modules`. Always check before merging. Fix with `npm ci` if it happens.
- **Full-size shots** (about 7 MB each) bloat the history. One branch carried 230 MB and was squash-merged.
- **Reformatting `photo-spots.json`** causes conflicts in every later merge. Use minimal edits.
- **Bot heights:** `g.ground` only knows loaded tiles (zeros elsewhere), and it doesn't include built solids; `g.wraithGround` does. Bot "height above start" is misleading on slopes, so use absolute `y` against `find.y`.
- **The Updraft's minimum aim range is 3 m.** You step into the column rather than cast it under yourself.
- **Shot timing:** a photo spot's `bend.seconds` or `weapon.seconds` decides what's on screen. Many weak shots were simply mistimed or framed too far away.
- **The PC is often locked:** use headless Windows Chrome (`win-shots.sh` and `play.sh` already do). Don't trust bench numbers taken while it's locked.
- **`vitest` without `--maxWorkers=2`** can exhaust the 4 GB with agents running.
- **The `architecture.test.js` frost checksum** can time out under load. Rerun it alone.

## 12. Worktrees and ports at handoff

| Worktree | Branch | Port | State |
|---|---|---|---|
| `/home/sol/WraithOfTheUnstill` | `claude/wraithoftheunstill-phase-7` (main) | 4173 | clean, pushed, 687 tests |
| `/home/sol/wraith-encounters` | `claude/encounters` | 4177 | §5.1, about 90 % done |
| `/home/sol/wraith-sand` | `claude/sand` | 4174 | §5.2, built, needs review |
| `/home/sol/wraith-shaped` | `claude/dune-shaped` | 4175 | §5.3, barely started |

No servers or agents are running.


28 October D1b checkpoint: `codex/dune-grade` at `69f8bb8` (worktree `/home/sol/wraith-dune-grade`) now includes distance-normal retention and sandstone restricted to the baked rock mask; the initial slope-only bands were rejected. Shared 12 m strata value leaves the bake unchanged. Full suite 783 passes and production build passes; 5 cold scout + 18 lighting-matrix views at 1280×720 have zero GPU errors/late compilation. Sixteen matrix frames have no RGB channel >=253; sunset-facing mid frames measure 0.814% / 2.835%, including sun/sky. Still IN PROGRESS, unintegrated: wet-sand regression, terrain-only sunset clipping, a measured unobstructed 2–4 km view, sustained target-resolution timing and human aesthetics. Canyon sawteeth remain D7b geometry. See its `docs/phase-9/dune-grade-review.md` and JSON/captures. Bot stopped and C: profile cleared; no temporary data remains on D:. C: free space verified about 121 GiB; Medal absent. D2/D9b gates remain unchanged.
