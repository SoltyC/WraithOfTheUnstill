# D1a review — 2026-10-27 (Codex)

**Current verdict: keep the near sand material and corrected wet response; D1a reviewed for integration.** The feature makes sand show footsteps, freezing and the progression from individual rain drops to a wet surface, serving pillar 2 (the world remembers and answers), with sensation and readable material state in the second-to-minute loop. The established material style is retained. The earlier change verdict and access failures below describe the initial review; the latest measured correction is at the end of this document.

## Existing captures reviewed

Reviewed the existing 1280 × 720 files in `screenshots/sand/`: close noon, close golden, and rain stages 2, 4, 5 and 6. These are historical captures; no fresh target-GPU capture was possible in this environment.

- Noon shows fine grain and coherent ripples, with no obvious broad white clipping by visual inspection. Clipped-pixel fraction has **NOT BEEN MEASURED** here.
- Golden hour keeps warm lit dunes and a cooler foreground; the foreground is fairly grey. The wider grade remains D1b work.
- First-drop dark dots are visible in the near ground. Whether they read in motion and at normal gameplay distance is **NOT ASSESSED**.
- Merging and drying show patches, but the fully wet frame does not clearly communicate uniformly darker sand. Rain highlights are prominent. **Do not sign this requirement off from these captures.** Re-capture with exposure and lighting recorded before changing material values.

## Correctness and integration fixes

- Merged local main `139ead6` into `claude/sand`. Reconstructed the photo-spot file from main's exact text plus the eleven `p9s1-*` entries. All **229** main spots are unchanged; ids are unique; the diff against main is **251 added lines and no removed lines**.
- Fixed independent photo controls: rain and puddle overrides previously did nothing unless `wetForce` was also set. Forced rain is now applied before wetness integration, so rain-only forcing actually wets the surface. Wetness alone no longer silently forces puddle fill to the same value. Zero remains a valid override; negative values release it.
- Bounded the drying wetness in CPU and shader code to [0, 1]. Removed unused diagnostic code and corrected the drop-growth comment.
- Existing dirty capture output (`screenshots/sand-raw8/shots-log.txt` and `p9s1-rain-6-drying.png`) was left untouched and uncommitted.

**Validation:** 696/696 tests pass; the production build passes under `/tmp/wraith-build.lock`. Five new tests cover independent forcing, rain-driven wetting, releasing overrides, all six photo stages, and bounded crest/hollow drying. This validates CPU behavior and bundling; it does not validate WGSL compilation on the target GPU.

## Remaining checks

1. **Access restored later on 2026-10-27:** the user enabled full access in Codex CLI. Windows interoperability and GitHub access now work; the existing checkpoints were pushed. Headless Windows Chrome connected to the bot on port 4174. On the fully wet scene, the bot reported wetness 0.95, puddle 0.5, rain 0.8 and `gpuStats.late: []` (this is a startup check, not the full weather-transition gate).
2. Capture the six rain stages again, recording exposure; make fully wet sand visibly darker while keeping drop dots legible and the existing style. Check the compacted and frozen shots too.
3. Measure the star-field cost before and after, confirm `gpuStats.late == []`, and review clipped-pixel fractions.
4. Integrate only after these checks. The branch contains **66 screenshot paths** absent from main, including full-size raw iterations; use the handoff's squash procedure and stage only the intended 1280 px review shots, source, tests, assets and docs. Do not merge raw capture history or stage `node_modules`.

**Smell review:** this material response adds no combat, quest, economy or gating rules. Its visual feedback serves an existing terrain-state system. Fun, moving telegraphs, and the visual result of this revision are **NOT ASSESSED**; no new claims are made about performance or frame allocations.

## Fresh capture verification after access was restored

The existing `win-shots.sh` completed **6/6 rain-stage captures** on headless Windows Chrome at 2560 × 1440. Raw output is local in `screenshots/sand-review-codex/`; committed review copies are 1280 × 720 in `screenshots/sand-review-codex-1280/`. The raw capture log records saves from 08:23:08 to 08:24:33 UTC. The dry, first-drop and fully wet copies were visually inspected: the scene renders correctly and first drops are visible, but fully wet sand still appears too close to dry sand. The earlier change verdict stands; investigate material lighting and exposure before accepting D1a. Capture access is no longer a blocker. No performance gate is claimed.

## Wet response correction

GPU readback showed adapted exposure increasing from **0.3889 dry to 0.6040 wet**, substantially cancelling the original 0.5 wet-albedo multiplier. Changed only sand's pore absorption to **0.32**; no exposure/grade change. Re-captured all six stages at 2560 × 1440, with committed 1280 px copies in `screenshots/sand-wet-fix-1280/`. The reviewed fully wet frame is uniformly darker and keeps ripple/grain detail; dots remain separate at the first stage. The dry frame is unchanged.

FFmpeg signalstats YAVG on the identical foreground crop (100, 360, 1080, 340) is **148.337 dry**, **147.998 first drops**, **146.417 many drops**, **111.282 merging**, **106.712 wet**, **106.684 drying**. Old wet was 132.881. These are display-luma measurements, not linear luminance; full-frame R/G/B ≥250 white clipping is **0% in all twelve before/after frames**. Detailed measurements: `docs/phase-9/sand-metrics.json`. Initial `gpuStats.late` remained empty through the old-material sequence. Full star-field and weather-transition verification follows the currently serialized dune-enemy GPU job.

Validation after merging main's haze-pipeline warmup: 698 tests passed in the full 700-test run, with two known 5 s architecture timeouts under load. Re-running `tests/architecture.test.js` alone passed **16/16**; no assertion failure remained. Locked production build passes. This is not yet the D1a performance acceptance.

## Integration verification

A subsequent clean full run passed **700/700 tests**, and the locked build passes. Identical-camera GPU timestamp audit at the star field, 2560 × 1440, render scale 1 and dynamic resolution off: **25.55 ms before / 27.10 ms after median** (172 samples each; mean 26.29 / 27.75 ms). Headless/possibly locked-PC timings are indicative and do not establish the sustained 60 FPS gate. Both star-field runs had zero GPU errors and no late pipelines.

The subsequent sand clear/rain/storm/clear check also had no late pipeline (the pre-D6 dune weather maps rain/storm to overcast). A first entry into the meadow forest then produced **five late render pipelines**, with zero errors and **no late compute pipeline**; later rain/storm/clear added none. The forest haze was active at 0.0032/m, so the dormant-compute warmup was exercised. Keep the late render variants open for the world gate; this pre-existing cross-biome defect is not hidden by the D1a acceptance. Results and stacks are in `docs/phase-9/material-audit/`. D1a is ready for a squash integration that excludes raw capture history; D1b and the sustained/human gates remain separate.
