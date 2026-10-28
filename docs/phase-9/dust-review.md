# Sand dust — requested visual addition, 2026-10-28

Subtle ground blow and rising puffs make loose sand answer movement and show the wind. This serves **the world remembers and answers** and **learn by reading**, at the seconds/minute loop, as material feedback and Sensation. No new player rule, Flow budget, damage, or progression is introduced.

## Implementation

- One static transparent draw: 1,536 wind wisps plus 24 bounded disturbance events × 24 particles (2,112 quads). Motion is in WGSL; CPU updates reuse arrays and vectors.
- Completed terrain brushes, including footprints, ploughs, mounds and Stone writes, trigger low dust that rises and disperses downwind. Freeze/wet paint and empty writes do not emit events. Restore clears old puffs. Existing Stone/Skitters' telegraphs remain intact.
- Uses the shared wind direction, gust-front/burst function, atmosphere and shadows. Dune restoration controls ambient ground blow independently of Frost's release. Stilled dunes have no ambient blowing dust; disturbances still answer. This is a small material effect, not D6 sandstorms or the future stilled veil.
- Baked sand/beach masks restrict sources; actual fine-window wet/frozen/transformed state suppresses loose grains. Rain wetness reduces dust gradually. Fine height relief keeps puffs above newly displaced ground.
- The overlay has a `sand dust` toggle. Pipeline is created with the normal boot materials and exercised during loading; no lazy variant at first dust.

## Validation

`tools/bot/sand-dust.mjs` captures five fixed-time views and invokes the direct material gate. `sand-dust-material.mjs` runs the **actual looseSand shader body**, with only rain promoted to a parameter, against the live GPU surface, fine state and window buffers. Target RTX 3060 results: dry **1**, rain 0.2 **0.8856976**, rain 0.5 **0.1713077**, fully wet **0**, non-sand **0**; freezing the real patch returns **0** at every sand query. Zero GPU errors and late world pipelines. Diagnostic pipeline creation is excluded synchronously from late detection; gameplay and all asynchronous work retain detection.

The initial image-only comparison failed its suppression thresholds because exposure/background evolution affected pixels. Those reports are preserved as `dust/before-exposure-control.json` and `dust/before-direct-material-oracle.json`; they are not accepted as exact suppression evidence. Images remain useful for visibility, and the live-buffer oracle now decides the material gate. Film grain/TAA, noise and exposure controls in the comparison are diagnostic only; normal gameplay settings are unchanged.

Reviewed the five 1264 × 569 captures and frames 105/240/330 of the six-second 1280 × 720, 60 fps film at `screenshots/sand-dust-review/sand-dust-720p.mp4`. The wisps stay near the ground, the two mound writes lift small warm puffs, and the puffs fade rather than lingering as fog. Raw 360-frame JPEG sequence is preserved locally and excluded from commits. This is a scripted material showcase, not a full traversal or D2 avalanche acceptance film.

1440p headless alternating off/on timestamp checks, 179 samples each: off medians **17.9699 / 17.9479 ms**, on **18.1709 / 18.1631 ms**. Indicative median cost **+0.2010 / +0.2153 ms**. Zero GPU errors/late pipelines. The baseline already exceeds 16.67 ms; these fixed-view measurements do **not** pass sustained 1440p/60 or the independent D2 relaxation budget.

Three regression tests cover event filtering, bounded memory/overwrite, normalized directions and restore reset. **783/783 tests pass**, including five previously untracked local-LLM tests preserved unchanged (778 tracked tests after this feature). Locked production build passes.

## Design verdict

Keep as cheap material feedback; style remains the existing warm sand and atmosphere. The graphics-without-play smell is accepted as bounded Sensation; missing/lying telegraphs are avoided by preserving enemy warnings, limiting opacity and suppressing non-loose surfaces. New strategy/resource/quest/Warden/economy smells are clear because these rules are unchanged. Bare-verb fun, human feel and readability during an eight-enemy sandstorm are **NOT ASSESSED**; D3/D6 and human play retain those gates. D2 stays disabled and unintegrated.
