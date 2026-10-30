> **Latest — storm prototype pushed at ec27b3d:** `/home/sol/wraith-light`, branch `codex/desert-storm`, now includes exposure history/save v4 and procedural storm audio (e401c4f), actual local Ridge shelter (3026285) and fresh GPU/teardown evidence (ec27b3d). **841tests/build pass.** The same published terrain-derived field drives CPU cloth/audio and GPU sand/water wind; actual Ridge smoke has lee exposure.12 versus windward/end1, including page save/reload. CPU/GPU10,874samples pass the unchanged.0002bound; zero GPU/readback/late errors. Explicit teardown followed by90renderer frames leaves zero resumed reads and open-air wind. Review the prototype's `docs/phase-9/{storm-transport-review.md,ridge-shelter-review.md}`. These changes are unintegrated; main source remains at its prior Stone-healing checkpoint. **Actual storm terrain erasure/re-rippling across live/evicted pages and collision remains unimplemented**, as do long-session history compaction and rendered/human/full-world/combined D12 acceptance. Normal storms stay disabled. Do not interpret older “audio/shelter absent” notes as current prototype status or infer full handoff completion.
>
> **User workflow preference:** commit and push smaller verified checkpoints frequently because usage is limited. Do not add coauthor credit or coauthor trailers. Retain clear unfinished-work notes and failed evidence. All storage stays on C:, never D:. Owned GPU bot4181 is stopped.

# Progress

> **Latest — 31 October, D10 (Claude): the Long Walker is in, first pass.**
> - Glass footprints lead to it, buried in the star dune; the brake stone wakes it and lends Stone and sand-surf.
> - It walks its circuit and every lifted foot's landing spot is pressed into the sand as a ring. A Ridge, a Bloom's pit or Frost-bound sand under a foot makes it kneel; its plated leg and flank are the climb onto its back.
> - Its back is a moving floor you ride. Shards or Gusts at the glyph pillars steer it; at the Stride it balks and throws you off.
> - At the camp it kneels by the gate; turn the two mirror-stones to throw the low sun down the well and it lies down, the erg restored.
> - All of it checked live with the bot. GPU +0.2 ms near it; **940 tests pass**. Details and gaps: plan.md "D10 — Done".
>
> **Latest — 30 October, D9 (Claude): the dune Shaped are in the world.** Whirlers and Glass-sworn merged; the user's choices built: Whirler blasts leave local dust clouds (veil only while inside), themed haunts across the erg (none near the camp) and Skitters riding sandstorms, a shattered Glass-sworn fuses its ground to glass. **929 tests pass**; no late pipelines. Details: plan.md "D9 — Done".
>
> **Latest — 30 October, D6 (Claude): sandstorms and the moving erg are in.** Merged `codex/desert-storm`; the restored erg's weather now brings sandstorms (front rolls in from 2.4 km upwind; stilled erg never storms); storms erase sand marks (~25× faster healing, erosion clock for stored pages); exposure history no longer throws when full; dunes migrate ~1 m an in-game day (saved shift, GPU/CPU parity 1.2/1.7 mm at 30 m, anchored round ruins/glass/oasis). Spots `p9-storm-arriving`, `p9-storm-inside`. **919 tests pass.** GPU 12.4 ms inside a storm. Details: plan.md "D6 — Done".
>
> **Latest — 30 October, D3 (Claude): sand-surfing is in.** Merged `codex/sand-surf`; sand-surf comes with Stone (`?stone=1` until the Walker); smooth low sand berms instead of snow's rubble; avalanche sheets pour off the downhill berm on slip faces (particles; D2 moves the mass); a singing-sand boom swells under them; sand streams off crests; dust-warm speed streaks. Three slip-face films 719/720 surfing, peaks 24.7/17.7/17.1 m/s, no errors; glide→slip face→surf carries 21 m/s. GPU surfing 13.0 ms at 1440p/0.7. **875 tests pass.** Needs your feel and sound review. Details: plan.md "D3 — Done".
>
> **Latest — 30 October, D2 (Claude): dune crests and avalanching sand are in and on.** Merged `codex/dune-relaxation` (crest metadata + analytic crest normals, conservative relaxation to 34°, sand healing, CPU ground from GPU snapshots); kept the 256-cell clipmap (512 cost +1–2 ms everywhere). Relaxation compute mean 0.155 ms / p95 0.174 ms at 32 m/s stress, rare peaks 0.41–0.57 ms recorded. Hidden-player spots now warm the Wraith (no late pipelines). **857 tests pass.** GPU at the p9r spots unchanged from before the merge (13.9 canyon, 14.3 meadow). Load measured 30 s both before and after the merge on the machine's current state (was 18 s this morning: other apps running). Details: plan.md "D2 — Done".
>
> **Latest — 30 October, finishing round (Claude): the guide's gaps closed.** Frozen sandfalls (Crystallize; climbable ramps, saved), sand cones at running falls, slot beams at the bends, wading in the braids, glass ground (terrain-state GLASS: crazed crust, slick to surf), the caravanserai at the oasis with a walkable gateway drift, the margin's grass drying to straw, and a bake fix for bare sand risers in the Galleries. **822 tests pass**, bake deterministic, load 18.0 s, GPU 10.6–14.2 ms at the p9r spots (1440p/0.7), no late pipelines. Not done: glass refraction (needs an opaque-scene copy pass). Allocation-check failures in controller/springArm/weapons/stone predate this session (same at ed57334). Review: `docs/phase-9/review-guide.md`, `screenshots/phase-09-review/sheet.jpg`.
>
> **Latest — 30 October, review build (Claude): the erg is ready for human review.** Walk `docs/phase-9/review-guide.md` (16 `p9r-*` spots; captures and a contact sheet in `screenshots/phase-09-review/`). New since the open matters: the Dry Braids run with thin water at dusk once restored, desert flowers on their banks, glass seams in the Stride, warm (not blue) shade on canyon floors, lighter erg trees, sandfalls dark in shade, glass dark in shade. **816 tests pass**, bake verified deterministic, load 17.1–17.5 s, GPU 9.9–13.1 ms at the p9r spots (1440p/0.7), no late pipelines. Left for later: frozen sandfalls (D11), the margin's own dry-grass blade, glass as terrain state.
>
> **Latest — 30 October, later (Claude): the open matters.** Slot light shafts (lit only where the sun reaches the air) and tiered sandfalls (restored) in the Galleries; Stone's mass height is a field query (no per-call allocation on the collision/push paths); the dry oasis basin is crazed mud; desert pavement (packed varnished gravel) patches the erg's flats; battle glass now shows the sand through a green-to-amber body with thin fracture seams; the colossus head has cheeks and ears; canyon floors grow sparse tamarisk, thorn and deadwood. **813 tests pass**; load 17.1 s to ready; GPU 12.8–13.0 ms at `p9r-galleries-dawn` / `p9r-hoodoos-noon` (1440p/0.7), no late pipelines. Still open: flowers after rain, frozen sandfalls (D11), human review. Details: `docs/phase-9/plan.md` D7b/D8 follow-ups.
>
> **Latest — 30 October (Claude): D7b ravine kits, D7 ruins and glass, D8 oasis and margin — integrated on main.** The canyon's sawtooth ledges are replaced by a sandstone cliff kit traced from the bake (`world/ravines.json`, `src/world/canyonKit.js`, a worker), with slot walls, hoodoos, arches, collision and dusty air; the erg's ruins (temple, colonnade, obelisks, aqueduct, Sun Gate, colossus head) and five glass fields are architecture sites; date palms, acacia, tamarisk and deadwood grow in the erg, and the oasis has a pool and reeds. Earlier the same day: post compute passes now clamp at the frame edges (bloom corner blobs), daylight shade is lifted before ACES, flower heads, hearth smoke and manor flagstones fixed. **813 tests pass**, build clean, bake verified deterministic. GPU means at 1440p/0.7: 11.4–13.8 ms at the new `p9r-*` spots. Details and what is not done: `docs/phase-9/plan.md` (D7, D7b, D8 Done notes).

> **Latest — 29 October, storm cloak response verified separately:** `codex/desert-storm` in `/home/sol/wraith-light` is pushed at **43d12d2**,810tests/build. The real player mantle and robe now respond to short gusts/crosswinds in the shared CPU/GPU field, with normal-air cloth motion unchanged in the matched simulation. Two native480-frame close-ups show clear wind versus storm; comparison on that branch: `screenshots/d6-storm-cloak/cloak-comparison.mp4` (left clear/right storm), with `cloak-storm-comparison.mp4` copied into the chat workspace. Actual cloth probes, corrected real-mantle regression, CPU/GPU parity and live1440p/.7 checks pass; full body/movement/shelter/art/allocation gates remain open. Read that branch's `docs/phase-9/storm-cloak-review.md`.
>
> Main remains805tests through18bd3ba/fc134bf; **storms are still dormant and unintegrated**. Next D6: shared spatial terrain erasure/re-rippling/persistence, sound, real Ridge shelter and the remaining graphics/combined gates. Full handoff remains unfinished; goal usageLimited/manual continuation authorized. Owned GPU bots stopped; C: only, no D:.
> **Latest — actual local Ridge shelter checkpoint:** A bounded GPU-state snapshot now feeds one published shelter field shared by CPU cloth/audio and GPU sand/water wind. Actual RIDGE brush smoke has lee exposure.12 versus windward/end exposure1, and rebuilds from saved terrain. CPU/GPU10,874samples pass the unchanged.0002bound; three1440p/.7 off/on pairs add approximately-.004,+.007,+.015ms mean GPU, with .81–.85ms CPU field rebuilds at5Hz. **841tests/build pass.** Review fixes stale pending publication and disposed-owner updates. `docs/phase-9/ridge-shelter-review.md` records limits: local32m field,14m rays, provisional tuning, D2 remainder integration, readback allocations and pending rendered/human review. **Terrain storm erasure/re-rippling and its collision/reload/save integration remain unimplemented; normal storms remain disabled.** The older “shelter missing” note below is superseded for this bounded prototype only. All other handoff/D12 gates remain open. User workflow: commit and push smaller verified checkpoints frequently; do not add coauthor credit/trailers. C: only.

> **Latest — storm history/audio foundation, not erasure/shelter completion:** `codex/desert-storm` adds a fixed world-space exposure journal, optional shared8m transport grid and save v4 front/history migration. Actual GPU pages/save-worker codec/in-memory reload preserve page bytes, front and exposure; saved history endpoints remain immutable after load, world-edge biome taps clamp correctly. New six-node storm rumble/grit/upwind audio uses actual local wind and density; seven offline actual-SFX renders verify off PCM identity, silence/mute and shelter-input response with no update-created nodes. Human listening remains NOT ASSESSED; shelter input is still1 in game. **834tests/build pass. Terrain storm erasure, collision/reload integration and real Ridge shelter are not implemented yet**, nor is long-session history compaction. Normal storms stay disabled. Review `docs/phase-9/storm-transport-review.md` and `docs/phase-9/storm-front/{save-smoke.json,audio-offline/report.json}`. This supersedes older “audio not built” notes only for the procedural graph, not its actual shelter consumer. All remaining full handoff/D12 gates stay open, C: only.

# Progress

> **Latest — 29 October, player cloak response corrected:** The dormant storm prototype now includes short shared gusts and bounded crosswind, so the real Verlet mantle/robe visibly lift, fold and stream with the sand. Existing cloth physics stays the owner. Matched CPU simulation keeps clear weather exactly unchanged and measures~8xmantle/~4.8xrobe mean free-hem speed, with similar average wind force. The first precision mismatch was fixed without relaxing the2e-4bound;5166GPU samples pass, off/zero-gate bit identity retained. New real-mantle motion regression fails on the prior source and passes now. **810tests/build pass.**
>
> Two native480-frame close-ups have0failed/GPU/late errors and sampled foreground clipping; comparison `screenshots/d6-storm-cloak/cloak-comparison.mp4` (left clear/right storm), with Windows copy `cloak-storm-comparison.mp4` in the chat workspace. Three live1440p/.7 clear/storm pairs add+.047–.071ms for the whole storm slice. Read `docs/phase-9/storm-cloak-review.md` for scope, retained failures and unassessed full-body/movement/art gates. Main remains805tests; storms remain disabled/unintegrated. Shared terrain erasure/audio/real shelter and the full handoff remain unfinished. All owned GPU bots stopped; C: only, no D:.


> **Latest — 29 October, collision healing fixed and storm streak checkpoint pushed:** Main includes **18bd3ba**: Stone collision accumulates healing rate over new elapsed time, honors zero refill and avoids retroactive Ridge-height jumps when weather/refill changes. **805tests pass (800tracked +5preserved local-LLM tests)** and production build passes. Five regressions and a fresh main1440p/.7/180-frame smoke pass; actual bundled CPU owner exactly holds aged height at refill0 and matches piecewise decay. Main still has128post/24wind floats and no storm model. See `docs/phase-9/stone-healing-review.md`.
>
> Separate `codex/desert-storm` worktree `/home/sol/wraith-light` is pushed through **5ccdc95** (streaks a15ee78, wind d3d8df5),808tracked tests/build. Shared wind/water-SSR, readable low-Sun diffuse air and FOV-capped precipitation-geometry grains are verified in bounded scenes, with480-frame native motion/decoded QA, depth/zero-gate/snapshot/resize checks. The720p60 review film is `screenshots/d6-storm-streaks/streaks-inside.mp4` on that branch; a Windows review copy is in the chat workspace. Failed fixtures and all timing samples are retained. **Storms remain dormant/unintegrated.**
>
> Next: shared spatial terrain erasure/re-rippling with resident/evicted/save/collision agreement, audio/cloth feel and real Ridge shelter, then Sun-disc/actors/moving-camera/border/allocations/combined gates and saved anchored meso migration. `storm-erasure-contract.md` maps ownership and unresolved contracts; no renderer-only density shortcut. D2 still fails unchanged cold.4ms, D3/D9b and D7–D12 remain open. Full handoff/goal unfinished; usageLimited/manual continuation authorized. Owned GPU bots stopped; all files C:, no D:.


> **Latest — 29 October, near storm grains verified:** `codex/desert-storm` now adds a sand variant sharing the existing snowfall Geometry, one active-storm draw after fog/before TAA, no new full-screen texture. **803tests/build pass.** Actual native HDR readback verifies changed grain pixels, exact zero-gate/repeat output, unchanged scene depth and real opaque occlusion. Twelve repeated snapshot/resize phases return identical same-size texture memory/refcounts with0GPU/late errors. Final three1440p/.7 paired costs+.026879,+.022356,-.004385ms (all retained). The FOV-capped native480-frame film has no failed frames/GPU errors or sampled foreground clipping; first long-line and render-state/snapshot failures are retained and labelled. See `docs/phase-9/storm-streak-review.md` and `screenshots/d6-storm-streaks/streaks-inside.mp4`.
>
> **Still dormant/unintegrated; main remains800tests.** Terrain erasure/re-rippling, sound/cloth feel, real Ridge shelter, Sun-disc/actors/moving-camera/border/allocations/combined gates remain open. `storm-erasure-contract.md` maps current CPU/GPU/reload/collision gaps; do not add a renderer-only density multiplier. Full handoff/D2/D3/D9b/D7–D12 remains unfinished. Goal usageLimited/manual continuation authorized. Owned GPU bot stopped; all files C:, no D:.


> **Latest — 29 October, storm wind and low-Sun review:** `codex/desert-storm` in `/home/sol/wraith-light` now has the shared CPU/GPU front wind, matching water/SSR inputs and corrected dusk/night diffuse light. **803tracked tests/build pass**;5166GPU parity samples max1.89262e-5, exact old-field off/zero-gate GPU behavior, compose-off bit identity and200m core visibility retained. Six fresh native1440p poses have0clipping/GPU/late errors. Nine matched1440p/.7 pairs have on means10.528–10.567ms; all deltas including a noisy negative pair are retained. The checkpoint also includes the front/light owner wiring omitted from9fdca58's source snapshot. Read `docs/phase-9/storm-front-review.md` for reproduction and limits.
>
> **Dormant and unintegrated.** Main remains800tests through dry weather/crest/D5. Next: precipitation-geometry sand streaks, terrain erasure/re-rippling, audio/real Ridge shelter, moving-camera/border/Sun-disc/actors/cloth/water/allocation/combined gates. No full D6 or handoff completion; D2/D3/D9b and D7–D12 gaps remain. Goal usageLimited/manual continuation authorized. All files stay C:, never D:.


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

> **Latest D9b review — 2026-10-28:** 3/3 staff/Frost clears each single/new mixed fight; both alternate live material answers verified; corrected 420-frame film and five cold captures have zero GPU errors/late pipelines. 786 tests/build pass. Frozen debris keeps size/material. Full allocations, sustained performance and night/storm/surf-speed readability remain open, so D9b remains unintegrated on claude/dune-shaped. D1b is now integrated from main; its grade is included in this branch for the next enemy review. See docs/phase-9/dune-casters-review.md.

> **Historical D9b implementation checkpoint — 2026-10-28:** Whirler/Glass-sworn code, bounded dust devils and powder, material answers, bestiary and eight regressions are built in /home/sol/wraith-shaped on claude/dune-shaped. 786 tests/build pass. Cold 1280 captures and input-driven Frost/staff clears have zero GPU errors/late pipelines; 1440p eight-caster powder cost is ~0.68–0.69 ms. D9b is not integrated: debris-size fix/frozen-glass shader need fresh GPU/film review; repeated balance, alternative live answers and full allocations remain open (15 GC/100k mixed frames). Read docs/phase-9/dune-casters-review.md. D2 stays disabled on codex/dune-relaxation, pushed through 67597d8; recording is stopped under the user's latest instruction. Earlier pending-approval text is historical.

Session handoff log. Update at the end of every session (see BRIEF §0).

## Current state

> **D2 continuation 2026-10-28 afternoon:** sand dust merged; full-size moving Ridge, wet/frozen GPU oracles, eight-step isolated and overlapping Skitter-write settling verified. Cached collision callbacks remove two closures per refresh, with three ownership regressions. **800 tests/build pass.** Strict timing and true knife-edge/motion gates remain open, so D2 stays disabled at its existing 32-step default. `docs/phase-9/relaxation-review.md` contains the exact experiments and failed repeats; no all-task completion is claimed.


> **Current continuation — 2026-10-28:** recovered Windows disk space (removed `C:\Medal`, ~7.4 GiB; `C:\adobeTemp` could not be removed due to Windows permissions), restored WSL access, and reviewed the most recent main/D2 handoffs and execution tracker. The user's added visual request is built: low sand ground blow and rising terrain-disturbance puffs, gated by sand/wet/frozen state. Direct RTX 3060 shader oracle returns exact zero on fully wet/frozen/non-sand; five stills and a six-second 720p/60 film were reviewed. Indicative fixed-view 1440p cost +0.201/+0.215 ms; no sustained-60 or D2 timing acceptance. **783 tests pass** (778 tracked + five preserved untracked local-model tests); locked build and cold GPU checks pass, no errors/late pipelines. See `docs/phase-9/dust-review.md`. **D2 remains in progress and disabled** on `codex/dune-relaxation`; its remaining gates are unchanged. This paragraph and HANDOFF's current continuation supersede the historical access/phase notes below.

> **Access restored later on 2026-10-27:** full access in Codex CLI resolved Windows execution and GitHub restrictions. All checkpoints are pushed. Headless Windows Chrome's bot works and six fresh sand rain screenshots completed; review copies are committed on `claude/sand` at `e573210`. Wet sand still needs stronger visual darkening. See the access update at the start of `HANDOFF.md`; environment-blocked notes below are historical.

> **Codex continuation 2026-10-27:** `HANDOFF.md` starts with the current checkpoint. Encounter lifecycle fixes are committed locally at `b0955cc` (749 tests); sand weather/capture fixes at `39613c8` (696 tests). Both branches have local main merged and pass locked production builds. Main gameplay stays at `139ead6` while required GPU review is pending. Windows executable interoperability and GitHub DNS fail in the restricted execution environment; no new GPU results or successful pushes are claimed. Next steps and review documents are recorded in the handoff.

> **Codex continuation 2026-10-27:** encounter lifecycle review is checkpointed on `claude/encounters`, with local main `139ead6` merged. Whole-wave capacity, Barley calm, and telemetry cancellation/load handling are fixed; 749 tests and the locked production build pass. See `docs/encounter-audit.md` §8. Windows interoperability fails at the socket boundary and GitHub DNS is unavailable here, so GPU playtests, the two remaining isolation films, push and integration into main are pending. Next: restore the existing Windows bot/capture path, run the pending review, then merge; sand and dune-enemy work remain in their original worktrees.

> **Codex continuation 2026-10-27:** `claude/sand` has local main `139ead6` merged. Photo spots now preserve all 229 main entries exactly and append eleven sand entries. Independent weather overrides and bounded drying are fixed; 696 tests and the locked production build pass. See `docs/phase-9/sand-review.md` for the visual verdict and precise next steps. Main integration, fresh target-GPU review and pushing are pending because Windows interoperability and GitHub DNS fail in this execution environment. Existing dirty raw capture output was preserved. The encounter branch is separately checkpointed at `b0955cc` with 749 tests passing; dune enemies remain at their original WIP.

> **Handoff 2026-10-27:** read `HANDOFF.md` first. It is the full current state: the user's rules, everything merged since Phase 7 (weapons, economy, Remembrance, restored world, the Bell-mace, Phase 9 D0 and D4), the three unfinished branches, ready-made agent briefs, the code map and the tooling. This log below covers Phases 0–7.

- **Phase:** 7 (RPG layer), **in progress — visual pass under way on branch `claude/wraithoftheunstill-phase-7` (see Session log 2026-10-09 and PLAN.md)** — built and pushed, awaiting the user's play-through on T (see "Phase 7 open"). Phase 6 is closed (accepted by the user, 2026-10-04, on the MacBook re-shoot and the T bench), on condition that `src/main.js` is cut down first. Phase 5 is closed: the user said to fix the last issues and move on if good (2026-10-04); they were fixed and judged good on the target shots. Phase 4 is closed (accepted by the user, 2026-10-03). Phase 3 is closed (accepted 2026-10-03). Phase 2 is closed (accepted 2026-10-03). Phase 1 is closed under the user's ruling (2026-10-03). Phase 0 is closed (2026-10-02).
- **Phase 7 built** (commits 9ed68f1 …; DECISIONS.md "Phase 7"):
  - **`src/main.js` split** (1101 → ~190 lines): `src/boot/` (engine, world, actors, game facade) and `src/systems/` (one module per concern, same run order).
  - **Save v2** (`src/game/save/`): quest graph state and world flags, Echoes, shrines, lore, the explored map, ice formations, the Warden (dormant / rested where it lay down), forced weather, time, restoration, and the **dirty coarse terrain pages** — the window is written down into its pages, resident pages read back one per frame, evicted pages copied from the worker; a load hands them back to the worker's page store and they stream in as the Wraith approaches. v1 → v2 migration. `tools/capture/save-gate.mjs` automates the gate (marks → save → new page → load → check).
  - **The frost chapter** (`data/quests/frost.json`, **draft for the user's review**): 3 main quests (The Empty Robe → The Held Snow → First Snow), 4 side quests (A Trail in the Snow, The Sleeping Spring, The Stones Remember, The Slow Songs), 5 named Veiled, 4 Echoes with visible effects (`game/echoes.js`), 4 lore fragments. Runtime in `game/chapter.js` (quest graph, talk tables, one-choice dialogue) and `systems/chapter.js` (facts, events from the world, Interact, subtitles, notices).
  - **The Veiled** (`character/veiled.js`, `systems/npcs.js`): five archetypes (staff-bearer, elder, child, lantern-keeper, monk) on the Wraith's own robe/cloth/gait, each simulated in a scaled copy of the world so a child's feet plant exactly; dyed robes, hunch, breathing, posture shifts, turning toward the Wraith, LOD (full < 60 m, ⅓ rate < 260 m, hidden beyond). An ambient pilgrim walks the camp–shrine path leaving footprints. The lost child's trail is pressed into the snow a stretch at a time.
  - **Architecture** (`world/architecture.js`, `render/architecture.js`, `shaders/architecture.wgsl.js`): procedural Shaper stone — the monastery on the summit (plinth, the hall with its bier and half-fallen roof, a 14-column cloister with broken and fallen columns, the bell arch, steles), five shrines (glyph altar, five carved stones; their glyphs wake with a cold light once rested at), the pilgrims' camp (felt tents lit from within at night, fire, lantern post, sleds, windbreak), the frozen spring and the watching stone. One static draw; seated on known ground (anchor patches); collision (`world/solids.js`: walls and columns block, plinths are floors).
  - **The Warden lives in its arena** in play (dormant until the Wraith comes within 45 m), and lies where it was released after a load.
  - **Music:** the user's nine cues (`assets/audio/music/` → `data/audio/music/*.m4a`), directed by `systems/audio.js` (release > fight > title > waking > shrine > camp lyre; stingers for the Warden waking, death, an Echo); streamed, crossfaded loops, ducked under dialogue.
  - **Screens** (`ui/menus/`, `ui/hud/`): title over the living world (Continue / Begin / Settings), loading screen with lines of the world, parchment codex — pause, journal (journeys, lore, Echoes), the map (drawn from the real heights in ink, revealed as explored), shrine (rest until dawn/midday/dusk/night, travel between rested shrines, attune carried Echoes), save/load pages, settings (music, sounds, subtitle size). Subtitles low and centred, the interaction glyph at the thing in reach, quiet notices. Fonts: Cormorant Garamond and IM Fell English (OFL, bundled).
  - **Photo spots:** `p7-monastery-approach`, `p7-monastery-hall`, `p7-camp-dusk`, `p7-shrine-noon`.
- **Phase 7 evidence (cloud container, SwiftShader — logic, not timings):** `node tools/capture/save-gate.mjs` **passes** (`screenshots/phase-07/save-gate-swiftshader.log`): a crater, a trail, an ice formation and a released Warden at the start; a crater 450 m away; save (waiting behind a running autosave); a fresh page; load; the Wraith back in place, both craters and the trail back (an evicted page and a resident one), the formation and the rested Warden as left. Re-run green after the final load path (loads wait for ground and floors). Look-only review shots at 480×270 in `screenshots/phase-07-swiftshader/` (monastery from the stair head, from the air, the hall). Found and fixed on the way: the monastery sank 39 m into its sharp summit (now a citadel seated at the summit); the Wraith landed inside its foundations on teleports and loads; tents blazed white at dusk (emission now display-referred); a write onto a stored page dropped its history (a loaded save's marks were lost at the first footstep); a save during an autosave was refused; an architecture shader used a reserved WGSL word (an invalid pipeline stopped all rendering).
- **Phase 7 open:**
  - **The gate (only the user can play it):** on T, `npm run build && npm run preview`, open `http://localhost:4173/`, Begin, play from waking in the monastery hall to the Warden's release (the quests lead there), save on a codex page, close the tab, reopen, Continue — every trail, crater and ice formation should be where it was left, the Warden lying in the land.
  - **Gate shots on T:** `?shots=p7-&dir=phase-07&capture=1&res=2560x1440`.
  - **Story review:** every line in `data/quests/frost.json` is a draft.
  - Not done yet: props in the Veiled's hands (staff, lantern body — the lantern's light is there), a point light from the camp fire on the terrain, NPC dialogue barks, map sketches of creatures in the journal, sound-effect samples (deferred by the user).
- **Phase 6 built** (commits 3bee69a …; DECISIONS.md "Phase 6"):
  - **Post chain** (`src/post/`, `src/shaders/post/`): the camera renders into an HDR target (rgba16f + sampleable reverse-Z depth); compute passes follow and one display pass draws to the swapchain. MSAA is off (TAA replaces it).
    - SSAO (½ res, depth only) → SSR on ice/wet slush (½ res; reflective pixels marked in the scene alpha by the frost clipmap) → weather volumes (¼ res: raymarched clouds, light-shaft ratio through the shadow cascades) → compose (AO, SSR, clouds, analytic weather fog) → frame-metered exposure → **TAA** (Halton jitter, depth reprojection, Catmull-Rom history, variance + min/max clip) → DOF (release cinematic only) → bloom (6-level compute chain) → display (AgX or ACES, CAS sharpen, 32³ LUT grade, grain, dither).
    - Every pass has a toggle in the overlay (Systems & post). `?tonemap=agx` starts with AgX; `?postDebug=1|2|3` flags non-finite inputs / shows the raw scene / the composed frame.
  - **Grading:** the stilled/restored grade moved into a procedural LUT (`post/grades.js`), with cold shadow tint and warm highlights when restored.
  - **Eye adaptation:** a histogram meter of the real frame corrects the analytic exposure within −1 … +0.75 stop (replaces the fixed frost-albedo compensation); overcast and snow sit ~0.5 stop lower on purpose.
  - **Weather** (`world/weather.js`): clear, overcast, snowfall, blizzard, eased over ~40 s. A stilled steppe has only clear and a still overcast. It drives cloud cover (clouds, sun dimming, overcast sky in the IBL), weather fog and light shafts, falling snow (`render/snowfall.js`, 16k GPU flakes, blizzard streaks), wind (cloth, spindrift, sound) and snow refill of tracks (×(1+5·snow)). Overlay: weather select with "auto (cycle)".
  - **Fix:** the aerial-perspective LUT was looked up vertically mirrored since Phase 1 (DECISIONS.md).
  - **Photo spots:** `p6-{clear,overcast,snowfall,blizzard}-{dawn,noon,dusk,night}` (the gate matrix), `p6-vista-clear`, `p6-vista-overcast`, `p6-shafts-snowfall`, `p6-stilled-golden`, `p6-restored-golden`.
  - **Bench:** `?bench=weather` — each weather walking with an orbiting camera, a live clear→blizzard transition, and the Shaped pack in a blizzard.
  - **Tests:** 102 (weather state machine added). `npm run alloc`: the weather update is allocation-free.
- **Phase 6 evidence on T (2026-10-04, user's run):**
  - **Shots:** `screenshots/phase-06/` (21, ACES) and `screenshots/phase-06-agx/` (same spots, AgX), all saved in ~3 s each (`shots-log.txt`).
  - **Bench:** `?bench=weather` at 1440p (175 Hz display): GPU frame 12.3–12.6 ms median, p95 ≤ 13.2 ms in every weather, in the live clear→blizzard transition and with the 8-Shaped pack in a blizzard; 0 late pipelines; 785 MB (PERF.md). The pack's presented hitches are 175 Hz pacing, not GPU (as in Phase 5); repeat at 60 Hz for the gate.
  - **Review of the target shots:** time of day reads at every weather (warm low light over blue shadow at dawn and dusk, deep-blue moonlit night with stars, flat white noon); overcast shows its grey deck; the blizzard swallows the peaks while the near ground still reads; stilled vs restored grades differ clearly. **ACES chosen over AgX** (AgX drains the golden hour; DECISIONS.md).
  - **Fixed after the review** (needs a re-shoot): clouds read as vertical streaks (2D density → height-varying density, flat bases, dome tops); overcast and snowfall still threw crisp warm sun shadows at dawn/dusk (the deck now leaves ~4–11 % of the sun); falling flakes read as dark dashes on sunlit snow (lit brighter); the shafts spot framing.
- **MacBook re-shoot (2026-10-04, `screenshots/phase-06-mac/`, look only — not the target):** falling snow now reads as white wind-driven streaks; snowfall haze good; shafts framing better. Still wrong, fixed after it (re-shoot pending): hard warm shadows at overcast/snowfall dawn and dusk (the sun now goes to ~2–4 % and the shadow maps fade under a deck), no clouds at all in the clear sky (coverage threshold lowered), radial streaks across the overcast deck (far-field noise level, capped grazing paths).
- **Second MacBook re-shoot (`dc1a35a`):** overcast and snowfall now give flat, shadowless light at every time of day (fixed). Still: only one wisp of cloud in the clear vista, and step-banded "ladder" streaks across the overcast deck. Fixed after it (re-shoot pending): march steps start at 60 m at the layer entry and grow ×1.12 (equal 440 m steps banded), a 64-frame jitter of the march start, more scattered cloud in clear weather; the post frame index is now relative to the last history reset (captures repeat exactly).
- **Third MacBook re-shoot (`6ce68bd`):** the ladder banding is gone from the overcast deck; the clear vista now has a lit cumulus with soft shading and scattered wisps; overcast and snowfall stay flat and shadowless. The overcast deck still reads as wind-streaked stratus converging toward the horizon (perspective of a 2D-based field) — acceptable, could be richer. **Gate review requested from the user.**
- **Phase 6 open:**
  - Re-shoot on T after the fixes above (`?shots=p6-&dir=phase-06…`) and confirm; a 60 Hz bench for the hitch rule.
  - In motion on T (only the user can judge): falling snow and blizzard streaks, light shafts, TAA on the moving Wraith (no per-object motion vectors), the weather easing.
  - The Wraith's robe bunches strangely at the hem in the snowfall-noon shot (cloth in wind during the walk-in); watch it in motion.
  - Not done: per-position cloud shadows on the ground, real refraction for spell water/crystals, per-object motion vectors for TAA (DECISIONS.md).
  - Software-renderer checks in the cloud session found and fixed: a black outline on far silhouettes (SSAO half-float overflow), overcast/blizzard over-exposure, peaks through a blizzard.
- **Phase 5 built** (commits 653430b … 049ad9b; DECISIONS.md "Phase 5"):
  - **Shaped:** procedural bodies (rope spine, planted feet, two-bone knees) clad in chunk rigs of packed snow, ice shards and a glowing core.
    - Three archetypes: hound, brute (slam), seer (ice shards).
    - Creatures rise out of the snow chunk by chunk and collapse back into a mound.
    - Freezing glazes them; a frozen Shaped shatters.
  - **Combat:** Sweep, Ribbon and Crystallize hit the Shaped, and Shaped attacks land on the Wraith.
    - Focus is spent on verbs, dodge and climbing; dodge (Ctrl) gives immunity; lock-on (Tab).
    - Hit-stop and shake on hits.
    - Health and focus live on the body, not a HUD: the cowl light gutters, frost creeps up the robe, and a cold vignette appears at very low health.
    - Death folds the Wraith into the snow, and it re-forms at the last safe point.
  - **The Frost Warden:** a ~35 m glacier-mammoth. Its four water joints are frozen (Crystallize) and then shattered: the two front knees from the ground, the two on its back by climbing it.
    - Its material is a matte glacier, snow over blue ice. Normals blend across neighbouring chunks so it shades as one mass, with crevice shade where chunks meet.
    - Its footfalls crush craters into the snow.
    - It bucks while climbed.
  - **Climbing (hold RMB on the Warden):**
    - It grips legs and body as parametric surfaces and the climbing pose reaches in turn.
    - Climbing drains focus; the Wraith is thrown off, lets go or slips.
    - The camera stands off the surface and treats the Warden as an occluder.
  - **Release (the last joint breaks):**
    - Light fills the ice along its fractures.
    - The exhale: a ground-hugging powder wave rolls out with a wind gust and a heavy shake.
    - It lies down into a long drift.
    - The grade moves from stilled (cool, flat, still air) to restored (wind, spindrift, warmth).
    - A letterboxed orbit camera follows it all; Jump or E skips it.
  - **Diamond dust:** ice grains hang motionless in stilled air. They twinkle as the camera moves and start drifting and thinning on the release's gust.
  - **Dev tools:** world tools Spawn, ×3, Kill all, Warden and Release; `?bench=fight`.
  - **Tests:** 91 pass (Shaped, combat, climb, release camera).
- **Phase 5 rework after the user's review (2026-10-04)**, which said the climb looked like flying, the release sank and vanished, and combat was bland:
  - **Climb, now hold-to-hold:**
    - Each move is a reach (the lead hand arcs to a new hold), then a pull (the body surges up under it), then a beat.
    - Hands and feet are holds that ride the Warden. The arms use two-bone IK; the feet plant with frog knees, or hang while it heaves.
    - The pelvis hangs on a spring. Each grab gives a puff of snow, a jolt and a crunch.
    - The climb surface is now the visible one (rays leave the outermost chunk).
  - **Release, rebuilt:**
    - Light fills the ice, the Warden rears, then slams onto its chest with a hit-stop and a white flash.
    - A shockwave tears out across the steppe: a powder wall and radial scour grooves.
    - The shockwave throws the Wraith onto its back. It lies through the cinematic and gets up afterwards.
    - The Warden lies down under snow and stays for good, as a ridge with its spires standing.
    - The camera directs three shots (the rearing, the wave, a crane); skipping jumps to the end state.
  - **Combat:**
    - **Hits:** cold-white hit flash and knockback (hounds hop, big ones rock); heavier hit-stops and a camera punch; frozen kills blow apart.
    - **Hounds:** take turns (a lunge token) and spread round the Wraith.
    - **Brutes:** crack the ground where the slam lands; the slam's ring passes under a jump.
    - **The Warden:** spells on its body chip it and make it flinch and turn on you. It stomps (a ground ring), tail-sweeps behind and sheds shard volleys at range, and enrages per broken joint.
    - **Casting:** flashes the hand light.
  - **Sound (pulled forward from Phase 7):** procedural WebAudio covering hits, shatters, slams, stomps, the shockwave, steps, grabs and the three verbs, plus a wind bed. The stilled steppe is silent; the release brings the wind back.
  - **Tests:** 99 pass (knockdown, release camera, hold-to-hold climbing, fight feel).
- **Phase 5 final fixes (2026-10-04):**
  - The Warden's chunks are cut by cleavage planes into angular glacial blocks (it read as snowballs up close).
  - Lain down, its masses spread and flatten under deeper banked drifts.
  - Granular snow crunch and scattered shard pings for the shatter.
- **Phase 5 gate evidence (target T, 2026-10-03):**
  - **Shots:** `screenshots/phase-05/` (`?shots=p5-`):
    - hounds, pack and combat with the HUD hidden;
    - Warden golden and afternoon;
    - climb flank and leg;
    - release rear, wave, thrown and settled;
    - steppe stilled and restored.
  - **Bench:** `?bench=fight` on T at 1440p. The pack (the heaviest view) has a GPU frame of 13.2 ms median and 13.8 ms p95; 0 late pipelines (PERF.md).
- **Phase 5 open (for review / polish):**
  - The Warden still reads as lumpy snowballs up close; silhouette crags could carry more large-scale form.
  - The powder wave is subtle against sunlit snow. It reads best in motion and against shade.
  - A faint brighter disc remains where the release drift sits.
  - Release, climbing and joint fight need a feel check in live play on the PC. Use the world-tools Warden and Release buttons.
  - Diamond dust (stilled air) is subtle by design: it shows against the sky and in shade, flashes as plate crystals mirror the sun, and is invisible on sunlit snow. It needs a look in motion.
  - The pack view has the least perf headroom (p95 16.1–16.5 ms when the PC is loaded; PERF.md).
- **Phase 4 built so far** (commit f74c958; DECISIONS.md "Phase 4"):
  - **Terrain state repack:** word 1 now holds compaction, wetness, frozen and transform (8-bit each). That is one fragment binding, and the snow reads slush, crust and permanent ice from it.
    - Five brush programs: PRESS, PLOUGH, SCORE, FREEZE, WET.
    - Healing uses dithered 8-bit rounding.
    - 48 brushes per frame.
  - **Snow-surf (hold RMB on snow):** a surf model in the controller.
    - Feel: a crest pushes toward cruise; gravity acts along the slope; carving is grip-limited; the lean comes from lateral acceleration; entry and exit ease.
    - On screen: the Wraith's surf stance and lean, the robe whipping back, a banked camera with wider FOV.
    - The wake ploughs a groove with outside-heavy berms; a spray plume and a crest at the feet.
  - **Frost verbs:**
    - Sweep (tap LMB): a slush crescent ploughs a wet channel.
    - Ribbon (hold LMB): a GPU water tube from the hand to the aim, scoring thin wet lines.
    - Crystallize (F): a formation of faceted refractive crystals over permanent ice.
    - Shared: spell lights glow in the snow; the Wraith faces the aim and reaches with its right arm.
  - **Photo spots** can pre-roll a scripted surf run (`surf`); gate spots are `p4-surf-*`.
  - **Tests:** 71 pass, including surf feel targets and every verb writing the state.
- **Phase 4 gate evidence (target T, 2026-10-03):**
  - **Shots:** `screenshots/phase-04/` (`?shots=p4-`).
    - `p4-verbs-noon`: every verb's persistent mark (Sweep channel, Ribbon line, Crystallize formation on ice).
    - `p4-surf-carve-golden`: the wake berm and plume.
    - `p4-surf-field-noon`: a finished run seen from 40 m.
  - **Bench:** `?bench=bend` (PERF.md).
    - Surf costs +1.2 ms over standing in the same view; the verbs cost ~0.
    - 0 late pipelines (no first-cast hitch).
    - Surf p95 is 14.0 ms (60 fps budget 16.7).
  - **Feel:** the user's verdict on the surf is "feels rlly good".
  - Shots and benches were taken by launching Windows Chrome from WSL. The user granted it; method in memory.
- **Phase 4 defects fixed this session:**
  - mouse buttons never registered (Babylon suppresses the compatibility mouse events; input now comes from pointer events);
  - Ribbon made no marks on downhill ground (now a ballistic launch and slope contact);
  - zig-zag stripes in plough berms (a stepped hash; now smooth noise);
  - ghost berms at stamp boundaries;
  - the walk-in hold froze the Wraith outside captures;
  - surf spray PCSS overdraw (p95 18.7 → 14.0 ms).
- **Phase 4 open (polish):**
  - water and crystal refraction against scene colour (approximated);
  - spell-light SSS on non-snow materials;
  - element selection (only frost exists);
  - a curling wave mesh for the wake (spray and berms carry it today);
  - the open snowfield costs 11.6 ms at 1440p standing (frost material); scalability pass in Phase 6.
- **Phase 3 built so far** (details in DECISIONS.md "Phase 3"):
  - **Locomotion:** procedural gait with true foot planting (0 slide in tests) and two-bone knees; the kinematic body (lean, bank, arm swing). Footfall events stamp a footprint and kick up spray on the exact frame of contact.
  - **Cloth:** CPU Verlet with about 3,000 particles: robe, cord and sash, capelet mantle, bell sleeves, deep cowl, wrapped hands and feet.
  - **Shading:** cloth shader (sheen, woven anisotropy, translucency, fold and layer occlusion, torn hems); 24-shell fur at the hood rim and cuffs; the breathing cowl light and fingertip glow.
  - **Captures:** photo spots can walk the Wraith into place (`walk`). Five gate spots: `p3-wraith-*`.
- **Phase 3 defects fixed this session:**
  - robe hung upside down after the spawn's vertical teleport;
  - hem thrown over the waist on stopping (pelvis offset stepped);
  - pelvis rose during the running flight phase;
  - hem kicked to the waist by hard leg colliders.
- **Phase 3 evidence on T:**
  - **Shots:** the third set in `screenshots/phase-03/` (`?shots=p3-&dir=phase-03`, 2026-10-03 18:56) covers walk-noon, run-golden, side-dawn, hood-dusk and night. The user's verdict: "its good".
  - **Bench:** `?bench=1` at 60 Hz gives a walk GPU frame of 7.7 ms median and 10.4 ms max with 0 hitches (PERF.md).
  - **Tests:** gait tests show 0 slide and prints landing on the exact frame (63 tests pass).
  - **Gate:** accepted by the user, 2026-10-03.
- **Phase 3 items carried forward (polish and later phases):**
  - target shots (`?shots=p3-&dir=phase-03`) and review;
  - a perf bench with the Wraith on T;
  - traversal-mode whip (Phase 4 traversal does not exist yet);
  - low-health cowl guttering and frost creep (Phase 7);
  - the hood-dusk close-up still reads slightly back-tilted from a low camera;
  - the Wraith's pipelines are only warmed if it is visible during loading (hidePlayer spots create them late).
- **Phase 2 gate evidence:**
  - shots on T (`screenshots/phase-02/`): dawn, noon, dusk, night, the north face and a trail close-up;
  - flight run 2 at 60 Hz: GPU 7.4 ms median, 14.0 ms max, 0 game-attributable hitches.
  - Polish items carried forward are listed in DECISIONS.md.
- **Gate status (Phase 1): MET under the user's ruling of 2026-10-03** (DECISIONS.md), from four flight runs on T (PERF.md):
  - the gate counts game-attributable hitches only, and there were **0**: CPU ≤ 1.2 ms and GPU ≤ 8.2 ms before every hitch, with no streaming correlation;
  - the GPU frame is ~4.2 ms at 170 Hz and ~6.0 ms at 60 Hz, against a 16.7 ms budget; shadows take 1.4–2.1 ms against 2.7 ms;
  - presentation stalls from outside the game remain: 14 real drops in 45.8k frames at 60 Hz. They are reported separately.
- **Phase 1 gate work in place:** the benchmark (`?bench=flight`) flies the continent at 20 m/s (surf, 12 m up) and 40 m/s (glide, 45 m up), recording presented frames, GPU time per pass category, stream queue depth, tile uploads, late pipelines and the hitch attribution.
- **Built in Phase 1** (BRIEF §17), with details in the session log and DECISIONS.md:
  - **world:** deterministic bake; worker streaming; 12-level clipmap with geomorphing; CPU/GPU height parity (max 0.58 mm);
  - **lighting:** Hillaire atmosphere with day/night, aerial perspective and GPU eye adaptation; 4-cascade CSM;
  - **horizon:** a distant mountain ring;
  - **terrain state:** the two-level architecture (fine window, coarse pages, eviction with closed-form healing on reload).
- **Captures:** clay view, 8 Phase 1 photo spots in `screenshots/phase-01/`.
- **Machines:**
  - **Target T** is this PC: Windows 11, RTX 3060, Chrome. Measure it with the in-page benchmark; the results go to `perf/runs/`.
  - **W** is WSL headless SwiftShader on the same PC, used for captures and allocation profiles.
- **Exact next step:** the user decides on the Phase 6 gate (MacBook look shots + the T bench at 175 Hz, or a final pass on T). If on T:  `git pull && npm run build && npm run preview`, then in Windows Chrome `http://localhost:4173/?shots=p6-&dir=phase-06&capture=1&res=2560x1440` (re-shoot after the overcast-sun / cloud fixes); review the clear vista (scattered cumulus), the overcast vista (no radial streaks), overcast and snowfall at dawn/dusk (no hard shadows); then `?bench=weather&res=2560x1440` with the display at 60 Hz; then ask the user to accept the Phase 6 gate.

## How to run

```
npm install
npm run dev                 # http://127.0.0.1:5173  (F1 or ` = dev overlay)
npm test                    # Vitest logic tests (102)
npm run alloc               # zero-allocation check of hot CPU paths in Node's V8
npm run capture             # build + 1440p photo-spot captures ×2 → screenshots/phase-01/, reproducibility + clipping report
npm run bake                # rebuild data/world/ from the seed (≈25 s); npm run bake:verify checks it is byte-identical
npm run heap                # build + idle-loop heap profile (game vs engine split)
npm run overlay-check       # dev overlay functional check + screenshots
npm run parity              # CPU/GPU height parity over 4096 points (gate: < 1 cm)
npm run build && npm run preview            # then, in Windows Chrome on the target:
#   http://localhost:4173/?bench=1&res=2560x1440        → idle/walk/fly bench, results in perf/runs/
#   http://localhost:4173/?bench=flight&res=2560x1440   → Phase 1 gate flight (surf + glide across the continent)
#   http://localhost:4173/?bench=weather&res=2560x1440  → Phase 6: each weather, a live transition, pack in a blizzard
#   http://localhost:4173/?shots=p6-&dir=phase-06&capture=1&res=2560x1440 → Phase 6 gate shots
#   http://localhost:4173/?shots=p7-&dir=phase-07&capture=1&res=2560x1440 → Phase 7 shots (monastery, hall, camp, shrine)
#   http://localhost:4173/                              → play: title, Begin (add &title=0 to skip the title)
node tools/capture/save-gate.mjs                        # Phase 7: marks → save → new page → load → checks
#   (add &gpuTimer=0 to skip GPU timing)
```

URL options: `?spot=<id>` applies a photo spot. `&capture=1` freezes the clock and skips the
loading fade. `&overlay=1` opens the overlay. `&snapshot=0` disables snapshot rendering. `&res=WxH`
locks the render resolution.

**WSL/Linux without a GPU:** the harness adds the SwiftShader flags automatically (DECISIONS.md).
`WRAITH_CHROME=<chrome or headless_shell>` uses a preinstalled browser build; `WRAITH_OUTDIR=<dir>`
builds and serves a separate output directory; `--query=postDebug=2` appends URL parameters.
The bundled Chromium needs libgbm, libasound and libwayland-server. On this box they were unpacked
without root into `~/.local/wraith-libs/root/usr/lib/x86_64-linux-gnu`, and the harness picks that
up automatically (override with `WRAITH_CHROME_LIBS`). With sudo: `npx playwright install-deps chromium`.

### Session — 2026-10-08 — Flow, navigation and quests (Phase 7 follow-up, user request)

- Compact story layout in the bake (monastery on a shoulder above the Warden's arena; the Shapers' Run, a graded banked 493 m chute with nine gates; camp/spring/watching stone/5 shrines/6 Echo stones/den within ~1 km). `npm run bake:verify` byte-identical.
- Navigation: `game/nav.js` registry, `ui/hud/compass.js` strip + waypoint, `systems/nav.js`; T cycles the tracked goal; Compass setting. Logged in DECISIONS.md (deviation from §12).
- Quests: graph gained optional objectives, variables, reveal and goals; `frost.json` rewritten (3 main + 5 side); `systems/trials.js` supplies the Run gates, verb stones, Echo stones, braziers, encounters and last-shrine respawn.
- To verify on the GPU: ride the Run (all nine gates light), wake the three hall stones, the hounds at the watching stone and the den, the compass at 2560×1440. Not built yet: light beacons, lantern, bell, robes.

## Session log

### Session — 2026-10-21 — review board and fixes (meadow and frost), branch `claude/wraithoftheunstill-phase-7`

- **Meadow Shaped (M8) and the hub (M10, buildings only):** Sedgerunner (flush), Hedgewarden (territory), Chanter (song, pollen curtains; `render/pollenFx.js`). Gale disperses pollen, and focus does not return inside it. The hub is at (−30, 1030): four turf-roofed stone houses, a mill with stilled sails (site `hub-mill-sails`, ready to spin on release), a market, a meadow shrine, 10 lamps (lit by night) and a hearth. Meadow sites carry no snow (`siteGlow.z`). Shots: `screenshots/shaped-1`, `pollen-1`, `hub-1`. Open: the turf roofs are CANVAS (a MAT.TURF is proposed); `world/architecture.js` is now 929 lines (split the hub into `world/hub.js`); the hub's NPCs and quests (`meadow.json`); a visible sightline from the border is not confirmed (the mill top clears the ridge by about 2.5 m on paper); `pois.json` `hub` still points at the old (−220, 580). The meadow Warden is chosen: the Bellwether (user, 2026-10-22).
- **Glide (Phase 8 M7, first pass): see PLAN.md M7 "Done".** Hold RMB in the air (off a ridge or a drop, or on an Updraft). Shots: `screenshots/glide-2/`. Found by the pose agent and not changed: the surf's extra cloth drag (1.3) is only ever set in `teleport()`, so it never applies while surfing; the robe may whip back less than intended. That is a one-line change, pending a look.
- **Gale (Phase 8 M6, first pass): see PLAN.md M6 "Done".** Gust (tap), Vortex (hold) and Updraft (heavy) on keys 1/2 to switch elements (try `?gale=1`, then 2). New brush programs FLATTEN and STRIP; the controller's `lift` (rising air, capped at 13 m/s); combat hooks (Gust shove, Vortex pull and tick damage, Updraft strike). Shots: `screenshots/gale-2/` (meadow and steppe: the lane, the ring, the column).

- **Local lights, the hall and the fire (PLAN.md V5/V6, Q5), shots in `screenshots/lights-1/` and `lights-2/`:**
  - **16 light slots** (`LIGHT_SLOTS`, shaders/common.wgsl.js; the terrain's own loops too): slots 0–3 are the verbs' and the carried lantern's (`frost.js` now clears only those), and slots 4–15 are **world lights**.
  - `systems/lights.js` fills slots 4–15 each frame with the nearest registered lights to the camera (insertion-sorted, faded over the last 25 m of a 90 m reach, flicker per kind: fire, candle, lamp, bounce). It also exports `nightAt(tod)`. Owners register once with `g.worldLights.add({…})` and move the record and set its `level`.
  - The architecture builder has `b.light(x, y, z, radius, r, g, b, intensity, kind)`, and `buildArchitecture` returns `lights` (site-local; tests).
  - **The hall:** a vigil brazier beside the bier, with flames and embers from the fire system and a warm light (radius 9). Four candle ledges on the back wall, 2–3 wax stubs each, with candle lights. A shroud on the bier, slates fallen under the broken roof, and a cold moon-and-snow bounce under the gap at night. The hall's embers burn via `siteGlow.w`, which lights embers without lighting felt from within. `rv-f04` (night) now reads: the floor, walls, bier and Aud are lit by the brazier, with cool snow under the gap.
  - **The camp:** the hearth is a registered fire light (radius 16, intensity 1.2 by day to 4.4 at night) instead of a borrowed spell slot. The flames are larger (1.25). The smoke is pale, thinning and forward-scattering instead of an ink-black column. A melted, wet hollow is pressed round the hearth (PRESS + WET brushes, re-stamped every 4 s near it). Lit braziers and the Veiled's carried lanterns are world lights too.
  - Open from V5: near-field sun shafts in the hall, motes in the beams, the carved bier detail, and glyph bands. Open from V6: soot (no state channel for it), and props from the scan set.

- **Review:** 25 new photo spots `rv-m01…14` (meadow) and `rv-f01…11` (frost), each aimed at a likely weakness: close character reads, night, blizzard and night fights, aerials, frost verbs on grass, swimming, the camp by day, the monastery wide. Shots are in `screenshots/review-2026-10-21/`. A five-member critique board (art, combat, UX, world, production) argued over them; its files were in the session scratchpad. Their consensus and the findings now open are listed below.
- **Fixed, with shots on the 3060 (`screenshots/verify-2/` all 25, `screenshots/verify-3/` meadow after the grass fix):**
  - **Waterline black band and the Wraith standing on a lakebed** were one bug. The lake mesh covers the bake's mask plus a border, but `levelQ()` read only the mask: on border texels (up to 2 m deep) the CPU said dry, so swimming never started and the camera clamp never ran. The camera sat under the surface, and SSAO turned the lower frame black (proved with `?postDebug=2|4`, `screenshots/debug-water-*`).
  - **Stair-stepped lake edges from the air:** the 4 m mask is coarser than the terrain. `render/water.js` now floods each lake's level into neighbouring texels whose real 2 m ground lies under it (up to FLOOD = 8), plus a one-texel rim (`levelAt` excludes the rim). Flooded river texels become lake. `levelQ()` reads mask → river → flooded. Shore fade widened to 0.25 m, with a faint foam fringe.
  - **Dark wedges in the mid-field grass:** the normal roll split each wide outer-ring blade into a lit half and a black half. The roll now fades past 3–15 m, and blades transmit about a third of the light on their shaded face. Root darkening, AO and edge darkening also fade with distance.
  - **The Wraith read as a black cut-out:** robe albedo lifted (0.135 → 0.18, mantle 0.098 → 0.13), a key-light rim, and a faint display-referred cool edge for night and interiors (cloth shader: the Veiled too). The hood interior is unchanged (BRIEF §8.1).
  - **Frost verbs on grass (BRIEF §4.4):** the brush pass now reads the bake material (`MATERIAL_AT` shared with healing). On turf, depth ×0.25, thrown mass ×0.06, Sweep and Ribbon leave frozen (rime), not wetness, and Crystallize frosts the turf without the permanent ice transform. Grass blades whiten with the frozen channel and thaw with it. Spawn craters on grass are now shallow (no black pits).
  - **Photo spots in a lake:** `p8-meadow-noon`, `rv-m01/03/04/07` moved from (−100, 1000) to (−10, 970), a dry rise.
  - **web-ocean (Noniv, MIT, cloned at `~/web-ocean`):** slope-derivative specular AA, distance roughness and the grazing reflection tilt in the water surface (ASSETS.md). It barely changes the look. The lake stripes from height are the beat of the analytic wave set (PLAN.md M5).
- **Tooling:** `tools/capture/win-shots.sh <prefix> <dir> [s]` takes supervised shots on the Windows GPU. It runs headless (works with the PC locked), uses a fresh profile per run, relaunches on no-start or stall, resumes at the first missing PNG, and closes its Chrome at the end. The first load after a rebuild is slow (shader compile).
- **Findings that stand (not fixed):**
  - The hall at night (`rv-f04`) is still mostly black and needs a light source.
  - Outer-ring grass blades are wide wedges (a geometry LOD issue).
  - Frost Shaped never spawn in the meadow in play (all encounters are frost-anchored): the meadow simply has no enemies yet (M8).
  - From the board: the meadow has no destination or landmark (hub M10, standing stones); no onboarding or controls page; no remapping or accessibility settings; telegraphs fail in blizzard and at night; the monastery reads as box primitives; the camp fire is a small white cone under black smoke.
  - Meadow perf on the 3060 is unmeasured at 1440p (bench with the user at the PC; locked-PC numbers are suspect).

### Session — 2026-10-09 → 10 — Phase 8 begins (Highland Meadow), branch `claude/wraithoftheunstill-phase-7`

- **Biome under the camera (M0):** the streamer samples the four biome weights at the camera; restoration and the grade blend by them (meadow stilled / restored looks). Meadow ground from eleven new CC0 scans, near and far samples, height-blended layers by landform. Photo spots `p8-meadow-golden`, `p8-meadow-noon`, `p8-meadow-stilled`, `p8-border`.
- **GPU grass (M3):** stateless blades built in the vertex shader in three camera-centred rings, placed by meadow weight, patches and slope, bent by travelling gusts, laid down by pressed ground.
- **Grown trees (M4):** pine, oak and birch from a seeded generator, eight variants each at two levels of detail, a leaf atlas drawn at load, scanned bark, translucent backlit leaves.
- **Tree cost:**
  - At render scale 0.7 on the 3060: meadow noon 23.4 → 14.5 ms; inside a grove 24.4 → 16.3 ms.
  - Bark and leaves are separate draws. The leaves have a depth prepass: the colour pass tests for equal depth and shades each visible leaf pixel once.
  - Detail switches at 55 m.
  - A tree that changes detail, or enters or leaves the 365 m edge, dissolves over 0.6 s. Nothing pops, and no dither remains at rest.
  - Tree shadows: cascade 1 gets shadow-only far-geometry copies of every tree within 155 m. Receivers in cascade 0 read cascade 1 for the trees.
- **God rays (M4b):** a forest haze under the canopy is lit through the crowns by the shaft march (its own ratio). Under a full canopy, exposure lifts up to +1.4 stops. Canopy cover is a weighted count of the trees within 45 m. Photo spot `p8-forest-shafts`.
- **Forest floor, light under the crowns, ground cover, the grass parting (user: "the forest floor … is pretty vacant", "quite dark in the forest", "ground coverage of the meadow", "pushing some grass over"):**
  - **Canopy map:** a world crown-cover map (2048² at 4 m, built once at load in 97 ms from the tree placement) feeds four things.
    - Light: under the crowns the open sky is partly hidden and a warm-green fill comes off the sunlit leaves. This applies to the ground, the grass, the trees, the cloth and the ground cover.
    - Ground: the forest-floor, litter and moss scans replace the turf under the crowns.
    - Grass: it thins and shortens under the crowns.
    - Ground cover: it picks its kinds from the map.
  - **Ground cover:** a new stateless GPU ring of 84² cells at 0.6 m, each item built from cards on a ground-cover atlas drawn at load. It has drifts of fallen leaves, needle litter, twigs, ferns, sorrel, moss and bracken at the forest's edge. The open meadow gets daisy, buttercup and bellflower clumps, clover, plantain and pebbles, in patches. Ferns and flowers sway, and they lean away from the Wraith.
  - **Grass push:** blades within 1.3 m of the Wraith, and of an 8-point trail behind it, lean away and spring back over ~2.5 s.
  - **Found:** a WGSL uniform written `array<vec4f, 8>` (with a space) silently never received data from Babylon. It must be written `array<vec4f,8>`.
  - **Perf** at 0.7: `p8-forest-floor` (new spot) 15.8 ms, `p8-forest-shafts` 16.7 ms, meadow noon 14.9 ms. The ground cover costs ~0.6 ms. The meadow ground skips the turf layers under a full canopy.
- **The rest of the list (user: "continue working through the list"):**
  - **Trunk collision:** trunks, stumps and logs within 26 m join the rock solids. Logs block like low rocks, so thin ones are stepped over. Checked in the browser: the Wraith placed inside a trunk is pushed out to radius + capsule.
  - **Shrubs and logs:** tree cells left empty may grow a shrub (several arching stems, dense leaves) or, in groves, a fallen log or a stump. Logs follow the ground under every vertex.
  - **Motes and pollen:** 4000 stateless points that glitter only where the sun reaches them.
  - **The frost↔meadow border:** it breaks into crisp, torn snow patches with a straw-coloured melt band, the same in the terrain, the grass and the ground cover; grass tufts come up between the patches. `p8-border` now stands on the actual border.
  - **Perf at 0.7:** `p8-forest-shafts` 17.0 ms (just over the 60 fps floor), meadow noon 15.3 ms. Giving the terrain the cheap shadow lookup changed nothing (16.0 vs 15.8 ms), so its shadow filter is not where its ~5 ms goes; it needs a proper profile (vertex count, the material layers).
- **Since then:** the terrain profiled and its shadow passes slimmed (grove 15.6 ms, meadow noon 14.05 ms); mossy rocks on the meadow; **the wind field (M1)**: grass, trees, ground cover, motes, cloth and sound all read one deterministic field of travelling gust fronts plus injectable bursts; debug map toggle; tests.
- **Next step:**
  - M5 rivers, M6 Gale verbs (bursts are ready for the Gust);
  - (done) profile the terrain shader;
  - cheap stand-ins for distant trees if the budget needs them;
  - mossy boulders in the meadow (the rocks are frost-only);
  - Phase 8 M1 wind field, M5 rivers, M6 Gale verbs onward (PLAN.md).

### Session — 2026-10-09 — Phase 7 visual pass (user: "extremely high graphics quality"), branch `claude/wraithoftheunstill-phase-7`

- **Plan:** `PLAN.md` (art bar from the user's reference `screenshots/reference/forest-ruins-target.webp`, the quality foundation Q1–Q6, the frost visual pass V1–V9, the Phase 7 close-out, Phase 8 milestones with the reworked meadow Shaped). Audit shots before the pass: `screenshots/phase-07-audit/`.
- **Built** (commits 981e304 … 2bf8f48; DECISIONS.md "Phase 7 visual pass"): a stilled look without the grey veil (valley fog, 22° ice halo, hanging snow, silver/steel grade); robes that read as wool and snow bounce in the sky SH; scanned CC0 PBR materials (`tools/textures/build.mjs`, `src/materials/library.js`, `shaders/materials.wgsl.js`); laid masonry with chamfered blocks, paving, drum columns, ruined tops, lost blocks, snow drifts and snow pillows (`world/masonry.js`); the monastery's buttresses, cornice and hall interior; felt tents, sleds, packs, hearth and GPU fire (`world/camp.js`, `render/fire.js`); fire and spell light on robes and stone; scanned rock on outcrops and cliffs; the Warden as an old glacier; carved staffs and lanterns; three robes with a journal page (`game/robes.js`, `systems/robes.js`).
- **Verified on T (RTX 3060, Windows Chrome headless via `tools/winchrome/`):** every spot loads, 0 late pipelines, robes swap on the Wraith, fire burns at the hearth; shots in `screenshots/phase-07-visual/` (p7 spots, Warden, pack, steppe stilled/restored, the halo, a stilled overcast, before/after). Tests: 150 pass.
- **Performance (PERF.md):** +1.1 to +1.9 ms on the GPU frame at 1440p; the 3060 was already at 15–18 ms native on these views — 90 fps needs render scale + TAAU (PLAN.md Q6), not built.
- **Open (honest):** frozen ridge plumes; the far peaks' soft rock smudges; the lesser Shaped's glassy look; the monastery plinth from below; masonry/outcrop LODs; render scale + TAAU; the rest of the Phase 7 close-out (Echo stones 3 and 6, Run medal times, a load mid-escort, barks, journal sketches, story review, re-shoots of p6, the user's play-through gate).
- **Later the same day:** temporal upscaling at render scale 0.7 + creature/rock culling → 10.7–13.2 ms on the 3060 at 1440p (PERF.md); ambient barks; the bestiary with sketches; robes; Echo stones 3/5/6 completed in the browser (stone 3's surf trial moved to stone 5); Run medals set from scripted rides; save/load mid-escort fixed; Phase 6 re-shoot on T (`screenshots/phase-06/`, 21 spots, no regressions). Tests: 151.
- **Phase 7 gate status:** everything the agent can do is done; what remains is the user's: the story review of `data/quests/frost.json` (dialogue, barks, bestiary and robe texts are drafts) and the play-through from waking to the Warden's release, save, quit, reload.
- **Next step:** the user plays the chapter (`npm run build && npm run preview`, `http://localhost:4173/`) from waking to the release, saves, reloads; and reviews the story text. Then Phase 7 closes and Phase 8 begins with PLAN.md M0.


### Session — 2026-10-09 — Hybrid Warden fight and quest rework (user request)

- **Warden fight** (commit ca2ea6e; DECISIONS.md "Hybrid Warden fight"): crystal pillars that heal it (climb, strike), then seams and chips; a 15 s ice-spike barrage only stone stops (cover walls, pillars, its belly); frenzy at 30 % calls brutes, hounds and ≤ 2 seers; dying resets the fight to the dormant Warden. Tests: `tests/wardenFight.test.js`.
- **Quests** (commit 110af3c; DECISIONS.md "Quests rebuilt around play"): `data/quests/frost.json` rewritten (5 main incl. epilogue, 5 side; every line a draft for review); new systems `encounters.js`, `echoTrials.js`, `flame.js`, Tobin's escort in `npcs.js`, the seedling in `wardenFight.js`; the den mother archetype. Tests: `tests/chapter.test.js` rewritten (9).
- **Verified in Windows Chrome (real GPU) via `tools/winchrome/`:** pillars rise, climb + mantle + strikes break the ward; barrage: 0 damage behind a wall, ~45 in the open; frenzy summons; death resets; seedling: 0 damage behind the watching stone, 25 in the open; camp raid waves; escort to the fire → Echo; Echo stones 1, 2, 4, 5; sled → hound tracks → den waves → den mother armour; flame → four braziers → Isolde's song; re-forming at the arena brazier; save/load keeps quest state. 0 late pipelines. Shots: `screenshots/phase-07-fight-quests/`.
- **Not verified by play:** Echo stones 3 (surf a circle) and 6 (Ribbon reach), the Run medal times (34/40/48 s are guesses — the user should ride it), the feel of the fight at full speed with a human player.
- **Known rough edges:** the cover walls and the sled are plain block geometry (readable, but simpler than the monastery); the Warden looks glassy-blue while its glow is up (existing shading); a load mid-escort restarts Tobin at the spring only on a fresh page.



### Session — 2026-10-04 — Phase 6 (post, weather and time polish, frost)

**Machine:** a cloud container (4 cores, no GPU) — not T. Headless Chromium 1194 on SwiftShader via
`WRAITH_CHROME=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` (the
bundled Playwright wants a newer build) and `WRAITH_OUTDIR=/tmp/...` so concurrent runs never share
`dist/`. A 480×270 spot takes 11–22 min. No timings were taken; no gate shots were committed.

**Built:** see "Phase 6 built" above.

**Defects found and fixed from the software shots:** a black outline on far silhouettes, bisected
with the new `?postDebug` views to the SSAO upsample: sky AO texels stored their distance as 1e6,
which is ∞ in half float, so every weight at a silhouette was 0 (on the way: a NaN from SSAO taps on
sky, TAA history undershoot needing a min/max clamp, and SSR self-hits landing on sky — all fixed); overcast/blizzard over-exposed; peaks visible through
a blizzard (fog layer too shallow); crisp sun shadows under a snowing deck.

**Environment notes:** in this container one logic test fails (`Math.f16round` needs Node ≥ 24; the
target's Node has it) and `npm run alloc` reports the same three pre-existing controller/spring-arm
failures with and without this session's changes (Node 22 here).

### Session 5 — 2026-10-03 — Phase 2 (Frost Steppe look-dev), in progress

**Built** (commit 4b85253 plus later work; rationale in DECISIONS.md "Phase 2")
- **Snow material** (`src/shaders/snow.wgsl.js`):
  - four-scale wind-stretched detail normals faded by pixel footprint;
  - wrapped diffuse plus blue back-scatter subsurface, and a cold-shifted sky IBL;
  - soft sheen, and stable glints at grazing views;
  - blue ice scoured on steep windward faces; snow-dusted frozen-lake ice;
  - triplanar rock strata, with snow re-accumulating on upward faces.
- **Frost sastrugi** in the render-only micro height layer, on the fine levels only.
- **Sky IBL:** L2 spherical harmonics of the live sky plus a ground bounce, computed in the ambient pass. Eye adaptation compensates for snow's albedo using the frost weight at the camera.
- **PCSS soft shadows** with a receiver-plane bias and white-noise rotation.
- **Deformation:**
  - the clipmap is displaced by the terrain state, its normals come from the state field, and the shadow casters displace too, so trails self-shadow;
  - packed snow, occluded trail floors and chunky berms;
  - a swept-capsule brush with a queue, player footprints, and photo-spot trails.
- **Spindrift ground blow** (GPU, stateless, shadowed).
- **Rock outcrops:** thin-instanced noise-displaced rocks with snow accumulation; they cast shadows.
- **Photo spots:** Phase 2 frost spots at dawn, noon, dusk and night, plus a sunlit trail close-up (`hidePlayer`, `trail`). Compositions were chosen with an offline sun-visibility search over the bake.
- **`?shots=<prefix>`:** in-page gate captures on the target GPU, uploaded to `screenshots/<dir>/` by the preview server.
- **Art controls:** glint intensity, deformation depth and refill rate are wired. Haze default raised to 4.5.

**Defects and open items**
- **Not yet on T:** the gate screenshots and the Phase 2 flight benchmark. The GPU cost of PCSS, the snow material, rocks and spindrift is unmeasured.
- **Live healing is decay only** (no diffusion), and the debug writer stands in for real feet until Phase 3.
- **Rocks:** no collision.
- **Fog:** valley fog is deferred to Phase 6, which also brings frame-metered exposure (the frost compensation is a stand-in).
- **Software-GPU captures are very slow** (10–17 min per 640×360–960×540 spot), so iteration happens at 640×360.

### Session 4 — 2026-10-02 → 03 — Phase 1 (World skeleton)

**Context:** the user approved Phase 1 after reviewing milestone 1 (the bake). They were remote late in the session, so the target flight benchmark couldn't run.

**Built** (commits a719f0a, 650350c, cfef900, f01554f; rationale in DECISIONS.md "Phase 1")
- **Bake** (`tools/bake-world/`, `npm run bake`, `bake:verify`): a deterministic 8 × 8 km continent, byte-identical, about 25 s.
  - Coastline, regions, eroded ranges and the volcano.
  - Hydrology: priority-flood, D8 accumulation, region-aware lakes and rivers.
  - Soft biome weights, surface materials, wind climatology and POIs.
  - Heights: 2 m in 256 tiles, plus an 8 m overview.
- **Streaming and collision** (`src/world/`):
  - the world worker fetches and decodes the bake, streams tiles (velocity-predicted, one upload per frame) and computes collision patches;
  - residency versioning keeps CPU and GPU on identical texels;
  - teleports wait for up-to-date collision.
- **Clipmap** (`src/render/clipmap.js`, `shaders/clipmap*.wgsl.js`):
  - 12 levels × 256², 6.25 cm to 128 m, one thin-instanced draw;
  - compute writes heights and normals only for dirty levels;
  - geomorphing, and covered interiors sink instead of being discarded.
- **Height parity:** macro (Catmull-Rom over 2 m) plus shared per-biome directional meso layers (`terrain/meso.js` ↔ `terrainNoise.wgsl.js`). `npm run parity` measures max 0.577 mm.
- **Atmosphere** (`render/atmosphere.js`, `shaders/atmosphere*.wgsl.js`):
  - Hillaire 2020 LUTs in compute, with sky-view for both sun and moon;
  - aerial-perspective froxels, plus GPU key/ambient and eye adaptation;
  - day and night, with a stylised blue moonlit night.
- **CSM** (`render/shadows.js`, `shaders/shadows.wgsl.js`):
  - 4 cascades, 2048² R32F, texel-snapped, 16-tap PCF, cascade blends;
  - fixed the Y-flipped render-target convention, which caused mirrored false shadows at high sun;
  - one cleared pass per cascade (snapshot rendering had made it two).
- **Distant mountain ring** (`terrain/mountainRing.js`, `render/mountainRing.js`, `world/ring.worker.js`): an impostor range 12–28 km out, built on a worker; far plane 40 km.
- **Terrain state** (`src/terrain/state/`, `shaders/terrainState.wgsl.js`):
  - **fine window:** 4092² at ~2 cm, toroidal and snapped;
  - **coarse pages:** 128 m at 25 cm, 48 slots;
  - **streaming:** strip downsample and refill, decay healing, LRU eviction with GPU readback, serialisation on `state.worker.js`, and closed-form healing on reload;
  - **debug writer:** "stamp trail" toggle (overlay → Terrain); the clay view shows marks;
  - **verified in the browser:** stamp 0.120 m → coarse page 0.119 m → evicted → reloaded after 300 s at 0.041 m (decay plus diffusion as expected);
  - **tests:** 17 in `tests/terrainState.test.js`.
- **Tooling:**
  - the flight benchmark (`?bench=flight`, `src/core/benchFlight.js`);
  - the GPU timer now times every pass (frame, main, shadow, compute);
  - the overlay shows state pages;
  - captures fail on GPU validation errors and wait without timeout;
  - tool outputs default to `screenshots/phase-01/`.

**Verified** (machine W)
- Tests: 52/52. `npm run alloc`: 9/9. `bake:verify`: byte-identical.
- Overlay check: 9/9, no late pipelines. Parity: PASS (0.577 mm).
- Captures: 8 spots, byte-identical across two loads, 0 % clipped.

**Measured performance**
- **Target T:** nothing yet. **The Phase 1 gate (the flight benchmark) has not been run.**
- **Structure:** 12 draws, 2.11M triangles, 678 MB GPU, 20 pipelines, 0 late (PERF.md).
- **The allocation profile was not re-run.** SwiftShader now takes ~3 s per frame, so a valid warm-up isn't feasible on W (PERF.md).

**Screenshots** (`screenshots/phase-01/`, 2560×1440, clay view, machine W): see the table below.

| File | Shot | Mean luma | Clipped |
|---|---|---|---|
| `p1-monastery-golden.png` | Monastery ridge at golden hour: long capsule shadow, ring on the horizon | 112.3 | 0% |
| `p1-meadow-noon.png` | Hub uplands at noon, toward the northern ranges | 127.9 | 0% |
| `p1-dunes-golden.png` | Dune basin at golden hour: dune shadows across the basin | 84.7 | 0% |
| `p1-volcano-dusk.png` | Ash plain toward the volcano at dusk (dark: see defects) | 25.4 | 0% |
| `p1-mire-dawn.png` | Mire lowlands at dawn (dark: see defects) | 25.7 | 0% |
| `p1-coast-noon.png` | South coast dunes at midday: short noon shadow | 158.7 | 0% |
| `p1-frost-night.png` | Frost plateau by moonlight | 119.1 | 0% |
| `p1-vista-continent.png` | Free camera over the continent with the mountain ring | 85.3 | 0% |

Also in the folder: `capture-report.json`, `overlay-open.png`, `overlay-late-pipeline.png`, `overlay-check.json`, `parity-check.json` and `bake-preview.png`. All 8 shots are byte-identical across two fresh loads.

**Unfinished**
- **The Phase 1 gate run on T (flight benchmark).** Until it runs, the gate is not met.
- The allocation profile with the Phase 1 frame. It needs either the real GPU or a lighter profiling mode.
- **Terrain state:**
  - live diffusion; for now resident pages only decay (Phase 2, with real writers);
  - persisting evicted pages into save slots (Phase 2);
  - real writers (Phase 2).
- **Shadows:** PCF only (PCSS/contact hardening comes in Phase 2 with berms); no per-cascade level culling.

**Known defects (clay view)**
- Dusk on dark ash (p1-volcano-dusk, luma ~25) and dawn in the mire (p1-mire-dawn, luma ~26) read very dark. Low key light on dark albedo, and there's no sky IBL yet (Phase 2 look-dev).
- Beyond the bake, the continent's east and north edges fall to the sea as sheer walls (edge falloff); the vista shows them. The ring hides most of this from the ground.
- The sea is a flat dark clay colour until Phase 12.
- The debug stamp writer leaves scalloped grooves (overlapping round stamps). Phase 2 replaces it with swept brushes.
- Carried over from Phase 0: about 1 frame in 570 drops while walking (CPU or compositor side). Re-check it in the flight benchmark.

### Session 3 — 2026-10-02 — Phase 0 (target change and real-GPU measurement)

**Context:** the user retired the 5070 Ti target. This PC (RTX 3060) is now the target, at 1440p / 60 FPS.

**Built**
- `src/core/gpuTimer.js`: GPU main-pass timing through WebGPU timestamp queries.
  - Hooked into the frame-path overrides in `babylonTweaks.js`.
  - It samples every 4th frame and costs nothing when off.
  - The engine requests the `timestamp-query` feature.
- `src/core/bench.js` (`?bench=1`): an in-page benchmark run in the player's own Chrome.
  - Phases: idle, walk with camera orbit, and a fast fly-over.
  - Reports presented and GPU statistics, hitch timelines with neighbouring frames, page events and heap.
  - Shows a styled results panel and POSTs the JSON to the local server.
- `vite.config.js`: dev/preview middleware `POST /__wraith/perf` → `perf/runs/<date>.json`.
- **Fixed:** the game never handled window resizes. `?res=WxH` now locks the render resolution, and render scale applies on top of either mode in one sizing function.

**Measured** (target T, production build, render 2560×1440, 4 runs in `perf/runs/`):
- GPU main pass: idle 1.6, walk 1.8, fly 1.2 ms median; p99 ≤ 2.8 ms.
- Presented FPS is ~170 (display refresh), with 1% lows of ~159.
- The SwiftShader allocation re-verification still shows 264 B/frame, all WebGPU floor (game 0).

**Defects**
- About 0.07% of frames land one refresh late (11.1–11.9 ms at 170 Hz), mostly while moving. It's not caused by the GPU timer, GC or page events. The benchmark now logs neighbouring frames to tell a real drop from a late callback.
- Run 1, windowed, had 15 idle-phase stalls up to 52.6 ms. They didn't reproduce in three fullscreen runs and can't be attributed.

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
| Clock running | 265 B/frame | 0 | 0 (29 B later shown to be `writeBuffer`, i.e. API floor) | 224 + 29 | 12 |
| Clock frozen | 236 B/frame | 0 | 0 | 225 | 11 |

Captures are still byte-identical. Tests 34/34, alloc check 9/9, overlay check 8/8.

**Then (same session, after the user accepted the WebGPU floor):**
- Chased the 29 B/frame seen when uniforms change. Profiling a stepped copy of `UniformBuffer._updateOwnerKeyed` and two upload-path overrides showed the bytes always sit at the `queue.writeBuffer` call site. A warm `writeBuffer` to a buffer no pass uses costs nothing; to a buffer in use by bundles it costs ~31 B. Classified as API floor. The experimental overrides were removed.
- Added the design rule "one `writeBuffer` per frame for all per-frame uniforms" (DECISIONS.md).
- `overlay-check.mjs` now also verifies that a live slider change alters the rendered frame (9 checks).
- Final: 265.5 B/frame with the clock running and 236 B/frame frozen, all API floor. **Gate met.**

**Unfinished**
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

Start **Phase 3 — The Wraith** (BRIEF §17, §8.1). Carry these rules forward:
- no doubles as call arguments in hot code;
- one params write per system per frame;
- warm every pipeline during loading;
- gate shots and benchmarks run on T via `?shots=` and `?bench=flight` at 60 Hz;
- rebuild after editing `data/photo-spots.json`.

- Phase 8 M11 (rain and thunderstorm): see PLAN.md "M11 Done" and DECISIONS.md. Rain/storm states, rain renderer, wet world, lightning, thunder; shots in screenshots/rain-final.


28 October D1b checkpoint: `codex/dune-grade` at `69f8bb8` (worktree `/home/sol/wraith-dune-grade`) now includes distance-normal retention and sandstone restricted to the baked rock mask; the initial slope-only bands were rejected. Shared 12 m strata value leaves the bake unchanged. Full suite 783 passes and production build passes; 5 cold scout + 18 lighting-matrix views at 1280×720 have zero GPU errors/late compilation. Sixteen matrix frames have no RGB channel >=253; sunset-facing mid frames measure 0.814% / 2.835%, including sun/sky. Still IN PROGRESS, unintegrated: wet-sand regression, terrain-only sunset clipping, a measured unobstructed 2–4 km view, sustained target-resolution timing and human aesthetics. Canyon sawteeth remain D7b geometry. See its `docs/phase-9/dune-grade-review.md` and JSON/captures. Bot stopped and C: profile cleared; no temporary data remains on D:. C: free space verified about 121 GiB; Medal absent. D2/D9b gates remain unchanged.
