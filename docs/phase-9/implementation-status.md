# Phase 9 execution tracker

User requested an active goal on 2026-10-27: finish the remaining HANDOFF work, including captures, bot play, integration and pushes. Keep user-only feel/acceptance gates explicit. The primary implements most changes; Terra and Luna may handle scoped work. Do not claim completion until the agent-verifiable list is done.

## Current work (2026-10-28)

- **D1a sand integrated** as `e491fa6`. Six revised rain stages show dry foreground YAVG 148.337 → wet 106.712; dry/wet white clipping 0%. Fixed star-field median GPU delta +1.55 ms (25.55 → 27.10 ms), indicative headless comparison, not sustained-performance acceptance. Review and measurement JSON are in `docs/phase-9/`. Main passed 700 tests at this checkpoint.
- **Encounters ready for integration:** three reviewed 720p isolation films, fresh staff + Frost checks, all six Barley enemies and 60 s calm verified. Cloister/stair/ring 3/3 clears each; Barley corrected bot navigation 3/3. Original chase failures retained. Main merged through `984fa34`; 762 tests and locked build pass. Audit §9 records evidence and human-only limits.
- **D9a lead review** in `/home/sol/wraith-shaped`: Terra finished its scoped implementation. Lead found a hollow where a moving mound should be; replaced the Ridge with one filling MOUND brush and fixed frozen telegraphs emitting sand. 710 tests passed before diagnostic readback extension. Fresh merged-sand captures/probes are running before integration. All outstanding code and visuals are verified by the primary.
- **Pipeline gate:** dormant forest-haze compute now warms at load. Cold forest entry has zero late compute but five late render pipelines. Main `984fa34` adds shader names to diagnostics so the missing variants can be identified. World-wide zero-late acceptance remains open.
- **D2:** worktree `/home/sol/wraith-relax` prepared; no implementation yet. It follows the first three integrations.

## GPU coordination

Only one Windows target-GPU capture/bot workload at a time. Primary owns the slot; encounter Chrome has stopped and D9a captures run on 4175. Preview servers may coexist. Builds always use `/tmp/wraith-build.lock`. Preserve original untracked screenshots and exclude raw captures/frame sequences from commits. User's latest delegation rule: only extremely easy/light subtasks, with primary verification of every code change. No trailer modifications.

## Remaining ordered milestones

1. Finish/integrate encounter audit, D1a sand and D9a Shaped.
2. D2 crests, conservative sand relaxation, healing and collision parity (only after sand integration).
3. D9b Whirlers and Glass-sworn.
4. D1b far field and grade.
5. D3 sand-surf, D5/D6 desert light/weather/migration, D7/D7b ruins/glass/ravines, D8 scrub/oasis.
6. D10 Long Walker using gameplay-design §5.1 (bring it home), D11 puzzle grammar and Silent Instruments/camp/quests, glass blade and caravan trade/forge.
7. D12 agent-verifiable gate: shots, performance, full quest path, persistence/reload and regression checks; prepare human feel gates for the user.

Detailed specs remain in HANDOFF.md, gameplay-design.md, plan.md and dunes-design.md. Update this tracker as work proceeds; old access-blocked notes are historical. Full access now works and all existing checkpoints have been pushed.
