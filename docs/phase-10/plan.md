# Phase 10 — Mirefen and Tide (plan, drafted 2026-11-01)

BRIEF §17: *mud material, mire water, mangroves, fog, Tide verbs, water-skim, mire Shaped and Warden, the camp, and borders.* **Gate:** the mire's signature frame (§6.3: the Wraith water-skimming across mirror-still water at dawn, its wake splitting a reflection of mist-hung trees). Mud keeps tracks, and Draw visibly dries it.

This file is the work order for the phase. `docs/cross-biome.md` still governs order, locks and reactions. Same rules as Phase 9: risky tech first, every milestone checked on the 3060, and the user reviews at the marked checkpoints.

**Status: a proposal. Nothing here is approved until the decisions at the end are answered.**

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

*Optional:* the sawtooth scarp at (2420, 1354) needs a re-bake too. Do it in the same bake only if the diff stays limited to that area.

### F1 — Fen water (the proving ground of this phase; 2–3 sessions)

The biggest technical risk. Nothing else is worth building if this frame fails.

- **A ripple simulation:** a wave-equation height field following the Wraith, about ±50 m, written by feet, wakes, spells, Shaped and the Warden. It settles back to a mirror.
- **Reflection:** SSR loses trees that are off screen, which is the whole signature frame. Test a quarter-resolution planar pass of trees and sky on High.
- **Black water:** tannin absorption, floating litter, sparse bubbles, mist contact at the surface.
- **Low lever:** no simulation (the existing analytic ripples plus an analytic V-wake) and sky-only reflection. The Warden's bow wave must still read there.
- **Budget:** 1.5 ms on the 3060 with all of it, under 0.5 ms on Low.

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
| **The Drowned** (elite) | elite | walks the bottom unseen, seizes from below | a line of bubbles on still water | read it and step on to ice; Undertow |

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
- **Main thread, three sites that teach the water** (cut if the Warden teaches it already):
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

| | Sessions | Review with the user |
|---|---|---|
| F0 carry-over and bake | 1–2 | the grown fen on the map |
| F1 fen water | 2–3 | **mirror still and wake clip: go/no-go** |
| F2 mud | 1–2 | mud close, mid, far |
| F3 water-skim | 2 | **skim feel (the user plays it)** |
| F4 Tide verbs | 2 | Surge, Draw and Undertow on every surface |
| F5 + F6 fog, mangroves | 3–4 | the fen composed; signature attempt |
| F7 sites, borders | 1–2 | the walk in from the meadow |
| F8 Shaped | 1–2 | fights in the bot's footage |
| F9 Warden | 3 | **the fight (the user plays it)** |
| F10 camp and quests | 2–3 | **story (the user plays it)** |
| F11 restoration | 1–2 | the tide turning |
| F12 gate | 1 | gate shots and bench |

Roughly **19–26 sessions**, an estimate from Phase 9's 16–20 plan. Built in the main session unless the user asks for subagents.

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

1. **Scope of carry-over (F0):** do the meadow CPU, the High lows and the laptop bench before the fen (recommended), or start the fen now and accept the risk. The rest of Phase 9's open list (signature wake, veil pair, Ridge trenches, stand-ins) stays open for the whole-world pass unless you say otherwise.
2. **Grow the mire** to 8–10 km² with 40–50 % open water, a bake change that leaves everything east of x = −900 identical (recommended), or keep today's 2.35 km².
3. **The biome's idea:** noise as danger, with the Listener (recommended). Alternatives:
   - **A simple hunt:** same Warden, without noise as a system: it tracks by distance only. Cheaper; loses the biome's identity.
   - **The Drowned Tree:** a vast mangrove that walks the shallows, climbable. Readable, but too near the Walker.
4. **The moving tide after the release** (F11): real, on the clock (recommended), or two fixed states.
5. **Shaped roster:** Mudlings, Rootback, Lampfish, the Drowned elite.
6. **Skim before the Warden?** Lent at the waking like sand-surf (recommended), or only at the release. Later keeps the first half on foot but removes the fight's core tension.
7. **Open order and locks** (`cross-biome.md` decisions 1, 2 and 4) are still recorded as open, and this plan assumes the recommended answers.
