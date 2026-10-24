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
| **4. Quiet, but never empty.** Few people, few icons, and every place pays the player for turning toward it. | Discovery, Submission | Checklists, map-icon clearing, fetch quests, loot, levels. |
| **5. Learn by reading.** Difficulty is fixed and designed. Material and motion tell the truth about threats, and knowledge opens the world. | Challenge (competence) | Hidden scaling (user: no world tier), stat gates, lying telegraphs. |

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

## 11. Decisions for the user

1. **Flow:** build it (recommended), and prototype it on the existing game first?
2. **The Long Walker as "bring it home"** (pursue, stumble, board, steer to the well), or a more combat-heavy variant?
3. **The Remembrance page** (observations and the living reaction table)?
4. **Nook density:** add a nook pass to frost and meadow before Phase 9 starts?
