# D1b — far field, dune grade and sandstone (in progress)

Source: plan.md D1 and HANDOFF D1b, dunes-design.md §7.2. Preserve the D1a wet/noon calibration and the existing graphical style. Primary owns implementation; Terra only provided a short read-only entry-point scout.

First finding: dune-camera restoration/grade was falling back to Frost. The environment sampled only frost/meadow weights, so releasing the dune Warden could not independently change the local grade or wind. Dune weight and its own eased restoration now participate in the existing owner, with the actual camera biome correctly identified as dunes. A zero dune weight preserves the old frost/meadow blend arithmetic. The grade cache compares independent values instead of an additive scalar whose changes can cancel. Desert weather itself remains D5/D6; this change does not introduce a new weather profile.

Stilled grade is restrained grey-violet and flatter/desaturated; restored leans gold with cool shadows. Constants are provisional until noon/golden/night and wet-sand captures plus clipping review. Three boundary/restoration regressions are added. No GPU or visual acceptance yet. Far normals and sandstone strata remain unimplemented at this checkpoint. D2 and D9b gates remain documented separately.

CPU checkpoint: full suite 781 tests passes; locked production build passes. GPU review is deliberately pending until the D9b GPU slot is released. No visual, clipping, far-field or sandstone acceptance yet.

The next material pass keeps geometry/collision unchanged. At large pixel footprints, sand now retains the drawn dune normal rather than blending toward an averaged texture normal; slip-face lighting also avoids a three-level-coarser normal that loses the meso slope. Near-field D1a scan/rain constants are unchanged. Exposed steep dune walls gain height-aligned ochre/cream sandstone bedding through the existing clipmap lighting/atmosphere shader. Fine laminations fade with footprint; upward faces and the base keep sand through the existing slope blend. This is material treatment, not the D7b wall/arch/sandfall geometry kit. All changes still need actual noon/golden/night/far/clipping review. No visual acceptance yet.

The user clarified that temporary test data must stay on C: and be cleared rather than moved to D:. Future GPU profiles use the normal temporary location and are disposed after the job.

The initial sandstone pass was rejected on image review: slope-only selection striped steep sand faces, and the colour contrast looked artificial. It is replaced with the actual baked rock classification (same surface.materials.rock ID as gameplay) in a one-time 4 MiB R8 sampled texture. This avoids a ninth fragment storage binding and adds no new geometry or bake classification. Bedding now uses the shared 12 m ledge pitch, a restrained palette and footprint fade; the bake imports that same scalar with unchanged value. CPU mask tests cover channel selection/order and invalid texels. No revised GPU acceptance yet. The far4 camera is on meadow land and cannot validate the dune grade; it remains a rejected scouting view.


## Revised material checkpoint — 28 October

The baked rock mask and restrained strata replace the rejected pass. Five cold-start scout captures and the 18-view noon / 17.8 h / 23 h × stilled / restored × close / mid / candidate-far matrix all report zero GPU errors and no late pipeline compilation, at recorded 1280 × 720 dimensions. Reviewed close sand grain remains intact, canyon bands no longer stripe the loose steep dunes, and restored dunes retain cool slip-face shadows. The existing canyon ledge sawteeth are still clearly visible and belong to D7b geometry. No geometry or collision values changed.

Full suite: 783 tests pass; production build passes. Main's C: profile disposal changes are merged; the GPU bot was stopped after review and its C: profile disposed. No test data is retained on D:.

Exposure report uses decoded RGB pixels and the existing capture threshold (any channel >=253), over the whole frame including sun and sky. Sixteen matrix views measure 0%; the two mid views facing sunset measure 0.814% stilled and 2.835% restored. This is not a terrain-only clipping measurement, so the sunset result remains to be isolated before acceptance. Reports are under dune-grade/{scout,matrix,exposure}.json. Selected revised images are in screenshots/dune-grade-scout and screenshots/dune-grade-matrix; the rejected first-pass JSON is retained, with rejected images left local and untracked.

Still open: explicit wet-sand regression against D1a; terrain-only sunset clipping; a measured unobstructed 2–4 km terrain view rather than a foreground-dominated scouting camera; sustained target-resolution cost; and human aesthetic acceptance. D1b remains in progress and unintegrated. D2/D9b gates are unchanged. This work supports the existing stillness/restoration contrast and readable terrain; it adds no new player verb or progression shortcut.
