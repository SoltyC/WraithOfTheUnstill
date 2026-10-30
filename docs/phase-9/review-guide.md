# Phase 9 — the erg: human review guide (30 October 2026)

Everything for D7 (ruins and glass), D7b (ravine kits) and D8 (scrub, margin, oasis) is in and on
`claude/wraithoftheunstill-phase-7`. This is the list to walk through. Each view is a photo spot:
open the game with `?spot=<id>` (add `&title=0` to skip the title), or pick it from the photo-spot
menu. The captures from the last build are in `screenshots/phase-09-review/` (`sheet.jpg` is all
sixteen on one page).

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
| `p9r-sandfall-restored` | a tiered sandfall on the west wall, morning | reads as poured sand; faint in shade |
| `p9r-braids-restored` | the Dry Braids at dusk from above | thin braided water catching the sky, not a river; the aqueduct beside |
| `p9r-glass-field` | a battle-glass field, late afternoon | glass, not plastic: green to amber, sky in it, dark in shade |
| `p9r-colossus-head` | the colossus head from the front | reads as a face (brow, nose, cheeks, ears) |
| `p9r-pavement` | desert pavement underfoot | packed, varnished gravel, not dots |
| `p9r-pavement-far` | the flats at 16:00 | darker gravel patches in the sand |
| `p9r-oasis-restored` / `p9r-oasis-stilled` | the oasis both ways | restored: green palms, pool, reeds; stilled: grey palms, the basin dry and crazed |

Worth walking too (no fixed spot): the braids' banks once restored (flower clumps: primrose,
sand verbena, globemallow, marigold); the slot floors; a wall's foot (collision); the Dry Stair's
ford into the canyon.

## Known gaps (not bugs)

- **Slot light shafts** are physically placed (lit only where the shadow map says the sun reaches
  the air) and so rarely visible: the sun peaks at 49° and the Needle runs across its azimuth.
- **Frozen sandfalls** and `p9r-sandfall-frozen` wait for D11's puzzles (freezing a fall is a verb).
- **Sandfalls and the braids' water are visual only** until D2's sand flow; nothing wades in the braids.
- Glass ground as terrain state, full-scene refraction, sand drifting into doorways as CPU solids
  and the caravanserai (D11) are not done.
- The margin's dry grass is the existing straw tussocks, not its own blade type.

## Cost

GPU means at 2560×1440, render scale 0.7 on the 3060: 13.1 ms at `p9r-galleries-dawn`, 13.1 at
`p9r-hoodoos-noon`, 9.9 at `p9r-braids-restored`; load 17.1–17.5 s; no late pipelines. See PERF.md.
