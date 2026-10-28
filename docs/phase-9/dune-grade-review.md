# D1b — far field, dune grade and sandstone (in progress)

Source: plan.md D1 and HANDOFF D1b, dunes-design.md §7.2. Preserve the D1a wet/noon calibration and the existing graphical style. Primary owns implementation; Terra only provided a short read-only entry-point scout.

First finding: dune-camera restoration/grade was falling back to Frost. The environment sampled only frost/meadow weights, so releasing the dune Warden could not independently change the local grade or wind. Dune weight and its own eased restoration now participate in the existing owner, with the actual camera biome correctly identified as dunes. A zero dune weight preserves the old frost/meadow blend arithmetic. The grade cache compares independent values instead of an additive scalar whose changes can cancel. Desert weather itself remains D5/D6; this change does not introduce a new weather profile.

Stilled grade is restrained grey-violet and flatter/desaturated; restored leans gold with cool shadows. Constants are provisional until noon/golden/night and wet-sand captures plus clipping review. Three boundary/restoration regressions are added. No GPU or visual acceptance yet. Far normals and sandstone strata remain unimplemented at this checkpoint. D2 and D9b gates remain documented separately.

CPU checkpoint: full suite 781 tests passes; locked production build passes. GPU review is deliberately pending until the D9b GPU slot is released. No visual, clipping, far-field or sandstone acceptance yet.
