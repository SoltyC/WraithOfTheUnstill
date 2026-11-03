# The release cut against the art bar (2026-11-03)

The bar: BRIEF §1 — "anything that reads as low-poly, flat-shaded, untextured, placeholder, or indie prototype is a defect".
PLAN.md "The art bar": layered depth; warm key against cool shadow, shafts; materials that read as real surfaces at arm's
length; life. Judged frame by frame on cut 6 (`review/release/release-cut6.mp4`, 48 frames, 5 at full resolution).

**Short answer: not there.** A few frames come close: the causeway (depth, shafts, stone), the hall from the well, the dawn's
mountains. Most of the rest reads as a well-lit prototype. What holds it back, ordered by how many frames each costs:

| # | Gap | Where | Cost | This pass |
|---|---|---|---|---|
| 1 | **The people are untextured.** Every robe was one smooth colour: the 4 mm weave fades out past ~0.5 m, so at film distances nothing was left between it and 30 cm wear. Sleeves are tubes; hoods are dark holes or blank domes. | nearly every shot | high | **Mid-scale cloth:** drape folds as relief, wrinkles, crease shading, hand-spun weft, seams with stitches (`shaders/cloth.wgsl.js`). The silhouettes (tube sleeves, blank hoods) are not touched: that is the cloth rig and the figure model. |
| 2 | **Faceted props.** Round things shaded flat: the Lung's bottle, posts. | jetty | low | Drums can be `smooth` (true normals); the Lung uses it, at 24 sides. Columns and other sites unchanged. |
| 3 | **Text cards** stand in for shots: 11 (the Wraith through the kelp), 13 (the Listener lets go). | 13 s | high | **Both filmed.** 11: the Wraith comes down a shaft of sea-light, seen from the held crowd on the causeway. 13: the Wraith at the well, the light swelling as the hold lets go. **No kelp and no Listener exist**: 13 needs the Listener built (a Warden-scale figure) to be the shot the script wants. |
| 4 | **The dawn robes** were near-black lumps (albedo 0.035): no dye, fold or sheen read. | 2:40 to the end | med | Soaked-wool dyes lifted to real values, drying paler where the cloth rides above the water, the sky's gloss along every fold. |
| 5 | **Record shots too dark** to read the robe bending down. | 1:50 to 2:15 | low | Fill lifted, a cold key over the Wraith's head. |
| 6 | **The dawn's near hill** is a smooth mound with a low-res smear of texture. | the last 15 s | high | Not touched: the Sounding's rim terrain, a world-art job (scans, rock outcrops, scree, vegetation). |
| 7 | **The city's gold trim** is long, straight bars catching one flat reflection. The material is good (scanned bronze, verdigris); the geometry has no bevels, mouldings or breaks. | city shots | med | Not touched. |
| 8 | **Morrow's figure.** She stands (no sitting clip has passed the gate); her sleeves dwarf her hands. | jetty | med | Not touched (the motion gate). |
| 9 | **Water.** The Sounding at dawn is a perfect mirror. Physically right for dead calm, but no life near the robes (rings, drift). | dawn | low | Not touched. |

## What AAA needs beyond this pass

- **Characters:** a modelled figure under the cloth with hands that read; hoods with depth and a face or veil; sleeves that taper and fold. The robes carry the game.
- **Terrain at the Sounding:** the rim needs the frost range's treatment (scanned rock, scree, snow lines).
- **The Listener**, for shot 13, and kelp, for the script's version of shot 11.
- **Architecture detail:** bevelled, moulded trim; breakage and weathering on the long runs.
