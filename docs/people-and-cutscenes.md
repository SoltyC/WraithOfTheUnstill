# People and cutscenes (plan, 2026-11-22)

**User direction (2026-11-22):** *"We should do ash-cast figures; however… we need to have some good detail… the robes need to be much more detailed… NPCs actually need to be graphically good, or it's hard to tell and it looks very goofy… when the volcano erupts, there should be a cutscene… if the player lies… they should witness a scene where villagers are ripped off their feet and pushed into a huge lava stream… burnt up, and the homes all on fire or decimated and destroyed, and then the player should be able to see the destruction left behind. I believe we should have more cutscenes in the game."*

This plan has three parts:
1. people who look good up close;
2. the ash-cast dead;
3. a cutscene programme, with the eruption as the proving scene.

It builds on what exists:
- the U7 release cinematic (shot timeline, subtitles, cloth kept warm across cuts);
- the motion gate (`docs/phase-10/motion-gate.md`);
- the high-fidelity sculpt-and-bake pipeline (`docs/hifi-models.md`);
- `docs/phase-10/cutscene-research.md`.

---

## 1. People who look good up close

### 1.1 Why they look goofy (to confirm with the user's eye)

Read from the code. Each point needs a screenshot to confirm, and the user's own list comes first:

1. **One robe for everyone, dyed.** Every Veiled is the Wraith's own robe system scaled, with a colour multiplier on charcoal wool (`character/veiled.js` `ARCHETYPES`). Nobody wears anything else: no layers, belts, aprons, bags, tools, hats or shoes. A child is the same figure at 0.62 scale, which reads as a doll.
2. **A coarse cloth grid.** The robe is a particle grid with folds added in the shader (the U7 art pass). Up close it reads rubbery and smooth, with no weight at the seams.
3. **Procedural motion.** Gait, breath and "posture shifts" are generated, so people move like puppets. Feet slide, and nobody really *does* anything.
4. **Background figures update rarely** (`direction.md` M0, `npcs.js` `BUDGET = 3`), so their robes jerk.

### 1.2 The fix

| Layer | What changes | How |
|---|---|---|
| **Costume** | Each people gets its own clothes: a body garment, an outer layer, headwear over the veil, and tools and things they carry. | Sculpted and baked in Blender with the `hifi-models` pipeline: high-detail garment sculpts (folds, seams, stitching, patches, wear, soot or salt or ash at the hem) baked to normal and AO on a game mesh. The **live cloth stays** for the parts that move (hem, mantle, veil, sleeves); the stiff parts (belts, aprons, leather, hats, bags) are rigid meshes on the body. |
| **Cloth** | More particles for the hero robes, a proper fixed step, and every figure near the camera simulated every frame. | Cloth moves to a **GPU compute pass**, so 20+ figures fit inside 90 fps on the RX 9070. This also fixes M0. Crowds far off play **baked cloth (VAT)**, blended between frames so it never steps (`cutscene-research.md` §3). |
| **Body and proportion** | Real proportions per age and build. A child is a child's body, not a small adult. | The body rig (`character/wraith/body.js`) takes per-archetype proportions: head size, limb length, shoulder width. |
| **Hands and feet** | Wrapped hands and boots, sandals or bare feet, visible and sculpted. | Rigid meshes on the hand and foot frames. |
| **Motion** | People *work*: knead, haul, mend nets, swing a pick, herd goats, carry children, flinch, panic, fall. | Generated clips through the **motion gate** (it already accepted the Drowned's tasks), played on a curve every frame. Procedural motion stays for walking and looking. |
| **Faces** | Unchanged: still veiled (BRIEF). The veil gets depth: a sheer layer over a shadowed face shape, with breath moving it. | Cloth and shader. |

**Per-people costume sheet** (the Ember villages; `docs/phase-11/ember-design.md` §4):

| People | Clothes | Headwear | Carried | Wear and stain |
|---|---|---|---|---|
| Cinderhold miners | leather apron over a short wool robe, padded shoulders, belts | a leather hood with a brass lamp | picks, lamp chains, tally boards | soot to the elbow, burn holes |
| Ash Chapel pilgrims | long undyed linen in layers, prayer cords | a white veil to the chest | bells, water jars | ash-grey hems, wax drips |
| The Sow farmers | a dyed wool tunic, shawls, a sash | a broad straw hat over the veil | baskets, crooks, children | earth and fig-stain, patched knees |
| Steamhaven fishers | oiled cloth, knotted belts, bare forearms wrapped | a tied head-cloth | nets, gutting knives, eel traps | salt crust, darker wet hems |

Hearn, the frost camp, the dunes and the fen get their own sheets once the Ember slice has proved the pipeline.

### 1.3 The gate before anything is built at scale

- **One villager first:** a Sow farmer with a straw hat, a shawl and a basket. The user judges them in a set of shots:
  - a turntable at 1 m;
  - walking;
  - working;
  - in wind;
  - at night by firelight;
  - at 20 m.
- Only when the user says yes does the rest follow.
- **Cost:** a crowd of 20 in the village must hold 90 fps on the RX 9070, measured as presented frames.

**Brief change (approved by the user, 2026-11-22):** sculpted costume parts and gated generated motion for people, extending BRIEF §8 ("procedural and cloth-driven only"). Imported and authored meshes were already allowed (DECISIONS 2026-11-14).

---

## 2. The ash-cast dead

**When a village didn't leave, the people who stayed are found where they were, cast in ash.**

- **Their poses are their last moment, not a generic statue:**
  - a mother bent over a child;
  - a man still at a lift's crank;
  - two pilgrims kneeling at the spring;
  - a fisher halfway along the jetty;
  - Aled among his goats.

  Each is placed by what that person was doing when the surge came, read from the story state. For example, a village that believed the lie was asleep: casts in their beds and doorways.
- **Made from the real moment:**
  - the cutscene (§3) plays the figure's motion and live cloth up to the surge;
  - that frame (the exact folds, the hem in the wind, the reach of an arm) is frozen into a static mesh and kept;
  - so each cast holds the real folds of that person's own clothes, and the player can recognise who it was by their costume (§1).
- **The ash material:**
  - layered grey ash with a cracked crust;
  - finer ash in the folds;
  - the costume's shape and wear still readable underneath (the straw hat's weave, the miner's lamp);
  - for the first days a faint ember glow in the deepest cracks, which cools to grey;
  - wind lifts fine ash off the tops.
- **They are not props.** They can't be broken or moved, and no verb harms them. The Remembrance page names everyone the player knew.
- **Shown, not explained:** no text, no marker. The player walks through.

---

## 3. Cutscenes

### 3.1 What a Wraith cutscene is

- **In the engine, in the real world state:**
  - the player's marks, fires, ice and craters are all there;
  - the people present are the ones alive;
  - what's destroyed is what the player failed to save.

  Never pre-rendered (`cutscene-research.md`).
- **Short:** 20–90 s for most, a few minutes for the great ones.
- **They show consequences.** Most cutscenes exist to show the player what their choice did. They are **variants composed from the state**, not one fixed film.
- **Skippable after the first viewing, except the Listener's release in Ebbhold,** which always plays in full (user, 2026-11-22). Control returns exactly where the cutscene leaves the world, and the camera eases back to play.
- **Real shots:**
  - a shot list with lenses;
  - faces never needed (veils);
  - performance in posture, weight, timing and cloth;
  - the U7 tools (warm cloth across cuts, no pop-ins, motion blur reset per cut) used everywhere.
- **90 fps on the RX 9070 holds in cutscenes too.**

### 3.2 The proving scene: the eruption, *the village that stayed*

Played for each village that didn't leave (fully or partly). This is the user's scene.

- **Composed from the state:**
  - how many people are there and who;
  - what they were doing (asleep after the lie, at prayer, loading carts too late, waiting on the jetty);
  - what the player did there.
- **Sound:** the mountain, the wind and the bells. No music until the last shot.

| # | Shot | What we see | Built from |
|---|---|---|---|
| 1 | **The quiet before** | The village as it is now. For the lie: lamps lit late, people in doorways looking at a mountain that didn't come last night, a child asleep on a step. | the live village, its people's current state |
| 2 | **The mountain answers** | A low, wide view up the slope: the crater flares, then the flank opens, and a dark surge pours down. | the eruption system (§3.4) |
| 3 | **They know** | Close on a person the player knows (the elder, Aled, a captain). Their head turns, the veil stills, then they move toward the child. | gated motion clips |
| 4 | **The wind first** | The surge's blast reaches the village before the cloud: shawls, veils and hems tear sideways, a straw hat goes, people are **ripped off their feet** and thrown. Roof tiles, nets and racks fly. | live cloth in a blast wind; thrown and tumbling clips; physics on props |
| 5 | **The fire** | Through the wall of ash, roofs take fire all at once. A lava front comes down the village's street, pushing what's in its way into the stream. Figures go down into the glow, as silhouettes against the light. | lava flow (§3.4), the fire system, figures as silhouettes in the cloud |
| 6 | **The buildings go** | Houses break apart: walls fold, roofs fall in burning, the jetty or the lift or the chapel bell tower comes down. | pre-broken building kits (§3.4) |
| 7 | **Ash falls** | Silence. Grey falling over everything. The glow fades under it. | ash fall, the cooling ground |
| 8 | **After** | Hours later, the same view as shot 1. The village is a black and grey ruin, still smoking. The first ash-cast shapes show in the doorways. Control returns here, and the player walks it. | the ruined village, the casts (§2) |

**Other outcomes get their own cut of the same scene:**
- **Evacuated:** the same mountain seen from the boats or the road. The people watch their home burn, alive, and someone puts a hand on the child's head.
- **Partly evacuated:** the scene above, seen *by those who left*, from the ridge. They watch who they left behind.

**Tone:** the deaths are shown honestly and plainly, as the user asked: people thrown and lost, the village destroyed. They are framed as tragedy, never spectacle:
- the camera stays with people the player knew;
- no slow-motion, no lingering on a body;
- the horror is in the scale and in knowing who they were.

### 3.3 More cutscenes across the game

Candidates, chosen for **set pieces and consequences**. Where a scene is already built or designed, that's noted. Every variant reads the story state (`storyline.md` §4).

| Chapter | Cutscene | Variants from choices |
|---|---|---|
| Frost | **The waking** (the Wraith gathers in the empty robe in the monastery) | — |
| Frost | **The Warden wakes / is released** | — |
| Frost | **Tobin goes south** (seen from the camp at dawn, small tracks leaving) | only if he was left listening |
| Meadow | **Arrival on the fire night** (Wenna leads the Wraith to the burning village) | — |
| Meadow | **Doran's choice plays out** (cast out into the snow; or climbing to the manor at the release; or leaving with Wenna) | three |
| Meadow | **The Bellwether's release** (exists in some form; only the scene around it changes) | Doran in or out |
| Dunes | **The Walker wakes** | — |
| Dunes | **Where it lies down** (the well fills, or the Sun Gate's cistern; the losing camp packs and walks) | three |
| Fen | **The Lung cut, the release, the veils on the water** (built: U7) | Tobin, survivors' count |
| Ember | **The warning** (the messenger arrives) | three messengers |
| Ember | **The crater** (the Wraith looks in at the rising lava and the Warden straining) | stage |
| Ember | **The eruption** (§3.2) | per village: stayed, partly, evacuated; the lie |
| Ember | **The camp on the coast** (the survivors count themselves) | count, who |
| Coast | **The Last Tide, the sacrifice and the epilogue** (`storyline.md` §5; the sacrifice and the epilogue are never skippable) | the shore's people, the epilogue, Wenna or the sand |

**Rule against too many:** no cutscene breaks a traversal run or a fight's flow, except the Warden wakings and releases. A cutscene must show either a set piece or a consequence. Exposition stays in the world and in people's words.

### 3.4 The tech this needs

| Need | Exists? | Work |
|---|---|---|
| Shot timeline, cameras, subtitles, warm cloth, cuts without pops | yes (U7, `systems/cinematic.js`, `data/cutscenes/`) | generalise into a data-driven tool every chapter uses, with variants chosen by state conditions (the quest graph's `when`) |
| Gated motion clips for actors | yes (motion gate) | new clips: thrown off feet, tumble, fall and crawl, shield a child, run in panic, kneel and pray, carry and load |
| Blast wind on cloth | partly (wind, Gale bursts) | a directional blast field driving every robe in the shot |
| **Lava flow** | no | a flowing crust surface (dark crust plates over emissive melt, heat shimmer, light into the world grid) along authored channels, advancing over time and writing the terrain (new black ground, permanent) |
| **The surge** (pyroclastic cloud) | no | a rolling volumetric front, particles plus fog volume, lit from inside by the glow. The most expensive item: budget it per preset |
| Burning buildings | yes (`render/fire.js`, `villageFire.js`) | more slots for the eruption, embers at scale |
| **Destructible buildings** | no | pre-broken versions of each Ember kit (walls, roofs, the lift, the jetty, the bell tower) that fall on cue, with dust and fire; the ruin stays |
| Ash fall and ash-covered ground | partly (snowfall, sand dust) | an ash fall and an ash brush on terrain state |
| Ash-cast figures | no | the freeze-to-mesh bake from a live figure (§2), the ash material |

---

## 4. Order

1. **M0 cloth on the GPU,** which serves both the fire night fix and everything here.
2. **The villager gate (§1.3):** one Sow farmer to the user's bar.
3. **The cutscene tool, generalised**, with state variants. Proved by re-cutting one existing scene (Doran's or the Walker's) with variants.
4. **The eruption tech** (lava, surge, destruction, ash), measured against 90 fps.
5. **The eruption scene** for one village (the Sow), all three variants, user review of each cut (the U7 review loop).
6. **Ash-casts,** then the other villages.
7. **The cutscene list (§3.3)** chapter by chapter, alongside each chapter's rework.

## 5. Decisions (answered by the user, 2026-11-22)

1. Sculpted costumes and generated motion for people: **approved.**
2. The eruption scene's tone: **"sounds right".**
3. The cutscene list (§3.3): **approved.**
4. Skippable after the first viewing: **yes, except the Listener's release in Ebbhold.**

---

## Gate v1 (2026-11-22): the Sow farmer, sent for the user's eye

- **Built:** rigid costume parts made in code (`render/costumeGeo.js`, `render/costume.js`, `shaders/costume.wgsl.js`): a broad straw hat sewn from one coiled plait (coils and plait in the shader, light through the brim), a madder band with knotted tails, an oval willow basket (real over-under weave, rolled rim, twisted handle, a heap of figs) that swings from the hand as a damped pendulum. Instanced per figure from a storage buffer, shadow casting.
- **Cloth:** `opts.costume` (`game/costumes.js`) dyes the tunic, makes the mantle a woad shawl with woven stripes, gives the hood its own wool, hems cut clean (not torn), no fur, sheen in the dye's colour; the hood is drawn in under the hat (`fitHoodUnderHat`). The left hand carries the basket out from the hip (IK).
- **Shots:** `tools/bot/costume-gate.mjs` (stills, turntable, walking, wind, far; night on the fire-night page). Sent: `screenshots/costume/sow-gate-v1-stills.jpg`, `sow-gate-v1.mp4`.
- **Claude's read:** the hat and basket hold up close. The body does not yet: the robe is still the Wraith's grid (blocky hood under the hat, paper-flat panels, a sleeve showing through the shawl). The night shot is lamplit, not firelit. No working motion yet (needs a gated clip). Cost: hat 40k and basket 38k triangles at full detail; a crowd needs LODs.
- **User, 2026-11-22, on v1:** "the cloth thing is glitched through the other cloth, otherwise it looks pretty good." Fixed in v2: a costumed figure keeps the over-arm colliders on (`wraith.overArms`), its mantle-only shoulder collider is fatter and set back, and the shawl's pinned rows sit higher and wider (`fitShawl`), so neither the sleeve tops nor the tunic's back show through. Checked standing, turning, walking and in wind (`sow-gate-v2.mp4`).
