# The Glass Dunes — puzzle quests and ravines (design, 2026-10-26)

**User direction (2026-10-26):** *"Come up with something more different than the frost; it's very similar. Make the dune more puzzle-based, and add ravines into the design spec, outlining graphically what our expectations are."*

This file **replaces the quest list in `plan.md` D11** (main quests, side quests and robes) and **expands the ravines in `plan.md` D0** into a spec. The camp, the NPC roles, shrines, Echoes and save notes in D11 still stand. The Long Walker stays as `docs/gameplay-design.md` §5.1, with one added beat at the end (§3.4 below).

Figures (sources: `docs/phase-9/figures/*.svg`; rebuild with `node tools/world/dunesMap.mjs` and `node tools/world/renderFigures.mjs`):

| Figure | What it shows |
|---|---|
| `figures/erg-plan.png` | The erg over the seed-1 bake: ravines, camp, instruments, rift, glass track, side sites |
| `figures/quest-shape.png` | The frost's quest shape against the dunes' |
| `figures/sand-grammar.png` | The puzzle rules every dune puzzle is built from |
| `figures/instruments.png` | The three instrument sites, laid out |
| `figures/ravine-sections.png` | The four ravine types in section, with dimensions and the Wraith for scale |
| `figures/ravine-features.png` | What fills each ravine type: the look and play we expect |

---

## 1. Why the old plan felt like the frost

The old D11 list put the dunes through the frost's steps under new names:

| Frost (built) | Old dune plan | Same shape |
|---|---|---|
| A Trail in the Snow: follow footprints, a child on the ice, lead him home | The Dry Stair: follow sled tracks to a lost scout; Lost in the Storm: find the mapmaker's child | follow tracks, rescue, escort |
| The Shapers' Run: nine gates, three medal times | Sled run: a runner course with medals | a timed race |
| Carry the Flame: a lantern that gutters if you hurry | Lost in the Storm: a lantern the storm gutters | carry a fragile light |
| Echoes of the Shapers: find stones, give each its gesture | The Glass Garden: find five formations | find N things |
| Pilgrims' Fire, Watching Stone: go there, kill the hounds, talk | The Choked Well: go, learn, go | go, fight, talk |

The frost's verbs are mostly **go, fight, talk, race and carry**, on one line. A second biome built on the same verbs reads as a reskin (smell: *Fetch in disguise*, *Reskinned* at the quest level).

## 2. What makes the dunes different

| | Frost | Dunes |
|---|---|---|
| Core activity | fighting and racing | **reading and changing the land**: puzzles made of sand, light and sound |
| Quest shape | one line, in order | **a hub**: three instruments in any order, then the Walker (`figures/quest-shape.png`) |
| Main-quest steps that are a fight | 4 of 15 | **0**. Shaped are pressure *inside* puzzles, not the goal |
| Guidance | the compass and footprints | the compass to the *site*, never to the answer; the answer is read in the place |
| Time of day | mood only | **part of the puzzle**: shadow keeps frost, noon makes mirages, the sun throws beams |
| The release | the snow falls | the Walker is *brought home*, and the wadis run, which opens new puzzles |

**Pillars:** 5 (*learn by reading*) first, then 2 (*the world answers*) and 1 (*moving is the joy*: the puzzles are solved at speed on sand). **Loop layer:** the 5–15 minute site.

## 3. The sand grammar (the rules every puzzle is built from)

Every dune puzzle is made from these rules and nothing else, plus at most one Shaper object per site (a mirror-stone, a sluice). A rule learned at one site works at every other site, and in combat. See `figures/sand-grammar.png`.

| # | Rule | What the player does | What the game must simulate |
|---|---|---|---|
| G1 | **Sand flows.** A face steeper than 34° (the angle of repose) slides when disturbed, and flowing sand fills the lowest place first. | Trigger a slip face by stepping on its lip, striking it, surfing off it, or with Gust or Shard. | D2's relaxation pass: real mass moves and settles. |
| G2 | **Sand goes where the channel is cut.** | **Sweep** ploughs a channel. Sand that flows takes the channel. | Sweep's depression and berm on sand, which already write terrain state. |
| G3 | **Frost holds sand.** Frozen sand doesn't flow, bears weight and can stand vertical. **A frozen sandfall is a pillar you can climb.** | **Crystallize** a face, a breach or a falling stream. | The `frozen` channel stops relaxation. A frozen sandfall becomes a temporary climbable column. |
| G4 | **The sun thaws, shade keeps.** Frozen sand thaws in about 60 s in sun and lasts in shade. | Read the shadows. Freeze what is in shade, or work fast in sun. | Thaw rate from the sun-shadow term already in the renderer, read on the CPU from the sun direction and the canyon depth. |
| G5 | **Wet sand stands.** Wet sand holds a 60° face and is fast to surf, until it dries. | **Ribbon** lays water. | The `wetness` channel raises the angle of repose. |
| G6 | **Light travels.** Sunbeams enter through gaps, reflect off mirror-stones and glass, and light glyphs. **Ice bends a beam, and the beam melts that ice.** | Turn mirror-stones by striking them. Crystallize an ice lens in a basin. | One CPU ray, at most 6 bounces, per site. The beam is a cheap additive mesh. |
| G7 | **Sand sings.** A large slip face booms when it avalanches; bigger dunes are lower. **A frozen face is silent.** | Trigger faces in order. Freeze one to silence it. | The avalanche size from G1 chooses a procedural boom (D3's "singing sand" synth). |
| G8 | **Stone moves ground** (lent at the Walker's waking, mastered at its release). | Ridge raises walls and dams; Shard strikes from range; Bloom digs pits. | D4. |
| G9 | **Wind strips** (Gale, optional). | Gust strips sand off things and triggers faces from range; Vortex digs pits. | Already built. |

**Element rule:** every main-quest puzzle before the waking can be solved with **Frost only** (G1–G7). Gale (G9) is always a faster second solution, never the only one. After the waking, puzzles may need Stone (G8). This keeps `docs/cross-biome.md`'s rule that the critical path needs only Frost plus the biome's element.

## 4. The main quests

### 4.1 Into the Erg (two entries, one lesson each)

The player arrives one of two ways. Each entry teaches one rule of the grammar, and the camp teaches the other.

- **From the meadow, down the Dry Stair.** The stair's lower flights vanish under a slip face (G1). Walking onto it starts it sliding. Two solutions:
  - freeze a line of steps across it with Crystallize (G3) and walk the frozen line;
  - or wet it with Ribbon (G5) so it holds while it is crossed, before it dries;
  - or start the slide on purpose from the ledge above: the sand pours into the canyon below and clears the stair.
- **From the frost, across the cold erg.** Quicksand pans block the way to the camp. Freeze a path across (G3), or go round by the long way.
- **At Wellhouse.** The camp's sand-sled is buried to the runners. Sarai the well-keeper asks for it to be freed: Sweep a channel beside it (G2) and trigger the lip above, so the sand flows away down the channel instead of over the sled.

### 4.2 The Silent Instruments (the hub)

**Hook:** Sarai says the well followed the Walker, and the Walker followed the Shapers' instruments: "a light, a clock and a song". Nothing has sounded in an age.

**Structure:** three sites in any order. The compass points at each site, never at an answer. Each site follows *teach, combine, twist* in 5–10 minutes. Solving one:
- lights a third of the glass track across the erg (the footprints glow at dusk from then on);
- writes its rule into Remembrance;
- and changes the camp: someone moves, or something is built from the news.

Layouts are in `figures/instruments.png`.

#### A. The Sun Gate (a side gallery of the Red Galleries canyon; light, G6, G3, G4)

A Shaper gate with a glass eye, high in a canyon wall. A sunbeam enters through a notch in the rim: the east notch in the morning, the west arch in the afternoon. At night the gate sleeps, and the journal says so.

1. **Teach.** One mirror-stone. Striking it turns it 45°. The beam lands on a glyph and opens a ledge door.
2. **Combine.** The beam must go round a corner. Crystallize the still water in a Shaper basin into an **ice lens**, which bends the beam. The beam melts the lens in about 20 s, so turn the second mirror-stone before it melts.
3. **Twist.** A sandfall pours from the rim across the gate's eye. Crystallize the sandfall into a column (G3), then strike the frozen column to shatter it. The eye is clear for about 60 s while the fall re-forms (Gust holds it open longer).

**Payoff:** the gate opens and its beam continues out of the canyon mouth across the erg. At that hour every day afterwards, it points at the Walker: a landmark the player made.

**Remembrance:** "Ice bends the sun. The sun takes the ice back."

#### B. The Hourglass (the Needle slot canyon; sand flow, G1, G2, G3)

A Shaper sand-clock carved into the slot canyon. A rim dune spills sand into its top bowl without end; Shaper-moved sand is the only sand still moving in the stilled erg. Three tiers of bowls are joined by chutes with sluices. A **counterweight cradle** at the bottom lifts the canyon's stone door, the Needle's Eye.

1. **Teach.** Open the first sluice by striking it. The sand pours into the cradle, but a breach in the chute spills it out. Crystallize the breach (G3).
2. **Combine.** The middle bowl splits its flow left and right. Sweep a channel in the bowl floor (G2) to send it all to the right chute.
3. **Twist.** The left cradle is the door's *other* counterweight. Sand that reaches it pulls the door shut again. Freeze the left chute closed, and in sun it thaws in 60 s (G4). Fill the right cradle within that window, or wait for the canyon's shadow to reach the left chute.
4. **Pressure:** Skitters burrow in the bowls, and their bulges spill sand the wrong way. Crystallizing a bowl stops them burrowing. The same verb serves the puzzle and the fight.

**Reset:** leaving the Needle opens the cradles' drains, so nothing is ever stuck. The chute flow is surfable: riding the pour down is the quick way out.

**Remembrance:** "Sand goes where the channel is cut. Frozen sand does not flow."

#### C. The Singing Dunes (three star dunes east of the Walker; sound, G1, G7, G3)

Three star dunes boom at three pitches when their faces slide: low, middle and high. A ring of resonance stones stands where they meet. Touching it hums a phrase, which is also cut into the stones as glyphs, so it can be read as well as heard.

1. **Teach.** One dune, one boom: the ring answers with one note of light.
2. **Combine.** Play the phrase, low, high, middle. Each boom lasts about 6 s, and the next must start before it fades. The dunes are about 150 m apart, so the way to do it is to surf off one crest, ride the avalanche down and carry the speed to the next crest. *Moving is the joy.*
3. **Twist.** The middle dune is overloaded. When the low dune booms, the middle one slides in sympathy, out of order. Freeze the middle dune's face first (G3: a frozen face is silent). When its turn comes, strike the frozen crust to release it.
4. **Pressure:** a Whirler patrols the ring, and its dust devils set off faces at random. Read its path, or bind it first.

**Payoff:** the phrase is the Walker's song. Striking a glyph pillar on the Walker's back plays part of it, which is why the pillars steer it (§5.1, step 6).

**Mastery:** play the phrase in one unbroken surf, without touching flat ground, for the **Sand-runner's robe**. This replaces the old sled-run medals.

**Remembrance:** "A frozen face does not sing."

### 4.3 Follow the Glass

The lit track leads to the star megadune: the Long Walker, `docs/gameplay-design.md` §5.1. The instruments' lessons are its tools:
- frost-binding sand to stumble a leg (the Hourglass);
- the song that steers it (the Singing Dunes);
- light at the end (the Sun Gate, §4.4).

The route home crosses the plan's rift, the Stride. Steer the Walker round its north end, through the cold erg, or its south end, across the wadis (`figures/erg-plan.png`).

### 4.4 The Well Rises (the release)

The Walker kneels at the camp's dry well, but it lies down only when the well's glass eye is lit. Two mirror-stones on its caravanserai roof throw the evening sun into the shaft: the Sun Gate's lesson, played on a moving body at sunset.

Then:
- the Walker becomes a dune range round the oasis;
- the wind returns and the crests stream;
- the well fills;
- **the wadis run at dusk**, which opens the Flood Garden (§5).

## 5. Side sites (each a puzzle, never an errand)

| # | Site | Who | Puzzle | Rules | Needs | Reward |
|---|---|---|---|---|---|---|
| 1 | **The Mirage Map** (the salt pan) | Nadra, the mapmaker | Her map marks a cistern "that isn't there". At noon, the heat shimmer (D5) shows its dome as a mirage from two Shaper vantage cairns. The mirage lies *along* the line of sight, not at its end. Mark both bearings (the map draws them), then uncover the cistern where they cross with Sweep and an avalanche. | reading, G1, G2 | Frost | A shrine-water refill point; marks; Nadra's map layer |
| 2 | **The Frozen Falls** (the hoodoo field at the canyon's south end) | Pell, Nadra's child | Pell wants to see the "sky window" on the tallest hoodoo. Sandfalls pour off the rim between the hoodoos. Freeze them into columns to climb (G3), but the ones in sun thaw in 60 s (G4). Plan a route through the shade, or come at the hour when the shadows line up. Ridge steps are a second route once Stone is known. | G3, G4, glide | Frost | An Echo; later, Pell's kite flies from the window (a visible consequence) |
| 3 | **The Glass Battle** (the glass fields) | Iven, the glass-reader | Five fused-glass formations are frozen moments of an old fight. Iven reads each in one line ("the splash came from the east, and froze before it fell"). Stand where the blow came from and replay its element. The glass rings and shows the moment (an Echo-style vision). Formations 1–3 need Frost, formation 4 needs Stone, and formation 5 accepts any element. | reading, G3, G8 | Frost, then Stone (after the waking) | The **Glass-reader's mantle** robe |
| 4 | **The Buried Door** (the Sunken Temple's dome) | Sarai | The temple door, its light vent and its stair are buried. Every Ridge pushes sand somewhere. Clear them in the wrong order and the vent is buried again (G1, G8). Three clears, one right order, with the state readable on the sand. | G1, G8, G9 | Stone | Opens the entrance hall (the cave in Phase 13) |
| 5 | **The Flood Garden** (a terraced side canyon of the Galleries) | Sarai, after the release | The restored wadi floods the slot at dusk for about 90 s. Route the water with Ridge dams, Sweep channels and a Crystallize ice dam to fill the Veiled's four garden cisterns before it drains. Channels cut in dry sand slump; wet them first with Ribbon so they hold. | G2, G3, G5, G8, water | Stone, after the release | The camp's garden blooms (visible); the oasis trader's stock grows |

**Cross-biome locks** (`docs/cross-biome.md` §2) stay as listed there. The quicksand pans are now also the Frost path of §4.1, and the dry aqueduct (Tide) feeds the Flood Garden's upper cistern.

**Cut from the old plan:**
- the sled run, a frost Shapers' Run clone (its robe moved to the Singing Dunes mastery);
- Lost in the Storm, a Tobin plus Carry the Flame clone;
- The Glass Garden, which became the Sun Gate and the Glass Battle;
- The Choked Well, which became the hub's hook.

**People** (names checked against `data/`, so none clash):
- Sarai, the well-keeper;
- Hesper, the caravan master and the oasis trader;
- Iven, the glass-reader;
- Nadra, the mapmaker;
- Pell, Nadra's child;
- the two continuity pilgrims from D11, chosen from existing Hearn and frost NPCs at build time.

## 6. Puzzle design rules (check every site against these)

1. **Systemic first.** Every site is built from the grammar (§3) plus at most one Shaper object. If a site needs a new rule, add it to the grammar and use it in two places, or cut it.
2. **Teach, combine, twist** inside each site. The first beat can't be failed.
3. **The state is visible.** Sand levels, beams, frost crust, thaw (the crust darkens as it goes) and the glyphs that are lit all show in the world. Nothing important is only in the HUD.
4. **More than one solution** where the elements allow. Frost always works; Gale and Stone are shortcuts.
5. **No irreversible failure.** Shaper sand never stops pouring and cradles drain, so every site resets by leaving it or by waiting.
6. **Hints stay diegetic:**
   - the NPC's one line;
   - glyph panels showing the solved state;
   - Remembrance lines.
   After 5 minutes on site without progress, the site's rule appears as a recalled Remembrance line (it can be turned off in settings).
7. **Time of day is a tool, not a wall.** A puzzle that needs an hour says so in the journal. **Shrines get "wait until": morning, noon, dusk or night** (new; needed by A, B, 1 and 2).
8. **Bot-testable.** Each site's logic is a pure state machine in `src/game/puzzles/<site>.js`, with vitest tests and a solver script `tools/bot/puzzle-<site>.mjs` that plays it from the site's entry. The bot also logs time-to-solve and false moves.

## 7. Ravines — the spec

The user asked for ravines in the erg (2026-10-24). The erg is not only dunes: ravines give it height, shade, cover and routes, and in the dunes they are where most puzzles live, **because shade is a puzzle rule (G4)**. See `figures/ravine-sections.png`, `figures/ravine-features.png` and `figures/erg-plan.png`.

### 7.1 Four types

| | The Red Galleries (canyon) | The Needle (slot canyons) | The Dry Braids (wadis) | The Stride (the rift) |
|---|---|---|---|---|
| **Where** | along the escarpment foot, x ≈ 1470–1540, z −50 to 1380, with three side galleries | branches off the Galleries' east wall, 250–350 m long | from the escarpment east across the basin, z ≈ 160–360 | one crack, (2120, 1480) to (2380, 300), between the Walker and the camp |
| **Section** | 40–120 m floor, 30–80 m walls in steps (ledges every 8–15 m) | 2–6 m wide, 20–40 m deep, walls curved and undercut | 30–150 m wide, 3–8 m deep, braided channels round gravel bars | 15–40 m wide, about 60 m deep, sheer, with no floor reachable on foot |
| **Plan** | winding, with alcoves, arches and hoodoos at the south end | sinuous; it narrows and widens; light shafts at bends | braided, splitting and joining, with cut banks on the outer bends | nearly straight, with a jagged edge; fallen spans and two land bridges |
| **Material** | sandstone in red-ochre and cream strata; sand floor with drift ramps | smooth, wind-polished banded sandstone | gravel, cracked mud, pale sand bars | dark bedrock under the sandstone; glass where the Walker's step split it |
| **Play** | the Sun Gate, the Flood Garden, the Frozen Falls; shade keeps frost; a natural route north–south | the Hourglass; a sand-surf run through the slot (walls are collision, the floor is sand); flash-flood lore | the restored wadis run at dusk (the Flood Garden); fast flat surf lines; the aqueduct follows one | a barrier the Walker must be steered round; glide crossings; Ridge or ice bridges once known |
| **Ways in and out** | Shaper stairs, drift ramps, sandfalls frozen into columns | from the Galleries' floor, or a drop from the rim | open, from anywhere | glide; two land bridges; fallen spans |
| **Restored** | sandfalls stream from the rims and catch light | a thin stream on the floor at dusk | water at dusk, flowers after | wind moans in it; dust plumes from its lip |

**Climbing:** canyon walls are not climbable. The ways up are Shaper stairs, ledges, drift ramps, frozen sandfalls and, later, Ridge. This keeps climbing special to Wardens and pillars (BRIEF §8.4) and makes "how do I get up there" a puzzle.

### 7.2 How it is built

- **The bake (`carveRavines`, D0).** The canyon, wadis and rift are carved into the 2 m macro height with a least-earthwork router, as the hill stair was. Walls are steep height steps. Strata come from the rock material's triplanar bands by height, so they line up across the canyon. CPU/GPU parity is kept because the carve is in the baked height.
- **Slot canyons are kits, not heightfield.** At 2 m resolution a heightfield can't make a 2–6 m slot with undercut walls. The bake cuts a **trench**, about 10 m wide and to the full depth. A **slot-wall kit** (`world/slotKit.js`) then places curved sandstone wall meshes inside it. They are procedural, banded and polished, and their CPU solids give collision. The floor stays terrain, so the sand on it is real state and surfable.
- **Arches, hoodoos and overhangs** are meshes from the same kit, seated on anchor patches like the ruins (D7).
- **Sandfalls** are a stream of sand particles plus a terrain-state source at the foot that piles a cone (G1). A frozen sandfall swaps to an ice-sand column mesh with a CPU solid, which can be climbed.
- **Light shafts** are god-ray cards placed at the slot bends, faded by sun angle. Their beams must agree with G6's sunbeams.
- **Shade (G4)** is the sun-visibility term already in the renderer. The CPU copy, for thaw, uses a ray against the bake height and the kit solids at 4 Hz per frozen patch.
- **Perf budget:** ravine kits at most 0.4 ms on the 3060 at 1440p. The slot interiors cull by portal (each bend is a cell).
- **The map** draws ravines as hatched rims, and the compass never points into a slot except at a goal.

### 7.3 The look we expect (photo spots `p9r-*`)

| Spot | The frame | The bar |
|---|---|---|
| `p9r-galleries-dawn` | Looking south down the canyon at dawn: banded walls, the floor in blue shade, the rim lit gold | strata read as layers, not noise; the shade is cool and not black |
| `p9r-needle-noon` | Inside the slot at noon, looking up a light shaft into floating dust, with the polished curved walls glowing orange from bounced light | the bounce light is warm; the beam has edges; the walls are smooth, not faceted |
| `p9r-braids-restored` | From the escarpment at dusk: the braided wadis carrying thin sheets of water that catch the sky | water reads as thin and braided, not a river |
| `p9r-stride-glide` | Mid-glide across the rift, looking down 60 m into darkness, the glass seams glinting | the depth reads; glass glints are pinpoint, not bloom |
| `p9r-sandfall-frozen` | A frozen sandfall column in shade beside a running one in sun | frozen and running are told apart at a glance |
| `p9r-hoodoos-dusk` | The hoodoo field at dusk with long shadows across the sand | the silhouettes are clean; the shadows are long and soft |

These spots join the D12 gate list. They are judged on the 3060 against the existing graphical style (no new style: the same palette, sky and post).

## 8. Design review (wraith-design skill)

- **Pillars:**
  - 5, *learn by reading* (the grammar, the glyphs, the mirage, the glass);
  - 2, *the world answers* (terrain state everywhere, the beam as a landmark, the camp's changes);
  - 1, *moving is the joy* (the Singing Dunes run, the chute ride, the falls).
- **Smells:**
  - Fetch in disguise: *clear*, since every step changes the land.
  - Reskinned quest: *clear*, by the table in §1.
  - Complexity over depth: *watch it*. Nine rules is the limit; each rule must be used at three sites or more. G5 (wet sand) has only two uses so far, the Dry Stair and the Flood Garden: give it a third or cut it.
  - Gate without warning: *clear*, since Frost always works before the waking.
  - Scope mismatch: *present*. Sand flow (G1) depends on D2's relaxation pass being stable. **Fallback:** puzzle sand runs on scripted volumes (a level per bowl, driven by the same rules) if real relaxation isn't ready. Decide at the end of D2.
  - Graphics without play: *clear*, since the ravines are puzzle space.
- **NOT ASSESSED:** whether the puzzles are fun to a human, the time-to-solve, whether the shade rule reads without a tutorial, and the sound phrase for players who can't hear well. The glyphs cover that last one, but they need checking. The bot measures solve times and false moves; the user plays A, B and C at the D11 checkpoint.

## 9. Build order inside Phase 9

The tech is in D0–D4. Puzzles slot in as follows:

- **D0:** carve the ravines, add the slot trench and place the sites (`figures/erg-plan.png`).
- **D2:** relaxation, with the sand-flow fallback decision.
- **D4:** Stone.
- **After D7, new D7b "Ravine kits":** slot walls, arches, hoodoos, sandfalls (running and frozen) and light shafts; the `p9r-*` shots.
- **D11 is rewritten as:**
  1. the grammar runtime (`src/game/puzzles/grammar.js`: thaw, beams, booms, the sand-flow hooks) with tests;
  2. Into the Erg;
  3. the three instruments (one Sonnet agent each, in worktrees, in parallel);
  4. the Walker hooks (§4.3–4.4);
  5. the side sites;
  6. shrines' "wait until".
