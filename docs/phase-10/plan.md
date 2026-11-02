# Phase 10 — Mirefen and Tide (plan, drafted 2026-11-01)

BRIEF §17: *mud material, mire water, mangroves, fog, Tide verbs, water-skim, mire Shaped and Warden, the camp, and borders.* **Gate:** the mire's signature frame (§6.3: the Wraith water-skimming across mirror-still water at dawn, its wake splitting a reflection of mist-hung trees). Mud keeps tracks, and Draw visibly dries it.

This file is the work order for the phase. `docs/cross-biome.md` still governs order, locks and reactions. Same rules as Phase 9: risky tech first, every milestone checked on the 3060, and the user reviews at the marked checkpoints.

**Status: agreed in outline (user, 2026-11-01), not started.**

**The main part of this phase is Ebbhold and The Lung** (user): the dive, the city, the Drowned, the release and what follows. The fen is there to serve it: to make the player love Morrow and to teach them to be quiet. Morrow is the only betrayer; Aud is out. The user sources voices (`voice-script.md`) and music (`music-cues.md`).

**Revised the same day:** the user asked for the phase to be planned around underwater play: an abandoned city under the water, with the Warden and the Drowned inside. The story is in `docs/phase-10/storylines.md`. Everything below that was written for the fen still stands; the section *Under the water* adds to it and changes the Warden's arena.

---

## Under the water (added 2026-11-01)

**Second half of the biome: Ebbhold, a Shaper city at the bottom of the Sounding.** The player arrives by the Lung, can't go back, and goes through the city to the Listener. This suits the biome's idea: sound carries under water, and the city's Drowned hear for the Listener.

### What exists today

Nothing below the surface.
- The spring arm stops the camera 0.35 m above any water (`springArm.js`).
- Swimming floats the Wraith at the surface (`capsuleController._swim`); there is no diving.
- No underwater view, no surface seen from below.
- No interiors under terrain: collision is one height per point, and caves (Phase 13, SDF) aren't started.
- The height encoding stops at −128 m. The lowest ground today is −86 m.

### New milestones (between F3 and F8)

**U1 — The dive (the second proving ground; 2–3 sessions).** Do this straight after F1, as a slice in a bare pit, before any city.
- A 3D swim: pitch by aim, buoyancy, the robe spread and drifting (cloth with water drag).
- The camera through the surface in both directions, with no pop.
- The underwater view: depth fog and colour falloff, caustics, light shafts from above, drifting particles, the surface as a bright ceiling from below.
- **Checkpoint: the user dives.** If swimming down isn't a joy alone, the city does not get built.

**U1 built 2026-11-02, for the user to dive:**
- **The test pit:** the Sounding is carved bare in the bake (`src/world/sounding.js`, `tools/bake-world/fen.mjs`). It's 250 m in radius at (−2800, −1400) in the coastal basin, 600 m from the nearest site. A shelf sits 0.6 m under the rim, walls fall at about 65° to a floor near −105 m, and the water is 1.41 m.
- **The swim:** looking down past 0.22 rad while stroking forward dives along the aim, trading forward speed for depth. Space strokes up and Ctrl down. Once under, the body drifts up at 0.25 m/s; near the surface the float spring takes over without a bob. Walls block the swimmer; they no longer lift it up their face. The body pitches along its path (`swimPitch`). Footfalls stop while swimming: they were stamping prints on the floor below and throwing spray into the water.
- **The robe under water:** no wind, almost no gravity, and strong drag (`WATER_DRAG`), so it trails the dive and spreads.
- **The camera** follows the Wraith under. The above-water clamp eases off and back on, so it never jumps. TAA history resets when it crosses the plane; without that, the surface seen from above smeared into the water as stepped bands.
- **The underwater view** (`post/compose`, `UNDERWATER_WGSL`): light lost along each ray, the body's own glow, and none of the air's fogs. A pixel counts as under water if its ray starts under the surface, so a camera at the surface splits the frame at the waterline. Light shafts come from the bent sun, focused by the ripples (10 jittered samples over 45 m). From below, the surface shows Snell's window, with the sky and sun bent in, and total internal reflection outside it. The Sounding is clear sea water (blue-green); fen water stays tannin.
- **The surface:** a body more than about 1.3 m down lays no trail or foam and stops moving the simulated surface. A dive leaves a short froth; the foam has a second noise octave because one showed square cells up close.
- **Cost:** 7.95 ms mean under water against 7.6 at the surface in the same spot (High, 300–400 frames; Minecraft open). 0 GPU errors, 0 late pipelines.
- **The clip:** `review/dive/dive-sounding.mp4` (16 s, 10:00): float, dive, look round, look up at the window, rise, surface.
- **Play it:** `?spot=u1-sounding` (the rim, wading, facing the pit).
- **Second pass (user: "make it feel as realistic and graphically appealing as possible"):**
  - **Marine snow** (`render/underwaterFx.js`): 3,000 specks in a 22 m box round the camera on slow loops and a faint current. They're lit by the same focused beams as the shafts, glitter between the eye and the sun, and dim between beams.
  - **Bubbles:** going under, the robe lets out the air caught in it: 64 bubbles, then a trickle that dies over a few seconds, plus a few shaken loose by fast strokes. They rise at the speed of their size, wobble, and go at the surface, drawn with a bright rim and a clear middle. Specks and bubbles are small opaque dithered quads that write depth, so compose fogs each at its own distance; additive specks were fogged at the distance of the water behind them and vanished.
  - **Caustics** on everything under the water (`post/compose`): the walls, the shelf and the Wraith, from the same moving net of light as the shafts. The Wraith's shadow falls on the wall.
  - **The robe** sways on slow eddies under the water and lifts a little.
  - **The camera** follows the dive sooner (`diveUnder` 0.3, the clamp eases at 6/s).
  - **The plunge's froth** is three octaves of finer noise. At 24 cm cells it read as a white blot with holes from close above.
  - **Cost:** 8.0 ms mean under water (was 7.95 before the particles and caustics; 7.6 at the surface). 0 GPU errors, 0 late pipelines.
  - **Clip:** `review/dive/dive-sounding.mp4` re-filmed at 60 fps; stills in `review/dive/underwater-stills.png` (the burst, the wall with caustics, the shelf from below, open water).
- **Still bare:** the bed is 105 m down and unseen, and the walls are plain terrain. U2 dresses the Sounding (shaft wall, kelp).

**Checkpoint: go.** The user dived on 2026-11-02 ("looks good, continue building through the steps"); the city is on.

**U2 — The Lung and the descent (2 sessions).** Air shown on the body only: cowl light, bubbles, the robe's life. The Sounding carved in the bake with a shaft wall from the canyon kit. Kelp that reacts to the body. The tear, the failed ascent (a wake-up, never a death), the bubble column and whirlpool.

**U3 — The undercroft (1 session).** **The whirlpool hides a cut:** the screen is all bubbles, so the Wraith can be moved to another place at no cost. Interiors therefore live in their own sealed space outside the terrain, not under it. It avoids holes in the heightfield and keeps Phase 13's SDF work out of this phase. The cave is a hand-shaped mesh kit, and Phase 13 can replace it.

**U4 — Ebbhold (4–5 sessions).** A kit of halls, stairs and sea-doors in Shaper stone, drowned and dry versions.
- The outside, seen from the descent, is a streamed site in the pit: it must look vast from 100 m up. The inside is a much smaller number of real rooms.
- **Real scale: about 8–12 rooms and a great hall, not a walkable metropolis.** Doors, collapses and a few long sight lines give the "mega palace" sense.
- A **per-room water level** (the shader, the CPU's `levelAt`, swim or walk at the line). Tide floods and drains rooms once lent, which is the Warden's herding at city scale.
- Air pockets for fights; **no real combat when fully submerged in the first pass.** Under water the player hides, flees and solves.

**U3 + U4 rebuilt 2026-11-02 at the user's direction** ("model the interior off of LOTR erebor palace, we want it to be huge instead of feeling like some interconnected boxes"; references: the film's dwarf-halls). The first grey box, 12 rooms joined by doors, is replaced by **one colossal hall**. The references are inspiration only; the motifs are the Shapers' own: tide chevrons, wave-stepped frames, veiled figures with staves.
- **The Tide Hall** (`world/ebbhold.js buildCity`): 260 m long, 90 m wide, 190 m from its drowned floor to the roof.
  - **The chasm:** water 30 m deep, and it's the great well, where the Listener is stranded.
  - **The causeway** down the middle, lined with veiled Shaper statues 14 m tall, leads to the register's platform and on to the sea-door landing. The sea-doors are 56 m high in bronze, between two colossi 52 m tall.
  - **Galleries:** three tiers on each long wall (0, 24, 48 m), joined by 80 m flights and by two bridges across the void at 24 m.
  - **Pillars:** eight, 9 m across, rising out of the abyss to stepped capitals under the roof.
  - **Off the galleries:** the people's rooms (bakehouse, nursery, wheel room, sweepers', archive).
  - **Below:** under the west gate, the intake stair climbs from the undercroft.
  - **A way back up** from the water, by the landing's stair.
- **The kit and material** (`render/ebbhold.js`, `shaders/ebbhold.wgsl.js`): chamfered pillars with bands and three-tier capitals; pilasters up the walls; balustrades with posts and balusters; deep fascias under every walkway; braziers.
  - **Wall relief:** panels 8 × 12 m in stepped frames, fluted below and crossed by tide chevrons above, with gold inlay.
  - **Floors:** polished flagstones that SSR reflects.
  - **Sea-windows:** they glow behind geometric leading.
- **The sea-light:** the hall's own light, not the sun's. Fixed beams fall through rows of short openings in the roof slits (`BEAM_WGSL`). On the stone they land as sharp pools (traced back up to the slits, blocked by the slabs above). In the haze, compose marches them (20 samples over 320 m). An interior haze fills the hall (the weather fog's slots while inside), with the lamps and a cold fill.
  - **Why not the sun:** at most hours the real sun's beams land high on one wall, and at night there are none.
  - **City height:** the city now sits 400 m above sea level. Below it, the atmosphere put the camera inside the planet and there was no sunlight.
  - **Terrain:** the terrain and the far mountains are switched off while inside. They are never seen from in here, and the terrain's shadow covered the roof.
- **Checked:** tests (`tests/ebbhold.test.js`) cover scale, spawn floors, the flights' clear headroom, platform and bridges to the galleries, the intake, the void, waters, the camera and the lamp budget. Walked (bot): gate → causeway; platform → north gallery; the walk → g1 flight; undercroft → intake → hall; out through the sea-doors. The intake had a gap at its top that fell to nowhere; it was closed, and any fall out of the city's spaces now returns the Wraith to the causeway.
- **Cost:** 8.05 ms mean on the causeway (High; 75 draws, 68,000 triangles). 0 GPU errors, 0 late pipelines.
- **Art pass, 2026-11-03** (user: "the pillars aren't enclosed, the texture is glitched… everything looks a little crude… we need a higher level of graphics inside this place").
  - **Hollow pillars and glitches:** every face was wound inside-out. Babylon culled the outsides, so pillars showed their insides and hidden faces z-fought through floors and rails. Faces are now emitted clockwise.
  - **Geometry:** the statues are sculpted surfaces of revolution: robe folds, folded sleeves, the hood's dark opening, a staff with a bronze crescent. The pillars have stepped feet, banded drums and two-tier capitals with an abacus under the roof's ribs. Colonnades stand behind every gallery, tier on tier. There are cornices, stepped portals at the gate and sea-doors, hooded triple-lancet windows, and solid lozenge-carved parapets with bronze copings. Bronze braziers hold still teardrop flames.
  - **Stone:** scanned stone (stone-pale, stone-dressed) retinted to a dark green marble with pale veins in drifts, grime runs, and a wet band over the water. Bronze comes from the iron scan, with verdigris in its hollows. The sea-doors are raised bronze waves, and the ceiling is coffered. Every relief is filtered by its screen footprint. The lamps glint off polished stone and bronze.
  - **Light:** the great pillars now block the sea-light (on the stone and in the haze).
  - **Cost:** 9.63 ms mean on the causeway (High, 0.8 scale; 75 draws, 222,000 triangles). 0 GPU errors, 0 late pipelines.
- **Review:** `review/city/ebbhold-hall-flythrough.mp4` (36 s), `ebbhold-hall-views.png`. Walk it at `?ebbhold=hall` (also `undercroft`, `gate`, `platform`, `gallery`, `well`).
- **Not yet:** the people (U5–U6); doors and rooms as tracked state; the whirlpool's cut (U2); weather is not shut out of the city. Beams still pass through the statues and colonnades.

**Checkpoint: the user walks the rooms.**

**U5 — The Drowned and the register (2 sessions).** They replace the "Drowned" elite in F8, and the elite gets a new name. Veiled bodies from the robe system with floating veils, each with a looped task. They hear (F3's noise), and they swarm. Saying a name stops one for good. Twenty or so named, with the register as a journal page.

**U5 first pass done 2026-11-03** (design review: `u5-design.md`).
- **Noise** (`game/noise.js`; the part of F3 the city needs): Shift is the quiet walk. Each action has a level that fades. It is shared as `g.noise` for the Listener.
- **Twenty people** (`game/drowned.js`; `systems/drowned.js`): Hanne and Ysolde kneading, Teodor at the cradle, Old Ise sweeping the long stair, Liese and her crew of four walking the north door-wheel, and thirteen more. Each is a Veiled robe figure on the city's floors with a loop. They hear, turn, come and hold the robe (four pin it), and let go after 2.5 s of stillness. A dodge shakes them off, loudly.
- **The register:** a journal page; carry a name, then say it. The right name stills them for good (saved); a wrong name cries out.
- **Checked:**
  - Tests: `tests/drowned.test.js` (8): noise ranges, every person on a floor of their tier, hear → come → hold → let go, losing a quiet sound, shake-off, naming.
  - Bot: a quiet approach is heard only at about 1.5 m; a walk at 7 m; two hold (speed ×0.36) and let go; wrong and right names.
  - Cost: 9.92 ms on the causeway (+0.3 ms for the twenty). 0 GPU errors, 0 late pipelines.
- **Not yet (U6):** hand animation and real props for the loops; the floating veils; the held look; Sefa. The compass still shows outside goals in the city.

### The twist (added 2026-11-01; `storylines.md`, *The betrayal*)

The user wants the player betrayed and changed by this chapter. The Drowned were alive, held by the Listener; the release kills them; Morrow knew. It needs:

- **F10 grows:** Morrow as the guide of the whole fen, with several scenes before the jetty, so the betrayal lands.
- **U4:** tracked state per room (door forced, flooded, drained) and per person (named). The survivors' count comes from it, and is saved.
- **U5:** the *held* look: flames that don't flicker, wet ink, mouths moving when named. Each Drowned's name-and-word is recorded in the Remembrance page.
- **The morning after:** a scripted dawn on the signature frame with thousands of veils on the water (one instanced cloth card; the same mirror as F1). A bespoke, fully voiced sequence with Morrow on the jetty.
- **World changes that last:** Veiled barks and kneeling in every biome; fen trade closed; the robe's wet hem and footprints in all biomes; a slightly dimmer cowl light. Save flags for each.
- **Phase 11 and 12 follow:** the sealed library's journal and the ending's new meaning. Add them to those phases' plans.

Test with the user: does the morning land, does the player feel cheated or changed, and does anyone want to replay the city? **Order:** Morrow's lines about the Wraith "putting things right" must make sense however many Wardens are released: the frost's alone is enough.

### Making the player understand (added 2026-11-01; `release-cinematic.md`)

The user's direction: the gameplay must carry the story, and freeing the Warden plays a cutscene that makes it obvious, with animated flashbacks, ending on the floating robes of the dead.

**U6 — The cinematic director and the people (5–6 sessions, with a spike first).** How, and why: `cutscene-research.md`. **First, a 10-second spike** of one captured shot, to prove the approach before the rest is built. A data-driven shot timeline for every later cutscene. The five people's loops and Sefa, the child who follows the Wraith. The name record saved with each name said. **Checkpoints: the loops on film; Sefa alone.**

**U6 started 2026-11-03.**
- **The people's loops:** the gated clips play on the Drowned's own robe bodies (`Performance.restart`: played through, eased out to a rest of 0.5–2 s, played again). Hanne and Ysolde knead (`knead1`), Teodor rocks his daughter (`rock`), and Liese's crew of five haul the door-wheel's bars (`wheel`). The manifest lists each as a cue.
- **Hand IK on a clip:** the hands go to the thing worked (the dough, the bar) and keep the clip's own rhythm about its running mean (`Performance.handT/handW/handSpread`, a two-bone reach after the clip's pose). This is the research's "Kimodo for the body, IK for the hands".
- **Props:** the kneading table with its board, dough and bowl; a bronze cradle on rockers; the door-wheel's drum, five bars and shaft; the archive's shelves of books; the register as an open book on a lectern; the shrine's stele.
- **The director** (`game/director.js`, `systems/director.js`): a shot list with hand-placed keys on a curve, eased, hand-held drift, and focus pulled per shot. A hard cut resets the temporal history and snaps the exposure. It has the camera, the controls and the letterbox, and can be driven by `seek()` for films.
- **Camera motion blur** (DOF pass, `P.cine`): 12 taps along each pixel's camera motion, at a 180° shutter by default. Where the frame barely moves, the depth of field is kept.
- **The spike** (`review/spike/spike-hanne.mp4`, 10 s): a push into the bakehouse, then a cut to a close side shot of Hanne kneading with Ysolde opposite. Live: 10.8 ms mean, p99 13.1 ms, max 14.2 ms (the gate is no frame over 20 ms). 0 GPU errors, 0 late pipelines.
- **Not yet:**
  - the crowd ("3 behind, 30 in the back") as baked, interpolated robes (VAT);
  - inertial blending between play and film;
  - pre-roll of the next shot's cloth;
  - Sefa;
  - the wide dark cuffs that hide the hands in close shots;
  - the dough reads as stone.
- **Loops on film:** `review/loops/`.

**U7 — The release and the morning after (4–5 sessions).** A grey rough cut first, as soon as U4's rooms exist, then the 3-minute sequence: flashbacks in the real rooms, the frozen wave, the player's own record, the held key that no longer does anything, about 4,000 floating robes. Then the walk through them, the jetty, the night's count, the rewritten journal, the changed title screen. **Checkpoints: the rough cut; the comprehension test.**

**Cut scope here last.** This is the reason for the chapter.

### Changes to the plan

- **F9, the Listener:** the arena moves from the fen's channels to **Ebbhold**, and `warden-mire` moves with it. *Hear* is played in flooded halls. *Herd* uses the sea-doors and Tide. *Strand* happens in the Tide Hall's great well. The climb and the last breath are unchanged. If the fen channels are kept, they carry the Soundings and the Sluice in F10.
- **F10:** the main thread becomes *The Lung*. The three sites shrink to teaching the noise rule on the way to the jetty.
- **F11:** at low tide, Ebbhold's towers stand out of the Sounding, and the roofs can be walked.
- **Combat with Tide:** lent inside the city, so mud Shaped in the fen are met with Frost first. The fen is revisited with the skim after, which is its restored play.

### Performance

Under water is likely to be cheap: fog closes the view, so the clipmap, far shadows and trees can be cut hard. NOT MEASURED. Interiors need portal culling. The price is load: the kit's pipelines must warm at start like everything else. Budget for the swim view is the same frame as the fen.

### Risks

- **Scope.** This is the largest addition to any phase. See the estimate and decision 8.
- **A forced trap can feel cheap.** The tear must happen to the player, not to a cutscene. Bot and user test: does anyone feel cheated by it?
- **No way back.** Once past the whirlpool the player is committed. **Warn and save before the jetty,** keep a shrine in the undercroft, and open a way out through the city as soon as possible (a sea-door shortcut). The quest must still fit open order: nothing in it may need Gale or Stone.
- **The Wraith under water with weapons:** turned off, and that has to read as natural.
- **Horror against tone:** the tone is melancholy, not jump-scares. The Drowned should be sad first.

---

## The idea of the biome

**The fen is the one place where moving is dangerous, because everything can hear it.**

Every other biome rewards speed. Here the water is so still that a wake is an announcement. The stilled mire is a held breath: mirror water, standing fog, nothing moving. The player's favourite thing, going fast, is what brings the Warden. After the release the same water breathes, and the fen becomes the fastest country in the game.

- **Stilled:** still water reveals everything that moves on it, the Wraith and what hunts it alike.
- **Restored:** a real tide runs through the fen on the game clock. Routes open and close with the hour.

This serves pillars 1 (moving is the joy, by making it a choice for once), 2 (the world answers) and 5 (learn by reading the water).

---

## Where the mire stands today (audit, 2026-11-01, measured from the bake)

- **It is too small.** Mire over 50 % weight: **2.35 km²**. Over 25 %: 9.88 km². The erg was 4.3 km² before Phase 9 grew it, and that was judged too small for its job.
- **Shape:** the core is a basin about x −2300…−1300, z −800…+1300, against the meadow's scarp (x ≈ −1000, ~200 m) in the east and the coast in the west. Height over the mire: mean 16.8 m, most of it at 15–25 m, with a lower part at 0–10 m towards the coast.
- **It is nearly dry.** Lakes cover **10.7 %** of it. The signature frame needs open black water; this needs something closer to half.
- **Baked POIs:** Warden arena `warden-mire` (−1212, −668), 19.6 m; shrines `shrine-mire-1…5`. No camp, ruins or Echo stones.
- **Height:** only tussocks (0.35 m of fbm in `meso.js`), so no hummock-and-hollow ground.
- **Look:** the Phase 1 clay view. No mud material exists; the oasis basin's dried mud in `clipmap.wgsl.js` is a useful start for the crust.
- **Water (`render/water.js`):** flat lake quads at fixed levels, with SSR and 64 analytic ripples. There is no ripple simulation, no moving water level, and SSR cannot reflect what is off screen.
- **Terrain state:** wetness, compaction and transform exist. Mud's behaviour is a stub.
- **Elements:** `tide` is listed, not in `BUILT`. The reaction table has a Tide column and a mud row as data, unbuilt.
- **Surf:** per-material tuning exists from D3. Water is not a surface for it yet.
- **Swimming** exists (enter at 1.2 m). No wading drag.
- **The meadow is the way in, and is the slowest place in the game:** about 23 ms (43 fps) of CPU. A wet, tree-filled biome next door will inherit that problem.

---

## Milestones

Letters are F for fen. Each ends in something reviewable on the 3060.

### F0 — Carry-over and geography (1–2 sessions)

**Debt first, limited to what the mire depends on:**
- Meadow CPU: cloth 4.4 ms and per-frame uniforms. The mire's trees and robe in water use the same paths.
- A GPU lever for the High 1% lows (Phase 9: 55–59, target above 60).
- The laptop run of `?bench=1&gfx=low`, so Low is a known number before new render work (needs the user).

**The bake:**
- Grow the mire to **8–10 km²** of dominant weight. First try weights only: drop the wetness factor in `biomeWeights` and let `reg.west` decide. If that falls short, widen the region.
- **Hummock and hollow:** in mire weight, lower the ground by low-frequency noise and give each basin one water table, aiming for **40–50 % open water**: shallows 0.2–1 m, channels 1.5–3 m, a few deep meres, wooded islands.
- A water table per basin in `lake_level`, with the lower coast part as its own.
- Placed: the camp, the Warden's channels, the drowned sites, and the river mouths from the meadow.

**Acceptance:** a diff test proves height and biome maps are **byte-identical east of x = −900 and north of the snowline**; Hearn, the Bellwether's manor and the frost are untouched. Every shrine stays dry and reachable.

**Measured 2026-11-02, half-scale trial bakes (nothing committed):**
- **Weights alone do not reach it.** Dropping the wetness factor west of x = −900 gives 7.85 km² dominant, but 4.88 of that is open sea. Real mire land goes from 2.50 to 2.97 km².
- **The land is not there.** West of x = −900, land above sea level is mire 2.90, meadow 4.05 (mostly the scarp at 60–300 m, only 0.5 under 60 m), frost 4.78, coast 0.39 km².
- **Hummock noise alone does not make the water.** At up to 8 m broad and 10 m fine noise over reg.west, lake share reaches only 15.7 % (target 40–50 %). The ground slopes to the sea, so hollows drain. The basin needs flattening towards one low level first.
- **Recommended:** grow the fen west over the shallows by raising the seabed into low marsh. That adds up to 4.9 km² without touching the meadow or the frost, for about 8 km² in all, and most of it can stay water. The alternative, cutting down the meadow's scarp, moves shrines and finished land. The coast shrines and `warden-coast` need checking either way. The user approved this on 2026-11-02.

**Done 2026-11-02 (`tools/bake-world/fen.mjs`, `tests/f0Diff.test.js`):**
- The fen is a stage after hydrology, so macro height and every river and lake outside its mask cannot move. Biome, surface, hydro, lake and height data are byte-identical east of x = −1024 and north of z = 1408. Wind changes only west of x = −1104.
- **Mire dominant 7.46 km², short of the 8–10 target.** More needs the meadow's scarp. Inside that, fen ground and shallows are 6.97 km², 43.8 % water: 57 % of it under 1 m, 37 % at 1–3 m, 3 % at 3–6 m. No mere passes 12 m.
- Water is set, not found: tidal marsh at the sea, then basins at 1.4 m and 3.6 m held by low banks. Rivers run on as channels. Every mire site has its own island, and all 10 sites west of x = −1024 stay dry and can be walked to wading under 1 m.
- `warden-coast` and both coast shrines are outside the mask. **Not placed yet:** the camp, the Warden's channels and the drowned sites. Those go in with their features.
- The ground is bare and the water is the plain lake look until F1 and F2. Frame cost over the new water is **not measured:** other programs held the GPU at 100 % during this bake.

*Optional:* the sawtooth scarp at (2420, 1354) needs a re-bake too. Do it in the same bake only if the diff stays limited to that area.

### F1 — Fen water (the proving ground of this phase; 2–3 sessions)

The biggest technical risk. Nothing else is worth building if this frame fails.

- **A ripple simulation:** a wave-equation height field following the Wraith, about ±50 m, written by feet, wakes, spells, Shaped and the Warden. It settles back to a mirror.
- **Reflection:** SSR loses trees that are off screen, which is the whole signature frame. Test a quarter-resolution planar pass of trees and sky on High.
- **Black water:** tannin absorption, floating litter, sparse bubbles, mist contact at the surface.
- **Low lever:** no simulation (the existing analytic ripples plus an analytic V-wake) and sky-only reflection. The Warden's bow wave must still read there.
- **Budget:** 1.5 ms on the 3060 with all of it, under 0.5 ms on Low.

**Ripple simulation done 2026-11-02 (`shaders/waterSim.wgsl.js`, `render/water.js`):**
- A wave equation over 512² cells of 0.2 m (±51 m) that follows the Wraith. Storage wraps, so moving the window copies nothing. Two steps a frame; waves at 1.25 m/s.
- Land and the last few centimetres hold the surface still, so waves stop at banks. Very shallow water and the window's edge damp them. The mirror returns in about 10 s.
- Written by the body moving through water and by splashes. `water.splash(x, z, r, depth)` is the hook for spells, Shaped and the Warden.
- The lake, wadi and SSR shaders all read it. With it on, the analytic rings and crests are off; the churn and foam behind the body stay.
- **Low:** off (`waterSim` in the presets), so the analytic wake is used. The pipelines warm at load on every preset.
- **Cost:** about 0.2 ms a frame (11.75 against 11.57 ms mean, 300 frames, two runs each) on the 3060 at 2560×1440, scale 0.8. Minecraft was open, so this is not an idle-GPU number. 0 GPU errors, 0 late pipelines.
- Stills: `screenshots/phase-10-water/` (`ab-compare.png`: off above, on below, 1.5 s after a short wade).

**Planar reflection spike done 2026-11-02 (`render/waterReflect.js`, `treeReflectFragmentWGSL`):**
- A camera mirrored under the water plane draws only the trees, with cheap shading, into a target 0.4× the window's size and 15 % wider than the view. The plane is the water at or near the Wraith. The pass leaves the frame when there is none for 2 s.
- The water projects each pixel with that camera, bends the lookup by slope × the tree's distance, and hazes the reflected path with the post chain's weather fog and forest haze. Without that haze the reflection was darker and more saturated than the trees themselves.
- Where it holds a tree, SSR adds no far fallback. Elsewhere sky and SSR work as before, including the far shore, which is not in this pass.
- **Result at `p8-lake-noon`:** looking down at the water, trees above the top of the screen now reflect; SSR showed sky there. Looking level, it matches SSR's look and also covers trees off the edges. Shots: `screenshots/phase-10-water/cmp-*.png`.
- **Cost there: about 1.07 ms** (18.17 against 17.1 ms mean, 400 frames, two runs each; 93 more draw calls). That's just over the 1.0 ms reflection budget, at the meadow's densest grove, with Minecraft open. Most of it is likely the main thread binding the extra draws (`perf-main-thread`); not measured apart. Levers, if it stays over in the fen: fewer species and LODs in the pass, or drawing it every second frame.
- **High and Ultra only** (`waterReflect`); warmed at load on every preset. 0 GPU errors, 0 late pipelines.

**Black water done 2026-11-02 (`shaders/water.wgsl.js` T_SIGMA, T_BODY):** tannin optics blended in by the mire's biome weight. Blue goes first, then green, so shallows are tea-brown and anything past a metre or so is near black. The body sends back almost nothing, and caustics fade to a fifth. Lakes elsewhere are unchanged (mire weight 0). A first try at (0.6, 1.5, 3.3)/m read red-pink over the bare ground; (1.0, 1.45, 2.6) reads brown. Dawn shots: `screenshots/phase-10-water/fen-dawn-*.png` (the still mirror with the mountains in it, the wake, looking down into it).


**The surface and the clip, 2026-11-02 (`shaders/water.wgsl.js`):**
- **Litter:** leaves and needles in calm patches, drifting slowly downwind and nudged by the ripples. Past the pixel's footprint they average into a faint brown tint, so they don't shimmer at range. They take away the reflection where they float.
- **Bog gas:** a third of 3 m cells have a vent on its own 5–12 s period. A bead swells, then pops into a small ring.
- **Mist:** a thin drifting veil on the water when the sun is low (dawn, dusk, night) and the air still, at most 55 %, lit from the sun's side. It stops at the water's edge, which reads as mist lying on the water; check it from the banks once F5's fog exists.
- **Low's wake:** a wake tied to the body vanished the moment the Wraith stopped, so it was dropped. Instead the trail's crests run out at ripple speed (1.1 m/s), and on Low the trail points are 32 cm apart, holding 20 m of path. The arms open to about the Kelvin angle and stay after the body stops.
- **The clip:** `review/fen-water/fen-wake-dawn.mp4` (High, 12 s at 60 fps) and `fen-wake-dawn-low.mp4` (Low's wake, 10 s at 30 fps). Dawn, 06:24, in the fen at (−2596, −289). The Wraith stands in the mirror, wades out, stops, and the water settles.
- **Frame:** the fen view with everything on runs at 10.3 ms mean on High (400 frames twice, Minecraft open). 0 GPU errors, 0 late pipelines.
- **Not in F1:** the trees in the fen's mirror (F6), and the Warden's bow wave on Low; it can lay its trail through `water.ripple`.

**Go: the user approved F1 on 2026-11-02** ("It's looking good, continue") from the dawn clip and stills.

**Go/no-go checkpoint:** a still of the mirror at dawn and a clip of a wake crossing it, before F2. **The fallback,** if planar reflection misses budget, is to frame the signature shot so SSR holds and keep trees on screen; cheaper, but a smaller frame.

### F2 — Mud (1–2 sessions)

- The mud material: wet specular that breaks into dry, cracked crust as wetness falls; puddles in depressions.
- **Keeps every track:** deep prints, slow healing (a new per-material rate).
- **Wetness drives everything:** wet mud slows feet; dry crust is firm and walkable. Shallow water gets a wading drag.
- The whole mud row of the reaction table for Frost, Gale and Stone (frozen crust, nothing, raised banks).

**Checkpoint:** mud close, mid and far; a track held from across a flat.

### F3 — Water-skim (most polish time; 2 sessions)

- A cushion of water under the feet, a V-wake and spray; over mud, a wet glossy track.
- **Its own feel:** the least friction in the game but the widest turns. Speed bleeds in shallows and reeds, and deep water carries it, so reading depth is the skill.
- **Hand-offs:** glide lands into skim; a skim off a bank takes off; skim onto mud brakes to a run with the eased exit.
- **Flow:** builds on clean long lines and near-misses with roots; breaks on a beaching. At Flow 2+ the wake throws a side spray that shoves small Shaped. Shown on the wake and hem only.
- **Sound as a mechanic, built here:** a noise value for the Wraith (skim loud, wading medium, walking on crust and on ice quiet), read later by Shaped and the Warden.

**Checkpoint: the user plays the skim.** This needs to feel right before anything leans on it.

### F4 — Tide verbs (2 sessions)

| Slot | Verb | What it does | Writes |
|---|---|---|---|
| Tap | **Surge** | A rolling wave over ground or water. Shoves, soaks, extinguishes; **travels as a noise**, so it is also a decoy. | wetness, displaced, ripples |
| Hold | **Draw** | Pulls water from mud, plants or enemies into a hovering mass. The source dries and cracks. Release throws the mass. | wetness, compaction, transform |
| Heavy | **Undertow** | A whirlpool drags enemies down and leaves a sunken basin that holds water. | depression, ripples |

- The whole **Tide column** for snow, water, sand, grass and mud (`reactions.test.js` must stay green). Ash waits for Phase 11.
- **Combinations:** Surge then Crystallize → an ice ramp; Tide on sand → wet packed sand that holds a Ridge; Ridge dams water.
- **Wet Shaped:** soaked then frozen is already a Flow reaction. Draw on a soaked enemy dries and crumbles mud Shaped (§4.4).
- **Wardens:** Tide does nothing to the Frost Warden and the Bellwether. **Those fights are not touched** (user rule).

### F5 — Fog and weather (1–2 sessions)

- Ground fog that pools in hollows and thins with the sun, stilled and standing.
- States from BRIEF §5.6: fog, drizzle, heavy rain. Rain writes the ripple field.
- **Fog must never become a wall** (§5.6): the fight and the routes read by sound and water, so visibility is tuned at the same time as F9.
- Dark nights with fireflies; marsh light as the only warm colour.
- Fog cuts the far view, so measure whether draw distance can fall here: a gift to the budget.

### F6 — Mangroves and reed beds (2 sessions)

- Mangrove trees through the existing generator: arching prop roots standing in water, no two alike, with collision for the skim. Drowned dead forest.
- Reed beds that part and stay parted (they slow skim and hide things), lily and litter on the water, moss.
- Art bar: procedural PBR, no repeats (`screenshots/reference/forest-ruins-target.webp`).
- **Budget:** the reflection pass draws these too, so an impostor path is required, not optional.

**Checkpoint:** the fen composed: water, fog, trees, at dawn and at dusk. Signature frame first attempt.

### F7 — Drowned sites and borders (1–2 sessions)

- Shaper causeways, sluice gates, sunken shrines (kits from `ruinKits`, in wet stone).
- **Meadow border:** rivers run out of the hills, grass gives way to reeds. Mire fog creeps up the western rivers (`cross-biome` §6).
- **Coast border:** a soft edge for Phase 12 to finish. The sea stays unbuilt.
- Restored-neighbour effect: a restored meadow's rivers run into the still mire, so moving water visibly meets still water.

### F8 — The mire Shaped (1–2 sessions)

Level 1 (flanking allowed). **All must be beatable with Frost alone,** because Tide isn't lent until the Warden wakes. Names are working names.

| Shaped | Role | How it pushes | Telegraph | Answers |
|---|---|---|---|---|
| **Mudlings** | swarmer | rise from any mud near noise; drag and slow | bubbles run towards you | frozen crust traps them; Draw crumbles them |
| **Rootback** | bruiser | root-bound mud; roots across the skim line, a slam that floods | roots lift the mud before the slam | freeze the wet joints and shatter; Draw dries the mud and exposes the root |
| **Lampfish** | caster | a light in the fog that lures, then spits a slowing tar | the light dips and swells | break line of sight; Sweep through the tar; Gust blows off its fog |
| **The Bottom-walker** (elite; was "the Drowned", now the city's people) | elite | walks the bottom unseen, seizes from below | a line of bubbles on still water | read it and step on to ice; Undertow |

- **All hunt by noise** (F3), so a fight can be avoided by walking, and a skim past one has a price.
- Encounter anchors per the director; a storm surge in heavy rain.
- A stranded Shaped in a dried flat is the visible payoff of Draw.

### F9 — The Warden: the Listener (working name; 3 sessions)

Replaces the sketch in `gameplay-design.md` §5. See *Warden brief* below.

**Checkpoint: the user plays the fight.**

### F10 — The camp, quests, Echoes and robes (2–3 sessions)

Per BRIEF §2.5: 2–3 main, 3–5 side, Echoes 3–5, robes 2–3.

- **The camp:** a stilted Veiled settlement on the causeway near `shrine-mire-3`. A trader and smith per §11. One person from an earlier settlement, per `cross-biome` §7.
- **Rumours:** a far trigger in Hearn, so the mire is heard of early.
- **The fen with Morrow, the chapter's first half** (`voice-script.md` sections 1–5): the meeting, learning to be quiet, her rescue, three nights at her fire, the jetty. Several hours of real company, built as carefully as the fight.
- **Sites that teach the water** (cut if the Warden teaches it already):
  - *The Soundings:* learn what it hears: walk the mirror behind a Veiled guide.
  - *The Sluice:* with Frost alone, hold a channel shut with ice and see the water level fall behind it. This is the herding lesson of the fight.
  - *The Stranded:* a drowned Shaper bell or boat raised as the water falls: the lore of why the tide was stopped.
- **Side quest verbs:** Draw, freeze, Surge, skim runs. No fetch. Each has a bot solver.
- **Locks** (`cross-biome` §2): freeze channels into ice roads; blow the standing fog off a drowned shrine (Gale); Ridge banks to drain a hollow (Stone). Ember's waits for Phase 11.
- **Tide keys elsewhere, as optional retrofits:** the frozen spring (frost), the burnt orchard (meadow), the dry aqueduct (dunes). Quest content only; **no boss fight is touched.**

### F11 — The tide breathes: restoration (1–2 sessions)

- **After the release, the water table rises and falls on the clock** (two tides in the 40-minute day, so about 20 minutes each). Stilled, it does not move.
- Low water opens mud flats, causeways and a crossing; high water opens skim channels through the drowned forest.
- Tide-pool Echo; a timed run that only works on the ebb.
- Fen wakes up: reeds move, birds, the camp's boats float.
- **Calm epilogue:** no threats for a while after the release.

**Risk contained here:** a moving level touches the water plane, the CPU `levelAt`, the shoreline wetness and the reflection. If it fails, the fallback is **two fixed states at dawn and dusk with a slow crossfade**, which keeps the play.

### F12 — Gate (1 session)

`?bench=mire`, `docs/phase-10/gate.md`, gate shots `p10g-*`, a playthrough with save, reload and load, and two orders of play (mire second, mire last).

---

## Warden brief: the Listener

**Against the roster (differs from every Warden on at least three axes):**

| Axis | Frost Warden | Bellwether | Long Walker | **The Listener** |
|---|---|---|---|---|
| Target | static | a building | always moving | **hidden, submerged, unseen until the end** |
| Win condition | freeze, shatter | strip, climb, open | steer it home | **find it, herd it, strand it, draw it dry** |
| Discovery | which joints | which vents | read the gait | **how it perceives** |
| Arena | snowfield | manor | the whole erg | **fog channels whose water falls during the fight** |
| Tempo | deliberate | siege | pursuit | **stalking, then sudden** |
| Mood | grief | relief | companionship | **dread, then pity** |

1. **Fiction.** It held the tide still by silencing it, listening for every last movement and putting it out. It is not cruel; it was told to keep the world quiet so the tide would sleep, and nobody came back to say it could stop.
2. **The approach.** The fen grows quieter towards it: birds stop, then frogs, then the music. Standing stones with bronze ears. No marker: the compass loses it in the fog.
3. **The waking.** It stirs, the water draws back from the Wraith's feet, and **Tide and the skim are lent**. Both are needed at once, and the skim is what it hunts.
4. **Phases.**
   - **Hear (hunt).** It is a bulge moving on mirror water, with a V of ripples. Noise draws it: skim, spells, a splash. It strikes where the noise was, and the strike is telegraphed by the water running out from under the spot. *Solutions:* throw Surge as a decoy; stand on ice; walk the crust.
   - **Herd.** Channels lead to a shoal, the Pan. *Solutions:* Crystallize the channel mouths shut and lure it with Surge, or be the bait and skim it in at speed. Stone or Gale give further options for those who have them.
   - **Strand.** In the Pan, Draw takes the water out; the level falls for real and the fen's floor shows. It heaves, thrashing, on to its side: the first time it is fully seen.
   - **The climb and the last breath.** Root-bound mud holds up its drying flank to the core. One long Draw, the biggest water mass in the game hanging over it, then Undertow to send the water down through it, and home.
5. **Calm moment.** On its back in the silence after stranding: its breathing is the only sound in the fen.
6. **The climb.** Yes, in the last phase only. Root-bound mud holds, drying and crumbling under the hand, so the climb has a clock made of the material.
7. **The release.** The tide returns through the Pan and runs out across the fen. F11's play opens. Its body stays as a low island.
8. **Measure.** Time per phase, deaths per phase, decoy against bait, how often the player walked by choice. **Must avoid the "three weak points" formula:** there is one core and one breath.

**Must not fail:** fog plus an unseen enemy can feel unfair. Each strike needs a readable water telegraph at a distance of at least 10 m on every preset, and a checkpoint at each phase.

---

## Design review (per `.claude/skills/wraith-design`)

- **Isolation test:** skim on empty water: NOT ASSESSED until F3. If it isn't fun alone, stop and fix it.
- **Dominant strategy (present, addressed):** in a stealth biome, walking everywhere would be safe and dull. Mitigation: routes are long on foot, and Shaped and sites reward going fast at the right moment. Measure the share of time skimming; **target above 50 %.**
- **Empty stretch (risk):** a flat fog has no landmarks. Each kilometre needs a silhouette tall enough to read in thin fog, and sound landmarks too.
- **Lying telegraph (risk):** see the Warden note.
- **Graphics without play:** clear. Stillness, fog and tide all change decisions.
- **Gate without warning:** clear if the critical path stays Frost + Tide; add the validator entries.
- **Scope mismatch (risk):** the phase has three big techs (ripples, reflection, moving tide). F1 and F11 each have a fallback, so it can shrink without losing the gate.

---

## Order, estimate and checkpoints

**Ebbhold first.** The risky, important thing leads, and the fen is fitted round what it needs.

| Step | Work | Sessions | Review with the user |
|---|---|---|---|
| 1 | F0 carry-over and bake | 1–2 | the grown fen on the map |
| 2 | F1 fen water | 2–3 | **mirror still and wake clip: go/no-go** |
| 3 | U1 the dive | 2–3 | **the dive (the user plays it): go/no-go on the city** |
| 4 | U3 + U4 undercroft and grey Ebbhold | 3 | the rooms, unlit |
| 5 | U6 the spike, then the director, the people, the voice player | 5–6 | **the spike; the loops; Sefa** |
| 6 | U7 grey rough cut, with temporary voices | 1 | **does it make the point?** |
| 7 | F3 skim, F4 Tide | 4 | **skim feel** |
| 8 | U2 the Lung and descent | 2 | **the tear and the whirlpool** |
| 9 | U5 the Drowned and the register | 2 | the first room of them |
| 10 | F9 the Listener | 3 | **the fight** |
| 11 | U4 art, U7 final: the release and after | 5–6 | **the real thing; comprehension test** |
| 12 | F2 mud, F5 + F6 fog, trees, F7 sites | 5–6 | the fen composed |
| 13 | F10 Morrow, the fire, the camp | 2–3 | **the first half, played** |
| 14 | F8 Shaped, F11 the tide | 2–3 | |
| 15 | F12 gate | 1 | gate shots and bench |

Roughly **38–47 sessions**, an estimate from Phase 9's 16–20 plan. It's the largest phase so far. **If it runs long, cut from step 12 and 14 first,** then the side quests. Steps 3–6 and 11 are the point of the chapter. Built in the main session unless the user asks for subagents.

**Needed from the user, and when:**
- **The stair song** and temporary voice takes by step 6.
- All voices and music by step 11.

## Performance budget

Targets on the 3060 at 1440p (High): 60 fps median and 1% lows above 60; Low 60 fps on the i5-1235U. 0 late pipelines. Zero per-frame allocations.

| New cost | High | Low |
|---|---|---|
| Ripples and water shading | 1.5 ms | 0.5 ms |
| Reflection pass | 1.0 ms | none |
| Fog | 0.8 ms | 0.3 ms |
| Mangroves and reeds | within the tree budget | fewer, impostors |

These are proposed numbers, to be replaced by measurements in F1 and F6.

## Risks

- **The meadow's CPU cost carries over** if F0 is skipped. Everything here assumes it isn't.
- **Off-screen reflection** is the signature frame's whole point, and the most expensive thing in the plan. Decide at the F1 checkpoint.
- **A bake change near finished work.** The diff test is what makes it safe. Nothing moves until it passes.
- **Sound as a mechanic has no HUD** (BRIEF: no HUD beyond the compass). It must read through water, music and the world. If bot and user can't tell how loud they are, it's a fake mechanic: cut it to speed alone.
- **Fog hides the art.** The bar is reachable only if the near 100 m is strong.
- **A moving tide** can break collision parity. See the F11 fallback.
- **Reflections of the robe** cost cloth twice, so check on Low early.
- **Caves are out of scope:** Phase 13 covers them (mire hollows).

## Decisions for the user

**Answered (user, 2026-11-01):**
- Underwater play and Ebbhold: yes, and they're the main part of the phase. **No split.**
- The betrayal, with the release killing the people of Ebbhold, shown by a cutscene with animated flashbacks, ending on the floating robes.
- Morrow is the betrayer. **Aud is not involved.**
- The user supplies generated voices and music.

**Assumed, unless the user says otherwise:**
1. **The performance work comes first** (F0).
2. **The mire grows** to 8–10 km² with 40–50 % open water.
3. **Noise as danger,** with the Listener.
4. **The tide really moves** after the release; Ebbhold's towers depend on it.
5. **The Shaped:** Mudlings, Rootback, Lampfish, the Bottom-walker. Fewer if the time goes to the city.
6. **The skim is lent at the waking,** like sand-surf.
7. **Ebbhold has 8–12 real rooms** that look vast.
8. **Open order and locks** as in `cross-biome.md`.

**Decided 2026-11-02:** generated movement is allowed (BRIEF §8 amended), through the gate in `motion-gate.md`.

**Still open:**
9. **The city's name:** a six-year-old in the meadow is called Ebb. Rename the city, or make it a deliberate link.
