# Direction: one game, not five (drafted 2026-11-22)

This is written after the user's playtest on the RX 9070. The user's words: *"it feels very disconnected… our game lacks an identity like Elden Ring… apart from the frost biome, the gameplay is not very good."* They also reported:
- the meadow's fire night is buggy, the cloth looks horrendous (it seems to update about once a second), and characters and story there are bugged;
- the rest of the meadow is beautiful, but the player is hardly sent into it;
- in the desert the player had no idea what to do;
- the dive into Ebbhold explained itself, but the hall of names in the middle was confusing, with far too many names;
- the gameplay doesn't hang together.

The new performance target is a **steady 90 fps on the RX 9070**. Low at 60 fps on the i5-1235U still applies.

The review followed `.claude/skills/wraith-design`. Wherever something was read from code and docs rather than played, it is marked **NOT ASSESSED**.

---

## 1. Why the frost works and the rest doesn't

**The frost runs one loop, and it's clean:**
1. **See:** the Warden's ground is visible from the camp. Varo watches it, and every person points at it.
2. **Learn small:** *The Watching Stone* has the player climb a **seedling pillar** and break its crystal. That is the Warden fight in miniature, taught before it's tested.
3. **Ride:** the Shapers' Run turns the walk to the camp into a surf.
4. **Release:** the snow falls, the camp changes and the bell rings.

Every frost quest feeds that one goal. Nothing in it is a different genre.

**Each later biome switched to a new game:**

| Biome | What the player is actually doing | The problem |
|---|---|---|
| **Frost** | fight, surf, climb, release | Works. This is the template. |
| **Meadow** | an escort, then fire triage and a child rescue in a burning village, then a 200 m climb up the stair, then a siege boss | The main path is **road → village → stair → manor**. The forest, the lake, the Ring of Nine and the Western Edge (the beautiful parts) are reached only through optional side quests given in Hearn. The fire night is a one-off genre (firefighting) that never comes back. It is the player's first impression of the meadow, and it is the buggiest part of the game. |
| **Dunes** | a hub of three quests (*A Light*, *A Clock*, *A Song*), each a single step: "Find the X", with puzzles built on rules G1–G7 (angle of repose, shade keeps frost, sand sings, mirrors…) | The rules are never taught on their own before they are tested. The three instruments don't visibly point at one goal, and the Walker (the one thing that would explain the biome) is buried until the end. The player meets three riddles with no question. |
| **Ebbhold** | a dive (works), a stealth city, then the **register**: 20 named Drowned, matched by reading lines about robe dye and patrol position; a wrong name makes them cry out | The register is a memory test of a census. It hides the story's point: that naming someone is an act with weight. Twenty strangers have no weight. |

**On top of every biome sit layered systems:**
- six weapon families, a five-tier forge, infusion, six consumables, marks, three materials;
- Flow, robes, Echoes, Remembrance;
- 39 nooks and four ring or medal courses.

Each one was reasoned on its own. Together they are the smell *complexity over depth*: none of them is the reason to go anywhere, and most of them don't touch the Warden loop.

**What Elden Ring does, in the terms that matter here:**
- One loop, repeated everywhere: see something on the horizon, ride to it, overcome it, come out stronger.
- The *situation* changes from region to region; the *game* doesn't.
- Travel feels short because the horizon always shows the next thing, and the space between is dense.
- Graces point the way.
- We already wrote this rule ourselves (`gameplay-design.md` §2, Halo): **vary the situation, not the verbs.** The later biomes broke it.

---

## 2. The identity

> **The Wraith is the world's last motion. Every Warden is something holding the land still, and the people living around it each know a piece of why. You see it from far off, piece it together from the land and the people, ride to it when you think you're ready, and release it. Then the land you set moving carries you to the next one.**

**Revised after the user's reply (2026-11-22).** The user's words: *"We don't want to have a game which completely tells the player what to do… but we also don't want something that's completely impossible for the player to figure out… every action that the player completes is for a purpose… like the characters are actually existing."*

So the game is neither a checklist nor a riddle. It is a **hybrid**: the *goal* is always visible, the *way* is found, and every step answers a question someone in the world actually has.

### 2.1 Purpose: every action answers someone's want

- **Every main-path action does something a person in the world cares about.** You don't open a vent because the journal says so. You open it because Orm's well has been choked since the Bellwether stilled, and the well comes back when you do.
- **Every action also moves the Warden problem forward.** The same act that helps a person teaches you, or weakens, or reveals, part of the Warden.
- **The test (new, for every quest step):** can the player say, in the world's own terms, *who* this is for and *what* it changes? If they can't, the step is cut or rewritten.

### 2.2 Guidance: the goal is shown, the way is found

The player is never told the answer, and they are never left without a thread to pull. Guidance comes in layers. Each layer only appears if the one before it wasn't enough:

| Layer | What the player gets | Example (meadow) |
|---|---|---|
| **1. The world shows** | the Warden on the horizon; a tableau that asks "what happened here?"; the material tells the truth | the manor's chimneys smoke turf; the lake shore is choked with the same turf |
| **2. People know pieces** | each person knows one part, from their own life, in their own words, and only when it matters to them. Nobody knows the whole answer | Orm: *"The old wells all ran to the hill. Mine stopped the night the bell did."* |
| **3. The Wraith remembers** | Remembrance records what the player has *seen*, never a task | *"The turf on the chimney shook when the wind hit it."* |
| **4. Someone notices you're stuck** | only after real time stuck in a place: a person who would plausibly be there says one more piece. Never the answer itself | Wenna, at the chimney after a few minutes: *"The wind moved it. Not enough wind, maybe."* |

- **The compass points to people and places, never to answers** (already the rule). A place appears on it only once someone has told you about it, or you've seen it.
- **Nothing is required in a fixed order.** The pieces can be gathered in any order, and the Warden can be attempted at any time. Going early is harder but possible: the reward for understanding is an easier fight, not a key.

### 2.3 People who exist

The characters don't wait at their posts for the player:
- **They have days.** A routine by time of day: Orm at his well at dawn, at the forge at noon, at the hall at night. Where they are is part of what you learn.
- **They have wants of their own,** and those wants sometimes conflict. Corin wants his brother found; Hild wants the stair kept shut until the village is safe.
- **They act without you.** Wenna sets off for the dunes after the meadow's release whether or not you follow. You may find her there in trouble, or settled, depending on when you arrive.
- **They remember.** What you did (who you helped first, what you left burning, who you named) changes what they say and where they go. Delayed and visible, per the quest template.
- **They travel.** The same few people across the continent, not a new cast per biome.

### 2.4 Rules for every biome

1. **The Warden is the landmark.** It can be seen from where the player enters the biome and from most of the biome. It is the biome's global landmark (§6), not a reveal at the end.
2. **The Warden is understood, not unlocked.** Its fight has 3–4 things to understand. Each one is held by a place and a person somewhere in the biome, usually in its most beautiful parts. The player gathers them in any order, by exploring and listening. Each one has an action that helps that person *and* rehearses the Warden in small (frost's seedling pillar is the model).
3. **No one-off genres on the main path.** Firefighting, matching names and hidden-rule puzzles can live as side content, or as a short scene, but the main path is the loop.
4. **Each release opens a line of motion toward the next biome.** The land the player set moving carries them on:
   - frost meltwater becomes a river to ride south;
   - the meadow's wind becomes the Wind Road, gliding to the Dry Stair;
   - the dunes' wadis run, and their flood is a surf line down to the fen.

   This is the connected feeling: the world moves *because of you*, toward the next thing.
5. **One person travels with the story.** Wenna, who ran north to find the Wraith, appears again at the dune camp and the fen jetty. That gives one face across the game instead of a new cast in every biome (the BRIEF budget is 10–20 named NPCs in the whole game).

---

### 2.5 The story

The story, and the player's choices that change it, are in **`docs/storyline.md`**. Every Warden holds a disaster with people alive inside it. Each chapter has one great choice, made by an act in the world. The state those choices write decides who lives, where people go and which endings are open.

## 3. The plan, by milestone

Each milestone ends with a build the user plays. Nothing is called done until the user has played it.

### M0: Fix what's broken, and measure 90 fps (first)

1. **NPC cloth.**
   - **Cause (read from `src/systems/npcs.js`):**
     - only the 2 figures nearest the camera simulate every frame;
     - every other figure shares `BUDGET = 3` updates a frame, with one coarse step of up to 1/40 s;
     - the fire night has about 22 figures, so a background robe waits many frames, and when the frame rate dips under the fires and lights the waits stretch further.

     That matches "updates once a second".
   - **Fix:**
     - simulate every figure within 40 m at a fixed 30 Hz, with the drawn pose interpolated between steps so it never stutters;
     - raise the budget to whatever fits the 9070's frame (measure it);
     - beyond 40 m, freeze the cloth into a wind-swayed pose in the vertex shader rather than stepping it rarely;
     - if the CPU can't carry it, move the crowd's cloth to a compute pass.
   - **Measure:** cloth update rate per figure, and the frame time in the burning village.
   - **Done (2026-11-22): GPU cloth for every Veiled.**
     - **Built:**
       - `character/wraith/clothGpu.js`: the topology, coloured into 14 sets, and each figure's per-frame job;
       - `shaders/clothSolve.wgsl.js`: one workgroup per figure, the same Verlet as `cloth.js`, then the packing;
       - `render/clothGpu.js`: one shared output buffer that every Veiled's cloth, fur and shadow materials read, offset by slot.
     - **Behaviour:**
       - every shown figure steps every frame, with substeps that cover the frame's real time;
       - the CPU now runs only the gait, body, colliders and pins: 0.027 ms a figure, down from about 0.6 ms;
       - the player's robe stays on the CPU.
     - **Parity:** `tools/cloth/gpu-mirror.mjs` mirrors the shader in JavaScript. Over 600 frames it matches the CPU cloth by a mean of 0.7–1.6 cm, with the same stretch.
     - **Measured** at the fire night (`p8-fire-night`, 22 robes, Windows Chrome headless at 2538×1286, render scale 0.8):
       - 132 fps presented (p95 8.4 ms);
       - GPU 7.11 ms, against 6.83 ms with the dispatch off, so the robes cost 0.3 ms;
       - 0 GPU errors;
       - a hem particle moves every frame.
     - **Evidence:**
       - clip `screenshots/m0/m0-gpu-cloth.mp4`;
       - shots `screenshots/bot/m0-cloth-a.png` and `m0-cloth-b.png`;
       - test `tests/clothGpu.test.js`.
     - **Not assessed:**
       - how it looks to the user in play;
       - the Drowned and the cutscene figures (they share the path, but weren't filmed);
       - the Low preset on the laptop.
     - **Fixed:** the player's own robe took `round(dt / (1/120))` substeps, so at 90 fps it ran at 3/4 speed. Its substeps now cover the frame, with time-corrected Verlet.
2. **The fire night bug list.**
   - **Done (2026-11-22): the bot played the night** from Wenna's road through Ebb, the fires and Hild (`tools/bot/to-village.sh`, `fire-quest.mjs`). Ebb was rescued, all 15 fires were put out with none lost, the stair opened, and frame rates stayed at 108–131 fps.
   - **Fixed:**
     - **Alder and Tamsin never came home.**
       - Nothing set `meadow:alder-found`, and neither of them existed as a person, so the Alder quest could never finish. After the release, Hild still asked the Wraith to find them.
       - They are now people, hidden until the Bellwether is released, then slumped against the forecourt's dry fountain on the stair side.
       - Spoken to, they are found. Once out of sight, they go home: Alder beside Corin, Tamsin at Hild's door.
       - Hild, Corin and Wenna have new lines and barks for after the release and for when the two are home. Corin's lines also open his quest and his shop if the player never met him.
       - The Bellwether fight itself is unchanged.
     - **Names shared between characters:**
       - Hearn's Sefa is now Linnet; the Ebbhold child is Sefa.
       - The Drowned Pell, Wyn and Tamsin are now Abel, Lark and Edda.
       - The Ember doc's Bram is now Aled.
       - A test now fails if two people share a name.
   - **Evidence:**
     - shots `screenshots/bot/m0-captives-forecourt.png` and `m0-tamsin-home.png`;
     - 4 new tests in `tests/meadowQuest.test.js`; 1184 tests pass.
   - **Not assessed:**
     - the user's own list of what broke (the cloth was the one they named);
     - the stair climb, the encounter on it and the Bellwether fight, played straight through (the release was set by flag);
     - a save and load in the middle of the captives' thread.
   - First, the user lists which characters were broken and how.
   - The bot then plays the whole night (`tools/bot`) and logs every NPC state, every flag and every stuck figure: Wenna's lead, the raid, Marit and Ebb, Hild, Doran at the gate.
   - Fix each bug against a reproduction and a regression test.
   - **NOT ASSESSED:** I haven't reproduced the story bugs yet.
3. **A 90 fps audit on the RX 9070.**
   - **Done (2026-11-22):** `tools/bot/fps90-audit.mjs` measured 18 spots across every biome on High, with dynamic resolution off. Results are in `docs/perf/fps90-audit.json`.
     - **Every spot passes.** Presented p50 was 7.4–8.0 ms (120–133 fps), and p95 was 8.3–10.8 ms. The worst was Hearn by day (`p8-hub-golden`, p95 10.8 ms, max 12.2 ms), then the volcano vista (p95 10.0 ms).
     - **GPU median:** 5.8–7.4 ms. The forest's shafts were the highest.
     - **Errors:** 0 GPU errors anywhere.
     - **Conditions:** headless Chrome with a 2538×1286 viewport and High's render scale of 0.8.
     - **Not assessed:** native render scale 1.0 at full 1440p; a human playing (fights, surf and storms in motion); the laptop's Low preset.
   - Bench one spot in each biome: frost camp, Hearn by night with fires, Hearn by day, the forest, the lake, the erg, the Walker, the Sounding, Ebbhold.
   - Report the frame time against 11.1 ms, using the presented frame rate and not only the GPU timers (memory: the main thread binds every mesh).
   - Every later milestone keeps the 90 fps check.

### M1: The meadow, sent into its beauty

- **The fire night stays as the hook, but shorter and fixed.**
  - Keep: Wenna, the burning village and Ebb.
  - Cut it to 10 burning houses instead of 14 (user, 2026-11-22), with fewer villagers on screen (which also helps the cloth).
  - It becomes the 10-minute opening scene, not the biome's main activity.
- **The main path becomes three pieces, found in any order, each with a person behind it:**

  | Piece of the Bellwether | Where | Whose want | What the player works out |
  |---|---|---|---|
  | Its vents choke on turf | a small bell-chimney broken through the forest floor | **Corin**: his brother Alder went into the forest after the noise and hasn't come back | Alder is pinned by Shaped by the chimney. Freeing him and clearing the chimney are one act (Gust strips turf) |
  | Its body can be climbed | the drowned stone circle in the lake | **Orm**: his well stopped the night the bell did; the old water runs from the circle | raise the stones (Updraft, the Ring of Nine's lesson) and climb them; the well runs again |
  | Its valves open in order | the Western Edge, where the wind used to reach the manor | **Maud**: the weaver's loom-house up there has been silent; her apprentice is still in it | the old wind-valves open in a sequence read from the loom's pattern |

  - **Nobody hands out the list.** Each person talks about *their* problem, at the time and place they'd really be. The player connects the problem to the Warden.
  - **Each piece cleared tolls the manor's bell,** so the Warden answers the player, and the fight is easier for each piece understood. All three are optional; the fight is possible with none, but hard.
  - This sends the player into the forest, the lake and the edge **because people they've met need them there**, not because a quest marker does.
- **Wenna is the thread.** She was the one who came for the Wraith. She can be found around the meadow helping the people the player is helping. If the player is stuck at a place for a while she may be there, with one more piece of what she's seen. After the release she leaves for the dunes on her own.
- **Measure:**
  - the bot's main-path route;
  - the share of main-path time spent in the forest, lake and edge (target above 50 %; today it is close to 0);
  - the payoff interval;
  - the user's playtest.

**M1, Doran's story, done 2026-11-22** (user: Doran set the fire; scenes round the Bellwether may change, the fight stays):
- **The pieces, found, never told:** a rag soaked in lamp oil behind the stair gate, once the fires are out (`clues` in `data/quests/meadow.json`, `systems/clues.js`: look, and the Wraith takes it); Ebb, once he is safe, says the gate-man came to his door with a jar that smelled of the lamps; Doran's barks (his wrapped, wet hands; "it kills what is up there"); and at the manor, behind one of the hall's tall front windows, a girl in a kiln-worker's apron, a lamp in her hand, perfectly still: **Bryn**, his daughter, held there since she climbed to see the bell at sixteen. At night her window is the one that glows from the forecourt (`systems/doran.js`).
- **Confronted** (with the rag, or with what Ebb said), Doran confesses: he set the fires to keep the hill road empty, for her.
- **The choice:** carry the rag to Hild and **give it** (one choice, in the act of handing it over): he is cast out north; Hearn trusts the Wraith more (`word:hearn` +1); he is found at the frost shrine on the road, alive by Isolde's fire if her four braziers burn when the Wraith first comes there, dead in the snow if not. **Keep it**, or never tell: at the release he climbs to her and is lost with her. **Tell Doran about the girl at the window:** he asks for one night; release the Bellwether on a later day and he came back down and leaves with Wenna, the same day and he is lost.
- **Measured** in the browser: the rag, the confession, Hild's choice (cast out, Hearn's word, Doran walks off and is gone), Bryn at the window by day and night, and the fate at the release. `tests/doran.test.js` covers the fate rules.
- **NOT ASSESSED:** a human finding the pieces unprompted; Doran at the frost shrine seen in the game; Wenna actually travelling south with him (M3b travel is not built: he simply leaves Hearn).

**M1, the first piece: The Cold Forge, done 2026-11-22.** The plan's pieces needed Gust before the fight, but the Gale is given when the Bellwether wakes, and giving it earlier would change the fight's opening (standing rule). So the pieces teach with what the player already has. Garrow (whose forge "went cold at the first frost") asks the Wraith to clear the manor's old kiln flue: three stone vents in the forest north of the manor (`world/flue.js`, at the densest flat patch of forest there), each sealed with a dome of turf. Pulled clear by hand, the flue breathes, and far off on the hill the bell rings once. Garrow lights the forge, remembers that Bryn worked those kilns, and says the hall's chimneys are sealed the same way, too high for hands: "You would need a wind." The player has seen three turf-sealed vents before meeting the hall's three. Side quest "The Cold Forge" (40 marks, turf-amber). The architecture site table grew from 640 to 768 (the flue made 644). **NOT ASSESSED:** a human finding it; the other two pieces (the gale's shelter, the climb) are not built.

**M1, the second piece: The Wind Gap, done 2026-11-22.** Maud's apprentice Senna went to the Western Edge for her shuttles and is caught in the Wind Gap, a gully from the crest down to the sea's lip (`world/windGap.js`, seven standing stones, staggered). Until the Bellwether is released the sea wind comes up it on a cycle (`systems/windGap.js`): calm, then the air is drawn seaward (the grass laid toward the sea, dust streaming out: the telegraph), then a wall of wind up the gully that throws anyone not sheltered by a stone landward and hurts a little (the fight's own shelter test). The Bellwether's gale is the same: inhale, then the wall; only stone shelters. Senna follows the Wraith up the gap stone to stone, only in a calm and only when it is ahead of her. Maud: "That is how the bell's wind used to come… If anything ever breathes at you like that, keep stone between you and it." Side quest "The Wind Gap" (40 marks, hedge-heart). After the release the gap is calm. **Measured** (bot): thrown in the open (health 100 → 92), unmoved in a stone's lee, Senna stone to stone to the top and safe. `talkFirst` now applies after every chapter has merged (a chapter may go in front of a table merged later). **NOT ASSESSED:** a human reading the telegraph unprompted; the third piece (the climb) is not built.

**M1, the third piece: The Lake Beacon, done 2026-11-22.** Ketil, who keeps Hearn's lamps, also kept the Lake Beacon: an old column of stacked stone on the shoulder west of the lake (`world/beacon.js`), its three iron shutters stuck shut the night the bell stopped. The Bellwether's own neck climb (`game/bellwether/neckClimb.js`, now taking another tube's dimensions) climbs it (`game/beacon.js`, a still tube with the neck's surface contract): grip at its foot, W/S along, A/D round, a strike opens a shutter in reach, with the fight's own hints ("A shut shutter above you: climb (W)"). Ketil: his grandfather said the bell's neck has shutters like those, "valves… three of them, up the neck and round it. You can only strike them open from the neck itself." He lights the beacon, and it burns at night from then on. Side quest "The Lake Beacon" (40 marks, turf-amber). **Measured** (bot + test): the climb mounts and reaches a shutter (`tests/beacon.test.js`); in the browser a strike opened one. The manor stands across the lake from it. **With the three pieces the fight's three lessons are taught before it** (vents sealed with turf; the inhale and the wall, shelter behind stone; climb and strike the valves), each through a person, none changing the fight. **NOT ASSESSED:** a human doing all three unprompted; the bell answering each piece (only the flue's rings it).

### M2: The dunes, one question with three answers

- **The Walker is visible from the first sight of the erg.**
  - It walks its circuit far off, slow and huge, kicking up dust.
  - It can't be reached: it walks out of reach each time.
  - Sarai says: *"It's looking for the well, and it has forgotten the way."*

  The *goal* is clear in the first minute. *How* to bring it home is not.
- **The camp's people each hold one rule, from their own work** (no tutorial gadgets that announce themselves):
  - Nadra the mapmaker reads distances by noon shadows, and she complains her ice won't keep in the sun (shade keeps frost);
  - Pell lets kites down the slip faces and knows which ones slide (sand flows);
  - Iven reads the old glass and knows where the light was thrown from (light travels).

  Each rule can be seen at work in camp life before it matters at an instrument: Nadra's ice store in the shade of the wall, Pell's kite pulling a face down.
- **The instruments stay free in order.** Each is reachable from the start, and a player who hasn't met the right person can still work it out from the place.
- **Each instrument visibly calls the Walker:**
  - the Light throws a beam on to its path;
  - the Clock's sand pours toward the track;
  - the Song booms, and it turns.

  After each one, the Walker comes nearer and its route bends toward the Wellhouse. The player sees progress toward the one goal.
- **Cut the rules down.** Keep four of G1–G9 on the main path: flows, frost holds, light travels, and Stone after the waking. The rest (shade thaw, singing faces, wet sand) go to side sites.
- **Measure:**
  - the user's first 15 minutes on the erg ("what am I doing?" answered within a minute);
  - bot completion;
  - time to solve each site.

**M2, first pass — Done (2026-11-22): the goal said, and every instrument useful.**
- **The cause** (read from the data): Sarai never said what the erg was for, and the main quest only started once the player wandered near the footprints. The instruments' quests were one step each ("Find the X"), and only the song changed anything.
- **Sarai, after the sled,** now says it plainly:
  - the well was full while the Long Walker walked;
  - it lies buried on the great star dune, east of the Stride;
  - wake it and bring it home, and the well fills;
  - the instruments aren't needed, but each makes it listen better.

  Her lines after each instrument say what that one changed.
- **The main quest** (renamed *Bring It Home*) starts when the sled is freed, with its compass on the Walker.
- **Every instrument now helps** (`walkerSys` in `systems/longWalker.js`):
  - the light: it walks at ×0.85;
  - the clock: it kneels ×1.45 longer;
  - the song: the pillars steer ×1.4 harder (unchanged).
- **Verified:** `tools/bot/dunes-playthrough.mjs` passes end to end (camp, sled, three instruments, side sites, release, save and load). The tests are in `tests/dunesGuidance.test.js`.
- **Not done** (the rest of M2):
  - the Walker visible and walking far off from the first sight of the erg;
  - each instrument visibly calling it;
  - the camp people's lives showing the rules;
  - a human's first 15 minutes (NOT ASSESSED).

### M3: Ebbhold, names that weigh

- **6 named people, not 20.** The rest of the Drowned are unnamed and simply held.
- **Each name is found where the person lives:**
  - carved on the cradle;
  - stamped in the bread;
  - cut into the wheel beside Liese's torn Lung.

  The player learns *one person*, in their room, by reading their place (pillar 5), not a census on a stone book.
- **Naming happens at the person.** Standing with them, the name the player has learnt is offered. There is no list to choose from and no wrong-guess puzzle.
- **The twist doesn't change:**
  - the betrayal, Morrow and the planted clues stay;
  - the count of survivors now rides on six people the player knew and on the doors they left shut. That is heavier, not lighter.
- **The register stays as a place:** the book of everyone, read once, with Aldo writing the last name. It is a tableau, not a mechanic.
- **Measure:**
  - the user's understanding (asked plainly after the city);
  - the time spent in the hall;
  - the number of names said.

**M3 — Done (2026-11-22).**
- **Six can be named** (`NAMEABLE` in `game/drowned.js`), each by something kept where they work:
  - Hanne: the stamped loaves (the younger baker);
  - Teodor: the child's bed with SEFA burnt into it;
  - Ise: the broom peg;
  - Liese: the crew's board (the tallest of the crew);
  - Orla: the pail;
  - Aldo: the register's last line, still wet.
- **The other fourteen are only held.** Listening to them says nothing names them.
- **Naming:** a name once read is said at the person ("Say “Hanne”"). There's no list to carry, no wrong name and no cry. The sign then hides, so the person is in reach, and its words stay in the journal's **Names** tab (it was "Register": all 20).
- **The register** is now a tableau: thousands of names, and the last line is Aldo's.
- **Unchanged:** the twist, the record the release replays, and the survivors' count.
- **Verified in the browser:** reading Hanne's bread, then saying her name, stilled her. All four other signs stand on floors and are in reach.
- **Evidence:** `screenshots/bot/m3-say-hanne.png`; the test is in `tests/drowned.test.js`.
- **Not assessed:**
  - whether a player finds the signs without help (they're lit only by the room);
  - the planted clues against the smaller cast;
  - the release cinematic's record shots with only six possible names.

### M3b: People who exist (across all biomes)

- **Routines.** Every named person gets a day: two or three places by time of day, with something to do at each. Built on the existing NPC paths and `streetNav`.
- **Memory.** A small set of flags per person for what the Wraith did near them or for them. Barks and placement read it.
- **Travel.** Wenna (meadow → dunes → fen) and one pilgrim from the frost move between biomes on their own clock, following the releases.
- **The "stuck" layer** (§2.2 layer 4). Per place, time spent there without progress. Past a threshold, the nearest plausible person turns up or says one more piece. The bot logs when it fires.
- **Cost.** These people are cloth figures, so this depends on M0's cloth fix and the 90 fps budget.

### M4: The land carries you on (connection)

- **Release lines.** Each one works only after its release, and its direction points at the next Warden:

  | Release | What starts moving | Where it carries you |
  |---|---|---|
  | Frost | a meltwater river from the Warden's ground, a surf line on water and slush | south to the meadow |
  | Meadow | the Wind Road (built) | extended east to the lip of the Dry Stair |
  | Dunes | the wadis' flood | a surf line west and down toward the fen |
- **Sight lines.** From each release point, a camera beat shows the next Warden's landmark on the horizon: the meadow's bell tower from the frost, the Walker's dust from the meadow's edge, the Sounding's bubble column from the dunes' west rim.
- **Distances.** Measure the riding time between Warden sites. Target: under 4 minutes of riding, never dead walking. Where it's longer, add a release line or a shrine, not filler.
- **Shrines are the Graces.** Each rested shrine shows the direction of the nearest unreleased Warden as wind and motes (already built), plus a single line of text.

**M4 first pass, done 2026-11-22** (user: build the connection "now"):
- **The Melt (frost release line).** `data/world/releaseLines.json` (baked by `tools/world/releaseLines.mjs`: the cheapest way water would go on the 8 m heights, starting at the lip of the Warden's tarn) runs 1.4 km and 279 m down from the frost Warden to the foot of the Bellwether's manor hill. `systems/releaseLines.js` draws it as a steady meltwater stream (`render/wadiWater.js` with a running-stream mode: unbroken, fast ripples, white water) and makes it a current: on it the Wraith surfs whatever the ground (snow, then grass), slick, pushed downstream and held in the channel unless steering (`character/surf.js` curA). No surf trench is ploughed in it; no boulder, tree or grass stands in it. It thaws over 20 s on the release and is simply running after a load. **Measured** (bot, unsteered, surf held): head to manor foot in about 57 s at 26 m/s; frame p95 8.5 ms on High along it.
- **The East winds (meadow release line).** Two new streams (`data/restored.json`: the Manor wind off the manor's east flank, the Knoll wind halfway) with three banners carry a glide from the manor hill east to the lip of the Dry Stair, and from there down into the dunes. The course simulator flies manor → lip in 61 s restored and cannot with the meadow stilled (`tests/restored.test.js`).
- **Sight lines.** The first time the frost or the meadow is released in play, once its own scene is over, a two-shot scene shows the way that opened and the next Warden's land: from over the melt's head to the manor's hill across the whole meadow; from over the knoll to the lip, then from the lip down onto the dunes. Viewpoints were found by line of sight over the baked heights.
- **Shrines** now say which way the nearest held Warden lies: "The motes drift north-east, toward the manor on its hill." (The drifting motes themselves are not built yet.)
- **The Outflow (meadow release, west; user approved 2026-11-22).** The dunes cannot send water west (they lie below a 290 m ridge, 5 km from the Sounding), so the meadow, the hub, opens both ways: east on the winds, and west on a second line from Hearn's pond across the meadow lake, down its outflow valley (250 m of fall) and over the lagoons to the landing of the Sounding's jetty (3.6 km). Over water the current skims, Tide or not; a swimmer in it who holds the traverse is lifted onto it; a swimmer who does not is carried. **Measured** (bot, unsteered): Hearn to the jetty in about 140 s.
- **The Stair heat (dunes release).** Three lines of rising heat up the Dry Stair (`data/restored.json`, banners with the dunes' own wind) carry a glide from the Wellhouse back west to the lip and the meadow: 92 s in the simulator, not possible with the dunes stilled. Banners now take their biome from their stream.
- **Sight lines** gained the meadow's west shot (down the outflow to the sea and the jetty) and the dunes' scene (over the Wellhouse up the Stair to the meadow's rim). The dunes' cameras ride high: their moving crests and the Stair's canyon walls are not in the baked heights.
- **The loop now closes:** frost → (Melt) → manor → (east winds) → Dry Stair → dunes → (Stair heat) → back to the meadow → (Outflow) → the Sounding.
- **NOT ASSESSED:** a human riding the Melt or the Outflow; the dunes' heat flown in the game (only in the simulator); no shimmer or dust devils are drawn on it yet (banners mark it); the sight-line scenes watched in full by the user; the Listener's release is not wired into play, so a shrine counts it held until the story state says otherwise.

**M3b and M4 additions, done 2026-11-22 (batch while the user was away):**
- **The stuck layer** (`systems/stuck.js`, `data/quests/stuck.json`): a player who has spent a while at a step's goal without moving on hears one more piece from a plausible person (Senna calling from the gap, Wenna about the flue and the beacon, Sarai about the sled, the Walker and the way home). Each line once; never the answer. **Measured:** at the Wind Gap, Senna called after 50 s.
- **Travel** (`systems/travel.js`): after the Bellwether's release Wenna leaves Hearn for the Wellhouse camp in the dunes, out of sight (a day later, or once the Wraith has been in the dunes), with her own lines there; Doran goes with her if he came back down from the manor. **Measured** in the browser.
- **Routines** (`systems/villagers.js` folkBrain): after the fire night Hearn's folk keep ordinary days — errands and doorsteps by day, indoors at night (the quest givers keep their doors) — every coming and going out of the Wraith's sight. **Measured:** folk indoors at 23:00, out again at 9:00, Garrow at his door.
- **Shrine wind** (`systems/shrineWind.js`): near a shrine the Wraith has rested at, a ripple of wind runs through the grass toward the nearest held Warden. **NOT ASSESSED** by eye.
- **Tried and dropped:** dust devils over the Stair heat (the spray billows are near-invisible against pale sand) and a "the star dune stirs" scene after each instrument (the sand-dust effect only draws near the camera, so the shot showed a still ruin). Both need a proper effect first.
- **90 fps audit rerun** after the batch: all 18 spots pass on High (worst p95 10.8 ms, the forest shafts). The fire night with 10 burning houses was played through by the bot (Ebb rescued, every fire out in 129 s, 116–131 fps).

### M5: Prune what the loop doesn't use

**Recommendation (the user decides):** freeze new systems, and make the existing ones serve the Warden loop.
- **Weapons:** keep the staff, plus **one weapon per biome, found on the main path**: sickles in the meadow, the maul in the frost, the glass blade in the dunes. Move the glaive, the flail and the bell-mace to side rewards.
- **Consumables:** keep the flask and two buffs, not six.
- **Forge and marks:** keep them, but their sources are Warden steps and seedlings, not nooks.
- **Ring courses:** stay optional, unchanged.

---

## 4. The boss fights: critique only

Per the standing rule, the frost Warden and the Bellwether are **not changed** unless the user asks for that fight by name.

| Warden | Verdict | Note |
|---|---|---|
| Frost Warden | keep | The template: seen early, taught by the seedling, deliberate and grieving. |
| Bellwether | report only | Its formula (Gust the turf off the chimneys → climb → open the valves) matches the frost's (climb the pillars → break the crystals → freeze and break the seams) on target type, win condition and discovery. That fails the brief's three-axis test as a reskin. M1's seedlings make it *feel* earned without touching it. Changing the fight itself needs the user's word. |
| Long Walker | keep, re-staged | The fight is different in kind (escort and steering). M2 only changes how it is approached. |
| Listener | keep | It is different in kind (stealth and noise). It is taught three times before the fight. **NOT ASSESSED:** played by a human. |

---

## 5. Smell walk (summary)

| Smell | Status |
|---|---|
| Hollow loop | **present** (meadow sides, dunes hub, economy): fixed by seedlings and release lines |
| Complexity over depth | **present** (layered systems, dune rules G1–G9, 20 names): M2, M3, M5 |
| Gate without warning | **present** in the dunes (rules not taught before tested): M2 tutorial gadgets |
| Reskinned Warden | **present** (Bellwether vs frost): reported, not touched |
| Empty stretch | the route model says clear; **NOT ASSESSED** by a human. The user's "disconnected" suggests that between biomes it is present: M4 |
| Graphics without play | **present** in the meadow (the beautiful parts are off the main path): M1 |
| Fetch in disguise | dunes "Find the X" steps: M2 makes each a reaction with a visible effect |
| Bare core is not fun | surf, glide and frost combat: the user's playtest says yes in the frost |
| Lying telegraph, dominant strategy, no opportunity cost | NOT ASSESSED in this pass |

---

## 6. Decisions for the user

1. **The identity in §2** (revised to the hybrid: goal shown, way found, every step for someone): is this the game?
2. **Fire night bugs:** which characters were broken, and how?
3. **90 fps:** at what resolution and preset (1440p High?), and does 60 fps on Low on the laptop still stand?
4. **The Bellwether:** may it be changed, or does it stay as it is?
5. **Pruning (M5):** which weapons and consumables stay on the main path?
6. **Order:** M0 → M1 → M2 → M3 → M4 → M5, recommended. M4 could go before M2 if connection matters most.
