# Phase 9 execution tracker

User requested an active goal on 2026-10-27: finish the remaining HANDOFF work, including captures, bot play, integration and pushes. Keep user-only feel/acceptance gates explicit. The primary implements most changes; Terra and Luna may handle scoped work. Do not claim completion until the agent-verifiable list is done.

## Current work (2026-10-28)

- **D1a sand integrated** as `e491fa6`. Six revised rain stages show dry foreground YAVG 148.337 → wet 106.712; dry/wet white clipping 0%. Fixed star-field median GPU delta +1.55 ms (25.55 → 27.10 ms), indicative headless comparison, not sustained-performance acceptance. Review and measurement JSON are in `docs/phase-9/`. Main passed 700 tests at this checkpoint.
- **Encounters integrated** as `bbb3898`: three reviewed 720p isolation films, fresh staff + Frost checks, all six Barley enemies and 60 s calm verified. Cloister/stair/ring 3/3 clears each; Barley corrected bot navigation 3/3. Original chase failures retained. Main merged through `984fa34`; 762 tests and locked build pass. Audit §9 records evidence and human-only limits.
- **D9a lead review** in `/home/sol/wraith-shaped`: Terra finished its scoped implementation. Lead found a hollow where a moving mound should be; replaced the Ridge with one filling MOUND brush and fixed frozen telegraphs emitting sand. 710 tests passed before diagnostic readback extension. Fresh merged-sand captures and readback verify +0.355 m raised relief. Dust now emits above the mound. 772 tests and build pass; shared rig allocation fix reduces pool collections 608 → 19 / 100k frames; zero full-path allocation remains open. Integrated into main as `72fceda`. All outstanding code and visuals are verified by the primary.
- **Pipeline gate:** dormant forest-haze compute now warms at load. Cold forest entry has zero late compute but five late render pipelines. Main `984fa34` adds shader names to diagnostics so the missing variants can be identified. World-wide zero-late acceptance remains open.
- **D2 in progress:** `/home/sol/wraith-relax`, branch `codex/dune-relaxation`, port 4176. Fine Jacobi relaxation, coarse disjoint-pair projection, collision streaming and wind-dependent weathering are implemented and target-checked. CPU/GPU oracle error 1.30e-7 m; coarse oracle 3.78e-7 m. Rounding remainders survive coarse/page transitions. Temporal healing bias was fixed. Real 60 s trail retains 89% depth/94% compaction; valid save/load and fresh-page trace recovery pass. A 10 m groove retains 98.5% depth in five save/load samples, with reviewed 1280 px images. **792 tests and locked build pass.** A clean 32 s 720p/60 avalanche film is reviewed (zero errors/late); its 35.18° final maximum leaves the 34° settling gate open. Restored ground now wakes without a new brush: target peak 1.699 → 1.293 m over 481 jobs, zero errors/late. D2 stays disabled pending full-load timing/movement/allocation checks, crest silhouettes/parity and settling-time acceptance. Eight steps/tile and 30 s queue lifetime are the current prototype settings. `relaxation-review.md` records remaining gates and fine-footprint detail lost on coarse refill.
- **General fixes integrated on main:** `bb8585a` preserves disabled snapshots through resize/culling and restores capture state; `56c4238` hides carried weapons/trails/light with the Wraith, including held photo poses. Cold GPU checks pass; main has **774 passing tests** and a passing build.

## GPU coordination

Only one Windows target-GPU capture/bot workload at a time. Primary owns the slot; encounter and D9a Chromes have stopped; D2 bot runs on 4176. Preview servers may coexist. Builds always use `/tmp/wraith-build.lock`. Preserve original untracked screenshots and exclude raw captures/frame sequences from commits. User's latest delegation rule: only extremely easy/light subtasks, with primary verification of every code change. No trailer modifications.

## Remaining ordered milestones

1. Encounter audit, D1a sand and D9a Shaped are integrated; their human-only/full-world gates remain documented.
2. D2 crests, conservative sand relaxation, healing and collision parity (only after sand integration).
3. D9b Whirlers and Glass-sworn.
4. D1b far field and grade.
5. D3 sand-surf, D5/D6 desert light/weather/migration, D7/D7b ruins/glass/ravines, D8 scrub/oasis.
6. D10 Long Walker using gameplay-design §5.1 (bring it home), D11 puzzle grammar and Silent Instruments/camp/quests, glass blade and caravan trade/forge.
7. D12 agent-verifiable gate: shots, performance, full quest path, persistence/reload and regression checks; prepare human feel gates for the user.

Detailed specs remain in HANDOFF.md, gameplay-design.md, plan.md and dunes-design.md. Update this tracker as work proceeds; old access-blocked notes are historical. Full access now works and all existing checkpoints have been pushed.
