# Wraith of the Unstill — project work report

**Prepared: 30 October 2026, Australia/Sydney.**

This report consolidates the work carried out during this Codex continuation, including implementation, reviews, tooling, machine recovery, validation and pushed prototypes. It records the latest verified state rather than treating every historical handoff entry as current. Test counts and performance figures below are historical results from the named checkpoints; they have not been rerun merely to produce this document.

The full Phase 9/handoff goal is **not finished**. Several substantial features are implemented on separate branches but remain disabled or unintegrated. Human enjoyment, final visual quality and sustained whole-world performance have not been signed off.

## 1. Current repository and checkpoint map

All WSL project data remains on the normal C: drive. WSL paths below are Linux paths inside Ubuntu, not a move to another Windows drive.

| Area | Worktree | Branch | Latest verified implementation/evidence checkpoint | Integration state |
|---|---|---|---|---|
| Main game | `/home/sol/WraithOfTheUnstill` | `claude/wraithoftheunstill-phase-7` | `03f9243` handoff; source includes `18bd3ba` | Accepted slices integrated; full phase unfinished |
| Desert storm | `/home/sol/wraith-light` | `codex/desert-storm` | `ec27b3d` | Pushed prototype; natural storms disabled |
| Dune relaxation/crests | `/home/sol/wraith-relax` | `codex/dune-relaxation` | `e44d9af` | Pushed; disabled and unintegrated |
| Sand surfing | `/home/sol/wraith-surf` | `codex/sand-surf` | `e5d4555` | Pushed; sand grant locked by default; unintegrated |
| Dune casters | `/home/sol/wraith-shaped` | `claude/dune-shaped` | `0dc2fa3` | D9b prototype pushed; unintegrated |

The commit that adds this report is newer than this table. Feature checkpoint hashes identify the underlying work and do not change when this documentation is committed.

## 2. Access recovery, storage cleanup and recording control

- Investigated disk use and the Windows/WSL access problems before resuming development. Project access was recovered following an authorized Ubuntu/WSL restart; later work used the existing Windows Chrome/GPU path without requiring the user to be home.
- Inventoried approximately **121.75 GiB** of Temp data, largely old Wraith headless Chrome profiles, and **4.41 GiB** of NVIDIA DX cache.
- Uninstalled **Medal** through its registered uninstaller. The recorded verification found both its installation directory and uninstall registration removed. Recording workloads were stopped for GPU measurements; Medal recording was not restored.
- Selected **561 inactive automation profiles** for cleanup. Three locked/skipped entries remained. The recorded final C: free-space result was approximately **121.4 GiB** at that checkpoint; this is not a current free-space measurement.
- Added bounded cleanup to bot and screenshot launchers to prevent profile accumulation. Cleanup validates the Temp root, known Wraith prefixes, Chrome metadata, active processes and reparse points. A native filesystem fixture verified owned-profile removal, preservation of unrelated data and rejection of malformed prefixes.
- Fixed capture launchers so interrupted screenshot work closes its owned browser processes.
- Removed task-created temporary D: profile/archive data after the user specified **C: only**. No ongoing project storage was moved to D:.
- Preserved source, the distro, raw game captures, unrelated personal Chrome data and local-model files.
- **Adobe was not fully removed.** Creative Cloud remained installed; `C:/adobeTemp`, approximately **5.60 GiB**, remained protected by its ACL. No privilege/security workaround was used.
- Two old WSL crash dumps, approximately **7.58 GiB**, remained after automatic approval review rejected their deletion. NVIDIA cache was retained to avoid unnecessary shader recompilation once profile cleanup provided space.

Evidence: main `docs/phase-9/disk-cleanup.md`; relevant commits include `1978f46`, `2ca4707` and `4beb7bb`.

## 3. Initial handoff recovery, encounter review and D1a sand integration

The game already contained its core world, weapons, economy, Stone verbs and earlier phases. Those inherited systems are not claimed as newly built in this continuation. Work here reviewed, repaired, extended and integrated the unfinished branches described by the handoff.

### Encounters

- Continued the encounter audit and fixed whole-wave/lifecycle accounting, encounter site ownership and release/death behavior.
- Corrected bot routing around Barley collision stalls and preserved failed runs.
- Verified staff plus starting Frost clears for the cloister, stair and ring, three repeats each. Barley repeated clears spawned all six intended enemies and reached a 60-second calm state.
- Produced isolation films for surfing (**120 seconds**), gliding (**60 seconds**) and combat (**12 seconds**), committed at 720p/60 under `screenshots/isolation/`.
- Integrated the reviewed encounter work into main. Bot completion is not a human-enjoyment or all-weather readability verdict.

### D1a sand material

- Reviewed close/noon/golden/rain-stage captures and corrected the weak fully-wet response using exposure-controlled readback.
- Fixed independent rain, wetness and puddle photo overrides, including valid zero overrides; bounded drying wetness to `[0,1]`.
- Preserved all 229 original photo spots while adding the sand review spots with unique IDs.
- Recorded revised dry/wet foreground luminance averages of **148.337 / 106.712**.
- Integrated the reviewed near-sand material and wet response. The fixed-view GPU delta of approximately **+1.55 ms** did not establish sustained performance acceptance.

### D9a Skitters and Plate-backs

- Finished and integrated the first dune enemy slice described by the continuation tracker.
- Replaced a hollow warning Ridge with one filling MOUND brush; GPU readback confirmed approximately **+0.355 m** relief.
- Prevented frozen warnings from stamping terrain or emitting warning dust, and raised dust above the mound.
- Captured six fresh review views and removed an unused boxed rig result. A mixed-pool CPU diagnostic dropped from **608 to 19 collections per 100,000 simulated frames**; full-path zero allocation was not claimed.

The combined main checkpoint reported **775 tests/build** before subsequent dust and desert work.

Evidence: main `docs/encounter-audit.md`, `docs/phase-9/sand-review.md`, `docs/phase-9/dune-shaped-review.md`, `docs/phase-9/implementation-status.md` and the detailed historical sections in `HANDOFF.md`.

## 4. Requested windblown sand and disturbance dust — integrated

Implemented the requested subtle dust lifting out of sand and blowing with the wind, independently of the unfinished storm/relaxation work.

- One static transparent draw contains **1,536 wind wisps** plus **24 bounded disturbance events × 24 particles**, totaling **2,112 quads**.
- Successful footprint and terrain brush writes produce rising, dispersing puffs. Wet/freeze paint and empty writes do not create disturbance events; restore clears old puffs.
- Sources use baked sand/beach masks, actual fine terrain wet/frozen/transformed state, rain wetness and the existing shared wind, atmosphere and shadows.
- Stilled/restored Dunes control ambient ground blow independently of Frost restoration. Disturbances remain readable in stilled sand.
- Added a developer sand-dust toggle and loading-time pipeline warm-up.
- The actual shader-body GPU material oracle reported dry emission **1**, partial rain suppression, and **0** for fully wet, frozen and non-sand samples. An earlier image-only test was inconclusive and remains labeled as such.
- Reviewed five stills and a six-second 720p/60 film. Indicative paired 1440p costs were approximately **+0.201 / +0.215 ms**; the approximately 17.96 ms baseline already exceeded a 60 fps budget.
- Added bounded-event/filter/reset regressions. This checkpoint passed **783 tests**, including five preserved local-LLM tests, and the locked build.

Commit: `364898c`. Evidence: main `docs/phase-9/dust-review.md`, `tools/bot/sand-dust*.mjs`, `screenshots/sand-dust-review/`.

## 5. D1b dune grade, distant normals and sandstone — integrated

- Gave the Dunes an independent restoration grade/local wind state.
- Refined distance normals and sandstone placement using baked geology rather than applying the material indiscriminately.
- Polished dune highlights and irregular rock strata while retaining wet/dry differentiation.
- Reviewed real GPU-depth-selected views at approximately **2–4 km**, including noon, golden hour and night; measured surface clipping and fixed-scene 1440p cost.
- Integrated the reviewed feature with main merge `a17d1e8`, including `5516a6f`.
- Main passed **789 tests/build** and a fresh native 2560×1440 cold launch without GPU errors/late pipelines in that check. Static close/mid/canyon medians were approximately **15.1 / 11.3 / 12.6 ms**.

Canyon sawteeth, cold-erg transition, human aesthetics and sustained combat/weather/streaming remained open. Evidence: main `docs/phase-9/dune-grade-review.md`.

## 6. D2 dune relaxation, crests, collision and persistence — disabled prototype

Implemented and iterated the physical sand-relaxation prototype on `codex/dune-relaxation`.

- Added a pure CPU reference and bounded GPU fine/coarse relaxation using conservative equal-and-opposite Jacobi transfers, dry/wet repose behavior and frozen/non-sand/transformed barriers.
- Reused existing clipmap base heights, respected storage-binding limits and warmed compute passes before play.
- Added half-float rounding-error feedback and tested repeated packed cycles rather than treating finite precision as exact mass conservation.
- Built bounded dirty scheduling, larger-writer capacity, expiry handling and tighter directional brush bounds.
- Implemented persistence/reload checks, including actual minute-old trails, page serialization, fresh-page/IndexedDB checks and reload without an extra brush.
- Built bounded asynchronous collision streaming with three in-flight reads/four reusable CPU arrays, serial/generation protection and reusable GPU staging.
- Improved centre-first clipmap density and analytic crest normals; measured CPU/GPU height parity and reviewed crest motion rather than judging only a still image.
- Tested real Ridge walking, synthetic fast travel and eight-body stress. Selected earlier runs held snapshot age below approximately **0.2 seconds**; final stress samples were below approximately **0.163 seconds**.
- Diagnosed overlapping full-size Ridge failures instead of accepting a small isolated mound as sufficient. Preserved the failed 43.29°, 36.90°, 34.59° and 34.1029° trials and the invalid stale-runtime run.
- Final `e44d9af` conservative **1/8** rate reached approximately **34.0055°** for the overlapping Ridge oracle after **246 simulated seconds**, passing the unchanged **34.1°** tolerance. Dry/wet/frozen parity and 100-cycle packed drift checks passed.
- Final checkpoint passed **819 tests/build**.

**D2 remains disabled and unintegrated.** Three warm stress maxima near **0.187 ms** did not erase a fresh-browser **0.492544 ms** result, which fails the unchanged **0.4 ms maximum compute gate**. Allocation acceptance and steep boundary-seif aesthetics remain open. Earlier allocation measurements improved but were not zero.

Evidence in `/home/sol/wraith-relax`: `docs/phase-9/relaxation-review.md`, `crest-review.md`, and retained JSON/capture fixtures. Important commits: `858854c`, `a144854`, `1c98263`, `e44d9af`.

## 7. D9b Whirlers and Glass-sworn — unintegrated prototype

- Implemented two material-driven dune archetypes within the existing eight-creature cap, shared shot pool and bounded visual pools.
- Whirlers warn through a tightening column/core, fire aimed sand clots and create bounded traveling dust devils that write actual PLOUGH scars. Frost and Gale provide existing-verb responses.
- Glass-sworn use existing lunge/pack behavior, armor and thermal shock responses. Fixed an existing frozen-armored damage path that incorrectly nullified ordinary weapon damage; added regression coverage.
- Added a bounded powder draw, dust veil, thinner normal grains, frozen pillar/debris handoff, pose/trigonometry caching and clearer warning-heart presentation.
- Ran single/mixed fights with staff/Frost and alternate material answers, retained failed capture/profile experiments, and corrected capture snapshot/resize handling.
- Produced thirty later-grade day/golden/night captures and two **420-frame** caster films with no GPU/late errors in those checks.
- Six live eight-body clear day/night measurements at native 1440p output/0.7 internal reported approximately **71–75 fps**, with 1% lows around **63–66 fps**.
- Latest checkpoint `0dc2fa3` passed **792 tests/build**.

**Not integrated.** Warm browser attribution still measured approximately **28.49 B/frame** for the feature. The glass refracts atmospheric sky, not the full scene. Full scene refraction, storm/surf readability, wider encounter pacing and human play remain open.

Evidence: `/home/sol/wraith-shaped/docs/phase-9/dune-casters-review.md` and `screenshots/` review artifacts.

## 8. D3 sand surfing — unintegrated prototype

- Extended the existing Surf/CapsuleController through a material tuning table rather than adding another controller, input or HUD.
- Added prototype sand acceleration, gravity, grip, lean and slip-face behavior, with a **32 m/s** downhill cap and momentum-preserving material transitions.
- Fixed glide-to-surf landing ownership so a fast landing does not recover a stale lower speed; the regression benefits the shared controller.
- Added sand wakes through actual terrain writes and fixed riding the wake's own front berm. A controlled run improved from approximately **5.05 to 13.36 m/s** while retaining collision.
- Added wet loose-spray suppression/shallow cuts, frozen metadata/refresh and a GPU frozen-crust PLOUGH guard. Final wet/frozen input tests recorded the expected suppression; actual frozen versus dry height changes were **0 versus approximately 0.199951 m**.
- Added procedural grain hiss/low rush using **six persistent AudioNodes**, driven by speed, carve, wetness, frozen state and contact. Offline renders and actual running-mixer routes checked silence, stop tails and material response. Human listening was not signed off.
- Produced three input-driven authored slip-face films, **720 frames each**, rather than only seeding a speed for profiling. Film peak speeds were approximately **24.635 / 17.509 / 16.937 m/s**.
- Separate actual 1440p/0.7 600-frame runs averaged approximately **61.16 / 61.06 / 60.40 fps**, with GPU means **16.118 / 16.193 / 16.324 ms**. This leaves little headroom and is not D12 acceptance.
- Latest feature checkpoints include `12744b2`, `0996ef4`, `9f5740a`, `e5d4555`; the full suite reached **833 tests/build** at the audio checkpoint.

**Not integrated; sand remains locked by default.** The prototype is based on the older D2 `1c98263`, not final `e44d9af`. Falling sheets/landing deposits/avalanche boom remain unimplemented: a visual curtain plus an additional MOUND would create mass because existing PLOUGH/MOUND composition uses maxima. Real source debit, transport and matching deposits must own the feature. Crest streams, wake art, wet/frozen seams, distant/reload run memory, world chains, progression/save grants, allocations and human feel remain open.

Evidence: `/home/sol/wraith-surf/docs/phase-9/sand-surf-review.md` and `screenshots/d3-slipfaces-first/`.

## 9. D5 desert light and D6 dry air/crest grains — integrated

### Heat shimmer, playa mirage and aerosol

- Added depth/material-masked heat shimmer before TAA (`ff6ce23`).
- Added guarded reflected-sky heat mirages over distant flat sand (`fc216fe`).
- Added low warm desert aerosol through existing shared atmosphere LUTs (`035482c`).
- Reused existing post/atmosphere resources rather than adding a full-screen copy, draw or texture for these slices.
- Verified zero-effect identity and near/sky/non-sand masks with actual GPU oracles. Mirage color changes were restricted to distant flat sand in the measured tests.
- Reviewed native noon/wet/golden/night views and three native 1440p/60 A/B films, **360 frames per film**. The measured checks recorded no opaque clipping, GPU errors, late pipelines or steady LUT rebuilds as applicable.
- Indicative matched GPU deltas: heat **+0.109–0.140 ms**, mirage **+0.016–0.035 ms**, aerosol **+0.003–0.010 ms**.

Interior/cave-mouth exposure awaits actual D7 interiors; broader movement/telegraph review and optional Milky Way remain open. Evidence: main `docs/phase-9/heat-review.md` and `screenshots/d5-{heat,mirage,aerosol}-review/`.

### Crest grains and independent Dunes weather

- Added suspended and wind-released grains above nearby dune crests (`76446ce`), tied to actual near-crest eligibility and restoration rather than a global floating dust layer.
- Added a separate seeded Dunes clear/heat-haze cycle and continuous Frost/Meadow/Dunes weather blending (`c0416b8`). The desert no longer inherits cold precipitation/fog targets as its ordinary weather.
- Corrected stilled-air behavior while keeping the desert dry and visually distinct.
- Four weather regressions cover unchanged non-Dunes targets, restored/stilled states, border continuity and deterministic long cycles. Six native views covered stilled/clear/haze/wet/golden/night with zero measured opaque clipping/GPU/late errors/steady LUT rebuilds; the wet view remained approximately **24.6% darker**.
- Main reached **800 tests/build** before the Stone healing fix.

Storm weather remains reserved and disabled. Far crest coverage and saved anchored meso-scale migration are still unfinished. Evidence: main `docs/phase-9/crest-air-review.md` and `dry-weather-review.md`.

## 10. Stone collision healing correction — integrated

- Found that multiplying an entire shape's age by the current healing rate retroactively changed collision height when weather/refill changed.
- Changed Stone mass to accumulate healing only over new elapsed intervals. Zero refill remains a valid value; frozen behavior stays under its existing owner.
- Added five regressions and checked the actual bundled owner, including an aged shape held at refill zero and piecewise rate changes.
- Integrated as `18bd3ba`; corresponding storm-branch fix is `5ccdc95`.
- Main passed **805 tests**: **800 tracked plus five preserved local-LLM tests**, and production build. A fresh native 1440p/0.7 180-frame smoke recorded no GPU/late errors.

This fixes the CPU healing-rate defect. It does not certify spatial storm erosion agreement between GPU terrain, CPU collision and reloaded pages. Evidence: main `docs/phase-9/stone-healing-review.md`.

## 11. D6 sandstorm prototype — pushed, dormant and unintegrated

Latest feature/evidence head: **`ec27b3d`** in `/home/sol/wraith-light`.

### World front, volume and light

- Built a fixed world-space leading face and finite tail, with one shared CPU/GPU density model.
- Reused quarter-resolution weather/compose resources for a depth-aware sand volume, plus warm diffuse illumination and corrected low-Sun/night readability.
- Verified **26,136 density points**, maximum error approximately **4.7471e-6**, without mismatches. Measured dense-core visibility is approximately **200 m**.
- Verified dormant compose identity against a pinned main baseline, five native 1440p poses and a corrected native **720-frame** arrival film. Failed exposure, lighting, empty-canvas and stale fixtures were retained.
- Initial matched 1440p/0.7 front checks recorded approximately **+0.031–0.117 ms** GPU deltas.

### Shared wind and airborne streaks

- Connected the front to shared CPU/GPU wind and water/SSR, preserving Gale burst ownership (`d3d8df5`).
- Reused snowfall geometry for near sand streaks, with one active-storm draw after compose and before TAA (`a15ee78`). No additional full-screen texture was added.
- Fixed depth/render-pass state, snapshot reset timing, shared target reference ownership, resize behavior and screen-space length caps.
- Actual HDR/depth oracles verified zero-gate/repeated output, unchanged scene depth and opaque occlusion. Twelve resize/snapshot phases returned matching same-size texture memory/refcounts.
- Reviewed a native **480-frame** film and retained first long-line/render-state failures. Three paired grain costs were approximately **+0.026879 / +0.022356 / -0.004385 ms**.

### Player cloak wind response

- Following the user's correction, added short advected gusts and bounded crosswind to the shared field (`43d12d2`).
- Retained the existing cloth solver, garment topology, pins, gravity and collisions. No separate fake cloth animation or manual force was added.
- Corrected a garment test that selected construction order instead of the actual mantle ID.
- A matched 12-second simulation preserved clear-air behavior and increased free-hem mean speed by approximately **8× for the mantle** and **4.8× for the robe**, while maintaining a similar mean wind force.
- Two native 1440p closeups, **480 frames each**, show real clear/storm cloth response. The comparison movie is `screenshots/d6-storm-cloak/cloak-comparison.mp4`; a copy is in the Windows chat workspace as `cloak-storm-comparison.mp4`.
- Fixed a CPU/GPU precision mismatch without relaxing the **0.0002** bound. The first failing result is retained. Full body contact, movement and human cloth feel remain open.

### Exposure history and save v4

- Added a fixed-capacity **65,536-key** world-space front/exposure journal and an optional canonical **8 m float32** transport grid (`e401c4f`).
- Kept discontinuities for debug/geometry jumps instead of sweeping a fictitious storm over intermediate terrain.
- Added save schema v4 with a nullable front/history payload and a v3 migration that invents no past exposure.
- Moved world/time capture after async terrain collection, ensuring the saved exposure horizon covers late page timestamps.
- Fixed two review findings: the final saved history endpoint must remain committed after restore, and north/west biome sampling must clamp both bilinear taps independently.
- Exercised actual GPU page collection, actual save-worker encoding/decoding and in-memory application without writing user IndexedDB saves. Page byte hashes, front state and exposure survived; clock rebasing preserved the integral.
- The grid is preparatory and is **not connected to terrain erosion**. Capacity fails explicitly; long-session compaction is still needed before shipping.

### Procedural storm audio

- Added low rumble, filtered grit and upwind stereo through **six persistent nodes** sharing existing SFX noise.
- Used actual player-local density/wind, wetness and shelter exposure. Fixed master mute/volume so continuous SFX obey the controls.
- Seven actual-SFX OfflineAudioContext renders verified finite samples, no update-created nodes, bit-identical ordinary storm-off PCM, mute silence and shelter-input response.
- No speakers were used for those renders. Human listening/mastering remains unreviewed; RMS measurements alone do not approve the mix.

### Actual Ridge shelter

- Added a bounded GPU-state snapshot independently of the disabled D2 solver (`3026285`).
- Combined actual fine-window depression/displacement with existing collision-base heights, avoiding double-counting the CPU Stone shape.
- Published one **33×33, 1 m** obstruction field from a **129×129, 0.5 m** height snapshot, tracing up to **14 m upwind** at at most **5 Hz**.
- Shared the exact published field between CPU cloth/audio and GPU sand/water wind. Near grains account for height above terrain; high air is not sheltered merely because a wall exists below it.
- Added missing/stale/outside coverage fallback, edge fading, restore generations, serial ordering, obsolete-read rejection, base-patch revision checks and explicit teardown guards.
- Fixed review findings concerning stale reads before any field exists and updates after buffer disposal.
- Actual RIDGE brush smoke changed lee exposure from **1 to 0.12**, while windward and beyond-end samples stayed **1**. Audio received the same **0.12**. Shelter rebuilt from actual saved terrain after reload.
- **10,874 CPU/GPU samples** passed the unchanged **0.0002** bound, with maximum error approximately **0.000190379** and no mismatches. Dormant/zero-biome results retained pinned-baseline identity.
- Three native 1440p/0.7 runtime shelter off/on pairs measured mean GPU deltas approximately **-0.004 / +0.007 / +0.015 ms**. CPU field rebuilds averaged approximately **0.81–0.85 ms**, up to **1.0 ms** in that run, at 5 Hz. These pairs include expanded uniforms in both modes and therefore do not isolate dormant upload cost against the old bundle.
- Fresh committed-code smoke/oracles and a teardown check were pushed as `ec27b3d`. After disposal and 90 actual renderer frames, reads did not resume, the wind header was open-air and no GPU/late errors appeared.
- Latest full prototype suite: **841 tests/build pass**.

Shelter is local and provisionally tuned, not a whole-world wind simulation. Half-metre sampling can miss narrow relief. D2's signed fine2 remainder must be incorporated explicitly when branches are integrated. API readback allocations and broader graphics/body/feel tests remain open.

Evidence in the storm worktree: `docs/phase-9/storm-front-review.md`, `storm-streak-review.md`, `storm-cloak-review.md`, `storm-erasure-contract.md`, `storm-transport-review.md`, `ridge-shelter-review.md`, plus JSON/WAV evidence under `docs/phase-9/storm-front/` and repeatable `tools/bot/` scripts.

## 12. Tooling, evidence and working method

- Used one owned Windows GPU browser at a time, with fresh page handshakes before commands. Stopped owned browsers between workloads and at the last checkpoint.
- Used locked production builds to avoid competing writes to the same output.
- Added repeatable browser/GPU/offline-audio/film/performance tools and kept machine-readable JSON evidence beside review documents.
- Used actual frame exports, GPU depth and HDR readbacks where image-only or pre-render canvas tests were unreliable.
- Kept failed experiments and corrected their interpretation rather than deleting them or lowering numerical gates.
- Retained raw captures locally; staged selected code/reports/review media explicitly instead of committing all multi-gigabyte frame folders.
- Preserved the unrelated five local-LLM tests and local model files. Their presence is not evidence that a local model implemented the features. Implementation ran through this agent's local Windows/WSL tools, with bounded read-only helper reviews where used.
- Kept main `HANDOFF.md` and `PROGRESS.md` updated with pointers to current feature worktrees and honest integration status.
- Adopted the user's latest workflow request: **commit and push smaller checkpoints frequently, with no coauthor credit/trailers**. Storm commits `e401c4f`, `3026285`, `ec27b3d` and main handoff `03f9243` were pushed.

## 13. Work still required

The following are outstanding; this report must not be used as completion approval:

1. **Storm terrain erasure/re-rippling:** consistent changes across live fine/coarse pages, off-screen reloads, CPU collision, fresh brush writes, wet/frozen states and save/load. Exposure history exists; the actual terrain consumer does not.
2. **Storm integration and acceptance:** history compaction, rendered Ridge/sand/cloth review, Sun-disc and night behavior, moving actors/camera, borders, human audio/cloth feel, saved collision agreement, allocations and combined sustained performance. Keep natural storms disabled until these gates pass.
3. **D2:** unchanged 0.4 ms worst-case compute gate, allocations, steep seif visual quality, combined collision/streaming acceptance and safe integration with the other branches.
4. **D3:** conservative falling sheets/deposits and avalanche boom, crest streams, wake polish, local material seams, distant/reload run memory, progression grant/save wiring, world chains and human feel.
5. **D9b:** allocation gate, full-scene glass refraction, storm/surf readability and world encounter placement/review.
6. **D5/D6 world work:** actual interior/cave-mouth exposure, far crest coverage, anchored saved meso-scale dune migration and remaining graphics standards.
7. **Later handoff items:** D7/D7b, D8, D10, D11, glass blade/trade/forge and full D12, following the project design/plan documents rather than treating prototypes as finished game content.
8. **Whole-project acceptance:** sustained native-target combat/weather/streaming performance, cold pipeline coverage, memory/allocation budgets, real human play and final graphics approval.

The existing automatic goal runner last reported `usageLimited`; manual continuation was authorized. The goal has not been marked complete. This is a consolidated implementation record and resumption aid, not a declaration that the game or handoff is finished.

## 14. Recommended reading order for resuming

1. This report and the newest preamble in main `HANDOFF.md`.
2. `BRIEF.md`, `DECISIONS.md`, `docs/gameplay-design.md`, `docs/phase-9/plan.md` and `docs/phase-9/dunes-design.md` for requirements and architecture.
3. The storm worktree's `storm-erasure-contract.md`, `storm-transport-review.md` and `ridge-shelter-review.md` before implementing erosion.
4. Each feature worktree's latest review and retained evidence before merging or replacing its implementation.
5. Historical handoff entries for context only; newer verified checkpoints supersede old statements such as “audio/shelter not built.”
