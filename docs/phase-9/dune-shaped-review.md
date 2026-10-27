# D9a design review — in progress

Skitters make the player read a moving sand trail and time a lunge; Plate-backs make the player change position or break a material seam. Pillars: the world remembers and answers, learn by reading. Loop: the 0–10 second fight. Aesthetic: tension and discovery.

Verdict: **change and assess before shipping**. The terrain brush, exposed flanks, Gust/Shard and wet-Frost/strike answers are wired and have CPU tests. Skitter cover uses the shared terrain-state plough/berm, and both leave a mound on collapse. Frost is sufficient in the rules; the actual fights must prove it. The detached plate currently follows a short ballistic fade rather than persistent solid debris; check whether this reads clearly.

- Bare core / isolation: **NOT ASSESSED** — bot fights on sand, 4 Skitters, mixed 1+2, and 2 Plate-backs with Frost then Gale.
- Dominant strategy, opportunity cost, complexity over depth, lying telegraphs: **NOT ASSESSED** — record casts, focus, time, damage, deaths, lunge readability and results from those fights.
- Hollow loop, empty stretch, reward, calm after fights, encounter kind and arena reshape: **NOT ASSESSED** — natural encounter placement is a later integration task; no new spawner was added here.
- Gate without warning: Frost-only route exists in code; teaching and player comprehension **NOT ASSESSED**.
- Graphics without play: cover writes terrain and can be stripped; rendering and visibility **NOT ASSESSED** until six target-GPU shots are inspected.
- Treadmill, reskinned Warden, fetch in disguise, forced resonance: clear for this enemy-only scope. Scope mismatch: **NOT ASSESSED** until bot and GPU reviews complete.
- Target GPU timing, late pipeline creation, style match, animation feel and first-use hitch: **NOT ASSESSED**. The existing Shaped material pipeline is used.
- Allocation: warmed isolated dune helpers: 1,000,000 steps, 0 observed collections and 25,904 bytes heap growth (`node --expose-gc tools/alloc/dune-probe.mjs`). A synthetic 100,000-frame test with eight active mixed dune enemies saw 608 GC events; eight hounds saw 508 and four hounds plus four brutes saw 561. Removing both new per-frame helper calls did not change the 608 result. The complete update does **not** meet a measured zero-allocation claim; investigate the generic body/rig/AI paths and retest on target.
