# Gameplay design — making Wraith a game, not a demo (drafted 2026-10-24)

Source research: `reports/RPG gameplay design research.md` (sourced; tags [P] primary, [S] secondhand, [I] inference). Notes are in `research_notes/RPG gameplay design research/`.

This file is the **design source of truth for play**: pillars, loops, the systems that tie movement, combat and the world together, how Wardens differ, quests, exploration, pacing and how we test it. The project skill `.claude/skills/wraith-design/` points here and holds the review checklists. `docs/cross-biome.md` covers order and gating, and `docs/phase-9/plan.md` covers the dunes.

Every proposal here is design inference **[I]** built on the research; it is proved or disproved by playing it, with the bot and with the user.

---

## 1. Pillars (each names what it rejects)

The rule, from the research: **every feature serves a pillar or it is cut.**

| Pillar | Aesthetic (MDA) | We reject |
|---|---|---|
| **1. Moving is the joy.** Surf, glide and climb are fun in an empty field. Speed, carving and chaining are the game's main pleasure. | Sensation, Challenge | Dead walking between content; traversal as a loading corridor; fast travel as the normal way to move. |
| **2. The world remembers and answers.** Every verb writes the ground, and reactions are rules, not scripts. The player's marks are their signature. | Expression, Discovery | One-off puzzle props with bespoke logic; invisible state; resets. |
| **3. Release, not kill.** A Warden is a problem to understand, and each one is a *different kind* of problem. | Fantasy, Narrative, Challenge | HP sponges; the same boss formula reskinned ("strip, climb, strike three"). |
| **4. Quiet, but never empty.** Few people, few icons, and every place pays the player for turning toward it. | Discovery, Submission | Checklists, map-icon clearing, fetch quests, random loot spam, stat grinding. |
| **5. Learn by reading.** Difficulty is fixed and designed. Material and motion tell the truth about threats, and knowledge opens the world. | Challenge (competence) | Hidden scaling (user: no world tier), lying telegraphs. |
| **6. Grow by what you carry (user, 2026-10-24).** Weapons found and forged, upgraded through quests and trade; a currency and people to trade with; consumables that heal and strengthen. Elements become the secondary powers. | Fantasy, Challenge, Discovery | Random-roll loot, numbers-only upgrades, shops that sell power the world should give. |

## 2. The loop stack

The rule, from Halo's nested loops [P]: **vary the situation around fixed verbs; don't add verbs.**

| Scale | Loop | Is it there today? |
|---|---|---|
| **0–10 s** | Carve, glide, climb, bend. Feel the speed; leave a mark. | Snow-surf: yes. Glide: first pass. Combat verbs: yes. **Isolation test owed** (§9): is each fun alone in an empty field? |
| **1 min** | Read the terrain, choose a line, **chain** modes (surf → jump → glide → updraft → land → surf), fight on the move. | Chains partly work (glide hands speed to snow-surf). **Nothing rewards chaining** (the Flow system, §3). |
| **5–15 min** | Spot a landmark, travel, find a **site** (a nook, a puzzle or a story tableau), get paid. | Frost and meadow have quests and shrines. **Payoff density is low** between them (§6). |
| **Session (1–2 h)** | Arrive in a biome, learn its people and threats, find its Warden, **release it, and the land changes**. | Frost and meadow, yes. **The restored world adds looks but little new play** (§7). |
| **Campaign** | Elements accumulate. Old places open to new verbs, and the continent heals. | Planned in `cross-biome.md` (locks, open order). |

## 3. Flow — the system that ties movement to combat (new; the core proposal)

**Problem.** Movement, combat and exploration are separate games today. Focus refills faster while moving (`combat.js`: idle 6, move 14, surf 28 per s), which is a good start, but nothing rewards moving *well*. There is no opportunity cost either: you can stop, wait and cast.

**Proposal: Flow.** One diegetic value, 0–3, built by unbroken, skilful motion and spent by bending well.

- **Built by:**
  - continuous traversal: surf speed above cruise, carving close to the grip limit, long glides;
  - **chains** between modes within 1 s (surf→glide, glide→surf landing, updraft catches, crest jumps);
  - reactions landed (freeze → shatter, strip → strike);
  - near misses (dodging through an attack).
- **Lost by:**
  - stopping (it drains over about 2 s while standing);
  - being hit (−1 tier);
  - mis-landing (falling hard).
- **Gives:**
  - focus regen ×(1 + 0.5·flow);
  - verbs cast at flow 2+ are stronger and **cost less**: a Sweep cast mid-surf is a wave, not a splash;
  - **at flow 3 each element has a "flowing" variant** of its tap verb:
    - Frost: a Sweep that carves a frozen lane you can surf on;
    - Gale: a Gust that carries you;
    - Stone: a Shard that you surf behind as it ploughs.
- **Shown in the world, not on a HUD** (BRIEF §12):
  - the hem and sleeves stream longer and brighter in the element's colour;
  - the hand-light leaves a trail;
  - the wake grows;
  - the music layer lifts.
  - Each tier change gets a soft sound cue.
- **Opportunity cost** (the research's smell list): *stop and aim precisely*, or *keep moving and stay strong*. Both are valid, and neither dominates. Standing still keeps precision; moving gives power and economy.
- **Why it fits:**
  - Sunset Overdrive's mobile-player redesign and Titanfall's accumulated speed show movement and combat feeding each other [P/S];
  - Doom's "enemies are the resource" becomes "motion and reactions are the resource" [P];
  - it serves Pillars 1 and 2.
- **Tuning by data** (`combatTuning.flow`), with tests for the build and decay curves. Feel is reviewed by the user.

### Flow — Done (2026-10-25)

- **Built:** `src/game/flow.js` (pure, allocation-free, `npm run alloc` case `flow.update`), owner `src/systems/flow.js`, tuning `flowTuning` (data, every number has a slider in the dev overlay's Flow section, `src/ui/overlay/flowTools.js`). Tests: `tests/flow.test.js`, `tests/combatFlow.test.js`.
- **Build values (per s):** surfing above 11 m/s +0.16, +0.42 scaled 14→22 m/s, carving +0.40 from 55 % of grip (≥ 9 m/s), gliding +0.34 scaled 9→15 m/s. Passive building fades out over the last 0.6 below `softCap` 2.1, and above it bleeds 0.2/s: tier 3 needs chains and reactions. Chains (mode held ≥ 0.5 s, next mode within 1 s): +0.45, +0.12 per chain in the streak (max +0.3 extra); surf→glide, glide→surf, crest jump landing back on the surf (≥ 0.35 s air), updraft catch +0.45. Events: shatter +0.6, Gust strike +0.45, any soaked-then-frozen or soaked-then-Gusted body +0.45, near miss +0.5 (rate-limited 0.5 s), `flow.hit(FLOW_EVENT.WEAPON_LIGHT/HEAVY)` +0.25/+0.4 for the weapons to call. Stacked events divide by (1 + recent), forgotten at 2.5/s.
- **Lost:** standing 1.5/s after 0.3 s (3 → 0 in 2 s); walking 0.35/s (not for 1 s after a chain, nor 1.6 s after a feeding event); a blow −1 and nothing builds for 0.6 s; a fall faster than 17 m/s −1 (not from a glide). Death resets.
- **Gives:** focus regen × (1 + 0.5·flow) (also the surf/move/idle rates); tier 2+: verb costs × 0.7 (taps, heavies, Ribbon and Vortex per second), Sweep and Gust range/width and verb damage × 1.25; tier 3: Frost Sweep also freezes its channel (a lane of ice that stays), Gale Gust carries the Wraith (0.7 s: +~6 m/s on the surf, airspeed in a glide, a 9 m/s kick and hop on foot). Verbs may now be cast mid-surf (they were blocked; the spec's "a Sweep cast mid-surf" needs it).
- **On the body:** hem, mantle edge and cuffs glow in the element's light (cloth shader `clothFlow`), cloth streams more (wind × (1 + 0.22·flow) plus a push back along travel), the hand-light leaves a 5-point trail per hand, the surf wake is 10 %/8 % wider/deeper per tier with more spray, speed streaks longer, brighter, with 64 extra, a soft tone per tier change (up: rising, warmer each tier; down: sinking), the score +28 % gain and a +4 dB high shelf at flow 3. Hands brighten a little. No HUD.
- **Telemetry** (bot state `flow`): on a 45 s snow-surf route seconds at tier 0/1/2/3 were 21 / 14 / 10 / 0 (the run broke up where the snow ended); with landed reactions injected tier 3 is reached and held a few seconds. See the report for the fight numbers.
- **Open:** Stone's flowing Shard (not built); weapon hit tuning (the hook exists); casting mid-surf has no pose of its own; fights with a cold start rarely lift Flow above tier 1 (the bot is a poor fighter: needs the user's feel pass); the glow could be read as the wound frost, so check at night; music lift is only a gain and a high shelf, not a separate layer; hard-fall threshold and the near-miss rate limit are untested by a human.

## 4. Combat

### 4.1 Roles and the material lever

Each biome has three archetypes in fixed roles, plus an elite. The **material decides the right element** (the weapon-switch analogue). Every enemy **pushes the player in one way** (Doom [P]).

| Role | What it forces | Frost | Meadow | Dunes |
|---|---|---|---|---|
| Swarmer | keep moving (punishes standing) | hounds | Sedgerunners (flush) | Skitters (under the sand) |
| Bruiser | find the angle or the reaction (armoured front) | brutes | Hedgewardens (territory) | Plate-backs (ruin shell) |
| Caster | close the distance or break line of sight | seers (ice shards) | Chanters (pollen) | Whirlers (sand blasts) |
| Elite | combine two reactions | the den mother | the Old Hedge | the Glass-sworn |

### 4.2 Encounter rules

- **2–3 roles per encounter, never one alone**, with a cap of 8 active (BRIEF §10).
- **The arena has a feature the fight reshapes**: a slope to surf, ice to make, grass to flatten, ruins for cover.
- Swarmers and casters **cut across surf lines**, so a mobile player faces mobile threats (Sunset Overdrive [S]).
- **Honest telegraphs through material**: sand streams before a lunge, crust cracks glow, frost creaks.
  - The *what* is never hidden; *timing* may vary (smell: lying telegraph).
- **Encounter kinds**, rotated so no two in a row are the same:
  - an ambush at a landmark;
  - a guarded site (the reward is visible);
  - a storm surge (blizzard, thunderstorm, sandstorm: telegraphs harder to read, shelter matters);
  - a hunt (an elite that flees to its lair);
  - a Warden frenzy.
- **Calm after peaks:**
  - no hostile spawns for a while after a release or a hard fight (Left 4 Dead's relax phase [S]);
  - music and ambience carry the pacing; no spawning director.

### 4.3 Death and fairness

- **Fixed difficulty.** No selector and no scaling (user).
- **Accessibility assists** are separate settings and are not called "difficulty": longer telegraph windows, slower Warden tempo and aim help. This fits Chen's player-chosen embedded challenge [P/S].
- **Checkpoints at Warden phase boundaries** (each stumbled leg, each opened vent). The uncheckpointed approach stays short.
- **The world keeps its marks when you die**: craters, grooves and ice stay. Death is learning (Doom [P]: "death is an ok thing").
- **Challenge is chosen by route**: a steeper line is faster; a Warden can be taken early or late.

## 5. Wardens — vary the problem, then the verb

Shadow of the Colossus [P]: each colossus was designed as body, climbable surfaces, battle flow and arena *together*. Early ones are beatable without the terrain; later ones need it. Items are never the key. When ideas pile up, **merge two into one**.

**Five axes. Each Warden must differ from every other on at least three.**

| Axis | Frost Warden (mammoth) | Bellwether (meadow) | **Long Walker (dunes)** | Mire (Ph. 10, sketch) | Ember (Ph. 11, sketch) | Sea (Ph. 12, sketch) |
|---|---|---|---|---|---|---|
| Target | static, rooted | a building: the manor is its body | **always moving, never attacks directly** | hidden, submerged | aggressive, fast | vast, surfacing in waves |
| Win condition | freeze joints, shatter | strip vents, climb, open valves | **bring it home: stumble it, board it, steer it to the dry well** | find it (lure by light and sound in fog), drain its core | a duel: crack and cool its crust, dodge-heavy | ride the waves to it; all elements |
| Discovery | which joints | which vents, the order | **read the gait; learn to steer** | where it is (knowledge hunt) | when it is vulnerable (rhythm) | how to reach it |
| Arena | open snowfield | manor grounds and the hill | **the whole erg is the arena; the fight travels about 2 km** | fog-bound channels | the caldera, which shrinks | open sea |
| Tempo | deliberate | staged siege | **continuous pursuit, calm on its back** | slow stalking, sudden strikes | frantic | epic, rising |
| Mood | grief | relief | **companionship, a journey** | dread | fury | farewell |

### 5.1 The Long Walker (replaces the D10 fight in `docs/phase-9/plan.md`)

The fiction: the Shapers' walker that carried a caravanserai across the desert; its stride kept the erg moving. It is not hostile. It wants to finish its walk.

1. **The track (approach, knowledge).**
   - Across the erg runs a line of **giant footprints fossilised in glass**: the Walker's old circuit.
   - Following them is the guidance; the terrain does the guiding, with no marker needed (Pillar 4). The quest's compass goal points at the next print.
   - They lead to a star megadune with a ruin on top: the Walker, buried mid-stride.
2. **The waking (it lends Stone and sand-surf).**
   - Touching the brake stone in its forecourt wakes it. It heaves out of the dune in a huge avalanche, and the Wraith *catches* its motion: Stone and sand-surf are lent.
   - The fight is the sand-surf tutorial under pressure.
3. **The pursuit.**
   - It walks its circuit at about 5 m/s. It does not attack, but its footfalls throw avalanche sheets down the dunes, its wake drags a sandstorm, and Skitters ride the storm.
   - The player surfs alongside. **The gait is the telegraph:** the six legs lift in a wave, and the next landing spot shows a dust ring under the lifted foot.
4. **Stumble a leg.** Change the ground where a foot will land:
   - raise a **Ridge** under it (Stone, lent);
   - or **frost-bind** the sand to a hard crust it slips on (Frost);
   - or, with Gale, **Vortex the spot into a pit**.
   - The leg lands wrong, it stumbles and kneels for about 8 s, and its leg's ruin-stone plates are the climb (BRIEF §8.4).
   - Several valid solutions give autonomy; the elements known decide which.
5. **On its back (calm).**
   - The caravanserai: a walled court, a well and a stair. It is a moving level with sandfalls off the flanks, and the light and the dunes slide past.
   - This is the quiet half of the fight. Pillar 4: the calm on its back is designed, not filler.
6. **Steer it home.**
   - Two **glyph pillars** stand at the court's sides. A Shard (or a Gust) against one turns the Walker toward that side.
   - The goal is the **dry well of the camp's oasis**, about 2 km away. The way passes the rift: steer it away or it balks, shakes everyone off and walks on, and you stumble it again.
   - Its shaking and shedding try to throw the Wraith off, and Skitters climb aboard.
   - Checkpoints come at each stumble.
7. **Release.**
   - (2026-10-26) It lies down only when the well's glass eye is lit: throw the evening sun into the shaft with the two mirror-stones on its roof (`docs/phase-9/dunes-design.md` §4.4).
   - At the well it kneels, lowers its head into the shaft and lies down. It becomes a dune range around the oasis.
   - The wind returns; every crest streams; the dunes begin to migrate; **the well fills**.
   - The camp's quest line resolves *because of where the player brought it*.
   - Stone is mastered and sand-surf granted.
   - Quality gate (BRIEF §8.4): if climbing a moving body fails the bar, every climb happens on the kneeling body, and the steering stays.

Why it is varied:
- the win condition is *navigation and escort*, not breaking weak points;
- the arena is a journey;
- the threat is the environment it makes, not its attacks;
- the mood is companionship.

It reuses the reaction table (Pillar 2) and makes the biome's traversal the fight's core (Pillar 1).

## 6. Exploration — terrain does the guiding

- **Landmarks:** one **global landmark** per biome, visible from anywhere in it. **Local landmarks** within a few hundred metres lead the eye from one to the next.
  - Frost: the monastery.
  - Meadow: the hill and the manor.
  - Dunes: the star megadune and the walker's glass track.
  - Mire: a drowned tower.
  - Ember: the volcano.
  - Coast: the sea stacks.
- **Triangle rule (BotW [S]):** rises hide the next point of interest; it reveals as you crest. Place sites first, then shape the terrain around them (Miyazaki placed bosses first [P]).
- **Three tiers of site**, not identical icons:

| Tier | What | Density (to tune) | Payoff |
|---|---|---|---|
| **Nook** | a 30-second find: a cairn, a view, a glass shard, a carved line | about 1 per minute of traversal along natural routes | a lore line, a vista with a music swell, a Remembrance entry, a shortcut |
| **Site** | a 3–10 minute puzzle or story tableau using the reaction table | 4–8 per biome | an Echo, a robe, a lock opened, a side quest |
| **Set piece** | a settlement, a Warden, a legacy ruin | 2–3 per biome | the chapter |

- **Every "look here" spot pays something** (BotW: rocks alone weren't enough, so Koroks went under them [P]). A nook may pay with beauty or melancholy, but never with nothing.
- **Guidance stays diegetic first:**
  - the compass is quiet (user: direction to quest NPCs is wanted, and is being built);
  - wind and motes lean toward the tracked goal, with a high-contrast variant on snow (Ghost of Tsushima's wind loses contrast in snow [S]);
  - roads and pilgrims' cairns lead places.
- **Remembrance** (the journal's new page): it records *observations*, not tasks.
  - "Frost binds wet sand."
  - "The Walker's left middle leg lands short."
  - "The hounds flee from fire."
  - Knowledge is the key (Outer Wilds [S]). Reactions discovered fill a living **reaction table** in the journal, collected by doing, never by checklist.

### Remembrance & nooks — Done (2026-10-26)

- **Remembrance:** `data/remembrance.json`, 46 entries (land 16, Shaped 7, Wardens 5, people 10, reactions 8), each unlocked once into the quest-graph flag `rem:<id>` (saved with the quests). One call, `remember(id)` (`game/remembrance.js`), is where the world answers (`systems/remembrance.js`): a quiet notice, a soft chime, the places the entry reveals made known on the compass and map, and a wind burst for a view. Triggers: world events through `chapter.raise` (talks, nooks), casts from the bending system, shatters from combat, and states polled twice a second (places sighted, Shaped sketched, shrines rested at, Echo stones, Wardens released, Flow 2). The first poll after a load is silent. The journal's **Remembrance** tab lists only what is remembered, plus the living reaction table (snow and grass by frost and gale; a cell fills with the rule's own words the first time that bend is cast on that ground).
- **Nooks:** 39 built (36 designed, 3 added for the far legs) from `data/nooks.json`, 13 procedural shapes in `world/nookSites.js` (cairn, seat, offering, marker, glint, sled, lantern, cart, log, tools, fire, boat, chimes) in the same stone, timber, felt and bronze as the places round them. Each has an interaction (Read, Look out, Look, Dig, Cross) paying on first use: a lore line (also in the Lore tab), a Remembrance entry with a swell, or the place a marker points at. Hidden from the compass until found (never sensed), then a quiet compass mark and a map mark. Found nooks light their glyphs. `reward {marks}` is data only; `payReward` in `systems/nooks.js` is the marked TODO for the economy. A nook is re-seated on the fine ground once the Wraith is within 120 m (the architecture seats far sites on the coarse ground, a metre low on a crest). `ARCH_SITES` went 400 to 512: the world already had 402 sites.
- **Payoff interval** (`node tools/world/payoff.mjs [--before]`, baked ground, travel pace per route; a payoff is a POI, shrine, quest site or nook within sight):

| | before | after |
|---|---|---|
| Natural routes (37 min of route) | mean gap 33 s, max 262 s (2 stretches over 180 s) | mean 27 s, max 105 s |
| Far legs (24 min: shrines 3, 4, 5) | mean 122 s, max 511 s (3 stretches over 180 s) | mean 61 s, max 158 s |

  Nothing now passes 180 s. The target of 60 to 90 s holds on the far legs (61 s); on the dense routes the gap is shorter than the target because shrines, stones and quest sites were already close.
- **NOT ASSESSED:** the payoff numbers are from a route model, not a human walk (the bot walked six meadow nooks and one frost nook and each was findable and paid, but not whole routes); whether a human finds 27 s dense-route gaps too busy; the late-pipeline count (no new material or pipeline was added, but the detector was not read); the frame-time cost of 39 more sites (65k vertices); whether the reaction table's cast detection is right on water, or in the biomes not yet built (surface is taken from the biome: snow in the frost, grass in the meadow); the burnt cart's wheel stands edge-on and reads weakly in the soot; `reward {marks}` pays nothing yet.

## 7. The restored world must add play, not only looks

After a release:
- **new traversal:** restored wind gives ridge lift for glides; restored dunes give crest streams to ride and moving slip faces;
- **new people and requests:** the camp's well is full, so the caravan moves and has new needs;
- **runs and courses** that only work restored: the glide course on the summit, the sled run down the moving megadunes;
- **a calm epilogue:** walking through the healed biome with no threats for a while (the relax phase).

The Wardens' bodies stay as landmarks and become places: the Bellwether's manor, the Walker's dune range.

## 8. Side quests — every quest a story

The template comes from Witcher 3's lessons [P via summary]: withhold information, emotional impact over spectacle, let the world carry exposition, and make consequences **visible and delayed**.

1. **Hook:** an anomaly in the world, or a person with a specific want. Not "bring me 5".
2. **Tableau:** a place to read (what happened here? Smith/Worch [S]). The terrain state can hold the evidence: old tracks, a crater, glass.
3. **Play:** the core uses verbs and reactions (thaw, bind, strip, raise, steer), not "carry".
4. **One choice**, at most one deep (BRIEF §11).
5. **Delayed, visible consequence:** a lit hearth days later, a new cairn, a person who moved to another settlement.

**No-fetch test:** if the only verb is *carry* or *go to*, add a reveal, a choice or a reaction, or cut the quest.

**Recurring people over many one-off givers.** A pilgrim met three times across biomes is worth more than three strangers. **No irreversible failure**; a missed moment changes the outcome instead.

## 9. How we test fun (with the bot and with the user)

The rule, from `/balance-check`: anything we haven't measured is **NOT ASSESSED**, never "fine".

- **Isolation tests** (bare loop, no content): surf an empty slope for 2 min; glide off a ridge; fight 3 hounds on flat ground. The user judges feel; the bot films each in film mode for review.
- **Payoff interval:** the bot walks natural routes and logs seconds between payoffs (nooks, sites, vistas). Target: about 60–90 s in dense areas, and no stretch over 3 min without a nook or a vista.
- **Flow telemetry:** the time at each flow tier on a traversal route and in fights. If flow 3 is never reached, it's too hard; if it's always 3, it's meaningless.
- **Focus starvation:** the share of fight time spent with focus too low to cast. Target: under 15 %.
- **Encounter logs:** deaths per encounter, time to clear, roles engaged.
- **Order tests** (cross-biome): play the dunes second and the meadow second, both scripted.
- **Smell review** (skill `wraith-design`) on every new system before it is built, and again after the first playtest.

## 10. What to change in what exists (priority order)

1. **Flow (§3):** the biggest gain in fun for the least content. Prototype it on frost and meadow before Phase 9's Stone.
2. **The Remembrance page and the living reaction table (§6).**
3. **Nook pass on frost and meadow:** add nooks along the natural routes (roads, ridge lines, the river) to the target density. Measure the payoff interval with the bot first.
4. **Restored-world play:** the summit glide course, ridge-lift routes, and Hearn's post-release requests (new people with needs).
5. **Encounter variety audit:** frost and meadow encounters against §4.2 (roles mixed, arena feature, honest telegraphs, calm after peaks).
6. **Isolation tests** for the surf, the glide and frost combat, filmed for the user.

## 11. Progression, weapons and trade (user, 2026-10-24)

The user's direction: *"there needs to be progression for the player… instead of relying on elements, they can be secondary powers, we should provide actual weapons which can be obtained, upgraded from quests, etc, trade currency, trade with npc to buy items, to heal, provide buffs like strength."* This overrides BRIEF §2.4's "no loot" and the robe rule (DECISIONS.md). The design keeps the spirit of Pillars 3–5: items are **hand-placed and earned**, never random rolls, and every upgrade **changes how a weapon plays**, not only its numbers (smell: treadmill).

### 11.1 Controls (the new combat layout)

| Input | Action |
|---|---|
| **LMB** tap / hold | Weapon: light attack (combo) / charged heavy attack |
| **Q** tap / hold | Element: quick verb / sustained verb (Sweep, Ribbon; Gust, Vortex; Shard, Ridge) |
| **F** | Element heavy verb (Crystallize, Updraft, Bloom) |
| **RMB** (hold) | Traversal (surf), glide in the air; while locked on: guard |
| **Ctrl** | Bend-step dodge |
| **1–5** | Select element (cuffs and hand-light colour) |
| **Mouse wheel / X** | Cycle the carried weapons (two carried) |
| **R** | Use the selected consumable; **C** cycles consumables |
| Tab, E, Space, M, J, Esc | Unchanged |

The dev free-camera keys move off Q and R (to the overlay's free-cam mode). The action map in `src/input/actions.js` is what changes.

### 11.2 Weapons

These are Shaper relics: things the Shapers carried to shape the world, now found, given or forged. Each is a procedural mesh held in the wrapped hands (no rigging; BRIEF §8). The attacks are procedural arcs on the existing Wraith pose with cloth reacting, a swept trail ribbon, hit-stop and material spray (§4.3, BRIEF §10). Six weapon families, **horizontal** (different, not better):

| Family | Feel | Light combo / heavy | Pairs with |
|---|---|---|---|
| **Pilgrim's staff** (start) | reach, sweeping, defensive | 3-hit sweep / overhead slam that dents the ground | Frost (a Sweep from the staff's tip) |
| **Sickle pair** | fast, close, bleeding cuts | 5-hit flurry / spinning reap | Gale (cuts in a Vortex hit everything inside) |
| **Shaper maul** | slow, staggering, breaks armour | 2 heavy swings / ground-shaking smash (a crater) | Stone (smash raises a Ridge ring) |
| **Glaive** | reach and arcs, crowd control | wide arcs / a thrust that pins | Gale, Frost |
| **Lantern flail** | a burning weight on a chain; area | swings / a lit spin that scorches grass | Ember (later), the carried flame |
| **Glass blade** (dunes) | precise, brittle-fast; ruinous to frozen and glass foes | quick cuts / a lunge that shatters frozen Shaped | Frost (shatter) |

- **Where they come from:** the staff at the waking. The others come from **quests, Warden releases and sites** (one per biome is a quest reward, one is found at a site, one can be bought or forged). There is no random loot: each weapon is placed and named.
- **Material-aware:** weapon hits apply the material reaction table weakly (a maul on a frozen Shaped shatters it; a blade on a plate-back glances). Elements remain the strong lever; weapons the reliable one.
- **Flow (§3):** weapon hits build Flow; at Flow 2+ each weapon gets its *flowing* finisher (a surf-strike, a glide-dive slam).

**Weapons — Done (2026-10-26, branch `claude/weapons`).** Built: three families (staff, sickles, maul) as data (`src/game/weapons/defs.js`), the state machine (`machine.js`), procedural attack poses with anticipation, strike and follow-through (`pose.js`), hit detection by swept wedge with aim assist and a ground impact for the slams (`weapons.js`), material affinities (`affinity.js`), procedural Shaper-style meshes and a swept trail (`render/weaponGeo.js`, `weaponView.js`), the two finds with a "Take" interaction (sickles at the reaper's stand, (152, 948), east of Hearn; the maul at the cold forge, (1090, 2722), by the monastery), the inventory stub (two carried, X or the wheel swaps), photo spots `p9w-*`, and the bot tools `fight.mjs`, `weapons-film.mjs`, `sheet.mjs`. Every connected hit calls `flow.hit(WEAPON_LIGHT | WEAPON_HEAVY)` and goes through the same chip, damage, stagger, stop and shake path as the verbs.
- **Tuning (live in the F1 overlay):** input buffer 0.15 s (a press during a cut or recovery waits 0.45 s for the link point); a dodge cancels recovery, a charge or a waiting swing at once and is kept 0.22 s through a windup or cut; a hold of 0.26 s becomes a heavy charge; weapon swap 0.32 s. Staff: 3 hits (11, 11, 16), reach 2.7-3.0, slam 34 with a 2.1 m radius and 0.055 s stop. Sickles: 5 hits (6.5, 6.5, 7, 7, 12 finisher), reach 1.75-1.9, bleed 3.2 per s for 3 s, reap 2 passes of 13 with a 0.04 s stop. Maul: 2 swings (30 with a 1.3 m ground impact, 38), smash 56 with a 3.2 m radius and a 0.06 s stop and a crater. Light hit-stop 0.012-0.022 s; heavies 0.04-0.06 s. Each tier adds 12 % damage (tiers are not built yet).
- **Playtest:** `docs/weapons-playtest.md` (bot fights: frost hounds and brutes, meadow sedgerunners and hedgewardens; sheets in `screenshots/weapons/`).
- **NOT ASSESSED:** how any of it feels in a human's hands (timing windows, the aim assist, the maul against flankers); the flowing finishers at Flow 2+ (not built); forge tiers, infusion and the other three families (glaive, flail, glass blade); sound design beyond the existing swish, thud, crunch and boom cues; the weapon meshes seen in the Windows-GPU frame-time bench (one preview-page spot check only); `npm run alloc` for the weapon update (the harness fails on controller and spring arm as before); the maul stagger-locking a lone brute (a poise recovery window is the likely fix); and the crater's size and depth, which may read too large.

### 11.3 Upgrades — the forge

- **Smiths:** Hearn's forge, the dune caravan's glass-reader, and later one per settlement. Upgrades cost **marks** (currency) plus **materials** from the biome:
  - frost: rime cores;
  - meadow: hedge-heart and turf-amber;
  - dunes: glass and sand-cores.
- **Five tiers per weapon.** Tiers 1, 3 and 5 **add or change a move** (a combo extender, an elemental infusion slot, the weapon's art). Tiers 2 and 4 are numbers (damage, stagger). So no upgrade is only numbers twice in a row.
- **Infusion:** from tier 3, a weapon can carry one element. Its hits then apply that element's reaction lightly: frozen edges, gusting strikes, stone weight. This is how elements become the *secondary* powers the user asked for, and it ties the two systems together.
- **Quest upgrades:** some side quests upgrade a weapon directly (the smith's lost hammer, Corin's brother's blade).

### 11.4 Currency and trade

- **Currency: marks**, old Shaper silver pieces the Veiled still trade in.
- **Earned from:**
  - Shaped (they leave a mark or two when they collapse, more from elites);
  - quests;
  - nooks and sites;
  - selling surplus materials.
- **Spent on:**
  - forge upgrades;
  - consumables;
  - robes and dyes;
  - maps of unexplored regions (the mapmaker sketches the next biome's landmarks);
  - a few weapons.
- **Traders** (named Veiled with their own stock that grows as their quests are done):
  - Hearn's market: Corin's stall;
  - the frost camp's sled-trader;
  - the dune caravan master.
- **Trade screen:** the parchment codex style (BRIEF §12), with buy, sell and stock. It opens through the existing talk interaction.
- **Economy targets** (tune with telemetry):
  - a biome's main path earns about 1.5× the cost of fully upgrading one weapon to tier 3;
  - grinding Shaped earns slowly (smell: no reason to grind);
  - quests and sites pay the most.

### 11.5 Consumables and buffs

Carried in a small pouch (4 kinds; stacks of 3–5). Bought, found and given.

| Item | Effect | Notes |
|---|---|---|
| **Warm salve** | heals over 3 s (interruptible) | the core heal; buyable everywhere |
| **Shrine water** | a flask refilled at every rested shrine (3 charges, upgradable by quests) | the guaranteed heal (Souls' Estus pattern) |
| **Ember tea** | +25 % weapon damage for 60 s ("strength") | |
| **Rime tonic** | −25 % damage taken for 60 s | |
| **Wind-bread** | focus regen ×1.5 for 90 s | |
| **Stillwater draught** | Flow decays half as fast for 60 s | |
| **Ash charm** (later) | a throwable that blinds | |

- **Use takes time** (an animation of about 0.6 s, cancelled by dodge), so healing mid-fight is a decision (opportunity cost).
- Buffs show on the body: a warm glow at the hands for strength, a frost sheen on the robe for defence.

### 11.6 The Wraith's own growth

- **Health threads:** each Warden release and certain quests weave a thread into the robe: +1 health segment. It shows as the cowl light burning steadier.
- **Focus:** Echoes (as now) improve elements.
- **Robes:** keep their identity and gain a **modest defence value** plus their one property. They become the armour slot (a robe and a mantle).
- **No experience levels.** Growth comes from weapons, the forge, threads, Echoes and robes, all earned by play.

### 11.7 Death

On death the Wraith re-forms at the last rested shrine and **drops its carried marks where it fell**: its robe's imprint stays in the terrain state, and walking there recovers them. Marks are lost only if it dies again before recovering them. Weapons and items are never lost. (Souls-like stakes, softened.)

### 11.8 Save

Save v3 gains:
- inventory (weapons with tiers and infusion, materials, consumables, marks);
- equipped weapon, robe and mantle;
- the shrine-water flask;
- health threads;
- trader stocks;
- the dropped marks' position.

**Economy — Done (2026-10-26, branch `claude/economy`).** Built: marks, materials, the pouch, the flask, health threads, robes as armour, traders, the forge, the death drop and save v3. The numbers below are live data; the playtest is `tools/bot/economy.mjs` (a bot run: a quest pays, Osk and Corin sell, consumables in a fight, Garrow forges, death and recovery, a save and reload) and the page shots are in `screenshots/economy/`.
- **Code:** `src/game/inventory.js` (marks, materials, pouch, flask, threads, infusion), `src/game/economy/` (`items.js` prices and effects, `buffs.js` the drink and the buffs, `trade.js` and `traders.js`, `forge.js`, `drop.js`, `purse.js`, `rewards.js`), `src/game/weapons/tiers.js` (the five tiers), `src/systems/economy.js` (play: R and C, buffs on the body, the drop's glow, saves), `src/ui/menus/trade.js` (stall, forge, journal Pouch and Arms), save v3 in `src/game/save/saveSchema.js`.
- **Consumables** (R uses, C cycles; the flask is first in the cycle):

  | Item | Price / sells for | Stack | Effect |
  |---|---|---|---|
  | Shrine water | (free; 3 charges, 5 at most) | the flask | heals 55 % of maximum over 2.2 s; fills at every shrine rest; two quests deepen it |
  | Warm salve | 12 / 5 | 5 | heals 40 % of maximum over 3 s |
  | Ember tea | 22 / 9 | 3 | weapon damage ×1.25 for 60 s |
  | Rime tonic | 24 / 10 | 3 | damage taken ×0.75 for 60 s |
  | Wind-bread | 14 / 6 | 3 | focus regeneration ×1.5 for 90 s |
  | Stillwater draught | 30 / 12 | 2 | Flow drains ×0.5 for 60 s |

  A use takes 0.6 s (the right hand goes to the lips, walking slows to half, the weapon is sheathed); a dodge breaks it off and spends nothing; a blow stops a heal that is trickling in. A heal is refused at full health. Buffs show on the body: the hand-light turns warm gold and larger (tea), the robe frosts without dimming the cowl (tonic). There is no new HUD; the journal's **Pouch** tab lists what is carried and a quiet notice names the item on C.
- **Health and armour:** maximum health is 100 plus 20 per thread (five segments of 20). Four threads exist so far: the frost Warden, the Bellwether, the den mother and gold on the Shapers' Run (the dunes' Warden is the fifth). Each thread also steadies the cowl light's gutter at low health. Every robe has a `defence` (0 to 6 %: the wanderer's none, the rime-hide mantle 6 %, the runner's 3 %, Isolde's ember 4 %, the barley cloak 4 %, the courier's cloth 2 %), apart from its one property.
- **Forge** (Garrow, Hearn; opens after the stair is open). Cost per tier, in marks and materials: I 40 + 2 rime cores; II 70 + 2 rime cores; III 120 + 2 hedge-hearts + 1 turf-amber; IV 200 + 2 hedge-hearts; V 320 + 3 hedge-hearts + 2 turf-amber (750 marks, 4 rime cores, 7 hedge-hearts, 3 turf-amber in all). Damage ×1.12 at II and ×1.25 from IV; I, III and V change play:

  | Weapon | I (a move) | II | III | IV | V (the art) |
  |---|---|---|---|---|---|
  | Staff | a fourth hit, the return sweep | +12 % | infusion slot | +12 %, more knock | **The Plant:** the slam sends a shock 7 m down the lane |
  | Sickles | a sixth cut, a lunging finish | +12 % | infusion slot | +12 %, deeper bleed | **Reaper's Fold:** the reap makes 3 passes and draws foes in |
  | Maul | a third swing, the backhand | +12 % | infusion slot | +12 %, more knock | **Groundbreaker:** the smash throws back everything within 5 m |

  **Infusion** (tier 3, chosen at the forge, free to change): frost chills, and the third blow within 3 s freezes the Shaped for 1.4 s; gale throws foes 1.7× as far and feeds 1.5 focus a hit. (Stone is in the code and the ladder of elements but not offered until it is bent.) The weapon's trail takes the element's colour, and grows with the tier.
- **Trade:** Corin (Hearn; after the stair is open) and Osk, the sled-trader (the frost camp; after the camp raid). Lines open with quests; a stock is a copy or two and refills by one a shrine rest. Traders buy materials at 60 % of value and spare consumables at the `sells for` price; weapons are never sold.

  | Trader | Always | Opens when |
  |---|---|---|
  | Corin | salve ×4, bread ×3 | tea ×2: The Fen Lamp done; draught ×2: The Stones That Listen done; tonic ×2: the Bellwether released |
  | Osk | salve ×4, tonic ×3 | tea ×2: the pilgrims' hearth lit |
- **Death:** the carried marks stay where the Wraith fell (the last safe footing if it fell into water or air): a press in the terrain state, a candle-light you can see from afar, sparks rising within 80 m, and a mark on the map page. Walking within 2.6 m takes them back. Dying before that loses them; the new drop is whatever was earned since. Weapons, items and materials are never lost.
- **Faucets and sinks.** Marks available in the first two chapters: **1212** (frost 567: main 345, sides 210, the den mother's drop 12; meadow 645: main 345, sides 300). A weapon to tier 5 costs 750, so one weapon to tier 5 and a second to tier 2 (110) leaves about 350 for the pouch; everything cannot be bought. Both biomes' main paths pay exactly 1.5× a weapon's first three tiers (345 vs 230), as §11.4 asked.

  | Faucet | Pays | Is finite? | Its sink |
  |---|---|---|---|
  | Main quests | 345 marks a biome; the Wardens' threads and rime cores / hedge-hearts | yes, once | forge tiers; consumables |
  | Side quests | 40–60 marks each (frost 210, meadow 300), a material, a thread, or a deeper flask | yes, once | forge; consumables |
  | Shaped | 1–3 marks a collapse from a purse of 10 that refills a mark per 30 s (about 120 an hour at the very most) | no, but capped | the everyday sinks, salves |
  | A placed elite (the den mother) | 12 marks and 2 rime cores, once | yes | forge |
  | Selling materials / spares | 60 % of a material's value; spares at under half price | yes (it costs the forge a tier) | none: it is a loss |
  | Nooks and sites | their own `reward: { marks }` (the Remembrance branch's hooks, not yet wired) | yes | forge |

  | Sink | Takes |
  |---|---|
  | The forge | 750 marks and 14 materials a weapon to tier 5; supply is 10 rime cores, 7 hedge-hearts and 5 turf-amber: one weapon can be finished (the hedge-hearts), not two |
  | Consumables | 12–30 each, with stacks and the traders' stocks as the cap |
  | Death | the marks carried, if it happens twice |
- **The checks (`wraith-design`):** *Every faucet has a sink:* yes, above. *No reason to grind:* the Shaped's purse and the finite materials; an hour of fighting the same Shaped pays under 150 marks, and none of the materials (tests pin it in `tests/economy.test.js`). *Each upgrade changes play:* I, III and V add a move, the infusion or the art, II and IV are weight, so none follows another as numbers twice running; `tests/economy.test.js` pins that. Smells: *treadmill* and *loot spam* clear (nothing is rolled; the Shaped leave marks, not items); *shop sells power the world should give* clear (the traders sell only healing and short buffs, never weapons or tiers, and the stock that matters comes from quests).
- **Tests:** `tests/economy.test.js` (inventory, consumables, trade, forge, death, purse, rewards), `tests/economyData.test.js` (the faucet targets, the materials, the traders against the quest data, back-pay), `tests/weapons.test.js` (forged weapons in play), `tests/save.test.js` (v2 to v3, the codec, validation).
- **NOT ASSESSED:** how it feels in a human's hands (the 0.6 s use in a real fight, whether tea and tonic are chosen or ignored, whether the flask makes the salve redundant); the right prices (they are one set of numbers, from the targets, not telemetry); whether a purse of 10 feels stingy or generous to a player who fights a lot; the drink pose (the weapon rides with the hand at the lips; no flask mesh); the mantle slot (saved as `mantle: null`, no mantles exist yet); robes are not sold and no dyes exist; maps of unexplored regions (§11.4) are not built; the dune traders (glass, sand-cores) belong to Phase 9; a live load of a real v2 save in the browser (the migration and back-pay are unit-tested and the back-pay path ran on a live quest state, not a real v2 file); the nooks' marks (waiting for the Remembrance branch); the weapon meshes do not change by tier (only the trail does); the dev overlay's live edits do not reach a forged tier's def (tier 0 only); `npm run alloc` for the new systems (the harness fails on the controller as before; the economy and weapon updates use no closures, strings or arrays per frame by inspection); the new pages on a phone or a narrow window.

## 12. Decisions

**Answered (user, 2026-10-24):**
- build Flow;
- the Long Walker as "bring it home";
- the Remembrance page: yes;
- a nook pass on frost and meadow: yes;
- **weapons, upgrades, currency, trade and consumables** (§11), with elements as secondary powers;
- new mechanics are welcome where they make the game more fun.

**Defaults chosen by me** (revisit any of them):
- the control layout (§11.1);
- six weapon families;
- the marks currency;
- dropped-marks death;
- health threads;
- robes as armour;
- no experience levels.

## 13. Build order

1. **Flow** (with the combat feel pass).
2. **Weapons and the new controls:** the staff first, then one weapon per family.
3. **Inventory, consumables and the trade screen;** marks drops; the Hearn trader and forge.
4. **The forge and upgrades,** infusion, health threads, robes as armour, save v3.
5. **The Remembrance page and the living reaction table.**
6. **The nook pass** on frost and meadow.
7. Then Phase 9, with weapons and Flow in place: the dunes get the glass blade, the caravan trader and smith, and dune materials.
