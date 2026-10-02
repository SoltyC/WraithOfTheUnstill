# The Wraith of the Unstill — Master Brief

You are the sole engineer and technical artist on an open-world elemental action RPG that runs in the browser. You are building it across many sessions, one phase at a time. This document is the spec, the art bible, the architecture, and the acceptance criteria. It does not change between sessions. Session state lives in `PROGRESS.md`.

---

## 0. How to use this document

- **Every session**, read `BRIEF.md` (this file), `PROGRESS.md`, and `DECISIONS.md` before writing any code.
- Each session works on **one phase** from §17. Do not begin the next phase until the current phase's gate passes. If a session ends before the gate passes, say so plainly in `PROGRESS.md`.
- At the end of every session, update `PROGRESS.md` with: what was built, what is unfinished, known defects, measured performance, screenshot paths, and the exact next step. Write it for a fresh agent with no memory of this session.
- The game is too large to hold in one context. Keep modules small, interfaces explicit, and documentation current, so any system can be understood without reading the whole codebase.

---

## 1. Prime directive

Visual quality is the product. A player loads this, walks out of a snowbound monastery, and within ninety seconds decides whether it is a AAA world or an indie prototype. That judgment repeats every time they cross into a new biome.

Two rules override everything else in this document:

1. **If a requirement here conflicts with making the game more beautiful, break the requirement.** Record the deviation in `DECISIONS.md` with a one-line rationale. You have full authority to change scope, swap techniques, or cut any feature that isn't paying for its pixels.
2. **Anything that reads as low-poly, flat-shaded, untextured, placeholder, or "indie prototype" is a defect, not a stepping stone.** If you can't make something look finished, cut it from the frame rather than ship it rough. This applies equally to the hundredth rock, the third enemy type, and the journal UI.

Do not stop at "it works." Stop when every captured frame, in every biome and at every time of day, looks polished, cohesive, and production-ready.

---

## 2. The game

### 2.1 Pitch

An elemental-bending action RPG in which **the ground itself is the canvas**. Every biome has a surface that remembers: snow, sand, mud, grass, ash. Feet, spells, traversal, creatures, and weather all write into one shared terrain state, and the world carries those marks until it slowly heals them. Bending is continuous, carries momentum, and never breaks the flow: nothing spawns from nowhere, and everything rises from the ground and settles back into it.

### 2.2 Fiction

For an age, the **Shapers** kept the world in motion. They turned the tides, drove the winds, walked the dunes across the desert, and drew the snows down from the peaks. They are gone now, and the world is **stilling**: wind dies in the high meadows, dunes stop moving, rivers slow to standing mire, and the fire under the ash cools. The **Shaped**, constructs the Shapers made from living material, have gone feral. They rise out of the ground they were made from and collapse back into it.

When the last Shaper died in a monastery high in the frost steppe, the world's remaining motion had nowhere to go. It gathered into the empty robe. That is the player: **the Wraith of the Unstill**. It is a hooded figure with no face, only a faint cold light deep in the cowl. Its hands are wrapped in cloth and its hem trails snow. The veiled pilgrims who remain revere and fear it.

In each biome, a colossal **Warden** holds that land's element in stillness. The Wraith does not kill Wardens. It **releases** them, and the Warden settles into the land. Motion returns to the biome, and the Wraith learns its element. When the last Warden is released at the sea, the Wraith itself has nothing left to hold and settles into the tide.

**Tone:** mythic and melancholic, in the spirit of Journey, Shadow of the Colossus, and Elden Ring. The world is vast, quiet, and half-ruined. NPCs are few, and most of the story is told by the environment. The game is beautiful first and threatening second.

### 2.3 World

**One seamless continent, about 8 × 8 km, with no loading screens.** Biomes blend across believable transitions: a snow line descending into meadow, meadow sinking into mire, mire opening onto coast, scrub drying into dune, dune blackening into ash.

Suggested geography (adjust if it composes better):

| Region | Location | Element taught | Traversal | Notes |
|---|---|---|---|---|
| **Frost Steppe** | North, high plateau under the ranges | Frost (water & ice) | Snow-surf | Starting region. The Shapers' monastery. |
| **Highland Meadow & Forest** | Centre, rolling uplands | Gale (wind) | Glide / updraft | Hub settlement of veiled pilgrims. Rivers rise here. |
| **Mirefen** | West lowlands | Tide (deep water, mud) | Water-skim | Rivers spread into marsh. Mangroves, standing fog. |
| **Glass Dunes** | East basin | Stone (earth & sand) | Sand-surf | Wind-carved erg. Half-buried Shaper ruins. |
| **Ember Waste** | South-east, around a volcano | Ember (fire) | Ash-skate | Ash dunes over a glowing crust. |
| **Coast & the Sea** | South and west shores | (all elements) | Wave-riding | Finale. The last Warden is in the sea. |
| **Caves** | Within every biome | — | — | Ice caves, crystal caverns, mire hollows, lava tubes. |

The continent is ringed by mountains in the macro heightfield, with a matte-projected or impostor ring beyond 8 km, so the horizon never reads as flat or ends.

### 2.4 Progression

- **Biome = element.** Releasing a biome's Warden grants its element (three verbs) and its traversal mode.
- **Elements open the world, Metroidvania-style.** Frost freezes rivers into bridges. Gale crosses chasms on updrafts. Tide drains mire into walkable crust. Ember melts ice walls and fuses sand into glass platforms. Older regions hide content that only later elements can reach.
- **Upgrades** come from **Echoes**, remnants of the Shapers found at shrines, in caves, and on optional Shaped. Echoes improve range, sustain, combos, and cross-element reactions. Keep the number of upgrades small and give each one a visible effect.
- **Robes** are found or earned. They change appearance (cloth pattern, layering, fur trim, colour) and have at most one modest property each. They are not a loot system.
- **Restoration is the progression the player sees.** Each biome has a *stilled* state and a *restored* state. Stilled: no wind, frozen particles, flat light, desaturated colour, dunes locked in place, a mirror-still mire. Restored: weather returns, spindrift streams, grass waves, dunes creep, rivers run. This is the reward for releasing a Warden. It must be dramatic and it must be beautiful.
- Order: Frost is first. After that, the player can choose. Design difficulty so that Meadow is the natural second region.

### 2.5 Content targets (whole game)

- Per biome: 3 Shaped archetypes plus 1 Warden, 1 camp or settlement, 2–3 main quests, 3–5 side quests, 1–3 caves, 4–8 shrines, and Echoes hidden in the world.
- Total: about 18 enemy archetypes, 6 Wardens, 1 hub settlement, roughly 25–35 quests, and 6–15 caves.
- Content should be dense where the player is likely to look. Empty space is allowed, and it is a feature in this tone, but empty space must still be beautiful.

---

## 3. Stack and hard constraints

| | |
|---|---|
| **Language** | Modern JavaScript (ES2023 modules). JSDoc types encouraged. No TypeScript build step. |
| **Engine** | Babylon.js, latest stable. **WebGPU only.** |
| **Shaders** | WGSL (raw `ShaderMaterial` with `ShaderLanguage.WGSL`, compute shaders, or NodeMaterial where it helps). |
| **Physics** | Custom heightfield character controller. Babylon's Havok plugin only where rigid bodies earn it (debris, Warden fragments). |
| **Bundler** | Vite. |
| **Target** | Chrome stable on Windows 11, RTX 5070 Ti, 2560×1440. |
| **Frame target** | 90 FPS sustained, 60 FPS floor, everywhere in the world. |
| **Frame time** | No frame exceeds median + 4 ms after the loading screen dismisses, including during streaming, biome transitions, weather changes, and first casts. |

**No fallbacks.** There is no WebGL path, no mobile path, and no feature-detection branches. If `navigator.gpu` is absent, show one line of styled text and stop.

**Measurement machine.** The build agent runs on the target PC (Windows 11, RTX 5070 Ti), so measure every performance number there and capture every gate screenshot there. State the machine in `PERF.md` anyway. If work ever happens on another machine, its numbers are indicative only.

**Assets.** Generate procedurally wherever that gives a better or more controllable result: terrain, noise, masks, rocks, trees, creatures, cloth, and most textures. Use free CC0 assets where hand-authored data wins, such as Poly Haven HDRIs and PBR scans or ambientCG detail textures. **No rigged human assets and no AI-generated character meshes.** Every character is procedural and cloth-driven (§8). Vendor everything into the repository; there are no runtime CDN fetches. Document every third-party asset and its licence in `ASSETS.md`.

---

## 4. World architecture

### 4.1 Build-time world bake

A deterministic, seeded Node script (`tools/bake-world`) generates the continent's macro data. Its output is vendored and versioned.

- **Macro heightfield:** about 2 m per texel across 8 km. Mountain ranges, plateaus, basins, river valleys, coastline, and the volcano.
- **Biome weight map:** soft weights, not hard IDs, so the shader can blend transitions.
- **Hydrology:** rivers, lakes, and wetland masks from flow accumulation, plus flow-direction maps for water rendering.
- **Material map:** the base surface material (snow, sand, mud, grass and soil, ash and crust, rock, beach).
- **Placement:** rocks and outcrops, vegetation density, ruins, settlements, shrines, cave mouths, Warden arenas, and roads or pilgrim paths.
- **Wind climatology:** the prevailing wind direction per region. Dunes, sastrugi, and vegetation lean all follow it.

The bake must be reproducible. Given the same seed and code, the output is byte-identical.

### 4.2 Runtime terrain

- **Geometry clipmap or nested-ring LOD** centred on the player, with geomorphing between rings and no visible popping. Inner-ring vertex spacing is under 10 cm at default zoom.
- **Height = macro bake + GPU meso and micro layers per biome.** Each biome defines its own layered, *directional* noise: broad dunes measured in tens of metres, wind lobes and drifts in metres, and ripples, sastrugi, or mud cracks in decimetres. Medium and fine layers stretch and shear along the regional wind. A single isotropic fBm stack is a defect.
- **Collision parity.** The CPU must be able to evaluate macro and meso height identically to the GPU, so one noise definition must be shared between JS and WGSL. Get fine detail and deformation near the feet by asynchronous GPU readback of a small region; one frame of latency is acceptable.
- **Streaming.** Chunk data (placement lists, vegetation instances, cave meshes, deformation pages) streams on Web Workers. Uploads to the GPU are spread across frames under a fixed per-frame budget (§14). The main thread never parses large data mid-game.

### 4.3 Terrain state: the core system

Everything writes here, and every surface shader reads it. This generalises the original snow deformation buffer to every material.

**Two levels:**

1. **Fine window.** A player-following target of about 4096² covering about 80 m, at roughly 2 cm per texel. It is scrolled toroidally and snapped to texel boundaries so it never swims.
2. **Coarse persistent pages.** A world-space sparse page atlas (for example 128 m pages at about 25 cm per texel) holding the longer-lived record. When the fine window scrolls, the outgoing strip is downsampled into coarse pages. A surf run several hundred metres long must stay visible from across the field after the fine window has moved on.

**Channels** (pack across targets as convenient; these are starting points):

| Channel | Meaning |
|---|---|
| Depression | How far the surface has been pushed down. |
| Displaced mass | Material pushed out of depressions to form berms and rims. Never skip it. |
| Compaction | Trodden or packed surface: denser, darker, tighter specular. |
| Wetness | Meltwater, rain, spray, tide. |
| Thermal | Frozen ↔ molten. Ice, refreeze, melt, heat glow. |
| Transform | Permanent material changes: glass, obsidian, crystal, burned. |
| Flatten | Vegetation bent or crushed (grass lanes, wind-flattened fields). |

**Rules:**

- **Persistent and additive.** Every writer splats brushes into the target each frame. Never rebuild state from a list of past events.
- **Healing** runs as a gentle diffusion and decay pass at per-material rates. A trail must still be clearly visible after 60 seconds. Snow refills, sand creeps back, grass stands up again, wetness dries, slush refreezes. Transform channels never heal unless a reaction overwrites them.
- **Off-screen healing.** When a page is evicted it is serialised with a timestamp. When it reloads, healing for the elapsed time is applied in closed form. Do not simulate missed frames.
- **Weather writes too.** Snowfall fills depressions, rain raises wetness, sandstorms erase and re-ripple, and ashfall blankets.
- **Terrain vertices displace** from depression and displaced mass. Normals are recomputed from the same data so lighting and shadows respond. A trail that does not self-shadow is a failure.
- **Writers:** player feet, every traversal mode, every spell, every Shaped creature's feet and spawn and collapse, every Warden, and weather. This shared write path is what makes the world feel physical.

### 4.4 Material reactions

Reactions are data: a table of (material state × element verb) → state change, implemented as brush programs that write state channels. The same table applies to terrain and to Shaped creatures, which are made of that material.

| Surface | + Frost | + Gale | + Stone | + Tide | + Ember |
|---|---|---|---|---|---|
| **Snow** | Packs into ice crust | Strips into spindrift, scours a ring | Hurls snow and earth | Slush | Melts to slush, then refreezes to ice |
| **Water** | Ice (bridges, platforms) | Waves, spray | — | Surge, whirlpool | Steam (occludes, scatters light) |
| **Sand** | Frost-bound and firm | Erases and re-ripples, sand plume | Erupts, raises ridges | Packed wet sand that holds sharp prints | **Fuses to glass (permanent)** |
| **Mud** | Frozen crust | — | Raised banks | **Draw dries it to cracked, walkable crust** | Bakes hard |
| **Grass** | Frosted, brittle | Flattened lanes that recover | Torn turf | Drenched | Burns, spreads downwind, leaves ash, regrows over in-game days |
| **Ash and crust** | **Obsidian (permanent)** plus steam | Ash plume that exposes the glowing crust | Cracks the crust | Steam, cooled crust | Re-melts, crust glows |

Combat uses the same table (§10). A frozen snow construct shatters, a sand wraith hit by Ember fuses into a glass statue, a mire serpent drained by Tide crumbles, and an ember construct struck by Frost cools to obsidian.

### 4.5 Save and world persistence

- Store saves in IndexedDB, with multiple slots, autosave at shrines, and a periodic autosave. The schema is versioned, with migrations.
- A save includes: player state, unlocked elements and Echoes, quest state, restoration state per biome, time of day, weather, and **dirty coarse terrain-state pages**, quantised and compressed. Releasing a Warden and carving a run across a dune must both survive a reload.
- Saving never hitches. Serialise on a worker; snapshot GPU pages with asynchronous readback spread across frames.

---

## 5. Rendering

### 5.1 Terrain shading framework

One terrain shader framework with per-biome material layers. This is the most important code in the project, and the snow material is its proving ground.

Every surface material must have:

- **Multi-scale detail normals** at three tiling scales, blended by distance and slope, plus analytic normals from the deformation heightfield. Triplanar mapping on steep slopes and cliffs.
- **A state-driven response.** Read compaction, wetness, thermal, and transform from the state buffer: darker and tighter where packed, glossy where wet, reflective where iced or glassed, emissive where molten.
- **Contact detail.** Trail and crater edges need micro-occlusion and chunky displaced granularity, not a clean bevel.
- **Biome blending** using height-based blending at transitions (snow settles in hollows first, sand drifts up against rock), never alpha cross-fades.

Per-material essentials:

- **Snow:** wrapped diffuse plus a back-scatter subsurface term. Shadowed and grazing areas glow soft blue-white instead of going flat dark. Add view-dependent glints from a high-frequency normal perturbation, gated hard on a narrow specular lobe and grazing angle, with a stable hash so they don't crawl under TAA. Keep glints subtle. If they look like glitter, halve them, then halve them again.
- **Sand:** granular sheen, fine glints from quartz (rarer and warmer than snow's), sharp ripple self-shadowing, and a colour shift as sand goes from wet to dry. Glass made from fused sand must refract and catch caustic-like highlights.
- **Mud:** wet specular that breaks into dry, cracked crust as wetness falls. Puddles collect in depressions and reflect the sky.
- **Grass and soil:** handled by the vegetation system (§5.4); the ground beneath needs moss, litter, and soil variation.
- **Ash and crust:** soft, matte, dusty ash over a dark crust. Cracks glow with temperature-driven emission and bleed light into the surrounding ash.
- **Rock:** layered strata per biome, with accumulation (snow, sand, ash, moss) blended onto upward faces.
- **Ice and obsidian:** smooth, reflective, refractive with depth absorption, and visible internal fractures.

### 5.2 Sky, atmosphere, and time of day

- A **physically based atmosphere** (Hillaire 2020 style: transmittance, multi-scattering, sky-view, and aerial-perspective LUTs in compute) drives sky colour, sun and moon, and aerial perspective consistently at any time of day.
- **Day/night cycle**, about 40 real minutes per day by default and tunable. Shrines can skip time. Golden hour must be stunning. Night must read as deep blue and moonlit, never black.
- **Heavy aerial perspective with height falloff.** Distance must compress contrast clearly.
- **Clouds:** low-resolution raymarched volumetric clouds with temporal reprojection if they fit the budget, otherwise layered lit cloud sheets. They must not read as a texture on a dome.
- **IBL** comes from the live sky. Reproject it time-sliced across frames, never in a single frame.

### 5.3 Lighting and shadows

- The sun or moon is the key light. Use **cascaded shadow maps with PCSS-style soft filtering**, with cascade splits tuned so near-field trail and footprint shadows stay crisp.
- **Ambient light is strongly blue-shifted in cold biomes** and tinted per biome elsewhere. The contrast between cool shadow and warm light is essential.
- **Dynamic lights:** spells, lanterns, lava, and crystals. Budget 4–6 tight-radius lights for gameplay. Use clustered lighting if settlements at night need more. Spell lights must drive each material's subsurface term, so a spell visibly lights a drift from inside and glows through ice.
- **Volumetric light shafts** only where they clearly improve the image: forest canopy, cave mouths, steam. Keep them restrained.

### 5.4 Vegetation

The meadow and forest are where open-world browser games most often look cheap. Treat vegetation as a hard problem.

- **Trees:** procedural at build time (space colonisation or a grammar), stylised-realistic: strong silhouettes, clumped painterly foliage masses, and per-biome species (snow-laden conifers, meadow broadleaf, mangroves, dead ash-forest snags, coastal pines). Use octahedral impostors in the distance with no visible transition.
- **Grass:** GPU-generated blade instances near the player, compute-culled. Blades read the terrain-state Flatten channel, so trails, spells, and Gale lanes bend the grass through the same system as snow. Clumping and colour variation keep fields from looking uniform.
- **Wind:** one global wind field (direction, gust noise, and local spell disturbances) drives grass, trees, cloth, spindrift, sand plumes, ash, and clouds. Everything leans the same way.
- **Shading:** translucency on leaves and blades (light coming through them at golden hour), specular sheen on grass, and ambient-occlusion clumping. Use GPU-driven instancing with compute culling and thin instances throughout.

### 5.5 Water

- **Rivers and lakes:** flow-mapped normals from the baked hydrology, depth-based absorption, refraction with restrained chromatic dispersion, foam where flow hits obstacles, and shoreline wetness written into the state buffer.
- **Mire:** still, dark, reflective water with floating litter, mist, and sparse bubbles. Disturbances (skim wakes, spells) ripple outward and settle.
- **Ocean:** an FFT ocean (Tessendorf-style) in compute, with shoreline waves, breaking foam, wet-sand darkening, and spray. It must look good from cliff height and at wave-riding height.
- **Spell water** (§9.4) shares this shading language.

### 5.6 Weather

A weather state machine per biome, driven by restoration state and time:

- Frost: clear, overcast, snowfall, blizzard.
- Meadow: clear, cloudy, rain, thunderstorm.
- Mirefen: fog, drizzle, heavy rain.
- Dunes: clear, heat haze, sandstorm.
- Ember: ashfall, ember storm.
- Coast: clear, sea mist, gale-driven storm.

Weather drives wind, precipitation particles, fog density, sky, IBL, and terrain-state writes. Transitions take tens of seconds and never pop. Weather must never obscure the terrain so much that the world stops reading.

**Ground blow:** a low, wind-driven stream of surface material across open ground (spindrift on snow, sand on dunes, ash in the waste, pollen and seed fluff in the meadow). It should make the world feel alive without hiding the terrain.

### 5.7 Caves

- Generate cave interiors at build time as SDFs meshed with marching or dual contouring, with smooth normals and no faceting.
- Cave mouths sit in cliff faces. The transition from outdoors to indoors is seamless, with eased exposure adaptation.
- The lighting setup has no sun. Light comes from emissive crystals, lava, bioluminescence, light from spells, and shafts from openings.
- Types: ice caves (blue translucent walls with subsurface), crystal caverns, mire hollows (roots, dripping water), and lava tubes.
- Cave floors with snow, sand, or mud drifts get a local terrain-state projection where practical. Record the decision.

### 5.8 Post-processing

Order matters. Suggested chain:

**TAA → SSAO → screen-space reflections (wet, icy, glassy, and water surfaces only) → very restrained depth of field → restrained bloom → AgX or ACES tonemapping → subtle film grain → post-TAA sharpening.**

- Use eye adaptation with tight limits, especially for cave transitions and snow fields.
- **Blown-out white is the primary failure mode** for snow, sand, and glass. Monitor highlight roll-off constantly.
- Each biome may apply restrained colour grading through a shared LUT system, blended at borders. Stilled and restored states have their own grading.
- Every post-process can be toggled individually from the dev overlay for A/B comparison.

---

## 6. Biome specs

Each biome must have: directional terrain layers, a surface material, state-channel reactions, rock and vegetation sets, ground blow, weather, stilled and restored looks, three Shaped archetypes, a Warden, a traversal mode, a camp or settlement, and caves. These one-liners set the target; achieve the essence first.

### 6.1 Frost Steppe — "the snow field"
Hard-packed wind snow, sastrugi, cornices on ridges, frozen lakes, and blue ice exposed on windward slopes. The light is low and warm against a cold blue ambient. The original snow tech demo lives here at full quality. **Signature frame:** a lone robed figure on a dune crest at golden hour, the surf groove of a long run curving away behind it, its berms throwing long shadows, spindrift streaming across.

### 6.2 Highland Meadow and Forest — "the wind country"
Rolling uplands, tall grass, wildflowers, broadleaf groves, rivers rising from springs, and standing stones. The hub settlement is here. Stilled, the grass stands rigid and pollen hangs in the air. Restored, wind waves visibly roll across the fields. **Signature frame:** a wind gust sweeping a long silver-green wave across a hillside of grass, with the Wraith's Gale lane cut straight through it.

### 6.3 Mirefen — "the drowned lowland"
Mangroves and drowned forest, standing black water, reed beds, mud flats that keep every track, ground fog, and fireflies at night. **Signature frame:** the Wraith water-skimming across mirror-still water at dawn, its wake splitting a reflection of mist-hung trees.

### 6.4 Glass Dunes — "the moving erg"
Huge star and barchan dunes with knife-edge crests, ripple fields, half-buried Shaper ruins, heat shimmer, and fields of fused glass from old battles. Restored, dune crests stream sand and slowly migrate. **Signature frame:** a sand-surf carve down a slip face, the sand wake curling and avalanching, with a glass formation catching the sun behind.

### 6.5 Ember Waste — "the cooling fire"
Black and grey ash dunes over a fractured crust that glows orange through cracks. Obsidian flows, a smouldering volcano, and dead ash forests. Stilled, the cracks are dim and cooling. Restored, the waste breathes, with glowing cracks pulsing and ember storms. **Signature frame:** at dusk, the Wraith skating across ash with a trail of exposed glowing crust behind it, while ash plumes catch the last light.

### 6.6 Coast and the Sea — "the end of motion"
Cliffs, sea stacks, tide pools, wet-sand beaches, and an open ocean that is stilled to glass until the end. **Signature frame:** the Wraith wave-riding along a breaking wave's face toward the final Warden rising from the sea.

---

## 7. Camera and controls

- **Third-person, action-RPG framing.** Over the shoulder, with a slight offset rather than directly behind.
- WASD movement is relative to camera facing. The mouse orbits. The scroll wheel zooms across a smooth, eased range.
- A **spring-arm camera** that avoids collisions and responds to velocity. It lags slightly under acceleration, widens the FOV with speed, and tightens on stopping. Every transition eases; nothing snaps.
- Subtle camera shake on heavy spells, hard carves, Warden impacts, and nothing else.

| Input | Action |
|---|---|
| WASD / mouse / scroll | Move / orbit / zoom |
| Hold **RMB** | Traversal for the surface underfoot (snow-surf, sand-surf, water-skim, ash-skate, wave-ride), once that element is known. |
| **1–5** | Select element. The Wraith's cuffs and hand-light change colour. No UI. |
| **LMB** tap / hold | Element's quick verb / sustained verb |
| **F** (or Shift+LMB) | Element's heavy verb |
| **Space** | Jump. With Gale: updraft and glide. |
| **Ctrl** | Bend-step dodge. A short, momentum-carrying slide through the surface material. |
| **Tab** | Soft lock-on toggle |
| **E** | Interact |
| **M / J / Esc** | Map / journal / pause and settings |
| **F1** or **`** | Dev overlay |

**Keyboard and mouse only.** Gamepad support is out of scope for now. Keep input behind a small action-mapping layer so a gamepad can be added later without rework.

---

## 8. Characters (procedural and cloth-driven only)

There are no rigged humans and no faces anywhere in the game. Every figure is robed, wrapped, veiled, or made of material. This is a constraint and also the art direction.

### 8.1 The Wraith (player)

Seen from behind at mid-distance almost all the time, so spend the budget on silhouette, cloth, and shading.

- **Hooded, layered robe:** a deep cowl, long sleeves, an over-mantle, and a trailing hem. Use shell-based fur at the hood and cuffs, with about 20–40 shells and alpha-tested strands.
- **Inside the hood:** darkness and a faint, cold, slowly breathing light. Never features.
- **Hands:** wrapped cloth, with the current element's light gathering at the fingertips. No finger animation.
- **Cloth simulation** on the hem, sleeves, and mantle: GPU or CPU Verlet with distance and bending constraints. It is driven by locomotion velocity, acceleration, and the global wind field. During traversal modes the cloth whips backwards sharply.
- **Cloth shading:** sheen or fuzz, an anisotropic woven response, and subsurface scattering in thin regions. Not a plain PBR dielectric.
- **Locomotion:** procedural, with real foot planting. Feet must plant, not slide. Each footfall writes to the terrain state and kicks up material spray, synchronised to the exact frame. If a rig cannot reach a high standard, use a more cloth-driven figure whose wrapped feet barely show beneath the hem, but footprints must still land exactly where the feet do.
- **Elemental state:** health and focus appear on the body (§12). Low health shows as the cowl light guttering and frost or ash creeping up the robe.

### 8.2 NPCs: the Veiled

- Built from the same robe system with parameter variations: a tall staff-bearer, a hunched elder, a small child pilgrim, a lantern-keeper, a hooded monk. Give each a distinct silhouette.
- Faces are veiled or deep in shadow. Hands are wrapped or tucked into sleeves.
- **Procedural idle behaviour:** breathing, posture shifts, cloth in the wind, turning toward the Wraith, walking pilgrim paths with foot IK, and footprints in the terrain state.
- Few and meaningful. Roughly 10–20 named NPCs in the whole game, plus ambient pilgrims.

### 8.3 The Shaped (creatures)

Creatures are **made of their biome's material** and **come out of the terrain**:

- **Construction:** a procedural skeleton (spine, limbs, tail) driving clustered meshes made of material (ice and snow chunks, packed sand, root-bound mud, ash-crusted rock), plus a skin of the material's particles where it hides seams.
- **Procedural locomotion:** IK legs with step planning and gait solving, body sway, and anticipation. Every footstep writes to the terrain state.
- **Spawning:** the material visibly gathers and rises, leaving a depression where it came from. **Death:** it collapses back into a mound of displaced mass that heals over time. Nothing pops in or out.
- **Readable telegraphs through material:** crust cracks glow before a slam, sand streams off before a lunge.
- Per biome: three archetypes, such as a fast swarmer, a mid-sized bruiser, and a ranged or area caster, plus optional elite variants.

### 8.4 Wardens

- Colossal Shaped, roughly 20–60 m, one per biome, each in an arena whose terrain the fight reshapes.
- The fight is about **reactions against weak points**: freeze its water joints, then shatter them; drain its mud core; fuse its sand limbs to glass.
- **Wardens are climbable**, in the spirit of Shadow of the Colossus. The Wraith grips material-specific holds: frost-crusted ridges, root-bound mud, ruin-stone plates set into sand, cooled crust between molten seams. The Warden shakes, rolls, and sheds material to throw the Wraith off. Climbing spends focus and exposes weak points that can only be reached from on the body. The robe hangs and whips under gravity and the Warden's motion, and the wrapped hands grip with procedural IK. Mounting, shifting holds, and being thrown off all ease; nothing snaps.
- Climbing is a quality-gated feature. Build it first on the Frost Warden. If it cannot reach the quality bar for a particular Warden, that fight drops climbing in favour of reactions alone, and the decision is recorded. Never ship a stiff or floaty climb.
- Release, not death: the Warden slowly settles into the land, the biome transitions from stilled to restored around the player, and the Wraith receives the element. This is the game's showcase moment, so render it like a cinematic. Keep it fully in-engine and fully skippable after the first time.

---

## 9. Bending

### 9.1 Grammar (all elements)

Bending is continuous, carries momentum, and never breaks the flow. Nothing spawns instantly and nothing despawns instantly. Everything eases in from the ground or the air and settles back into it. **Every verb reads and writes the terrain state.** Spells feel embedded in the world because they share its write path.

### 9.2 Verbs

| Element | Tap (quick) | Hold (sustained) | Heavy |
|---|---|---|---|
| **Frost** | **Sweep:** a crescent wave of slush ploughs a channel and throws berms to either side. | **Ribbon:** a continuous water stream that follows hand and aim through arcs and figure-eights, scoring thin lines in the surface. | **Crystallize:** water freezes into refractive crystal formations with internal light transport. The surface turns to glossy ice permanently. |
| **Gale** | **Gust:** a lance of wind cuts a flattened lane through grass, snow, or ash and shoves enemies. | **Vortex:** a swirling column strips surface material in a ring, holds it aloft, and lets it settle. | **Updraft:** a rising column lifts the Wraith, enemies, or debris. Doubles as traversal. |
| **Stone** | **Shard:** packed earth or sand torn from the ground and hurled; leaves a scar. | **Ridge:** drags a wall of displaced mass up from the terrain along the aim path. It is real terrain state, so it can be walked, surfed, and eroded. | **Bloom:** an eruption blows a crater with a raised rim, then falls back as a slow, glittering curtain. |
| **Tide** | **Surge:** a rolling wave over ground or water. | **Draw:** pulls water out of mud, plants, or enemies into a hovering mass. The source dries and cracks. | **Undertow:** a sinkhole whirlpool that drags enemies down and leaves a sunken basin. |
| **Ember** | **Flare:** a burst of heat; melts, scorches, ignites. | **Stream:** a sustained jet of fire that cuts molten channels and boils water to steam. | **Fuse:** a focused core that fuses sand to glass, ice to steam, and crust to magma. Glass and obsidian are permanent. |

These are proposals. If a different verb gives a stronger result, replace it and record why.

### 9.3 Traversal modes (hold RMB)

Traversal will be used more than everything else combined, so it gets the most polish. One shared surf controller is tuned per material:

- **Snow-surf** (the original centrepiece): a crest of compressed snow rises under the feet and the Wraith accelerates. Mouse movement steers carving turns with visible body lean and a banked camera. **The wake** is a curling, breaking wave of displaced snow that trails behind and toward the outside of the turn, throwing a spray plume that catches sunlight and casts a shadow, like a snowboard carve crossed with a boat wake. It carves a deep, persistent groove with high berms. A finished run stays visible from across the field.
- **Sand-surf:** faster on slip faces and slower uphill. The wake avalanches in sheets. Sand streams off dune crests behind the Wraith.
- **Water-skim:** a skating glide on a cushion of water with a V-wake and spray. Over mud, it leaves a wet, glossy track.
- **Ash-skate:** low friction. It exposes glowing crust in the wake and throws dark ash plumes that glow from below.
- **Wave-ride:** on the ocean, riding along the face of a breaking wave. The finale's traversal.
- **Glide (Gale):** off ridges or updrafts, with the robe spread like wings and the cloth roaring. Ground blow kicks up when gliding low.

Shared requirements: entering and exiting use eased transitions, never snaps. The robe whips back, the FOV widens, and screen-space wind streaks appear. Turning at speed must feel weighty and analogue. **Tune it by hand until it feels good, not merely until it compiles.** Every visual cue must add to the sense of speed.

### 9.4 Implementation direction

- **Coherent water and material bodies:** swept procedural ribbon or tube meshes updated on the GPU from a spline or particle spine.
- **Spray, mist, droplets, sand, ash, embers:** GPU compute particles, pooled.
- **Water shading:** refraction with restrained dispersion, depth absorption tint, animated flow-map normals, foam and slush at leading edges, and shed droplets with correct motion-blur streaking.
- **Ice, glass, crystal:** refraction with internal fracture planes and subsurface light transport. They should make the player stop and look.
- Spells emit light (§5.3). The light must illuminate the material they touch from within.

---

## 10. Combat

- **Action combat built from the verbs.** Soft lock-on, the bend-step dodge, and positional play on terrain the fight is reshaping. Ridges are cover, ice is footing, mud slows enemies, and craters trap them.
- **Focus** is the resource, shown by the intensity of the hand-light. Verbs spend it and movement and flow restore it. No mana bar.
- **Reactions multiply damage and stagger** (§4.4). The best play is reading which material an enemy is made of.
- **Game feel:** 30–60 ms hit-stop on heavy impacts, material-specific hit spray, and readable telegraphs. Enemies stagger and their material chips off, falls, and stays on the ground as terrain state.
- **AI:** utility or state-machine AI per archetype, with group behaviour such as flanking, ranged units holding distance, and swarmers rushing. Keep it readable rather than clever.
- **Encounter limits:** at most about 8 active Shaped at once. Plan the frame budget for that number.
- **Death:** the Wraith's light gutters, its robe collapses, and it re-forms at the last shrine. The world keeps the marks.
- Difficulty: punishing but fair, closer to Elden Ring than to a power fantasy. Wardens are the difficulty spikes.

---

## 11. RPG systems

- **Quests:** a data-driven quest graph with states, triggers, and conditions, stored in plain data files. 2–3 main and 3–5 side quests per biome. Side quests are short environmental stories: find a lost pilgrim's trail in the snow, carry a lantern across the mire at night, unearth a ruin by raising a Ridge.
- **Dialogue:** short, spoken-style lines, never trees deeper than one choice. NPCs speak little, and their words should matter.
- **Shrines:** fast travel, time skip, save, and Echo upgrades. Their visual language comes from the Shaper ruins.
- **Map:** a hand-drawn parchment map, revealed by exploring and drawn in painterly ink. No minimap.
- **Journal:** quests, lore fragments, and sketches of creatures and Wardens.
- **Restoration state per biome** (§2.4) is a first-class world-state flag read by weather, grading, vegetation, dunes, water, and NPC dialogue.

---

## 12. UI

**No HUD by default.** Nothing is on screen during exploration and combat except the world.

- **Health:** the cowl light and robe state (frost or ash creeping up the hem as health falls). At very low health, add a subtle vignette tinted by the biome.
- **Focus:** the intensity of the hand-light.
- **Element:** the colour of the cuffs and hand-light.
- **Interaction:** a small glyph drawn in the world only when an interactable is in reach.
- **Aim:** no crosshair. Ribbon and Gust follow the camera aim. A faint aim trace may appear only while a sustained verb is held, if playtesting proves it necessary. Record the decision.
- **Dialogue:** minimal subtitles with refined typography, low-centre placement, eased fades.
- **Map, journal, pause, and settings screens:** fully art-directed, using parchment, ink, and the Shapers' visual language. They must look as finished as the world. An unstyled browser default anywhere is a defect.
- **Loading screen:** the first thing anyone sees. Make it tasteful and on-tone.

### 12.1 Dev overlay (F1 / `)

Hidden by default, and built in Phase 0. It will save hundreds of hours.

- Frame-time graph with 1% low, draw-call and triangle counts, GPU memory, JS heap, and streaming queue depth.
- Individual toggles for every post-process and major system.
- Quality presets.
- Art sliders: sun angle and time of day, fog density, glint intensity, deformation depth, refill rate, wind strength, and per-biome grading.
- **World tools:** teleport to any biome or POI, time-of-day scrub, weather override, toggle stilled or restored, spawn any Shaped or Warden, free camera, god mode.
- **Photo spots:** named camera bookmarks per biome (position, orientation, time, weather) that Playwright uses for reproducible milestone screenshots.
- **Late-pipeline detector:** logs, and flags in red, any GPU pipeline created after the loading screen dismissed. Any entry is a defect.

---

## 13. Audio

The original demo had no audio. An RPG needs it, but keep it in proportion:

- WebAudio. Wind is synthesised procedurally and driven by the wind field and the player's speed. Footsteps, surf, and spells use material-aware layered CC0 samples (vendored and logged in `ASSETS.md`). Spatial sound for Shaped and Wardens.
- Music: sparse and atmospheric, only in Warden fights, at shrines, and at restoration moments. Silence and wind are the default.
- Audio allocations follow the same zero-garbage rules (§14).

---

## 14. Performance engineering

**Garbage collection is the primary enemy.** A 12 ms GC pause is a visible hitch and instantly destroys the AAA impression.

- **Zero allocations in the frame loop.** Never use `new` in per-frame code. Pre-allocate scratch `Vector3`, `Matrix`, and `Quaternion` instances at module scope and reuse them.
- No `map`, `filter`, `reduce`, spread, or object-creating destructuring in hot paths. Use plain indexed `for` loops.
- No per-frame string construction, including in the overlay. Update the overlay on a throttled interval and reuse buffers.
- Object pools for every transient: particles, splats, Shaped, projectiles, decals, audio voices.
- Pre-allocated typed arrays for all GPU uploads. Write into them; don't rebuild them.
- Use `freezeActiveMeshes`, `freezeWorldMatrix`, `material.freeze()`, and `blockMaterialDirtyMechanism` aggressively on static content. Use thin instances for all repeated geometry and GPU-driven culling for vegetation.
- **Streaming budget:** decompression and generation run on workers. Main-thread GPU upload is capped at about 1 ms per frame. Chunks are prefetched by velocity, which matters at surf and glide speeds.
- **Memory budget:** GPU around 8 GB on the target. Set a JS heap cap. Both are shown in the overlay.
- **Frame budget at 90 FPS is 11.1 ms.** Starting allocation; refine it with measurements in `PERF.md`:

| System | Budget |
|---|---|
| Terrain (clipmap, state passes) | 1.5 ms |
| Vegetation | 1.5 ms |
| Sky, atmosphere, clouds | 1.0 ms |
| Shadows | 1.8 ms |
| Water and spell VFX | 1.5 ms |
| Characters, Shaped, cloth | 1.0 ms |
| Post-processing | 2.0 ms |
| Reserve (streaming, weather spikes) | 0.8 ms |

- Profile with the Chrome performance panel and Babylon's inspector. Record the measured cost per system, per biome, in `PERF.md`. Watch the 1% low, not the average.

---

## 15. Loading and pipeline warm-up

WebGPU pipeline compilation stutter is a severe risk, and with six biomes there are many permutations. A shader that first compiles mid-Warden-fight is a multi-hundred-millisecond freeze.

**Requirement:** no GPU pipeline is ever created during gameplay. The late-pipeline detector (§12.1) enforces this.

Before the loading screen dismisses:

- Load and decode the starting region's textures, HDRIs, meshes, and buffers.
- Force-compile every material, particle, spell, post-process, weather, and shader permutation **for every biome** by rendering each once to a tiny offscreen target. Asynchronous pipeline creation behind the loading screen is fine.
- Warm every render target and run several frames of every compute pass.
- Only then fade in.

A loading time of up to about 15 seconds with a clean first hour beats an instant load that hitches. If boot-time warm-up of every biome becomes unreasonable, background-compile the remaining biomes with verified completion before the player can reach them, and record the decision.

---

## 16. Project structure

Suggested; adapt as needed.

```
/src
  /core        engine bootstrap, loop, resources, pools, scratch math, workers
  /world       streaming, chunks, page atlas, restoration state, time & weather
  /terrain     clipmap, height layers (shared JS/WGSL defs), terrain state, reactions
  /render      sky/atmosphere, shadows, lighting, vegetation, water, ocean, caves
  /shaders     WGSL
  /post        post-process chain, grading LUTs
  /character   Wraith controller, cloth, fur, procedural locomotion, NPC robes
  /shaped      creature construction, procedural gait, AI, Wardens
  /bending     shared bending primitives, one module per verb, traversal modes
  /vfx         particles, spray, ground blow, steam, embers
  /game        quests, dialogue, shrines, progression, save/load
  /ui          diegetic UI, map, journal, menus, loading screen, dev overlay
  /audio       wind synth, material sounds, music
/tools         bake-world, tree generator, cave generator, capture scripts
/data          baked world, quests, dialogue, reaction table
/assets        vendored third-party assets
/tests         logic tests only (see §19)
/screenshots   milestone captures, by phase
BRIEF.md       this file (do not edit except by the user)
PROGRESS.md    session handoff
DECISIONS.md   every deviation + one-line rationale
PERF.md        measured budget per system per biome, with machine stated
ASSETS.md      every third-party asset + licence
```

Files stay small, typically 200–400 lines and at most 800. Organise by feature, not by type.

---

## 17. Roadmap

Each phase ends with a **gate**. Capture 1440p screenshots at the registered photo spots, inspect them critically, and commit them under `/screenshots/phase-NN/`. **Do not move on from an ugly phase.** Phase 2 is the hardest gate in the project.

### Phase 0 — Foundation and tooling
Vite, WebGPU boot, render loop, pools and scratch math, input, spring-arm camera, a capsule controller on a test heightfield, the dev overlay with frame graph and late-pipeline detector, a Playwright capture script driven by photo spots, the save-system skeleton, and the logic-test harness.
**Gate:** the overlay works; captures are reproducible; a heap profile of the idle loop shows zero allocations per frame.

### Phase 1 — World skeleton
The build-time continent bake, chunk streaming on workers, the clipmap with geomorphing, CPU/GPU height parity, the physical atmosphere with day/night, CSM, aerial perspective, the distant mountain ring, and the two-level terrain-state architecture (fine window plus coarse pages with eviction and reload).
**Gate:** a scripted flight across the whole continent at surf speed, and again at glide speed, with no frame above median + 4 ms. Captures may use a debug "clay" view; it is never shipped.

### Phase 2 — Frost Steppe look-dev (hard gate)
The full snow material (SSS, glints, multi-scale normals, triplanar), frost directional height layers, rock outcrops with accumulation, the sky IBL, fog, and spindrift. Then deformation: footfall displacement with berms, healing, correct normals, and self-shadowing.
**Gate:** a static screenshot with no character already looks polished, atmospheric, and production-ready, at dawn, noon, dusk, and night. Trails visibly displace mass, form raised edges, and integrate with lighting.

### Phase 3 — The Wraith
Robe, cloth simulation, shell fur, cowl light, procedural locomotion, foot planting, and footfall spray and writes.
**Gate:** the robe reads as layered fabric in real motion; the fur reads as fur; feet plant without sliding; footprints land on the exact frame.

### Phase 4 — Frost bending and snow-surf
Sweep, Ribbon, Crystallize; spell lights driving SSS; water and ice shading; snow-surf with the full wake. Spend disproportionate time on the surf.
**Gate:** the original demo's criteria. Every spell leaves a persistent mark, there is no hitch on the first cast, the wake reads as displaced mass with momentum, and a finished run is visible from across the field.

### Phase 5 — Combat and the frost Shaped
The combat framework, lock-on, dodge, focus, the reaction table in combat, the three frost archetypes with procedural gait, and the Frost Warden with climbing and its release sequence.
**Gate:** a fight reads clearly with the HUD hidden. Creatures rise from and collapse into the snow. Climbing the Warden feels weighty and readable, with the robe and grip reacting to its motion. The Warden release and stilled-to-restored transition are the best-looking moment so far.

### Phase 6 — Post, weather, and time polish (frost)
The full post chain, tonemapping calibration, frost weather states including blizzard, grading for stilled and restored, light shafts, and eye adaptation.
**Gate:** Frost Steppe passes the global acceptance criteria (§18) at every time of day and in every weather state.

### Phase 7 — RPG layer
The Veiled NPC system, the monastery and a frost camp, dialogue, the quest graph, the journal, the map, shrines, Echoes, full save and load with terrain pages, the restoration system as world state, the diegetic UI, menus, the loading screen, and audio foundations.
**Gate:** play the frost chapter from waking to Warden release, save, quit, reload, and find every trail, crater, and ice formation where it was left.
> **Milestone: Frost chapter complete.** The original tech demo, alive inside a real game.

### Phase 8 — Highland Meadow and Gale
Vegetation tech (trees, impostors, GPU grass with Flatten), the global wind field, Gale verbs, glide, meadow Shaped and Warden, the hub settlement, rivers, rain and thunderstorm, and the Frost↔Meadow border.
**Gate:** the meadow's signature frame. Grass fields hold up in motion from ground level to glide height.

### Phase 9 — Glass Dunes and Stone
Sand material, dune layers, sand-surf, heat shimmer, sandstorms, ruins, Stone verbs, dune Shaped and Warden, the camp, and borders.
**Gate:** the dunes' signature frame. The sand-surf wake avalanches convincingly.

### Phase 10 — Mirefen and Tide
Mud material, mire water, mangroves, fog, Tide verbs, water-skim, mire Shaped and Warden, the camp, and borders.
**Gate:** the mire's signature frame. Mud keeps tracks and Draw visibly dries it.

### Phase 11 — Ember Waste and Ember
Ash and crust material, emissive cracks, the volcano, heat distortion, ember storms, Ember verbs, ash-skate, ember Shaped and Warden, and borders. **Retrofit Ember reactions in every earlier biome** (glass, steam, burn, obsidian).
**Gate:** the waste's signature frame. Every reaction in §4.4 works in its biome.

### Phase 12 — Coast and the Sea
The FFT ocean, shoreline, beaches, cliffs, sea storm, wave-riding, the final Warden, and the ending.
**Gate:** the coast's signature frame. The ending runs in-engine without a hitch.

### Phase 13 — Caves
SDF cave generation, interior lighting, exposure transitions, and one to three caves per biome with their content.
**Gate:** moving outside → inside → outside is seamless. Caves meet the same bar as the surface.

### Phase 14 — Whole-world pass
Biome border polish, world-scale performance hardening, a full pipeline warm-up audit, quest and content completion, and a final tuning pass across all biomes, times, and weathers.
**Gate:** a continuous 30-minute play capture through at least four biomes, with 90 FPS sustained, 1% lows above 60 FPS, no late pipelines, and every item in §18 passing.

---

## 18. Global acceptance criteria

Verify each item against fresh 1440p screenshots and in motion, per biome, before declaring a biome or the game complete.

**Image**
- No visible faceting, hard polygon edges, or flat-shaded surfaces anywhere in frame, including caves, ruins, creatures, and UI.
- No clipped highlights on snow, sand, glass, water, or ice. Shadows are tinted (blue in cold biomes), never grey or black.
- Distant terrain shows clear aerial perspective and contrast compression at every time of day.
- Surface detail is legible at three scales simultaneously in every biome (macro forms, ripples or drifts, grain).
- Biome transitions read as geology and climate, not as a blend mask.
- Night is readable and beautiful.

**Terrain state**
- Trails, craters, and grooves have raised berms, self-shadow correctly, and heal over time at material-appropriate rates.
- Permanent transforms (glass, obsidian, crystal) persist across reloads.
- Every verb, traversal mode, creature, and Warden leaves a mark that persists after the effect ends.

**Characters**
- The robe reads as layered fabric with real cloth motion, and the fur reads as fur.
- Feet plant and never slide. Footprints land on the exact frame of each footfall.
- Shaped creatures rise from and collapse into the ground. Nothing pops.

**Bending and traversal**
- Spell water, ice, and glass are translucent and refractive, with visible internal light scatter.
- Spell light visibly lights the material it touches, including light scattering through it.
- Each traversal wake looks like displaced mass with momentum, not merely particle spray.
- Sparkle appears only at grazing angles and does not crawl or shimmer in motion.

**Performance**
- 90 FPS sustained with 1% lows above 60 FPS, anywhere in the world, during combat with eight Shaped and during weather transitions.
- No hitch on streaming, biome crossings, first casts, Warden releases, or saves.
- The late-pipeline detector stays empty for an entire play session.

---

## 19. Working agreement

- **Look at your own output constantly.** Capture screenshots at photo spots, inspect them critically, and iterate on values. Most of the gap between "prototype" and "AAA" is parameter tuning, and you can only close it by looking.
- **Rendering is validated by eye, not by tests.** Use Playwright for photo-spot captures and to catch hard regressions. Compare each phase's captures with the last.
- **Game logic is validated by tests.** Write focused tests (Vitest) for systems that silently corrupt: save/load round-trips and migrations, the quest graph, the reaction table, CPU/GPU height-function parity, page-atlas addressing, and closed-form healing. Write them alongside the code. Don't build tests for anything you can check by looking.
- **When a technique is not working, replace it rather than patching it.** You have full latitude over the approach.
- **Record every deviation in `DECISIONS.md`**, one line each.
- **Keep `PROGRESS.md` honest.** If a gate isn't met, say so. If something was skipped, say so.
- Commit often with conventional messages (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`).

Ship a world worth screenshotting.

---

## Appendix A — Session kickoff prompt

Paste this at the start of each build session, replacing `N` and the phase name:

> You are continuing development of **The Wraith of the Unstill**. Read `BRIEF.md` (the spec, which does not change), then `PROGRESS.md` (current state and handoff) and `DECISIONS.md`. This session's task is **Phase N — \<name\>** from BRIEF §17. Work only within that phase. Do not start the next one. Meet the phase gate: capture 1440p screenshots at the registered photo spots, inspect them critically, and iterate until they pass. Before you finish, update `PROGRESS.md` (built, unfinished, defects, measured performance and the machine used, screenshot paths, exact next step), `DECISIONS.md`, and `PERF.md`. If the gate is not met, say so plainly.
