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
