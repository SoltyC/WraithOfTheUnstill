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

## Dune parity and first full-load check

`dune-parity.json` compares 4,096 points in each of two 500 m-radius dune regions on the Windows GPU, using the shader's full meso height and exactly the same resident tiles as CPU collision. Maximum errors are **0.905 mm** and **1.702 mm**, under the 10 mm threshold; zero GPU errors/late world pipelines. The diagnostic pipeline alone is excluded synchronously from late detection; gameplay and asynchronous waits retain detection.

The first real-time load check (`full-load-before-batching.json`) keeps eight Shaped active and records 1,048 terrain writes over 240 frames, 36 collision readbacks and a full 64-slot dirty queue. All 239 complete samples include the ten fine passes separately timestamped and summed per frame. Fine relaxation mean **0.144 ms**, p95 **0.902 ms**, maximum **7.533 ms**: **the 0.4 ms budget fails**. Seeded speed reaches 25.71 m/s but drops to a 5.2 minimum and 8.30 mean; this is not sustained full-speed evidence. Zero GPU/collision errors or late pipelines. The batching and precision continuation below resolves the measured fine-pass spike in repeated target runs; sustained full-speed traversal remains unverified.

The free-camera lens fix (`13aa555`, main equivalent recorded separately) stops a deferred player teleport from replacing the requested lens with 0.96 radians. Two new dusk captures record actual FOV 0.7 and render scale 1 in `crest-captures.json`. These are **diagnostic, not silhouette acceptance**: the selected target reads as a broad distant ridge and the nearer foreground dominates at 500 m. The captures do not demonstrate knife-edge geometry or absence of popping. They need a better isolated crest view and motion review.

## Batched solver and unbiased feedback — verified continuation

The eight-step path now runs four Jacobi steps inside each 16² workgroup output, with a four-cell halo. Two batched dispatches plus load/store replace ten dispatches. The 13.5 KiB shared working set fits WebGPU's default 16 KiB limit; one-step passes remain for even remainders and debug iteration. All six pipelines warm before world readiness.

An actual target precision probe found `pack2x16float` rounds toward zero on this backend (permitted by WebGPU). Tiny positive feedback was repeatedly discarded: the first batched 100-cycle test lost **10.26 ppm**, just outside the existing 10 ppm threshold. `packHeightRemainder` explicitly selects the nearest half with even ties. Fine/coarse relaxation, scroll transfers and healing use it; the three-word save format and residual interpretation stay unchanged. The CPU already uses nearest-even. `half-nearest.json` checks **1,024 matching CPU/GPU encodings**, including positive/negative subnormals, signed zero and exact halfway ties. The exploratory `half-precision-probe.json` columns are input, native half round-trip, scaled experimental round-trip and native half bits; scaling was diagnostic only and is not the implementation.

`batched-eight-gpu.json`: eight-step CPU/GPU maximum error **1.406e-7 m**, RMS **1.033e-8 m**. Repeated packed signed-height drift **−0.0004046 over 1339.29**, **−0.30 ppm** after 100 cycles, within the existing tolerance. Earlier failed `batched-eight-before-nearest.json` is preserved. Zero GPU errors/late pipelines.

The final real-time repeat (`full-load.json`) records eight active Shaped, **1,140 writes**, 240 jobs, 42 collision readbacks, a full 64-slot queue and 239 complete four-pass samples. Fine GPU mean **0.0417 ms**, p95 **0.0461 ms**, maximum **0.0481 ms**. A pre-rounding repeat has the same maximum (`full-load-before-nearest.json`). These measured workloads pass the fine-pass 0.4 ms budget; they exclude coarse/collision GPU cost. Surf speed still falls from the seeded 25.57 m/s maximum to a 5.2 minimum (mean 8.18), so they do not pass sustained full-speed movement or full-frame performance gates. Test health is raised solely to retain all eight enemies for profiling.

Full suite **793 tests passes**, locked build passes. Free-camera FOV fix is separately integrated on main as `a739456` (775 tests/build). D2 stays disabled. Remaining: settling before expiry, representative sustained-speed collision/latency and allocations, suitable knife-edge crest/motion captures and broader frozen/material target checks. Standing checks now pass below.

`crest-standing.json` verifies 120/120 grounded frames at each of two sampled crest maxima, (2605, 685) and (1415, −1670). Feet match streamed collision height with **zero measured error**, without horizontal drift; heights 204.300598 / 328.015259 m. Zero GPU errors/late pipelines. This does not replace moving/slumping collision validation.

## Settling investigation — next unresolved defect

The profiling harness now accepts an even iteration count and validates the expected dispatch count per sample. `full-load-32.json` passes the fine budget with 32 steps: mean **0.1315 ms**, maximum **0.1495 ms**, 239 complete ten-pass samples, eight Shaped and 1,146 writes, zero GPU/collision errors or late pipelines. This is an experiment; **the runtime default remains eight**.

`settling-32.json` is a failed real-time isolated-mound check after the 30 s dirty lifetime: peak relief 1.84082 → 0.60107 m, 1,456 jobs, maximum active slope **37.89°** (all four undirected edge directions checked), zero GPU errors/late pipelines. Its progress log had 29 pending tiles through most of the run. The new 25-tile neighbourhood wake competes with the small actual mound region, including empty tiles, and reduces visits to the displaced sand. Raising iterations alone does not solve bounded settling. The largest measured excess is a cardinal edge near (1904.69, 900.02), with relief 0.16318 / 0.14923 m and base heights 150.16180 / 150.15955 m; it is not merely a diagonal-angle reporting artifact.

**Next implementation:** retire empty queued regions (with safe stale-result handling), or otherwise wake only known displaced sand, while retaining the verified reload-without-brush behavior. Measure convergence and full-speed timing again. Do not enable D2, raise the default iteration count, or treat the clean earlier film's 35.18° as proof this newer scheduling gate passes. The film used the earlier scheduler; it remains evidence of presentation only. Original eight-step before/after benchmark artifacts are preserved, and no threshold was relaxed to pass them.

## Empty-work retirement and current checkpoint

GPU store workgroups now report whether their tile contains deformation. A fixed 256-byte activity buffer is read at most four times/s into one reusable CPU array. Empty results retire queued work; tags change on **every mark**, including a rewrite of the same tile, and survive queue resets monotonically. Delayed results cannot retire a new write, reused slot or restored save. A regression exercises those cases. Tag exhaustion disables retirement rather than allowing an ABA wrap.

The pending isolated queue drops from 29 tiles to four, and `settling-32.json` now reaches **34.0102°** after the dirty lifetime (acceptance tolerance in this diagnostic is 34.1°); peak relief 1.84082 → 0.58008 m. The failed earlier 37.89° report is preserved as `settling-32-before-pruning.json`. **32 steps/tile is now the experimental default**, still globally disabled pending the remaining gates. The 30 s lifetime is unchanged. This passes the isolated mound check, not eight overlapping full-size writes.

Warm-up now executes the scratch kernels across the full tile while a dedicated `warm` field prevents terrain stores and a zero generation suppresses activity writes. This prepares actual scratch work during loading instead of only compiling inactive jobs. It is not a claim that all timing variance is resolved. Full suite **794 tests passes**, locked build passes, target retirement read errors zero.

A stale **legacy headless capture on port 4174** was found still rendering with profile `wraith-sh-7342`: Windows GPU counters measured 47.54% for its GPU process and 40.48% for the current bot. Its process tree was stopped, with all raw screenshots preserved (`gpu-contention.json`). Earlier timings were therefore contended. The subsequent single-renderer check **still fails** the strict budget: `full-load-32.json` has mean 0.1532 ms / maximum **0.5376 ms**, and `full-load-16.json` has mean 0.1103 ms / maximum **0.4997 ms**. An additional cold 32-step spike at 0.9103 ms is preserved. **Worst-case performance remains open; do not use the earlier 0.15 ms repeats to sign it off.**

`single-gpu-thirtytwo.json` confirms 32-step height parity at **1.658e-7 m** and packed mass drift **0.34 ppm** after 100 cycles, zero errors/late pipelines. Its older accumulated timing harness reports 0.267 ms/job mean and a 1.085 ms maximum asynchronous batch; batch size is not a per-frame maximum. The preceding contended oracle is also retained. The valid post-pruning reload check succeeds without another brush, with zero GPU errors/late pipelines.

The speed drop in profiling is explained by the current gameplay code: `systems/wraith.js` enables surfing only on snow (`mat === 0`). **D3 sand traversal is still unbuilt.** D2 tests must distinguish a synthetic maximum-speed writer/collision test from later sustained sand-surf gameplay acceptance. Remaining D2 work: robust timing, moving/slumping collision latency, allocations, overlapping-writer settling, frozen/wet target behavior, and suitable knife-edge silhouette/motion review. No whole-world performance or human feel gates pass by implication.

The screenshot launcher now closes its owned capture browsers on exit/interruption. A real six-second SIGTERM test returns the expected timeout status 124 and leaves **zero** matching capture processes; the 4176 bot then restarts normally. Main includes this tooling fix separately.

## Continuation — 2026-10-28 afternoon

Main's sand-dust feature is merged on this branch as `b7861ab`. **800 tests and locked build pass** after the collision callback change below. D2 remains disabled and unintegrated; the runtime default is still 32 iterations.

- Moving collision: the new `tools/bot/moving-collision.mjs` crosses a full-size 14 m Ridge (half-width 2.95 m, height 1.1 m) with live relaxation. All 360 sampled frames are grounded and covered. GPU/state comparison max error **3.35 mm** in the full-size run; a narrower/steeper ridge was **8.01 mm**. Readback ages peak around **0.12 s**. Async probes report their elapsed span (~0.07–0.09 s); these are not simultaneous CPU/GPU snapshots and do not accept D3 traversal. The harness now isolates bare terrain without accidentally subtracting the analytic Ridge twice.
- Wet/frozen target extension: 32-step wet CPU/GPU max error **2.267e-7 m**, packed drift **3.97 ppm** after 100 cycles; fully frozen mound matches exactly, with **zero** height/mass change. Zero GPU errors/late pipelines. `wet-target-32.json`, `frozen-target-32.json`.
- **Eight steps are a viable experiment, not a new accepted default.** With empty-region retirement, the isolated mound settles to **34.0813°** after queue expiry, and eight overlapping full-size Skitter MOUND writes settle to **34.0309°** with eight frozen Skitters still present. Both retain the existing 34.1° diagnostic tolerance. The overlap test stops writers before measuring repose; it does not require an actively disturbed surface to be settled. `settling-8.json`, `overlap-8.json`.
- A true **synthetic 26 m/s data-path workload** now moves the fine-window/readback centre and emits real PLOUGH brushes while eight normal enemies continue their writers. It covers ~127–134 m per run with >99% collision coverage and ~0.13 s max snapshot age. This explicitly avoids calling a once-seeded, decelerating controller "sustained sand-surf". D3 is still absent.
- Timing remains **failed**. Three eight-step synthetic repeats have fine maxima **0.3072 / 0.44032 / 0.30413 ms**; a combined fine/coarse/collision run peaks **0.41779 ms** (coarse phase 0.35738 ms). Typical fine cost is ~0.04 ms; normal single batches ~0.015 ms can spike to 0.41 ms. Stage-level reports preserve these failures. Windows GameDVR video encoding is active (~6.66% on its encode engine during a sample); pausing it was asked asynchronously, with **no approval assumed and no service changed**. Its causality is not established. Do not filter spikes or sign off the 0.4 ms gate from passing repeats.
- CPU hot queue, collision sampling and bounded dust events: **zero GC collections over one million warmed calls each**. These checks exclude Babylon/WebGPU dispatch and native asynchronous readback promises. Two per-refresh collision callback closures are now replaced by cached callbacks/metadata; three regressions cover changing owner inputs during a read, stale reset generations, retry and buffer reuse. Full browser allocation attribution is still open.
- Terra provided four read-only CPU camera candidates; primary captured them at 2560×1440 and reviewed 1280 px copies. All have zero GPU errors/late pipelines. They improve skyline composition, but broad/rounded hills and macro relief still dominate; **they do not establish a knife-edge dune crest or motion acceptance**. Candidates are appended as `p9d2-silhouette-*`; raw captures preserved locally, review copies in `screenshots/d2-silhouette-candidates/`.
- The settling harness's original 30×120-frame loop could finish before 35 sim seconds on a fast renderer. It now permits 60 supervised chunks and can resume an already-expired test without restamping. The eight-step isolated result used that resume after expiry; no solver jobs ran beyond the 30 s dirty lifetime.

Next: controlled timing/overhead attribution; browser allocation profile; representative large adjacent Ridge/writer expiry and crest geometry/motion review. Keep D2 disabled until those gates pass. Independent D9b work can proceed while a timing-environment decision is pending; no ordering dependency requires enabling D2 first.

## Recording-free repeat — 2026-10-28

The user authorized pausing GameDVR, then explicitly requested stopping all game recording. GameDVR was stopped; Medal and its encoder were terminated; NVIDIA recording helpers were stopped. NVIDIA overlay respawned, but Windows counters showed no active video encoding. Recording is left stopped under the latest instruction. Causality for earlier spikes remains unproven.

Three eight-step synthetic26 repeats have combined fine/coarse/collision maxima **0.36352 / 0.335872 / 0.359424 ms**, with zero GPU errors or late pipelines. However, maximum collision snapshot age is **0.2802 / 0.2830 / 0.2808 s**, exceeding the unchanged 0.20 s diagnostic limit. All three runs therefore still fail the full gate. The browser had previously been resized to 2560 by 1440 for crest captures, but this harness did not record actual render resolution; do not assert a verified resolution or compare frame-rate results across runs. New reports are prefixed `no-recording-`; the previous failed recording-on reports are retained unchanged. D2 remains disabled, default 32 steps.

The GPU bot was stopped after these repeats. The local Qwen worker harness reports stopped, and starting it fails because its configured runtime or model is missing. No local-model contribution is claimed.
