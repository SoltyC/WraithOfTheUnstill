# D2 crest rendering — implementation checkpoint, 29 October

This is an unintegrated feature-branch checkpoint. D2 physics stays disabled by default, with 32 steps unchanged. The remaining allocation, final parity/walking, motion-film and larger-writer gates below must be completed before integration/enabling. D7b canyon geometry, D5/D6 weather and whole-biome/human aesthetic acceptance remain separate.

The feature makes the existing terrain legible while travelling (Learn by reading / Moving is the joy, moment-to-moment loop). It preserves the warm-gold/cool-shadow palette, near-field sand material and all gameplay rules; it adds no verb or progression shortcut. Human traversal feel is NOT ASSESSED; real sand-surf remains D3.

## Implementation

- Visible clipmap grows 256→512 cells with 12→11 levels, retaining the same 16,384m outer half-width and 6.25cm nearest spacing. Level storage grows about32.1MiB. CPU terrain/bake heights are unchanged; denser rendering retains more meso shape at a given distance.
- The visible terrain uses two static draws: fine centre first, then instanced rings. Deeply buried interior triangles are omitted with a two-cell guard, preserving joins for every legal finer-origin shift. Two topology regressions verify index winding/bounds and that omitted vertices stay under finer coverage at all nine origin offsets. The centre/rings share material and level data; there is no new per-frame mesh allocation or upload.
- Shadow casters keep a separate256-cell centre/ring grid on a reserved camera layer, sampling the same level storage. The main camera cannot draw them. Caster half-width is explicit; the last grid still covers the whole baked world. Centre-first order preserves early depth rejection.
- Eight-cell geomorph bands replace24-cell bands on visible/shadow grids. Actual motion review is still required; a static image cannot sign off popping.
- Analytic transverse/seif phase and amplitude are extracted during the existing height evaluation and packed into unused levelData.w as a finite24-bit integer. No additional fragment storage binding, texture or per-pixel FBM is added. Normal compute updates only y/z, preserving height/metadata and avoiding writes to neighbours' height inputs.
- The fragment normal adds the difference between the true profile derivative and its grid-filtered derivative. It fades out near the player, on unresolved pixels and across invalid/non-pure types. Other biomes and the D1a near material retain their prior path. Phase is quantised to1/512cycle; amplitude to0.5m.

## Measurements

All static rows below are three240-frame repeats at actual2560×1440, scale1, RTX3060 headless. Values are medians of the three GPU medians, in ms. These are whole-frame spans, not sustained game/1%low acceptance.

| Variant | Close | Mid | Canyon |
|---|---:|---:|---:|
| baseline | 15.106 | 11.304 | 12.666 |
| density512 | 19.172 | 15.574 | 17.013 |
| split-shadow | 17.000 | 13.400 | 14.828 |
| biome-cache | 16.900 | 13.333 | 14.821 |
| early-skirt | 18.257 | 13.820 | 18.253 |
| finite-skirt | 22.003 | 14.818 | 19.041 |
| ring-topology | 22.721 | 12.979 | 14.457 |
| center-first | 16.574 | 12.994 | 14.462 |
| analytic | 16.939 | 13.400 | 14.643 |

Rejected code is removed: full-density shadows cost too much; a biome-weight cache saved little and added quantisation; early vertex exits worsened cost; ring-first order caused expensive close-up overdraw. The current implementation uses static ring topology, centre-first ordering, separate shadow geometry and analytic crest metadata. Native close-up timing still exceeds16.67ms after the normal pass; no native1440p/60 claim is made.

The existing shipping configuration is2560×1440 output with scale0.7 TAAU (1792×1008 internal), documented in DECISIONS.md's temporal-upscaling decision. It has not been introduced or lowered to pass this task. Current analytic-normal camera-only96m sweeps measure median **15.103 /8.972 /9.632ms** (close /500m crest /2km crest); maxima **15.230 /9.099 /9.958ms**, zero errors/late pipelines. These exclude combat/weather; native camera-sweep failures are retained. Render-target timing includes both HDR scene and shadow targets, not shadows alone.

Before the final analytic-normal cache, three live32-step synthetic26 repeats at the existing0.7 configuration pass the unchanged compute/latency conditions: combined maximum **0.187392ms** each; max snapshot ages **0.1624 /0.1630 /0.1617s**, zero GPU/readback/retirement errors/late pipelines. Final-shader repeats remain to do. Native scale1 failures are retained; thresholds remain0.4ms and0.20s. The first shipping attempt retained a frozen photo clock (zero distance/age) and is explicitly INVALID in shipping-07-before-clock-fix.json. The load harness now unfreezes and requires finite elapsed simulation time >1s, and records both output/internal sizes.

The existing-storage metadata oracle checks547 GPU samples against independent CPU WorldData climate plus the original phase/amplitude functions:323 valid, max phase error0.00097918cycle, max amplitude error0.244515m, no bad families/non-finite codes, GPU errors or late pipelines. It introduces no diagnostic shader. This verifies metadata, not collision height.

Full suite **810 tests passes**, locked production build passes. Cold native captures of seven seif candidates and eight transverse candidates have zero errors/late pipelines. CPU rays select actual analytic crests rather than broad camera-to-target guesses; GPU depth records actual positions and the nearest sampled surface. Several seif cases lie near the eastern boundary and are stress views, not proof that the whole erg meets the aesthetic bar. Transverse interior views are separately selected; failed/before-bound candidates remain recorded. Exact slant range and nominal planar range are distinct in the reports.

## Still required

1. Final shader CPU/GPU height parity, live walking, wet/frozen/mass/convergence regressions and large adjacent writers.
2. Camera motion film and sampled-frame review of500m /2km crests; verify morph joins and normal stability, not only a successful upload.
3. Final-shader repeated full-load32 measurements at documented shipping configuration; retain scale1 failures and explicit internal/output sizes.
4. Full browser allocation attribution (own hot-path allocations versus bounded WebGPU/Babylon readback overhead), then integration decision. No zero-allocation or whole-world sustained-performance claim yet.
5. Broader biome transitions, night/weather/traversal context and human aesthetics remain D12/user gates. Canyon teeth remain a D7b defect.


## Final shader validation and readback pool, 29 October continuation

The final height shader passes two independent4,096-point/300m CPU/GPU regions: transverse max0.317mm, seif1.131mm. The parity diagnostic deliberately creates two late compute pipelines; that browser was stopped before cold tests. Dry/wet solver max errors remain1.658e-7/2.267e-7m; frozen output is exactly unchanged. Packed100-cycle mass drift remains0.34/3.97/0ppm respectively. These oracle reports retain their indicative native timing; they do not override full-load failures.

Three final-normal shipping0.7 stress runs before the pool pass: combined max0.190464/0.187392/0.190464ms, max snapshot age0.1589/0.1663/0.1712s, zero errors/late pipelines. Final-normal walking gives360/360 grounded/covered,359 moving, zero foot gap, max asynchronous difference3.916mm. These close the earlier final-shader parity/walking/regression tasks, with the larger-writer exception below.

Three240-frame720p native camera sweeps were captured for seif500m, transverse500m and transverse2km. Sampled frames0/60/120/180 show no opening joins, but do not establish continuous motion/human acceptance. The boundary seif retains blocky, mountainlike shoulders; broader graphics approval is still withheld. The first2km view was forest-occluded and is retained as rejected composition. Replacement uses interior candidate6. Warm frames now hold the first saved pose. Selected videos and the contact sheet accompany the report; raw frames remain local/untracked.

Actual Windows V8 sampling (16-byte interval, collected objects included),2560x1440/0.7, eight Shaped and live walking identifies substantial pre-existing game allocations and602B/frame inclusive D2 stacks. A fixed four-buffer GPU staging pool now copies in the existing Babylon encoder and maps after frame submission, using one boot-time end-frame observer and cached completion callbacks. Four regressions plus the existing five collision ownership tests pass; full suite814/build passes. GPU map promises and mapped-range views remain API-required allocations. Repeated sampling measures274B/frame inclusive D2 stacks, about54% lower; no zero-allocation claim. Existing game own allocations remain about174KB/frame in these profiling runs, which distort timing and are separate paths rather than identical replays.

Pool validation found zero GPU/readback errors and walking contact remains360/360 grounded/covered,359 moving, zero foot gap,4.008mm asynchronous difference, max age0.1392s. However this fresh session started with a hidden-player photo spot; exposing the Wraith later creates four late fur/FX render variants. The report is a failed whole cold gate and retains those entries. Do not clear them or call it zero-late. Repeated shipping compute is also not robust: cold max0.572928ms, first repeat3.262464ms, then0.185344/0.187392ms. All failures are retained; typical cost/passing repeats do not satisfy the unchanged worst-case0.4ms limit.

Two actual overlapping14m x5.9m x1.1m Ridge writes were run for36s with normal32-step scheduling, healing disabled, held player. The queue expires after30s and all work is gone by36s; sampled disturbed sand still reaches43.29degrees. This is a real large-writer convergence failure. Fifteen scratch tiles are sampled, not whole-footprint mass proof. Queue capacity/expiration and overlap scheduling must be corrected before enabling D2. All cold/performance/large-writer failures remain open despite the successful isolated mound oracle.


## Large directional writer follow-up, 29 October

Directional brush dispatch now uses the exact conservative component bound of the shader's capsule: abs(direction.x/z)*halfLength +1.9*halfWidth, retaining the original fine-window clipping. This shrinks an axis-aligned14m Ridge's dispatch area by about56%, avoids queuing the broad empty square and changes no brush program/profile. Page claiming/loading still use their original conservative square. Four tests cover round, rotated, negative/non-unit directions, shared buffer offsets and every queue tile of overlapping full-size Ridges. Inputs/outputs use existing typed arrays; no new per-frame objects or floating call arguments.

The disabled experimental scheduler is now512slots/240s,32steps unchanged. This is not an accepted/enabled default or permission to relax performance gates. The64slot30s run left43.29degrees. Capacity256/120s with square bounds left36.90degrees; capacity512/120s with tight bounds left34.59degrees. The longer **verified** fixed60fps test records loaded capacity512/lifetime240/build index-DCXKD7dB.js,14,754frames/246sim seconds and14,400jobs before expiry, zero pending at end. Fifteen sampled tiles reach maximum **34.10289239degrees**: this still FAILS the unchanged34.1degree tolerance. Most tiles read approximately34.000degrees. No threshold change or rounding to a pass. Zero GPU/readback/retirement errors and late pipelines.

One earlier fixed60 report was invalid for the claimed240s runtime: the build command reduced PATH before play.sh, making Windows launch/cleanup unavailable and leaving the previous120s browser running. Its7,201jobs exposed the mismatch; the report is retained as fixed60-stale-runtime and explicitly invalid. Subsequent launch ran separately with normal WSL/Windows PATH, completed a fresh handshake, and the harness now rejects mismatched loaded capacity/lifetime before stamping and records the entry asset. Fixed60 mode manually advances the real loop at1/60 with1280x720/0.7 and asynchronous GPU/event-loop work; it is a settling oracle, not wall-clock/1440p performance.

Full suite **818tests/build pass** (817full plus the added focused queue-coverage regression, followed by another818full run before the runtime guard's diagnostic-only field). Physics remains globally disabled/unintegrated. Remaining D2: explain/eliminate the marginal residual edge, robust worst-case timing including prior spikes, sustained allocations, steep boundary seif aesthetics/continuous motion and target-resolution live regression after scheduler changes. Independent D9b checks may proceed; there is no requirement to enable D2 first.


## Monotone rate and32m/s stress — 29 October

**819tests and production build pass.** Fine Jacobi exchange rate increases1/16→1/8 with the same eight neighbours,32steps,512slots/240s and repose thresholds. Each active-edge exchange is a nonnegative fraction<=1/8 of the total-height difference; their sum<=1, so the new total height remains a convex combination of its original neighbourhood. Equal/opposite immutable-snapshot exchange preserves signed mass. A new checkerboard/spike/noise test combines uneven base, wetness, frozen and non-sand barriers;200iterations per pattern preserve mass, finite bounds and barrier heights. Four-step workgroup dependency radius is unchanged. CPU/GPU constants remain shared; `relaxation.rate` exposes the loaded value solely for runtime diagnostic mismatch checks.

The exact prior overlapping-Ridge fixture now **passes unchanged34.1degree tolerance**: maximum sampled34.00550476degrees, against old34.10289239. Loaded rate0.125/build index-BVEDr-5X.js,14,754fixed60frames/246.0089sim seconds,14,400jobs before expiry,0pending/errors/late. No threshold rounding, added dispatches or larger lifetime. Fifteen sampled scratch tiles are not whole-footprint mass proof. `rate125-fixed60.json` preserves the data.

Dry/wet scratch CPU/GPU maxima2.035e-7/2.030e-7m; frozen unchanged. Packed100-cycle signed-mass drift2.06/5.98/0ppm, within the existing10ppm comparison. Raw native diagnostic timing still spikes1.094/0.689/1.076ms and is retained; this is not a timing pass.

`relaxation-load.mjs` now adds explicit synthetic32 mode and labelled reports, checks loaded rate, records nominal speed, and retains26/live modes. Actual PLOUGH/readback centre travels at32m/s; this is data-path stress, not D3 input feel. At2560×1440 output/0.7 TAAU with eight live Skitter/Plateback actors: three480-frame runs combined compute maxima0.187392/0.186368/0.186368ms,473–474collision-covered frames, max age0.1626/0.1622/0.1618s,0GPU/readback/retirement/late errors. **Fresh-session repeat still FAILS0.4ms**: combined0.492544ms, fine0.454656ms. Single fine batch pass6 spikes0.328704ms at measured sample434 (late in the run), while other batches are~0.015–0.017ms. Thus it cannot be explained away as only first-use warm-up. Collision remains473covered, max age0.1586s. Raw stages and old failures remain retained.

Verdict: keep the higher-rate prototype and newly closed sampled large-writer convergence gate, **do not enable/integrate D2**. Worst-case timing, allocations, broader moving/wet/frozen/large-writer context, steep seif presentation and human/whole-world gates remain open. The32m/s synthetic collision gap is now measured, not inferred from lower-speed D3 runs. Next transport implementation must preserve actual source/landing mass before showing avalanche sheets.
