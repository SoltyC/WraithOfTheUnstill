# D9a design review — in progress

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

The armed late-pipeline detector was empty after the fights and again after the visual revision. Six 1280-pixel stills are in `screenshots/dune-shaped/`. The photographed plough-and-mound version showed a raised centre against a displaced rim. It was subsequently replaced with a single Ridge brush to avoid concurrent writes to the same texels; the new brush has not yet been captured on the target GPU. Sand grains are visible during the telegraph but read as sparse fragments; whether a player reads them as a stream in motion is **NOT ASSESSED** and may need further tuning. The Plate-back silhouette, side/front and rise are readable, though the layered slabs look busy. A separate 30-frame bot capture showed the plate fragments separating and moving away independently; that capture included other actors close to the subject, so it is not a clean presentation film. Visual review used the pre-D1a sand material; check again after sand integration. Target 1440p frame cost and 1% lows remain **NOT ASSESSED**.

The two burrow/stream stills depict the previous two-brush prototype; refresh them for the single-brush version. The terrain writer runs queued brush jobs concurrently, so the original overlapping plough and mound had no guaranteed ordering. The Ridge brush writes crest and flank depressions as one job. **NOT ASSESSED:** new brush shape, wake and terrain-state behavior on target GPU.
