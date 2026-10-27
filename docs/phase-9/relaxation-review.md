# D2 relaxation — prototype checkpoint, not complete

Conservative sand slumping lets a carved berm fall back into the world instead of remaining an artificial wall. It serves **the world remembers and answers** and **moving is the joy**, in the seconds/minute loop, targeting sensation and readable material behavior. No new Flow rule or player budget is added; D3 will use the response in the wake.

The primary implemented a pure CPU reference, bounded dirty scheduler and GPU prototype. Normal gameplay keeps it **disabled**. The CPU reference uses immutable Jacobi snapshots and equal/opposite eight-neighbour transfers, 34° dry and 60° wet repose, with frozen/non-sand/transform barriers. Six tests cover signed mass, boundedness, convergence, deterministic results, material/frozen barriers, underlying slope and bounded scheduling. The GPU loads one 128² fine tile into two float snapshots, takes a bounded number of steps and stores it; half-overlapping tile origins avoid permanent closed seams. Only actual completed brush jobs enqueue tiles, and a restore clears the queue.

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
- Check bounded scheduling reaches repose before dirty tiles expire, including eight active enemies and adjacent/overlapping writes. The prototype now keeps tiles active for 30 seconds and takes eight steps per visit; the settling-time gate is still open.
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

## Coarse projection and weathering continuation

Coarse pages now visit one 32-row band at a time, using horizontal/vertical disjoint pairs at both parities. Each pair projects excess slope directly to 34°/60° repose using the existing clipmap base height; frozen and transformed cells are barriers. Equal/opposite transfers preserve signed volume. Four new pipelines warm during loading. The CPU pair oracle covers conservation and material/frozen/wet barriers.

The synthetic target oracle (`relaxation/coarse-oracle.json`) matches within **3.78e-7 m**, total signed-height drift **−5.36e-7** over 4.5. Its temporary synthetic pipelines are explicitly outside the world detector; a separate cold world check reported zero late pipelines. In the actual world (`coarse-world.json`), 180 coarse visits reduce the saved mound peak **1.55004 → 1.01700 m** with page sum drift **−3.28e-6** over 149.755, zero errors/late pipelines.

Rounding remainders now survive fine↔coarse scrolling, page packing and healing. A repeated CPU page round-trip test checks signed height within 1e-6 m without corrupting molten/flatten channels. Existing saved pages have zero spare halves and remain readable. The stored format still has three words per texel.

Sand relief, compaction and flatten weather at **0.08×** while stilled; restored rates range **0.8×–2×** with wind. Wetness and temperature retain their own rates; snow and other materials retain their previous decay. CPU/worker and live GPU use the same multiplier. The worker uses the rate at reload for its elapsed-time approximation, as the existing off-screen healing path uses current conditions; exact wind-history integration is not claimed. Coarse Gaussian diffusion remains the existing diffusion model. Tests show worst-rate analytical height retention above 70% after 60 s and stilled compaction above 99%; a real minute-old trail still needs image/motion verification.

Full suite at this continuation: **787 passed**, locked build passes. The default prototype stays disabled. Eight-step fine timing, avalanche presentation, worst-case writers, collision in motion, crest silhouettes/parity and full persistence checks remain required.

## Healing and persistence verification — 2026-10-28

A real minute-long check exposed a pre-existing live-healing bias: dither was seeded by the elapsed band interval. Under steady frame timing it repeatedly chose similar rounding at a texel. Healing now uses an integer world-coordinate hash with absolute game ticks; a statistical regression checks changing, unbiased choices at distant coordinates. Height healing also folds its rounding remainder into each subsequent step. Transform ids are copied without dither.

`trail-memory.json`: at restored rate 0.824×, a footprint's depth goes **0.04468 → 0.03986 m** over 60 simulation seconds (89.2% retained), and compaction **0.8980 → 0.8431** (93.9% retained). The three 1280 px images in `screenshots/d2-trail-review/` were reviewed: the minute-old trail remains clear. A valid IndexedDB slot save and load succeeds; the earlier invalid-slot attempt is retained in `trail-before-dither-fix.json` and is not persistence evidence.

Coarse refill preserves a shallower footprint trace, rather than the original fine detail: the sampled signed depth after load is 0.00768 m and compaction 0.2863. This limitation is visible in the reload image. `trail-fresh-page.json` separately verifies the saved trace survives a full page reload in the same isolated browser profile, with zero GPU errors/late pipelines.

The wider carved-run check (`groove-memory.json`) uses a 10 m × 1.6 m groove. All five samples retain **98.5%** of centre depression (0.21997 → 0.21667 m) after real save/load. The two 1280 px `screenshots/d2-groove-review/` images were reviewed: the groove remains legible; coarse refill smooths fine edge detail. Zero GPU errors/late pipelines.

The general snapshot-setting fix and carried-weapon visibility fix are separately integrated on main (`bb8585a`, `56c4238`), which passes 774 tests. D2's working suite now passes **790 tests** and the locked build. The clean avalanche presentation is being reshot after those fixes; earlier failed/poorly framed diagnostic attempts are not accepted footage.

## Clean avalanche film and reload wake — 2026-10-28

The clean fixed-camera film is `screenshots/d2-avalanche-review/avalanche-720p.mp4`: H.264, 1280 × 720, 60 fps, 1,920 frames, 32.000 s, 10,005,936 bytes. Four sampled frames were reviewed. The hidden staff and snapshot-resize errors from rejected attempts are fixed. `avalanche-film.json` records zero GPU errors/late pipelines, peak relief 1.84082 → 0.58496 m and 1,652 jobs. Its measured final tile maximum is **35.18°**, so this demonstrates movement but **does not pass** the 34° settling gate or human avalanche-convincingness. Fixed-step capture is not a performance measurement.

The continuation wakes a bounded 25-tile neighbourhood on approach and requeues incoming saved texels near the player. This closes a scheduling gap where reloaded unstable relief otherwise waited for another writer. Unchanged idle positions do not refresh expired work forever; resets wake the same location again. A matching CPU/WGSL guard preserves untouched macro terrain rather than eroding it just because a neighbourhood wakes. Two added regression checks bring the suite to **792 tests**, with the locked build passing. A fresh 1280 × 720 Windows bot verifies actual packed-page snapshot/restore with no post-restore brush: 481 jobs, fine peak relief 1.69908 → 1.29297 m, zero GPU errors/late pipelines (`reload-wake.json`). The prior long command timed out in the older browser and is not accepted evidence; splitting the fresh run into supervised chunks completes. This tests the solver wake separately from the already verified IndexedDB persistence.
