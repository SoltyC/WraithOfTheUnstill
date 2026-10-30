# Phase 9 — the erg: human review guide (30 October 2026, updated)

Everything for D7 (ruins and glass), D7b (ravine kits) and D8 (scrub, margin, oasis) is in and on
`claude/wraithoftheunstill-phase-7`. This is the list to walk through. Each view is a photo spot:
open the game with `?spot=<id>` (add `&title=0` to skip the title), or pick it from the photo-spot
menu. The captures from the last build are in `screenshots/phase-09-review/` (`sheet.jpg` is all
seventeen on one page).

Restoration matters: most spots set the Dunes **restored**; `p9r-oasis-stilled` sets them stilled.
Water in the braids runs only from about 16:30 to 1:00 and only once restored.

## The views and what to judge

| Spot | What it shows | Judge |
|---|---|---|
| `p9r-galleries-dawn` | down the Red Galleries at dawn | strata read as layers; the shade is cool but not black |
| `p9r-galleries-rim` | the Galleries' terraces from near the east rim | no sawteeth; ledges and caps sit on the terrain |
| `p9r-needle-noon` | inside the Needle slot at noon | warm bounce on polished walls; beams only when the sun reaches in (rare: see below) |
| `p9r-stride-glide` | over the Stride and a land bridge | depth reads; the rift's darker rock |
| `p9r-stride-seams` | down in the Stride | thin black-green glass veins in the walls, glinting, not glowing |
| `p9r-hoodoos-dusk`, `p9r-hoodoos-noon` | the hoodoo field and arches | clean silhouettes, long shadows |
| `p9r-canyon-shade` | the Galleries' floor in afternoon shade | the shaded sand is warm (the walls' bounce), not pale blue; sparse thorn and tamarisk |
| `p9r-sandfall-restored` | a tiered sandfall on the west wall, morning | reads as poured sand; a cone of sand heaping at its foot |
| `p9r-sandfall-frozen` | the same cascade frozen, afternoon shade | ramps of frozen sand ledge to ledge — a way up the wall |
| `p9r-braids-restored` | the Dry Braids at dusk from above | thin braided water catching the sky, not a river; the aqueduct beside |
| `p9r-glass-field` | a battle-glass field, late afternoon | glass, not plastic: green to amber, sky in it, dark in shade; the ground round each piece fused into a crazed glass crust |
| `p9r-colossus-head` | the colossus head from the front | reads as a face (brow, nose, cheeks, ears) |
| `p9r-pavement` | desert pavement underfoot | packed, varnished gravel, not dots |
| `p9r-pavement-far` | the flats at 16:00 | darker gravel patches in the sand |
| `p9r-oasis-restored` / `p9r-oasis-stilled` | the oasis both ways, the caravanserai beyond | restored: green palms, pool, reeds; stilled: grey palms, the basin dry and crazed |

Worth walking too (no fixed spot):
- **Freeze a sandfall**: with the Dunes restored and Frost in hand, Crystallize at the foot of a running cascade (the one in `p9r-sandfall-restored`). It freezes over a few seconds and stays frozen (saved). Climb its ramps up the wall.
- **Wade the braids** at dusk once restored: a wake and splashes in the thin water. Flower clumps line their banks.
- **The caravanserai** at the oasis: the gate drift (walk up and over it), the arcade roof (the stair in the back-left corner), the dry well.
- **Glass ground**: surf onto it — it is slick.
- The slot floors; a wall's foot (collision); the Dry Stair's ford into the canyon; the margin's grass drying to straw toward the erg.

## What changed in this round

- **Frozen sandfalls**: Crystallize freezes a cascade into ramps and landings of frozen sand. The Wraith can climb a whole three-tier cascade, 107 m to 145 m. The controller no longer slides on steep terrain while standing on a built floor above it.
- **Running sandfalls** heap a cone of sand at their foot (terrain state); it heals away when they stop or freeze.
- **Slot beams**: art-directed beams at the slot bends, dropping from the rim at the sun's elevation while the sun is high and the rim is lit. (At this latitude the sun peaks at 49°, so the exact shadow-tested shafts barely reach into a slot.)
- **Braids**: the Wraith wades in them. The CPU reads the shader's own water mask, and the wake and splashes ripple the sheets.
- **Glass ground**: the terrain state's GLASS transform is fused under every piece of battle glass, drawn as a crazed, bubbled crust. It is surfable and slick, and it is the same channel D9's Glass-sworn will write.
- **The caravanserai** (the Wellhouse camp, D11) at the oasis: walls, gate, towers, arcade with a walkable roof, a stair, the dry well, and sand drifted against the walls and into the gateway. The gate drift is a walkable solid. Trees now keep out of the erg's ruins.
- **The margin's dry grass**: toward the erg the meadow's grass dries to straw, shorter and thinning in patches.
- **Cliff fix**: two bake errors left some canyon risers as bare smeared sand slopes. Contour smoothing pulled cliff lines up onto the rock, and the floor trace used the spine's floor instead of the real one. Both are fixed.

## Known gaps

- **Full-scene refraction in the glass** is not done. It needs a copy of the opaque scene behind the glass (a new pass in the post chain). The glass's see-through term (the sky and sand behind, modelled) stands in.
- **Sandfalls are fed by nothing** until D2's sand flow. Their cone is a kept heap, not a mass budget.
- **No pair of cascades faces across the canyon**, so `p9r-sandfall-frozen` and `p9r-sandfall-restored` show the same cascade frozen in shade and running in sun, not side by side.
- The allocation check flags `controller.update`, `springArm.update`, `weapons.update` and `stone.update`. These fail identically at the session's starting commit (ed57334), so they are not from this work. Worth a look on their own.

## Cost

GPU means at 2560×1440, render scale 0.7 on the 3060: 13.9–14.1 ms at `p9r-galleries-dawn`, 14.2 at
`p9r-hoodoos-noon`, 14.1 at `p9r-needle-noon`, 10.6 at `p9r-braids-restored`, 14.8 at `p8-meadow-golden`; load 18.0 s; no late pipelines. See PERF.md.
