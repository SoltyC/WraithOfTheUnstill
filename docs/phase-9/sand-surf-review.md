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
