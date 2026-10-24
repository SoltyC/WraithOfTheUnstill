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

1. **Erg size:** grow it to about 8–10 km² by pushing the ember influence south, a bake change that leaves frost, meadow and Hearn untouched (recommended), or keep today's 4.3 km².
2. **The dune Warden:** the Long Walker (recommended), or one of:
   - **the Hourglass Serpent**, a ~60 m sand serpent swimming through the dunes that surfaces at the glass fields; it is unclimbable while it swims, so it is pinned with frost-bound sand, and fights end on its coiled body;
   - **the Sunken Colossus**, a seated Shaper statue that rises from the sand; static, climbable, readable; less novel.
3. **Shaped roster:** Skitters, Plate-backs, Whirlers, plus the Glass-sworn elite.
4. **Order freedom across biomes** (`docs/cross-biome.md` §1): open order with soft difficulty (recommended), or a fixed chain.
5. **Glass before Ember:** pre-existing battle glass is in the dunes from the start, and Ember (Phase 11) later lets the Wraith make its own. Recommended yes; it's the biome's name.
