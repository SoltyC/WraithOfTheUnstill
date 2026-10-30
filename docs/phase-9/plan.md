# Phase 9 — Glass Dunes and Stone (plan, drafted 2026-10-24)

BRIEF §17: *sand material, dune layers, sand-surf, heat shimmer, sandstorms, ruins, Stone verbs,
dune Shaped and Warden, the camp, and borders.* **Gate:** the dunes' signature frame (§6.4: a
sand-surf carve down a slip face, the sand wake curling and avalanching, a glass formation catching
the sun behind). The sand-surf wake must avalanche convincingly.

This file is the work order for the phase. How the game plays *across* biomes (order, gating,
revisits, reactions everywhere) is in `docs/cross-biome.md`; read that first, because several
choices below depend on it. The meadow's lessons apply throughout: risky tech comes first, every
milestone is checked on the 3060 with shots and with the bot, and the user reviews at the marked
checkpoints.

Map: `docs/phase-9/world-map.png` (1 px = 8 m, 1 km grid; red squares = Warden arenas, white =
shrines, yellow = Hearn).

---

## Where the dunes stand today (audit, 2026-10-24)

- **Geography (baked, seed 1):**
  - The erg is the east basin, about x 1500–3300, z 300–1300, at about 150 m.
  - From Hearn (125, 950) it is reached two ways:
    - down an escarpment from the meadow, x ≈ 1000–1400, which drops from 300–380 m to 150 m;
    - south-east off the frost plateau, where snow meets sand at z ≈ 1600–2000. The frost camp and the Frost Warden are only about 1.5 km from that edge.
  - South of z ≈ 400 the dunes blend into the Ember Waste: by z = 0 the weights are about 40 % dunes and 60 % ember.
  - Area where dunes dominate (more than half the weight): **4.3 km²**. Area with any real dune weight (more than a quarter): 8.3 km².
  - That is small for "huge star and barchan dunes" and an erg that reads as vast.
- **Baked POIs:** Warden arena `warden-dunes` (2436, 1124), 149 m; shrines `shrine-dunes-1…5`. No camp, ruins, echo stones or caves are placed yet.
- **Prevailing wind** (`wind.rg8`): toward the ENE, roughly (0.85, 0.5). Dunes, ripples, sand plumes and the slip faces must all agree with it.
- **Height:** `src/terrain/meso.js` has a dune layer:
  - transverse dunes about 140 m apart, 22 m high, with a lee slip face from `duneProfile`;
  - crests broken into segments;
  - 0.6 m ripples.
  - The same function exists in WGSL, with a parity check.
- **Look:** the "clay" view. `p1-dunes-golden` (`screenshots/final-1/`) shows:
  - flat tan albedo, with no ripples, glints or slip-face sharpness;
  - **meadow grass growing across the basin floor and up into the sand** (the grass places by meadow weight and ignores the sand), which is a defect;
  - an odd single peak (the east ring) dominating the frame.
- **Terrain state:** three words per texel (layout.js).
  - Depression, displaced, compaction, wetness, frozen, transform id, molten and flatten all exist.
  - There is no granular **relaxation** (avalanche) pass. That is the core new tech of this phase.
- **Surf:** `character/surf.js` and `surfWake.js` are tuned for snow, as one shared controller per BRIEF §9.3.
- **Elements:** `game/elements.js` lists `stone`, but `BUILT` is `{frost, gale}`.
  - The reactions table has the Stone column as data with `brush: null`.
  - Save is still v2. Elements are not saved; Gale is re-granted from the `WOKE` flag on load.

---

## Milestones

Same shape as Phase 8. Each ends in something reviewable on the 3060. The risky tech (sand material, dune geometry, avalanching state, sand-surf) comes first.

### D0 — Geography, bake and multi-biome clean-up (one session)

- **A bigger erg:**
  - Tighten the volcano's influence (`regions()`: `smooth(1000, 2900)` → about `smooth(900, 2300)`) and push the dune region south to z ≈ −400, so the pure erg grows to about 8–10 km².
  - Acceptance:
    - frost and meadow weights west of x = 1000 are byte-identical to today (diff test on the biome map);
    - Hearn, the hill, the stair and the village mask are unchanged;
    - `bake:verify` passes.
  - **User decision** (see the end): bigger erg, or keep it compact.
- **Dune fields by zone** (the bake writes a dune-type map, rg8 at 32 m: type weight and a phase seed; the meso reads it on the CPU and GPU):
  - **Barchans** on the stony erg margin by the escarpment: isolated crescents on hard ground. They teach the surf, because short runs end on firm ground.
  - **Transverse ridges** across the main basin (today's layer, kept).
  - **Star megadunes** (40–80 m) where the winds converge in the erg's heart, near the Warden. These are the landmarks seen from the escarpment and from glides.
  - **Seif (linear) dunes** toward the ember side, stretched along the wind and darkening with ash.
  - **Playas and salt pans** in the interdunes: flat, pale and cracked, for mirages and the camp's well.
- **Ravines (user):** the full spec, with sections, plan views and the look we expect, is now `docs/phase-9/dunes-design.md` §7 (figures in `docs/phase-9/figures/`). Slot canyons are a bake trench plus a mesh kit (new milestone D7b). The summary below still holds. The erg is not only dunes. Carve (bake, `carveRavines`, least-earthwork style like the stair):
  - **a canyon system** along the escarpment foot — sandstone walls 30–80 m, layered strata, sand floors fed by spill-over dunes at the rim (sandfalls when restored), arches and hoodoos;
  - **slot canyons** (2–6 m wide, 20–40 m deep, sculpted walls) — light shafts at noon, a sand-surf run through one (the run's walls are collision; the floor is sand), flash-flood lore;
  - **wadis** — dry braided river beds crossing the basin from the meadow's rivers (the aqueduct ruins follow one); restored rain in the meadow sends a thin seasonal stream down it;
  - **a rift** — one deep crack across the erg (the Long Walker's old path split the bedrock), crossed by glide, a Ridge bridge or the ruins' fallen spans.
  - Ravines give the erg verticality, shade, cover and routes; they are where caves (Phase 13) open. CPU/GPU parity: canyons are in the macro bake (2 m), sharp walls by the rock material's triplanar strata.
- **Escarpment descent** from the meadow: a carved pass ("the Dry Stair") with a caravan road (`story.mjs` least-earthwork route, like the hill stair). This is the erg reveal: the first view from the lip at golden hour is a planned photo spot.
- **Frost–dune border:**
  - Snow lies in the dunes' lee hollows and is stripped off the crests (height blend; BRIEF §5.1: snow settles in hollows first).
  - Frozen sand (the frozen channel at rest) keeps it firm.
  - This is a unique "cold erg" strip on the route from the frost camp.
- **Placement:**
  - the ruins (D7);
  - the camp (D11);
  - echo stones;
  - cave mouths (Phase 13 seats only);
  - glass fields;
  - the arena regraded (a ring of half-buried columns).
- **Fix: grass and ground cover on sand.** Mask them by the bake material (sand, beach or rock means no meadow grass). Dry scrub replaces them on the margin (D8).
- **Generalise the frost- and meadow-only systems this phase touches:**
  - encounters anchored to frost POIs;
  - photo-spot and bench helpers.
  - (Shrines are being generalised now by the side-quest work.)
- Acceptance: the bake is reproducible; the parity check passes on the new meso; frost and meadow shots are pixel-identical; there is no grass on sand.

### D0 — Done (2026-10-27, branch `claude/d0`)

**Built**
- **Bigger erg:** the volcano's *biome* reach shrinks east of x = 1000 (inner 1000 to 500 m, outer 2900 to 1300 m; the macro partition, heights, rivers and wind are untouched). Dune-dominant area (weight over half) is **8.10 km²**, was 4.33; of that 5.20 km² lies west of x = 3300 (the rest is under the east ring). Rule-placed POIs are pinned (`pinned.mjs`) so no shrine or Warden moved.
- **Diff test** (`tests/d0Diff.test.js`, hashes from the pre-D0 bake): biome weights west of x = 1000, the surface map west of x = 1000, the height tiles west of x = 512, the village mask, `village.json`, the hill stair and the hub/manor/stair-foot POIs are byte-identical.
- **Dune-type map** (`dunes.rg8`, 32 m; `dunemap.mjs`): R = type coordinate (barchan 0, transverse 1/3, star 2/3, seif 1), G = flat weight (playas, six pans, ravine floors and rims, the arena, the interdune belt that hides the transverse/seif seam). The meso reads it on the CPU (`terrain/dunes.js`) and the GPU (`duneTypes.wgsl.js`; it rides in the free `.zw` bytes of the wind buffer, so no binding changed). **Deviation:** there is no phase-seed byte; the meso hashes its cells by position.
- **Ravines** (`ravines.mjs`, `carveRavines`, 2 m, cut-only): the Red Galleries with three side galleries (ledged strata at multiples of 12 m above sea level), two slot trenches (10 m wide, 38 and 34 m deep, no wall kit), three braided wadis, the Stride (about 60 m deep, two land bridges). The canyon's south end bends SE to follow the escarpment foot instead of staying at x 1470-1540.
- **The Dry Stair** (`dryStair.mjs`): A* over an 8 m grid, then graded onto h4: 906 m, 107.8 m drop, 12 % grade, carved only east of x = 1030. The canyon fords it (cuts fade out within about 110 m of the road and never touch the road corridor).
- **Cold erg:** in `mesoHeight` snow fills dune hollows to 7 m where frost and dune weights overlap and crests stay bare.
- **No grass on sand:** grass and ground cover mask the baked material (sand, rock, beach, seabed). This also fixed the real cause of grass across the basin: the frost-border term gave 0.85 meadow weight everywhere outside frost.
- **Seats** (positions only, `seats.mjs`): the camp and Wellhouse, oasis, ruins (Long Walker, Sunken Temple, aqueduct, Sun Gate), sites, five glass fields, five echo seats, four cave mouths, the arena ring. Kinds are `*-seat` so nothing in nav or echo trials picks them up yet.
- **Helpers:** `chapter.js` places include the dunes' seats. Photo spots and encounters were already keyed by id and biome; `encounters.js` was not touched.

**Measured**
- `bake:verify` OK (267 files), the bake is reproducible. `npx vitest run`: 662 tests pass (new: `tests/dunes.test.js`, `tests/d0Diff.test.js`).
- **CPU/GPU parity (Windows GPU, `tools/capture/parity-bot.mjs`):** max 1.56 mm over 4096 points at the heart; 1.12 mm (barchans), 1.30 mm (seif), 1.71 mm (cold erg), 1.16 mm (canyon). All pass (gate 10 mm). The SwiftShader route (`parity-check.mjs`) cannot allocate on this box.
- Shots in `screenshots/phase-09-d0/` (1280 px): `before-*` is the pre-D0 build, `after-*` is D0, `main-*` is the merged main without D0.

**NOT ASSESSED**
- **Pixel-identical frost and meadow shots:** not achievable by shot comparison. Two shots of the *same* build differ (meadow PSNR 29.5 dB) and D0 against main is 28.0 dB (meadow) and 40.7 dB (frost). The data-level diff test is the evidence.
- Frozen sand staying firm: there is no sand state yet (D1/D2).
- The cold-erg shot is weak (it shows the slope into the sand, not hollows filled with snow); the look is D1.
- Wall zig-zag where canyon bends flip the nearest spine point; wadi cut banks and flowers; sandfalls, arches, hoodoos (D7b).
- `gpuStats.late` was seen non-empty only from my own parity compute pipelines; a clean run was not taken.
- Performance on the 3060: the meso now evaluates up to four dune types and a 2 x 2 star loop; not benchmarked.
- The overhead map is mostly frost and cloud at that height; the erg is the lower right.

### D1 — Sand material (the proving ground of this phase)

`shaders/surfaces/sand.wgsl.js` behind the surface interface from M0 (evaluated only where the sand weight is above 0).

- **Scans:** CC0 rippled sand, fine dune sand, coarse sand with pebbles, cracked playa and sandstone. Use ambientCG and Poly Haven, and document them in ASSETS.md. Ship near and far samples, stochastically tiled, as the meadow does.
- **Three-scale detail normals** blended by distance and slope.
- **Decimetre ripples:**
  - procedural, in the wind frame;
  - **sharp self-shadowing** (horizon-mapped from the analytic ripple height, so the low sun rakes them);
  - ripples fade on the slip face (smooth, avalanched sand) and are strongest on the stoss slope and the interdunes.
- **Granular sheen and quartz glints:** warmer and rarer than snow's, with a stable hash and gated hard. The BRIEF rule applies: if it looks like glitter, halve it twice.
- **State-driven response:**
  - wet sand darker, tighter and cooler, with a glossy film when fresh;
  - compacted sand (footprints, surf groove floor) a shade darker with fine-grain normals;
  - frost-bound sand (frozen) pale and crisp;
  - transform = glass is reflective and refractive (D7 shares it).
- **Rock and sandstone:** layered strata (§5.1), with sand accumulating on upward faces and drifting against the base of walls.
- **Far field:** dune shading at 2–4 km must still read; this is the horizon of the phase.
  - Shape comes from the macro and meso normals plus aerial perspective; the shading must not go flat beige.
  - The slip faces' shadow sides keep a cool sky fill (blue shadows on warm sand: the colour story).
- **Highlight roll-off:** blown white is the main failure (§5.8). Measure the clipped fraction in every shot (the capture report already gives luma and clipping) and set the noon exposure target for sand.
- **Grade:**
  - stilled: desaturated, flat, slightly grey-violet;
  - restored: warm gold with cooled shadows.
- **Review with the user:** sand close-up, mid-field and far, at noon, golden hour and night.

### D1a — Done (2026-10-27; integration review)

The erg's near material now has CC0 scans, three-scale normals, self-shadowed ripples, rare glints and compacted/frozen/rain states. The six rain stages were recaptured after correcting wet absorption to remain visibly darker through eye adaptation: dry/wet foreground display luma 148.337/106.712, with no white-clipped pixels in the twelve before/after captures. Independent photo weather controls are tested. Main's photo spots are preserved unchanged with eleven sand entries appended.

**Validation:** 700 tests passed; locked production build passed. Identical 2560×1440 star-field GPU timestamp medians: 25.55 ms before / 27.10 ms after (172 samples each; headless, indicative). Sand-view and sand weather checks reported no late pipelines or GPU errors. Entering the forest revealed five pre-existing render variants created late; no late compute pipeline appeared. That broader cold-entry defect remains open for the world gate and is recorded with stacks in `docs/phase-9/material-audit/transitions.json`.

**Review artifacts:** `docs/phase-9/sand-review.md`, `sand-metrics.json`, `material-audit/`; `screenshots/sand-wet-fix-1280/` and `screenshots/material-audit/`. **Not assessed:** sustained unlocked-PC 60 FPS/1% lows, human judgement in motion. D1b retains far field, desert grade and sandstone walls. Integrate as a squash excluding full-size raw capture iterations.

### D1b — Done (material implementation, 2026-10-28)

Independent dune restoration/grade, distance-normal retention and baked-rock sandstone are integrated. A dune-only hue-preserving LUT shoulder prevents sunset bloom clipping; zero dune weight retains frost/meadow output. Repetitive sine bands were rejected in favour of irregular restrained beds. Wet/dry foreground luma is 156.84→118.18 restored and 159.36→121.51 stilled; current 1440p depth-masked surface clipping is zero. Six measured far views contain 15,457 sampled dune points at 2–4 km, covering noon/golden/night and both restoration states. Canyon noon/dawn checks pass the material/error gates. Main 789 tests (784 tracked +5 local), build and cold 1440p check pass, with no late pipelines/errors.

Fixed-scene 1440p GPU medians ~15.1 ms close, 11.3 ms mid, 12.6 ms canyon. NOT ASSESSED: sustained gameplay/1% lows, human aesthetics. D2 sharp crests, D7b canyon geometry, the cold-erg boundary and D5/D6 weather are separate unfinished work; the biome is not visually complete. Evidence: dune-grade-review.md and dune-grade/*.json.

### D2 — Dune geometry and avalanching sand (risky tech)

- **Knife-edge crests:**
  - The clipmap must hold a crest line without faceting or popping.
  - The analytic crest normal is sharpened in the fragment shader from the meso derivative, which is discontinuous at the crest by design.
  - Crests geomorph between rings, and the far-ring LOD bias is tuned for silhouettes against the sky.
  - Check: a crest silhouette at 500 m and 2 km in a dusk shot, with no stair-stepping.
- **Collision parity:** the new dune types run in `meso.js` and the WGSL meso; `parity-check.mjs` passes; the Wraith stands on crests correctly.
- **Granular relaxation pass** (new, `shaders/terrainState.wgsl.js` and `terrain/state/healing.js`):
  - For sand texels (by the bake material, or a transient material id), wherever the slope of depression plus displaced exceeds the angle of repose (about 34°), mass moves downhill to the neighbours. This uses a conservative, stable discrete scheme (talus diffusion) in the fine window, run for a few iterations per frame only in a dirty rectangle around active writers.
  - Writes are conservative, so mass is never created.
  - The coarse pages get a cheaper closed-form flattening when written down.
  - Snow does **not** relax (it holds walls), and mud keeps its shape. Sand berms slump into sheets, which is the gate's "avalanches convincingly".
- **Sand healing:**
  - Prints soften and re-ripple over minutes, driven by the wind field: faster when restored and windy, very slow when stilled. A trail must still read after 60 s (§4.3).
  - Sandstorms erase it (D6).
- **Allocation budget:** relaxation is a compute pass under 0.4 ms in its worst case (surf at full speed). Measure it on the 3060.
- **Tests:** mass conservation, a slope never left above repose after N iterations, and determinism.

### D3 — Sand-surf (most polish time)

- **Tuning** (`surfTuning` per material: `sandTuning`):
  - faster on slip faces, slower uphill (higher friction, stronger gravity coupling);
  - a top speed above snow's on a slip face and below it on the flat;
  - carving grip lower (sand slides), so the lean is shallower and the drift wider.
- **The wake:**
  - **sheets that avalanche:** displaced mass thrown outward and up into the berms, which the relaxation pass then slumps down in visible sheets (a ribbon sheet mesh for the falling curtain, plus state writes when it lands);
  - a sand-spray plume that catches the sun and casts a shadow;
  - streams off the crest behind the Wraith when a run crosses a crest (BRIEF §9.3).
- **A whole run stays visible from across the field** (coarse pages).
- Entering and exiting ease. The robe whips back; the FOV widens; speed streaks are tinted by dust.
- **Sound:** hiss and rush by speed, plus the "singing sand" boom of a big slip-face avalanche, a lovely real phenomenon and a signature sound. Synthesise it procedurally (no samples yet).
- **Chains:** Updraft → glide → land on a slip face → sand-surf (see `cross-biome.md`).
- **Bot feel test:** scripted runs down three slip faces with fixed inputs, filmed in film mode at 60 fps for the user's review, since feel is the user's call.
- **Echo hooks:** surf speed and the avalanche size (D11 Echoes).

### D4 — Stone verbs (BRIEF §9.2)

`game/bending/stone.js` and `render/stoneFx.js`. The element is registered in `BUILT`. Hand-light and cuffs are ochre.

- **Shard (tap):**
  - tears a plate of packed earth or sand from the ground ahead (a depression scar);
  - hurls it along the aim as chunk geometry built from the surface material (sand, turf, snow or stone, like the Shaped chunks);
  - it shatters on impact and its debris lands as displaced mass.
- **Ridge (hold):**
  - drags a wall of displaced mass up along the aim path;
  - it is real terrain state, so it is walkable and surfable, and the relaxation pass slumps it on sand (a sand ridge sags over seconds, a turf ridge holds);
  - **collision:** ridge height must reach the CPU. The fine-region readback exists, but the ridge also writes a CPU-side copy of its own brush, so collision is immediate and does not wait a frame.
- **Bloom (heavy):** an eruption blows a crater with a raised rim (depression plus displaced), then falls back as a slow, glittering curtain (particles lit by the sun, falling and landing as state).
- **Reactions (the whole Stone column, in every biome):**
  - snow: hurls snow and earth;
  - grass: torn turf, which regrows;
  - sand: erupts and raises ridges;
  - water: only splashes (`water × stone`: nothing);
  - mud (Phase 10 surface): raised banks;
  - ash (Phase 11): cracks the crust.
  - Write the brushes for every surface that exists now, and stub the later surfaces in the table, so Stone works on day one in the frost and the meadow.
- **Combat hooks:**
  - Shard: knockback and stagger (heavy on brittle frozen Shaped, so frozen + Shard shatters them);
  - Ridge: cover against ranged attacks and the Warden's breath, and a wall that blocks swarmers;
  - Bloom: launches, and the crater traps them.
- **Focus costs** come from the Gale ones (Gust 10, Vortex 14/s, Updraft 24).
  - Proposal: Shard 9, Ridge 12/s plus length, Bloom 26.
- **Cross-element:** see `cross-biome.md` (Ridge + Frost, Bloom + Gale, Shard into a Ribbon).
- **Tests:** reactions coverage (every Stone cell has a brush or an explicit "nothing"), ridge mass conservation, and alloc.
- Until the dune Warden's release: `?stone=1` and the overlay, like Gale.

### D4 — Done (2026-10-27, branch `claude/stone`)

- **Built:** `game/bending/stone.js` (Shard, Ridge, Bloom), `stoneMass.js` (the CPU copy of the brush shapes), `combat/stoneHits.js`, `render/stoneFx.js` + `shaders/stoneFx.wgsl.js` (dust and glitter), brush programs `RIDGE` and `CRATER` in `terrainState.wgsl.js` (their constants are interpolated from `stoneMass.js`, so the GPU and CPU profiles share them). Registered in `BUILT`; granted by `?stone=1` or the F1 overlay's Elements section ("Grant stone"); the journal's Stone column shows only once it is unlocked. Hand-light ochre (`wraithView.handBase`), flow cuffs ochre.
- **Shard (Q tap, 9 focus):** a depression scar (PRESS) 3.6 m ahead, the plate (3 chunk records through the Shaped chunk path, kind from the surface: snow = frozen-earth slab with snow crumbs, grass = turf, rock = stone) rises and is hurled at 27 m/s; on a body or the ground it shatters into 9 thrown pieces that land as MOUND stamps. Combat: knockback and stagger through `strike` (a frozen body shatters, x3 and Flow SHATTER); a soaked body struck gives Flow REACTION. Flow 3: the plate skims low ploughing a lane (PLOUGH) and carries the Wraith like the Gust.
- **Ridge (Q hold, 12/s + 0.5 per metre):** a head dragged at 9 m/s, bending toward the aim point and carrying straight on past it, up to 14 m; 0.6 m capsule segments stamped at half height, swelling to full 0.22 s later (crest 1.1 m, crest half width 2.0 m, shallow trench on both flanks that supplies the mass). `PatchGround.mass` adds the CPU copy to every ground query, so it is collision the frame it is stamped: walkable (steepest slope under 44 degrees, checked in a test), surfable on snow (the surf reads the ground normal). Cover: shot and spike line tests (`blocker.segBlocked`) stop at the wall; swarmers are pushed out of any mass over 0.55 m. Turf holds (grass displaced half-life 15 min, snow 10, rock 30; healing rates of `healing.js`).
- **Bloom (F, 26):** a CRATER stamp (pit 0.42 of the footprint radius 4.6 m, 1.1 m deep, rim bump, mass-balanced), 16 real chunks thrown up, a glittering GPU curtain, and 14 MOUND stamps on the rim as it falls back over 3.4 s. Combat: foes inside 1.25 radii take 22, are lifted (`body.pop`, 0.85 s arc) and pinned 1.8 s; two or more caught gives Flow REACTION.
- **Reactions:** the whole Stone column in `reactions.js` (snow, grass, rock-as-snow built; water an explicit `nothing` that splashes; sand, mud, ash explicit `stub` rows with the same brushes). `CROSS`: `ridgeFrost` (Crystallize within 9 m freezes the wall with FREEZE stamps and the CPU copy stops healing; re-stamped every 20 s), `shardRibbon` (a plate through a Ribbon is carried 1.35x faster and soaks) implemented; `bloomVortex` is a stubbed row (needs sand, D1). Journal table, three Remembrance entries (`r-snow-stone`, `r-grass-stone`, `r-bloom`) and casts wired (the entry caps in `remembrance.test.js` and `restored.test.js` are now 60).
- **Flow (§3):** builds it: a Shard that shatters a frozen body (+SHATTER), a Shard or Bloom on a soaked body or two foes at once (+REACTION), a ridge ramp into a glide counts as a chain through the existing detector. Nothing breaks it but a blow (a held Ridge while standing still drains it like any standing). Flow 2+: costs x0.7, Ridge 25 % longer and taller, Bloom 25 % wider, Shard damage x1.25. Flow 3: the flowing Shard.
- **Numbers (measured):** CPU copy against the GPU readback across a ridge's cross-section: max error 0.010 m (crest 1.08 m); a Bloom's bowl 0.79 m on the GPU against 0.80 m on the CPU. Ridge mass: crest volume and flank trench volume agree within 15 % on a 14 m wall (the rounded ends add crest with no flank; the profiles themselves integrate to within 0.2 %). Bot fight, three hounds at 10 m on snow: Stone (Shard when more than 2.6 m away, Bloom when two are inside 5 m, staff inside 2.4 m) 3.5 s, 0 damage, peak Flow 1.98; staff alone 5.9 s, 36 damage, peak Flow 0.73 (single runs, a poor fighter bot). Hounds against a Ridge 14 m ahead: none was ever inside the wall (210 samples), they go round its ends; damage over 7 s was 24 against 36 without it (one run each). `gpuStats.late` was `[]` after casting every verb on snow, grass and by water; one unrelated atmosphere compute pipeline (the god-ray pass, `chain-*.js` `T.shaftsOn`) shows as late once the weather changes, in staff-only runs too.
- **Alloc (`npm run alloc`, case `stone.update`):** the case is added; it still reports 12 scavenges over 2 M calls (0.9 MB), against 292 before the fixes (closure doubles, double arguments to non-inlined calls, `Math.hypot`, arrow helpers: scratch typed array `A` now carries them). The isolated shard, ridge and bloom loops count 0, 4 and 8 per 1 M. Not zero. `controller.update` and `springArm.update` fail as before.
- **Shots:** `screenshots/stone/p9s-shard-flight`, `p9s-ridge-snow`, `p9s-ridge-turf`, `p9s-bloom`, `p9s-ridge-hounds`. Read critically: the turf ridge is good; the snow ridge reads as a soft dune with its trench; the Shard plate is small and low in contrast against snow at this distance and the Bloom's crater is a modest pit with a faint rim (a mass-balanced crater has a low rim; it wants a closer camera or an unbalanced rim); both want a pass. There is a visible stair-step banding along a ridge's flank on turf (the trench shading in terraces), not yet understood.
- **NOT ASSESSED:** feel of any verb in a human's hands; walking and surfing on a ridge with the bot (the slope and height are tested in unit tests only); the Warden's breath against a Ridge; the Frost + Ridge rampart seen (the stamps and the CPU freeze are unit-reasoned, not filmed); a Ribbon-carried Shard seen in play; Flow 3's flowing Shard in play; sand slump (D2), mud banks, ash crust (stubs); sound design (reused cues: shatter, thud, boom, crunch, whoosh); a ridge older than the 256-shape CPU ring, or evicted far from the Wraith and back (the CPU copy could then disagree with the GPU); performance on the target PC.

### D5 — Desert light: heat shimmer, mirage and the desert sky

- **Heat shimmer:**
  - a post pass after compose, before TAA;
  - a refractive UV offset from scrolling noise, masked by depth (only distant, low and ground-hugging rays) and by the "heat" of the hour, the sand weight under the view ray, and restoration (strongest at restored noon);
  - TAA-stable: offsets on the jitter-free grid, with the history clamp widened under shimmer.
  - Must not blur the Wraith, so it is depth-masked out near the camera.
- **Mirage** over playas and long flats: a sky reflection at grazing angles (reuse SSR's sky fallback for "wet-like" pixels marked by heat), shimmering at the horizon.
- **Atmosphere:**
  - a dust aerosol term (warmer, lower Mie and a whiter sky near the sun at midday);
  - a deep orange golden hour;
  - the desert night: cold blue, a very clear sky, bright stars (the existing stars, plus the Milky Way if one is cheap).
- **Exposure:** the meter must hold sand at noon without clipping, and the cave-mouth and ruin interiors in shade.

### D6 — Weather and restoration: heat haze, sandstorm, the erg that moves

- Weather table (BRIEF §5.6): **clear, heat haze, sandstorm**.
  - Stilled: clear and still haze only.
  - **Stilled signature:** sand grains hang motionless in the air over the crests, a frozen veil caught mid-stream. This mirrors the meadow's rigid grass and is the image of "the dunes stopped moving".
- **Sandstorm:**
  - a wall-front arrival (a visible rolling front on the horizon, then inside it), using the weather volumes (clouds) with a dust density, orange-brown;
  - sun dims to a disc;
  - visibility around 150–300 m but the near world still reads (§5.6);
  - streaks with the snowfall renderer's tech in a sand variant;
  - **erases and re-ripples the terrain state**;
  - strong gust fronts in the wind field; robes snap; sound.
  - Gameplay: the storm hides the Shaped's telegraphs, which are cued by sand streaming off them, and Ridge gives shelter.
- **Ground blow (sand):**
  - a low stream across open ground and **plumes off every crest** in the restored erg;
  - via spindrift's tech, wind-field driven.
- **Dune migration (restored):**
  - The meso dune phase advances with game time at visible-but-slow rates (crest lines creep about 1 m per in-game day).
  - The CPU and GPU share the phase, so collision parity holds.
  - Saved as a single world-time-based offset, not as state. Ruins and the camp sit on hard ground or in "anchored" zones where the meso weight is masked, so nothing important gets buried by drift.
  - **Story use:** the release uncovers a buried ruin over a few seconds in the cinematic, a scripted local phase.

### D7 — Ruins and glass

- **Half-buried Shaper ruins** (architecture builders, new kits in `world/ruinKits.js`), in the Shapers' visual language from the monastery and shrines:
  - a colonnade marching into a dune;
  - an obelisk field (sundial and wind-gauge stones);
  - **the Sunken Temple** (a domed roof showing above the sand: the interior is Phase 13's cave);
  - stairs that descend into sand;
  - a fallen colossus head;
  - aqueduct arches crossing the basin from the meadow's rivers (they once watered the erg, and they read from far away).
- Sand drifts against walls and fills doorways (sand accumulation; a CPU solid from the drift's height).
- **Glass fields** from old battles:
  - fused-glass formations (frozen splashes, fused craters, glass trees where lightning struck);
  - the crystals renderer gets a **glass material**: refraction, internal fracture planes, warm caustic-like highlights, and a sun glint visible from kilometres.
  - The transform channel marks the ground under them as glass, so it shades glassy, is slippery to surf and is permanent.
  - These are the "glass formation catching the sun" of the signature frame.
- Ruins and glass are seated on real ground with anchor patches, carry collision, appear on the map and in the compass, and feed caves later.

### D7 — Done (ruins and glass, 2026-10-30)

Ruins are architecture sites in Shaper stone (`src/world/ruinKits.js`), seated, collided, shadowed and chunked like every built place; erg sites take sand on their ledges and banked at their feet instead of snow (site glow z = 2): **the Sunken Temple** (its dome showing above a seif dune round the open vent, a ring of half-buried columns, the portal and the stair down into the sand: the Buried Door's site), **a colonnade** walking into a dune and sinking pair by pair, **an obelisk field** east of the Stride, **the aqueduct** (arches and trough on the baked ground along the wadi, the channel high over its dunes, spans fallen), **the Sun Gate** (a slotted lintel on a ledge of the Galleries' west wall), **a giant's head** buried to the lips. **Glass fields** (`src/world/glassKit.js`): each of the five seats has a centrepiece round a glazed crater (a frozen crown splash, a glass tree where lightning forked, a star of thrown shards) and seven smaller pieces; `MAT.BATTLE_GLASS` (19) is a clear green/amber body with Fresnel sky reflection, SSR, light through it from behind, lit fracture planes and a pinpoint glint. Site cap 640.
**Not done:** the transform channel marking glass ground (glass is meshes, not terrain state), full-scene refraction, sand drifting into doorways as CPU solids, the camp's caravanserai (D11), human review.

### D7b — Done (ravine kits, 2026-10-30)

The canyon's sawtooth ledges are gone: the bake traces every strata riser as a smoothed contour just above its foot (plus a floor-relative trace for each wall's bottom step) and measures its climb (`tools/bake-world/ravineWalls.mjs` → `world/ravines.json`); `src/world/canyonKit.js` builds sandstone cliff faces along those lines (beds by world height, bulges, joints, lean that never passes the terrain riser it hides, a rounded lip, caprock, ends turning back into the slope), at three levels of detail by distance, the near one in a worker (`world/canyon.worker.js`). Slots get wind-polished, undercut walls narrowing to under 3 m and lit by warm bounce; the Stride gets darker bedrock. 49 hoodoos and 3 natural arches stand at the Galleries' south end. Collision lines from the kit feed `world/solids.js` (wall segments). Two CC0 scans (cliff_side, sandstone_cracks). Bake: dunes no longer ride the rock walls; ledges ease into a sand ramp at the Dry Stair's ford. Dust in the ravines' air feeds the existing shaft march. Spots `p9r-galleries-dawn`, `-galleries-rim`, `-needle-noon`, `-stride-glide`, `-hoodoos-dusk`, `-hoodoos-noon`.
**Cost** (RTX 3060, 1440p / 0.7): +0.34 ms on the canyon floor, +0.46–0.53 ms in a rim view (walls draw last; only the near level casts, into cascade 1). GPU frame means 11.4–13.8 ms at the p9r spots.
**Follow-up (2026-10-30):** **light shafts in the slots** (`src/render/slotShafts.js`): additive slices every 3.5 m across each slot, no higher than the walls beside them, lit only where the shadow map says the sun reaches that air — exact but rare (the sun peaks at 49° and the Needle runs across its azimuth). **Sandfalls** (`src/render/sandfalls.js`): tiered cascades at nine sites on the Galleries' tallest walls, one per ledge level pouring onto the tread below, a dust cloud at each foot; they flow once the Dunes are restored (visual only until D2 feeds them). **Canyon-floor flora**: sparse tamarisk, thorn and the odd dead tree well inside the canyon and rift walls (trees.js `setRavines`).
**Review build (2026-10-30):** **the Dry Braids run at dusk** once restored (`src/render/wadiWater.js`: the bake exports each braid's line in `ravines.json` `wadis`; a ribbon per braid laid on the clipmap's rendered ground, broken sheets of thin water round sand bars, sky reflection and glints, wet sand either side; 16:30–1:00). **Glass seams in the Stride** (black-green veins in the rift walls, `shaders/canyon.wgsl.js`). **Warm canyon shade**: the clipmap measures how walled-in the flats are (6 ground lookups per vertex) and gives shaded ravine floors the walls' orange bounce instead of the open sky's blue. Erg trees are lighter and lit from the sand under them; canyon flora reaches out to the walls; sandfalls no longer glow in shade. Spots `p9r-braids-restored`, `-sandfall-restored`, `-canyon-shade`, `-stride-seams`. Review guide: `docs/phase-9/review-guide.md`.
**Not done:** frozen sandfalls and `p9r-sandfall-frozen` (D11's puzzles), human review.

### D8 — Scrub, the margin and the oasis

- **The meadow→dune margin ("scrub drying into dune"):**
  - dry straw grass species (the grass system with a dry palette, sparse, clumped);
  - tamarisk and saxaul shrubs, thorn trees (acacia-like, flat crowns from the tree generator), dead and bleached trees;
  - pebble and gravel desert-pavement ground cover;
  - a few desert flowers that bloom after rain (restored).
- **The oasis at the camp:** date palms (a new generator: segmented trunk, frond crowns, wind response), reeds, and a pool.
  - Stilled: the well is choked and the palms grey.
  - Restored: the water rises.
- **Deep erg:** nothing, on purpose, except dune grass tussocks in interdunes and the odd skeletal tree.
  - Empty space must still be beautiful; the sand material and the light carry it.

### D8 — Done (first pass, 2026-10-30)

Four new tree species in the generator: **date palms** (curved ringed trunks, crowns of arching fronds) crowding the oasis well, **acacia** (umbrella thorn, leaves only on the flat top) and **tamarisk** scrub on the meadow's margin, **bleached deadwood** at the margin and, rarely, out in the dunes; each keeps its own colour on the shared leaf sprites. **The oasis pool**: a basin carved into the playa by the bake (`tools/bake-world/oasis.mjs`) and marked a lake, so it is drawn, waded and swum like any lake, ringed with tall reeds. **Straw tussocks** where the meadow gives out onto the sand.
**Stilled and restored:** while the erg is stilled the well is choked — the pool's own mesh is hidden and the CPU reads the basin dry, the palms, thorn and tamarisk hang grey, the reeds stand short and dead; restored, the water rises and they green.
**Checked:** load 17.5 s to ready, no late pipelines or GPU errors after visiting the canyon, slot, hoodoos, temple, a glass field and the oasis.
**Follow-up (2026-10-30):** **desert pavement** on the bake's flats (the dune flat weight, in patches): packed angular gravel up close (Voronoi stones, dark and varnished, lit on the sun's side), a greyer, darker lag ground far off. **The oasis basin** is dried mud crazed into polygons, bare while stilled and the lakebed once restored. **Battle glass** reworked to show the sunlit sand through a bottle-green-to-amber body (varying across a piece, not facet by facet) with thin fracture seams; the colossus head gained worn cheeks and ears.
**Review build (2026-10-30):** **flowers after the water**: clumps of desert annuals (primrose, sand verbena, globemallow, desert marigold) along the restored braids' banks, drawn as small plants on cards (`wadiFlowers`), grown in with the restoration and shrunk away past 120–150 m. Spots `p9r-glass-field`, `-colossus-head`, `-pavement`, `-pavement-far`, `-oasis-restored`, `-oasis-stilled`.
**Not done:** the margin's dry grass as its own blade type (the straw tussocks stand in), human review.

### D9 — The dune Shaped (three plus an elite)

Proposals (the user to choose or replace), made of packed sand, sandstone and ruin fragments, rising out of the sand and slumping back into a mound that the relaxation pass flattens:

- **Skitters (swarmer):**
  - they travel *under* the sand as a moving bulge (a terrain-state brush: a travelling depression and displaced pair), then erupt to lunge;
  - telegraph: sand streams off the bulge before the lunge;
  - Gust strips their cover; frost-binding the sand (Ribbon then Crystallize) stops them burrowing.
- **Plate-backs (bruiser):**
  - a slow, heavy, scarab-like body carrying a **ruin-stone plate** as a shell;
  - frontal attacks glance off the plate;
  - Gust strips the sand from the plate seams, then Shard (or a frozen shatter) pops the plate off.
  - Without Gale: freeze the seams with Ribbon then Crystallize, then strike. It is slower but always works.
- **Whirlers (caster):**
  - a tall, dervish-like spinning column of sand around a glass core;
  - throws sand blasts that blind (a screen dust burst) and calls small dust devils;
  - Vortex reverses its spin and holds it; Frost binds it into a brittle sand pillar that shatters.
- **Elite — the Glass-sworn:**
  - a Shaped half-fused to glass in an old battle;
  - refractive and very hard;
  - immune to Shard until frozen (thermal shock), then shatters spectacularly.
- **Reactions (BRIEF §4.4, sand row, in combat):**
  - Frost: frost-bound (slowed, firm, brittle);
  - Gale: erased and stripped (exposes the core, blinds them);
  - Stone (after the release): erupted;
  - Ember (Phase 11): fused to a glass statue.

### D10 — The dune Warden and its arena

> **Superseded (2026-10-24):** the fight below is replaced by the "bring it home" design in `docs/gameplay-design.md` §5.1 (follow its glass track, wake it, pursue it on sand-surf, stumble a leg by reshaping the ground, board it, steer it to the camp's dry well). Kept for its arena and quality-gate notes.


Proposal (the user to choose; alternatives at the end): **the Long Walker.**

- **What it is:**
  - A ~55 m six-legged colossus of sandstone and packed sand that once *walked the dunes across the desert* (BRIEF §2.1). Its stride kept the erg moving.
  - On its back is a ruined Shaper caravanserai: a walled court, a well and a stair.
  - Stilled, it stopped mid-stride an age ago and the erg buried it to the shoulders. From afar it reads as a star megadune with a ruin on top.
- **The arena:** the star dune at `warden-dunes`, regraded, with half-buried columns as cover.
- **Fight phases** (generalising `game/warden/fight.js`, as the Bellwether did):
  1. **Waking:**
     - Approaching the ruin wakes it, and it heaves up out of the dune: a huge avalanche cinematic using D2's relaxation.
     - **The waking lends the Wraith Stone**, as the Bellwether's waking lends Gale (the cross-biome rule: a Warden's element is caught at its waking and mastered at its release).
     - Its legs are **pillars of packed sand around stone cores**. Each leg is held by a buried glyph-stone "brake".
     - A Shard breaks each brake free (or Gust strips it faster, if the meadow came first). Frost binds the sand around a leg so it can't re-form. The leg stiffens and the colossus lurches.
     - The critical path needs only Frost and Stone, so the dunes can be played before the meadow.
  2. **Climb:**
     - Holds are the **ruin-stone plates set into sand** (BRIEF §8.4, exactly), up a leg and onto the back.
     - It shakes, and sheds sand in sheets that try to sweep the Wraith off.
     - Climbing the caravanserai stair on its back reaches the **well**, its heart.
  3. **Its storm:**
     - Every N s it exhales a sandstorm across the arena. Shelter is behind columns, a Frost-raised ice wall, or a Ridge (Stone is in hand from the waking).
     - The Skitters come with the storm (frenzy, cap 8).
  4. **The well:** strike the three seals in the well shaft from on the body; the Wraith drops down the well as it kneels.
- **Release:**
  - It takes its first step in an age, then lies down into the erg and becomes a dune range.
  - The wind returns; every crest begins to stream; the dunes begin to migrate (D6); the buried ruin (D7) is uncovered; the camp's well rises (D11).
- **The release masters Stone** (full strength and the Echo slots) **and grants sand-surf.**
- Climb quality gate (BRIEF §8.4): if a moving six-legged climb can't reach the bar, the climb happens on the kneeling body (stationary), with the shaking kept, and the decision is recorded.

### D11 — The camp, quests, shrines, Echoes and robes

> **Quests superseded (user, 2026-10-26):** the main quests, side quests and robes below read too much like the frost's. They are replaced by the puzzle hub in `docs/phase-9/dunes-design.md`: the sand grammar, the three Silent Instruments, five side sites and the D11 build order there. The camp, shrines, Echoes, map, HUD and save notes here still stand.

- **The camp:**
  - **Wellhouse**, a Veiled caravan stranded in a ruined caravanserai at the oasis on the playa (x ≈ 1800, z ≈ 700; placed in D0);
  - felt tents and awnings in the meadow market's language, but sun-bleached;
  - pack animals are out of scope (no rigged animals). The caravan's sledges are sand-runners, sand-sleds pulled by hand.
  - **NPCs:** 4–6 named Veiled.
    - The caravan master.
    - A well-keeper.
    - A glass-reader (reads old battles in the fused glass).
    - A child, and a mapmaker.
    - **Continuity:** a pilgrim from the frost camp, and one from Hearn, who came on the Dry Stair road.
- **Main quests (2–3):**
  1. **The Dry Stair:**
     - Reach the erg (from the meadow or the frost; the escarpment's view).
     - Find the caravan's lost scout by following sled tracks that the terrain state really holds.
  2. **The Choked Well:**
     - The camp's well is stilled and dry.
     - Learn that the Long Walker "carries the water" (its well is the erg's), and find where the wind dies: the stilled veil of grains over the star dune.
  3. **The Long Walker:** the Warden.
- **Side quests (3–5),** short environmental stories (BRIEF §11; play, not errands):
  - **Unearth a ruin by raising a Ridge** (the BRIEF's own example; after the release): Ridge the sand away from a buried door, which opens the Sunken Temple's entrance hall.
  - **The Glass Garden:**
    - The glass-reader asks the Wraith to find the five oldest glass formations.
    - Each, struck by the low sun, throws a beam; aligning reveals a Shaper inscription (an Echo).
  - **Sled run:** the caravan's runner course down the megadunes (sand-surf medals, like the frost's Shapers' Run). The reward is a robe.
  - **The Singing Dune:** wake a dune that booms (a slip-face avalanche on cue: Gust or Bloom at its crest), at dusk with the camp listening.
  - **Lost in the storm:** during a sandstorm, find the mapmaker's child by the lantern they carry (reuse `flame.js`; the storm gutters it).
- **Shrines:** the five baked ones, generalised by the shrine work now in progress.
- **Echoes:** 3–4, each visible.
  - Sand-surf avalanche bigger.
  - Ridge longer.
  - Shard splits into three.
  - A cross-element one (see cross-biome).
- **Robes:** 2.
  - **Sand-runner's** (gold on the sled run).
  - **Glass-reader's mantle** (Glass Garden).
- **Map and journal** extend; creature sketches for the dune Shaped.
- **HUD:** quest goals use the compass and waypoint wiring being built now (`goal.npc` and places).
- **Save v3** if not already done: element unlocks and the active element, per-biome restoration, dune migration time, and medal times.

### D12 — Gate

- **Photo spots `p9-*`:**
  - **the signature frame** (a sand-surf carve down a slip face at golden hour, the wake avalanching, a glass formation catching the sun behind; deterministic via film mode);
  - the erg from the Dry Stair lip at golden hour;
  - the star megadune at noon (highlight roll-off);
  - the camp at dusk;
  - the stilled veil versus restored crest streams;
  - a sandstorm arriving and inside it;
  - the cold erg (snow in the lee hollows);
  - a ruin colonnade;
  - glass at sunset;
  - the desert night;
  - a Ridge and a Bloom on sand;
  - the Long Walker waking.
- **Bench `?bench=dunes`:**
  - a sand-surf run down three slip faces with the wake at full;
  - Ridge spam;
  - the 8-Skitter fight in a sandstorm;
  - a clear→sandstorm transition.
  - Targets: 60 fps with 1 % lows above 60 on the 3060 at 1440p, and 0 late pipelines.
- **Records:** PERF.md, DECISIONS.md and PROGRESS.md, plus a trailer pass (film mode) for the review.
- **Bot playthrough:** escarpment → camp → quests → Warden → release, save and reload. The groove, the ridges, the glass and the restored erg must be where they were left (BRIEF §4.5: "carving a run across a dune must survive a reload").

---

## Order, estimate and checkpoints

| | Sessions | Review with the user |
|---|---|---|
| D0 geography and clean-up | 1 | the bigger erg on the map, the escarpment view |
| D1 sand material | 1–2 | **sand close, mid and far** (stills) |
| D2 crests and avalanching | 1–2 | **an avalanche in motion** (film clip) |
| D3 sand-surf | 2 | **surf feel** (the user plays it) |
| D4 Stone verbs | 1–2 | Ridge, Shard and Bloom on sand, snow and grass |
| D5 + D6 light and weather | 2 | heat shimmer, sandstorm, stilled veil |
| D7 + D8 ruins, glass, scrub | 2 | the erg composed (ruins, glass, oasis) |
| D9 Shaped | 1–2 | fights in the bot's footage |
| D10 Warden | 2 | **the fight** (the user plays it) |
| D11 camp and quests | 2 | **story** (the user plays it) |
| D12 gate | 1 | gate shots and bench |

Roughly 16–20 sessions. Sonnet agents build each milestone in a worktree; I review the diffs and the 3060 shots before merging (memory: `feedback-subagents-build`). Parallel tracks that don't collide:

- {D1 sand material} ∥ {D4 Stone verbs on the existing surfaces};
- {D7 ruin kits} ∥ {D9 Shaped};
- {D8 vegetation} ∥ {D11 quest writing}.

## Risks

- **Knife-edge crests in a clipmap.** If geometry can't hold them, the crests are faked by normals only, which fails at silhouettes. The fallback is a crest skirt: a thin ribbon mesh along computed crest lines near the camera. Decide in D2.
- **Relaxation cost and stability** in a 4092² window. It runs only in dirty rectangles, and the iteration count is capped. Measure it first.
- **Blown-out sand at noon.** Calibrate in D1 before anything else is built on top.
- **Dune migration and collision parity.** The CPU and GPU must agree on the phase. Anchored zones stop ruins, the camp and quest objects from being buried.
- **Glass refraction cost** at distance. Use the crystals renderer's LOD, with sun glints as cheap sprites beyond 300 m.
- **Order freedom** (cross-biome): if the dunes can be done before the meadow, nothing on the critical path may need Gale. See the cross-biome plan.

## Decisions for the user

**Answered (user, 2026-10-24):** (1) the erg grows, **with ravines** — wadis, canyons and slot canyons cut into it (see D0); (2) the Long Walker, **but it must feel unlike the other Wardens** (no "strip the vents, climb, strike three things" formula; see D10 and docs/gameplay-design.md); (3) Skitters, Plate-backs, Whirlers, Glass-sworn: yes; (4) open order; (5) **no world-tier scaling.**


1. **Erg size:** grow it to about 8–10 km² by pushing the ember influence south, a bake change that leaves frost, meadow and Hearn untouched (recommended), or keep today's 4.3 km².
2. **The dune Warden:** the Long Walker (recommended), or one of:
   - **the Hourglass Serpent**, a ~60 m sand serpent swimming through the dunes that surfaces at the glass fields; it is unclimbable while it swims, so it is pinned with frost-bound sand, and fights end on its coiled body;
   - **the Sunken Colossus**, a seated Shaper statue that rises from the sand; static, climbable, readable; less novel.
3. **Shaped roster:** Skitters, Plate-backs, Whirlers, plus the Glass-sworn elite.
4. **Order freedom across biomes** (`docs/cross-biome.md` §1): open order with soft difficulty (recommended), or a fixed chain.
5. **Glass before Ember:** pre-existing battle glass is in the dunes from the start, and Ember (Phase 11) later lets the Wraith make its own. Recommended yes; it's the biome's name.
