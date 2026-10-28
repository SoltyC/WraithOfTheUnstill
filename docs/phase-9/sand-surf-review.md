# D3 sand-surf — shared controller prototype, 29 October

**Unintegrated and incomplete.** Worktree `/home/sol/wraith-surf`, branch `codex/sand-surf`, based on D2 `1c98263`. It includes the disabled experimental D2 renderer/solver; physics remains disabled,32steps/512slots/240s. D9b is not merged into this prototype. No target-GPU or human feel acceptance yet.

## Feature and architecture

One existing Surf/CapsuleController selects a static tuning table by baked material. Snow0 keeps its numerical tuning. Sand1/washed sand6 can use the new table only when `surf.sandUnlocked` is explicitly true; default false. D10 must set and restore that grant when the Walker lends/masters sand-surf. A diagnostic may set the flag to test; it is not a progression win. No new input, HUD or parallel controller.

Sand: flat cruise11/forward14m/s, slip-face cap32m/s, stronger gravity coupling1.5g, friction1.1, grip11m/s2, max lean0.52rad. These are prototype design values, not accepted feel. Ideal40s plane oracle gives forward flat14.00 versus snow17.00;45degree descent31.84 versus25.85; uphill1.26 versus8.82. Lower grip/lean widens the carve at equal entry speed. It does not yet add a separately simulated sideways slip angle.

Surface transitions preserve momentum and ease down to the lower cap. Measured sand31.568→snow31.493m/s in one1/120s substep (0.075drop), retaining the same controller. A real CapsuleController landing regression also exposed an existing chain defect: while gliding, inactive horizontal ownership left the still-active surf with stale speed. On landing into an available surf, incoming glide velocity now re-enters the same Surf model; a30m/s glide landing retains>29m/s rather than restoring15m/s. Both snow and sand benefit. Unsupported surfaces brake out with the last material tuning, retaining the prior eased exit.

Runtime controller inputs now use Surf owner fields plus engageQ/stepQ, avoiding four floating-point arguments per hot substep. Numeric wrappers remain for existing diagnostics/tests. No per-frame object/table construction, mesh, draw, binding or upload is added. Browser allocation attribution is still required; this is an architecture statement, not a zero-allocation measurement.

## Design review

Serves **Moving is the joy** and **Learn by reading** in the0–10s carve loop and minute terrain-line/chaining loop. Target: speed, weight and readable material traction. Existing Flow travel/carve/chaining logic reads the same model; stopping still decays Flow, and Flow2+ already widens/deepens the shared wake. Sand sheet/spray/echo specifics remain to implement.

Smell audit:

- Bare-core fun, dominant strategy, no opportunity cost, hollow loop, lying/missing telegraph and empty stretch: **NOT ASSESSED** in the actual world. Bot three-slip-face runs, new enemy surf lines, material seams, wake feedback and human play are required.
- Treadmill, complexity over depth, fetch in disguise, graphics without play and forced resonance: **clear by scope/code inspection**. Same traversal verb/controller, no XP/loot/quest loop or new HUD, meaningful material-dependent route choice.
- Reskinned Warden: **NOT ASSESSED**; no Walker implementation in this checkpoint.
- Gate without warning: **NOT ASSESSED**; default-locked input preserves progression, but D10's lending scene and save/reload hook must teach and restore the grant.
- Scope mismatch: **present** for complete D3. Keep this reviewable controller slice separate from the remaining sheet/spray/audio/world tests rather than calling a model oracle a finished traversal mode.

Verdict: **keep the prototype**, pending actual feel/graphics/performance. Smallest next step: material-aware sand wake and fixed-pool falling sheets using existing terrain writers, then input-driven three-slip-face60fps films and restored-run persistence. Preserve the current artistic style and all snow behavior except the documented momentum-handoff fix.

## Evidence and remaining work

**824tests and locked production build pass**, including five existing snow tests and six new sand/progression/slope/grip/seam/real landing regressions. `sand-surf/controller-model.json` uses the owner-field interface on ideal planes. This is not a GPU collision/parity/performance or human-feel pass.

Remaining D3: sand-specific wake settings and wet/frozen response, sunlit/shadow-casting spray, falling sand sheets with landing state writes, crest-stream emission, persistent coarse run visibility, procedural hiss/rush/singing avalanche boom, robe/FOV/dust speed feedback, actual glide/Updraft/world chains, three authored slip-face films, browser allocations and1440p/60/1%low45 target. Human feel is NOT ASSESSED. D2 must additionally be stressed at the new32m/s cap (old26m/s synthetic test does not establish it). Keep D2 disabled until its residual convergence/timing/crest-quality gates pass.


## Material wake and real-input correction — 29 October

**828 tests and production build pass.** The shared wake now selects a sand table: wider/shallow cut (half-width0.55+0.014×speed; depth0.10+0.0045×speed, cap0.26), heavier1.35 berm,11m/s² grip normalization, bounded spray through the existing3072-particle lifetime pool. Flow3's worst-case sand emission is32/frame,2112 simultaneously alive at60Hz/1.1s before other emitters; shared-pool contention with other effects still needs testing. Snow's numerical geometry/emission remains unchanged. Last-position/LCG state uses fixed typed arrays; this does not establish zero browser allocations.

The first actual Traverse/forward600-frame run failed: peak4.97m/s and an overly ridged track. Its actual output was2544×1289, so it is not1440p evidence. Subsequent solver-off/on runs had fixed output but did not fully reset surf/yaw; keep those as uncontrolled trials. The corrected rest fixture resets velocity, surf/glide state and body/camera yaw to0 without injecting positive speed/active state.

That controlled fixture reached13.399m/s with collision off versus5.050m/s on. Exact Surf input normals changed from roughly0–2° longitudinal terrain slope to a persistent fresh-wake uphill lip (~20–25°). The capsule-ended PLOUGH brush threw its rounded front berm into the next foot query; clearing the preceding stamp interior did not remove this moving obstacle in time.

For sand only, the swept brush now trails by1.65×half-width+0.30m: its entire rounded cap ends0.30m behind the current foot, outside the fine0.25m normal stencil. This retains the terrain writer and collision; it does not bypass collision or alter ground normals. Snow placement is unchanged. A geometry regression covers2/14/32m/s and teleport/inactive gaps. Re-crossing existing grooves, coarse-only ground and sharp reversals remain to validate; the clearance is specifically for normal fine-patch operation.

Corrected real-input trial:600/600 active and grounded, peak13.362m/s,593 collision-covered frames, max age0.1582s, no collision/GPU/late errors, actual2560×1440 output/1792×1008 internal (agreed0.7 TAAU). One repeated timed run gives peak13.363m/s, same600/600 and593coverage, age0.1597s; GPU mean16.505ms/p9918.033ms and rAF mean16.6645ms/p9919.10ms. This short, clear, loaded-scene run has almost no60fps headroom and is **not** sustained D12 acceptance. Raw maxima are retained.

`sand-surf/film-trailing.json` and `screenshots/d3-surf-trailing/sand-surf.mp4`: eight seconds,480/480 frames captured, fixed60Hz/native720p,479 active/480 grounded, peak13.424m/s, zero GPU/readback/late errors. Reviewed six sampled frames in contact.jpg: robe lean, sunlit spray and continuous heavy trail are visible. The rounded wake head and ridged berm need polish; no human graphics/feel signoff. Film capture speed is not real-time performance. No falling ribbon sheets, crest streams, singing avalanche sound or three authored slip-face films are claimed. Diagnostic grant/solver are explicitly restored off afterward.

Evidence: `tools/bot/sand-surf-first-input.mjs` (real rAF), `sand-surf-wake-film.mjs` (fixed-step film), labelled JSON including failed/uncontrolled trials. Sand-specific wet/frozen suppression and whole-run distant/persistence checks remain open. D2 remains default disabled and D3 remains unintegrated/default locked.


## Wet/frozen response — later 29 October checkpoint

**830 tests and production build pass.** Global weather wetness now feeds both normal and photo-run wake paths. Loose sand emission scales by(1-wet)², reaching zero when fully wet; wet cuts shallow continuously to55% of dry depth. Snow retains its numerical behavior. The collision snapshot's spare fourth float carries interpolated frozen fraction; one extra compute storage binding reads the existing fine1 state buffer. No extra buffer, readback size, draw, fragment binding or saved-state layout. Snapshots with nonzero frozen state also refresh periodically while stationary, allowing thawing to be observed.

The sand PLOUGH writer (surf and Sweep share it) now preserves per-texel crust above0.5 frozen fraction, before CPU readback arrives. Covered frozen wake suppresses cuts and loose spray; skipped cuts do not leave a stale brush program for the next writer. Missing/disabled collision coverage cannot yet suppress local frozen CPU spray; the GPU crust guard still protects geometry. D2 remains disabled in normal play, D3 remains locked, and this dependency must be handled at integration. Local state-only wetness (rather than global weather), material-edge mixing and freeze transitions in motion still need further checks.

Live input checks: fully wet180/180 active/grounded, measured wetness1,167 compacted plough writes and **zero emitted loose grains**. Frozen corridor180/180 active/grounded, **zero plough writes/loose grains**, zero GPU/readback/late errors. Reviewed stills show a dark, quieter wet lane and an intact pale frozen patch. The first wet trial incorrectly set weather.wetForce directly; environment overwrote it from ws.wetForce. Its1395-grain report is retained as `first-input-surface-wet-invalid-forcing.json`; corrected harness sets and verifies the world-owned value, restores it afterward, and asserts suppression. The frozen corridor fixture is bounded to120–180frames; it does not cover a whole downhill run.

`sand-surf/surface-gpu.json`: five actual fine-state probes see exactly0 height change under a frozen plough, versus0.199951m after the same plough on reset dry sand; snapshot frozen fraction1, zero GPU/readback/late errors. A diagnostic also clears unrelated dirty markers while sampling stationary refreshes, then restores the update method; this verifies refresh activity, not an isolated performance budget. New regression tests cover frozen interpolation/reset, wet interpolation of effect strength, unchanged snow and safe skipped-brush ownership. Raw earlier dry/frozen/live iterations are retained.

**Still incomplete D3:** falling ribbon sheets and landing writes, crest streams, procedural sound, distant/reloaded whole-run visibility, new enemy/Updraft/glide world chains, three authored slip-face films, browser allocation/performance headroom and human feel. Ridged wake/head art polish remains. This checkpoint does not resolve D2 convergence/timing/seif-quality blockers or authorize enabling it.
