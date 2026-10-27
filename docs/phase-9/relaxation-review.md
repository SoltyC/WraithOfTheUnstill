# D2 relaxation — prototype checkpoint, not complete

Conservative sand slumping lets a carved berm fall back into the world instead of remaining an artificial wall. It serves **the world remembers and answers** and **moving is the joy**, in the seconds/minute loop, targeting sensation and readable material behavior. No new Flow rule or player budget is added; D3 will use the response in the wake.

The primary implemented a pure CPU reference, bounded dirty scheduler and GPU prototype. Normal gameplay keeps it **disabled**. The CPU reference uses immutable Jacobi snapshots and equal/opposite eight-neighbour transfers, 34° dry and 60° wet repose, with frozen/non-sand/transform barriers. Six tests cover signed mass, boundedness, convergence, deterministic results, material/frozen barriers, underlying slope and bounded scheduling. The GPU loads one 128² fine tile into two float snapshots, takes four steps and stores it; half-overlapping tile origins avoid permanent closed seams. Only actual completed brush jobs enqueue tiles, and a restore clears the queue.

Base heights come from the clipmap's existing computed storage, avoiding a second terrain function and staying within eight storage bindings per stage. The clipmap geometry constants moved into `terrain/clipmapLayout.js` with the old shader exports preserved. Four compute pipelines warm with an inactive job during loading. New owner fields carry doubles into update without numeric arguments. Diagnostics/readbacks allocate only when explicitly invoked.

The fine word-2 high half now carries f16 rounding error feedback. It has no effect on ordinary materials/rendering. Relaxation includes it in the next float input; healing decays it, brush writers fold it into the input, and scrolling folds it into the coarse height before clearing the spare half. Coarse saves retain the existing three-word format; no persistent new channel is required. This prevents systematic loss from repeated f16 stores, within numerical precision.

## Measured on Windows Chrome / RTX 3060

`tools/bot/sand-relax.mjs` stamps a 2 m pile, verifies the tile actually contains disturbed sand, compares the float GPU result against the CPU reference, repeats packed cycles, and times only relaxation passes. It disables healing through `params.refillRate` (setting `terrainState.healScale` alone is overwritten by the environment each frame). Initial apparent losses therefore mixed legitimate healing with packing; those were not isolated conservation evidence.

The isolated checkpoint before the final owner-field refactor measured:

- CPU versus GPU maximum height error **1.30e-7 m**, RMS **1.05e-8 m** after four iterations.
- Float signed-height sum error **−8.49e-6** over a sum of 2718.18.
- After 100 packed cycles, sum error **−0.01666**, about **−0.000613%** (roughly 7.2 ml of volume over the tile). This is finite-precision conservation, not exact arithmetic.
- 120 processed tiles, **zero GPU errors and zero late pipelines**.
- Timing varied: earlier short samples averaged about 0.03 ms/tile; the isolated repeat averaged **0.426 ms** with a maximum asynchronous sample batch of **11.50 ms**. A batch can include more than one completed sample; this does not establish a per-frame percentile. **The 0.4 ms worst-case budget is not passed.**

JSON reports are under `docs/phase-9/relaxation/`. Final checkpoint tests/build and the repeated target run are recorded there and below.

## Required before D2 integration

- Measure a representative full-speed writer workload and diagnose timing variance; keep it below the allocated GPU budget.
- Extend collision validation to moving/surfing over a slumping Ridge, new casts in flight, reload and the full writer workload. The first streaming and standing checks pass below.
- Complete coarse relaxation and wind/restoration-driven healing; verify a trail remains readable after 60 s and survives save/reload.
- Check bounded scheduling reaches repose before dirty tiles expire, including eight active enemies and adjacent/overlapping writes. The current four-second queue lifetime is a prototype, not an accepted settling time.
- Capture/review an avalanche in motion, and crest silhouettes at 500 m/2 km. Run CPU/GPU meso parity and bot crest standing checks.
- Validate error feedback across brush/scroll/healing/save transitions on target, frozen barriers and material boundaries; assess hot allocations on target.

## Design review

**Keep the conservative solver, change and measure before enabling.** No extra player rule, reward, scaling, gate or grind was introduced. Shared material behavior avoids bespoke puzzle props. Bare-verb fun, graphics serving play, surf-speed readability and scope versus measured cost are **NOT ASSESSED** until the avalanche and D3 bot films. The remaining smell catalog has no new trigger in this low-level prototype; natural encounter/reward pacing belongs to D11. Human feel is not signed off.

## Saved checkpoint

The owner-field revision passed **778/778 tests**, the locked build, and a fresh cold Windows Chrome run (`relaxation/checkpoint-gpu.json`). CPU/GPU maximum error 1.30e-7 m; 100 packed cycles relative drift **−0.000484%**; 120 jobs, zero GPU errors/late pipelines. Relaxation total 3.2246 ms / 120 jobs = **0.0269 ms/job**; maximum asynchronous batch 0.0614 ms. This better repeat does not erase the slower earlier sample or replace the full-speed/worst-case gate. The prototype remains disabled pending the required list above.

## Collision streaming checkpoint

A 129² quarter-metre sand-state patch now streams into collision at most 12.5 times/s while the prototype runs. Two reusable CPU arrays swap only after readback; generation checks discard replies after a reset/load. Sampling allocates nothing. Uncovered/non-sand points retain analytic collision. Fresh Ridge casts and raises remain solid immediately; once the snapshot includes them, their old analytic shapes stop holding up slumped sand. Normal cover queries retain all analytic shapes. Meaningful stationary relief refreshes once/s for healing.

`tools/bot/state-collision.mjs` verifies the actual snapshot against four fine GPU texels, the ground query and standing, and forces an in-flight reset. Target report `relaxation/collision-gpu.json`: **0.874633789 m** CPU/GPU offset, **zero measured offset error**, standing passed, stale reply discarded, 47 readbacks, zero read errors/GPU errors/late pipelines. Reported snapshot age after the asynchronous probes was 0.296 s; it is not an input-latency measurement. Four new regressions cover mask/coverage, old versus new/raised Ridges and fallback. Full suite **782 tests passes**; locked build passes. Moving/latency, allocation and full-load performance gates remain open.

The headless launcher now saves Chrome startup/console messages to `C:\Windows\Temp\wraith-bot-<port>.log`. The new cold-load readiness gate exposed the reserved WGSL identifier `patch`; corrected to `gridMin` before target verification.
