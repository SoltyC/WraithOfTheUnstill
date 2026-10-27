# Phase 9 execution tracker

User requested an active goal on 2026-10-27: finish the remaining HANDOFF work, including captures, bot play, integration and pushes. Keep user-only feel/acceptance gates explicit. The primary implements most changes; Terra and Luna may handle scoped work. Do not claim completion until the agent-verifiable list is done.

## Current work

- **Primary / sand (`/home/sol/wraith-sand`, port 4174):** independent weather controls are fixed. Fresh six-stage captures showed exposure cancelling wetness; absorption now 0.32 instead of 0.5. Recaptured in `screenshots/sand-wet-fix-1280/`. Foreground FFmpeg YAVG: dry 148.337, wet 106.712 (old wet 132.881). CPU/GPU before-fix exposure readback: dry 0.3889, wet 0.6040. `docs/phase-9/sand-metrics.json` records image measurements. Full validation, star-field before/after and weather/pipeline transition check precede squash integration; exclude raw screenshot history.
- **Primary / encounters (`/home/sol/wraith-encounters`, port 4177):** lifecycle fixes at b0955cc; film/harness repairs at 69d4ff1. Combat setup had a duplicate `const I`; removed. Pulses now use simulation time; shatter telemetry uses cumulative weapon stats. Added `--kit frost` to audit staff + starting element, retaining historical `staff` melee-only runs. Remaining: runtime combat/glide pilot and films, current fight checks, review/integrate.
- **Terra agent `/root/dune_shaped` (`/home/sol/wraith-shaped`, port 4175):** D9a prototype 7e4c7dd, 695 tests/build at initial checkpoint, requested to merge latest main. Has exclusive GPU slot for six Frost/Gale fight configurations and six photo spots. Must explicitly release it. Zero observed collections in isolated helpers; full shaped path has pre-existing/different-shape allocations and is not proven allocation-free. Lead review confirmed detached shell chunks are skipped by `writeAlive` before integrating ballistic offsets, so no redundant rewrite is needed. Bot must exercise Gust→Shard, not just Gust+staff.
- **Main:** d26b0fa warms the dormant forest-haze compute pipeline at load, including compilation retries and replacement resources. Four focused tests, 691 full tests and locked build pass; GPU transition verification pending.

## GPU coordination

Only one target-GPU capture/bot workload at a time. Terra currently owns the slot on port 4175. Primary stopped its Chrome on 4177 before granting it. Preview servers may coexist on 4173 (main), 4174 (sand), 4177 (encounters), 4175 (Terra); builds always use `/tmp/wraith-build.lock`. Do not launch a second Chrome until Terra releases the slot. No trailer modifications.

## Remaining ordered milestones

1. Finish/integrate encounter audit, D1a sand and D9a Shaped.
2. D2 crests, conservative sand relaxation, healing and collision parity (only after sand integration).
3. D9b Whirlers and Glass-sworn.
4. D1b far field and grade.
5. D3 sand-surf, D5/D6 desert light/weather/migration, D7/D7b ruins/glass/ravines, D8 scrub/oasis.
6. D10 Long Walker using gameplay-design §5.1 (bring it home), D11 puzzle grammar and Silent Instruments/camp/quests, glass blade and caravan trade/forge.
7. D12 agent-verifiable gate: shots, performance, full quest path, persistence/reload and regression checks; prepare human feel gates for the user.

Detailed specs remain in HANDOFF.md, gameplay-design.md, plan.md and dunes-design.md. Update this tracker as work proceeds; old access-blocked notes are historical. Full access now works and all existing checkpoints have been pushed.
