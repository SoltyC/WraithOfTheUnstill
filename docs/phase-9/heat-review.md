# D5 heat-shimmer slice — 29 October

Heat shimmer is built and technically reviewed; **D5 as a whole remains incomplete**. Branch `codex/desert-light`, based on main98a1449, without experimental D2/D3. Keep the painterly style, warm sand/cool shade, clear near character. No gameplay/controller, terrain height, weather machine, restoration progression or exposure-meter behavior changes.

## Architecture and behavior

Refract the composed scene immediately before temporal reconstruction in TAA. This implements the planned after-compose/before-TAA ordering without a separate full-resolution copy target/pass. Reuse the history's bilinear sampler; add two compute storage bindings (existing baked surface buffer plus a32-byte control buffer). No fragment-stage bindings, draw, render target or per-frame arrays. Owner fields feed hour/time, smooth biome/restoration weight, wetness and cover. A dev toggle supports A/B; no product HUD.

Heat peaks around13h, fades with wetness/cloud, and is zero at night/outside the erg/stilled dunes. Per-pixel reverse-Z reconstruction uses the unjittered grid. Sky/non-sand/near<=90m have no offset; strength ramps to250m, masked to grazing rays. Wave amplitude is bounded1.25 reference-output pixels at1440 (live art cap3), scaled into internal pixels for TAAU. No temporal random seed. Source samples reject nearby<80m geometry and depth-layer differences>8%, protecting silhouettes. Widen temporal variance bounds and modestly reduce feedback under heat; unchanged paths retain the original reconstruction.

The exposure meter still reads the composed image before refraction. Heat uses no new bright/emissive term. Mirage reflection, aerosol/sky grade, Milky Way and ruin-interior exposure checks are not supplied by this slice.

## Verification

**787 tracked tests and production build pass** (main784 plus three heat-control tests). Controls cover time/restoration/wetness/biome/cloud interpolation, fixed buffer ownership and amplitude bounds.

`heat/off-oracle.json`: actual original main TAA compute versus new compute with heat0 on identical live composed/depth inputs and constant history. Both reconstruction-only and history branches are **bit-identical**,0mismatches/max difference0, no GPU errors. Diagnostic pipelines were deliberately compiled with the late detector unarmed; the subsequent performance/film session starts a fresh browser for its cold world gate.

`heat/masks-synchronized.json`: actual debug-mask/color/depth readback with the render loop stopped and GPU queue drained so matrices and jitter refer to the same frame. Every fourth pixel at1280×720: dry noon7214positive samples, max0.7598,30596near/1329sky/16954non-sand samples with **zero leaks**. Night/wet/stilled/off all have0positive samples and0leaks. The initial unsynchronized jittered readback had one material-boundary disagreement and is retained in masks-jittered.json; it was not accepted as a zero-leak result. Static-jitter-off masks.json also passes; the synchronized test restores normal jitter and resolves that fixture ambiguity without changing the guard.

Three matched alternating240-frame off/on measurements at actual2560×1440 output/1792×1008 internal (0.7 TAAU), fixed clear restored-noon view with near Wraith and frozen simulation. Mean whole-frame GPU deltas: 0.109285ms, 0.139641ms, 0.116851ms. Off means11.764–11.821ms, on11.873–11.938ms;0GPU errors/late pipelines. This is a fixed-scene incremental cost, not whole-world sustained traversal/weather/combat or combined D2/D3 performance. No browser allocation pass is claimed.

Six-second film captures360/360 frames at native2560×1440/fixed60Hz, first3s off then3s on,0failed/GPU/late errors. `screenshots/d5-heat-review/heat-ab.mp4` is a1280×720 review encode from the native frames; contact.jpg shows six sampled frames. Near Wraith and terrain stay readable; distant wavering is deliberately subtle. Reviewed samples do not show an unwanted palette change or near-body blur. Continuous motion/camera sweeps, human aesthetics and far combat-telegraph readability remain unassessed. Debug mask stills accompany the reports; raw frames/initial failed fixture remain local.

## Design verdict and remaining tasks

Serves **Learn by reading** and the sensation/place layer of **Moving is the joy**,0–10s environmental feedback and minute route/vista loops. No new Flow rule, progression gate or resource. Pure Sensation is accepted at the measured small fixed-scene cost. Treadmill, complexity-over-depth, fetch, forced resonance, reskinned Warden and opportunity-cost smells are clear by scope; no mechanics/quests/Warden are introduced. Bare-core fun, dominance, hollow loop and empty-stretch context remain NOT ASSESSED as whole-world judgments. Far telegraph readability is NOT ASSESSED, not replaced by mask tests. Scope mismatch is present for full D5; explicitly keep mirage/sky/exposure and D6 outside this completed slice.

Verdict: **keep and integrate the verified shimmer slice after main regression**; do not claim complete D5/D6 or human signoff. Next D5: mirage on playas, dust aerosol/noon/golden/night skies and interior/exterior exposure; D6 retains sandstorm front/veil/crest streams/migration. D2's residual worst-case timing and sheets' real transport contract remain separate open work.
