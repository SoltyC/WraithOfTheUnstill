# D9a design review — implementation reviewed, acceptance limits below

Skitters make the player read a moving sand trail and time a lunge; Plate-backs make the player change position or break a material seam. Pillars: the world remembers and answers, learn by reading. Loop: the 0–10 second fight. Aesthetic: tension and discovery.

Verdict: **change and assess before shipping**. The terrain brush, exposed flanks, Gust/Shard and wet-Frost/strike answers are wired and have CPU tests. Skitter cover uses one shared terrain-state Ridge brush (crest and two flanks), and both leave a mound on collapse. Frost is sufficient in the rules; the actual fights must prove it. The detached plate currently follows a short ballistic fade rather than persistent solid debris; check whether this reads clearly.

- Bare core / isolation: **NOT ASSESSED** — bot fights on sand, 4 Skitters, mixed 1+2, and 2 Plate-backs with Frost then Gale.
- Dominant strategy, opportunity cost, complexity over depth, lying telegraphs: **NOT ASSESSED** — record casts, focus, time, damage, deaths, lunge readability and results from those fights.
- Hollow loop, empty stretch, reward, calm after fights, encounter kind and arena reshape: **NOT ASSESSED** — natural encounter placement is a later integration task; no new spawner was added here.
- Gate without warning: Frost-only route exists in code; teaching and player comprehension **NOT ASSESSED**.
- Graphics without play: cover writes terrain and can be stripped; rendering and visibility **NOT ASSESSED** until six target-GPU shots are inspected.
- Treadmill, reskinned Warden, fetch in disguise, forced resonance: clear for this enemy-only scope. Scope mismatch: **NOT ASSESSED** until bot and GPU reviews complete.
- Target GPU timing, late pipeline creation, style match, animation feel and first-use hitch: **NOT ASSESSED**. The existing Shaped material pipeline is used.
- Allocation: warmed isolated dune helpers: 1,000,000 steps, 0 observed collections and 25,904 bytes heap growth (`node --expose-gc tools/alloc/dune-probe.mjs`). A synthetic 100,000-frame test with eight active mixed dune enemies saw 608 GC events; eight hounds saw 508 and four hounds plus four brutes saw 561. Removing both new per-frame helper calls did not change the 608 result. The complete update does **not** meet a measured zero-allocation claim; investigate the generic body/rig/AI paths and retest on target.

## Bot and visual review — 2026-10-27

At (1900, 900), the auto-fighter used a staff and Frost or Gale; the Gale run also unlocked Stone to test Gust → Shard. Times are simulation seconds, damage is from 100 health. One run per configuration; these do not establish balance for a human player.

| Group | Frost: cleared, seconds, damage, Crystallize attempts | Gale: cleared, seconds, damage, Gust / Shard attempts, verified plate pops |
|---|---|---|
| 4 Skitters | 4/4, 6.2, 0, 1 | 4/4, 6.5, 0, 2 / 0, 0 |
| Plate-back + 2 Skitters | 3/3, 13.3, 56, 3 | 3/3, 10.3, 28, 2 / 1, 1 |
| 2 Plate-backs | 2/2, 13.1, 84, 2 | 2/2, 14.8, 0, 3 / 2, 2 |

Frost-only clears were possible in these runs, but the bot did not record whether it popped each plate or attacked around it. It finished the two-plate Frost fight at 16 health: assess difficulty across more runs and human play. The Gale table records actual seam state and plate state as well as casts. Focus starvation and deaths across repeated runs are **NOT ASSESSED**.

The armed late-pipeline detector was empty after the fights and again after the visual revision. Six 1280-pixel stills are in `screenshots/dune-shaped/`. The earlier plough-and-mound version showed a raised centre against a displaced rim. A single Ridge brush replaced it to avoid concurrent writes. On target, the replacement reads as a low U-shaped hollow, rather than a raised travelling bulge; this fails the intended visual and needs correction. Sand grains are visible during the telegraph but read as sparse fragments; whether a player reads them as a stream in motion is **NOT ASSESSED** and may need further tuning. The Plate-back silhouette, side/front and rise are readable, though the layered slabs look busy. A separate 30-frame bot capture showed the plate fragments separating and moving away independently; that capture included other actors close to the subject, so it is not a clean presentation film. Visual review used the pre-D1a sand material; check again after sand integration. Target 1440p frame cost and 1% lows remain **NOT ASSESSED**.

The two burrow/stream stills depict the single-brush version. The terrain writer runs queued brush jobs concurrently, so the original overlapping plough and mound had no guaranteed ordering. The Ridge brush writes crest and flank depressions as one job; the existing spawn hollow may suppress its crest. Its raised-bulge appearance fails review. Wake and behavior in motion remain **NOT ASSESSED**.

## Lead correction and integration review — 2026-10-28

**Verdict: keep the archetypes and material answers, with the lead corrections.** The earlier hollow/pebble verdict describes the superseded revision. One filling MOUND brush now makes the travelling bulge, avoiding overlapping write races. Frozen telegraphs no longer stamp or emit dust. The fresh target readback in `dune-bulge-probe.json` measured **+0.3547 m** centre relief with no depression; the old Ridge centre failed visually. Adjacent terrain was already disturbed, so its +0.1157 m readback is not a pristine baseline. The probe reported no late pipelines.

Six new 1280 px views on integrated D1a sand are in `screenshots/dune-shaped-lead-1280/`: mound, warning, plate front/side, detached shell and rising bodies. Lead reviewed all six: the raised centre is legible and the shell separates from the body. The warning was revised twice: large airborne grains read as pebbles, and small grains alone disappeared. Fine dust had been emitted below the raised mound. It now spills from the crown, with tiny coarse grains and three outward streams. The final warning still shows a visible dust plume rather than floating stones. A short close-up diagnostic showed the dust spilling but its camera followed the burrow into the Wraith after the warning. That clip fails presentation review and is left uncommitted; it is not acceptance footage. Motion readability at surf speed remains open.

Fresh staff + Frost mixed fight after mound correction (`dune-lead-fight.json`): **3/3 released in 12.4 s, 28 damage**, three Crystallize attempts, eleven frontal glances. This verifies a starting-element solution, not plate-pop use: the bot recorded no pops or weapon shatters in that run. Prior Gale runs above verified actual Gust→Shard pops. Human difficulty, repeated focus budgets and natural encounter composition remain open for D11/D12.

**Allocation correction:** sampling identified the unused numeric return from shared `boneFrame` as the dominant source of boxed values. Removing it preserves all output records and reduces the same eight-body probe from 608 to **19 collections per 100,000 frames**. `tools/alloc/dune-pool.mjs` reproduces the pool measurement; `dune-allocation.json` records the result. Isolated new helpers still show **0 collections / 1,000,000 steps**, +29,256 bytes. Remaining shared body/AI allocations and Chrome behavior remain an explicit D12 issue; the entire path is not described as allocation-free.

**Validation:** current main including encounter integration merged; **772 tests pass**, locked build passes. Ten dune regressions include frozen ground, burrowing/stripping, frontal versus flank/crown hits, wet-frozen seam pop, Gust→Shard/Bloom, detached shell motion and eight finite active bodies. Human feel, sustained 1440p performance, 1% lows and surf-speed telegraph reading remain **NOT ASSESSED**. No natural spawner is added before the dune quest/encounter pass.
