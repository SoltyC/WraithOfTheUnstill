# Cross-biome gameplay (plan, drafted 2026-10-24)

How the game plays across the continent once there is more than one element and more than one
biome: order and difficulty, what each element opens where, traversal across surfaces, reactions
everywhere, combat, restoration at borders, the story thread, and the engine work this needs.
It applies from Phase 9 on, and parts of it reach back into the frost and the meadow.

Sources: BRIEF §2.3 (the world), §2.4 (progression), §4.4 (reactions), §9.3 (traversal), §10 (combat), §11 (RPG). The decisions marked **(user)** are open.

---

## 0. Principles

1. **One Wraith, one continent.**
   - Every element is a set of verbs that work on every surface, and every surface reacts to every element (§4.4).
   - A biome *teaches* its element; it does not own it.
2. **Biomes are learnt in any order after the frost** (BRIEF §2.4: "Frost is first. After that, the player can choose. Design difficulty so that Meadow is the natural second region").
3. **A biome's critical path needs only Frost plus that biome's own element.**
   - Every other element opens *optional* content: shortcuts, secrets, Echoes, robes and side quests.
   - This is the Metroidvania layer (§2.4: "Older regions hide content that only later elements can reach").
4. **A Warden's element is caught at its waking and mastered at its release.**
   - The Bellwether already lends Gale when it wakes (final polish).
   - Each Warden fight is therefore also the tutorial for its element, played under pressure.
   - The release grants full strength, the traversal mode and the biome's Echo slots.
5. **Nothing the player learns goes stale.** Frost stays useful in the last biome, and Stone matters in the frost.

## 1. Order and difficulty

**Reachability** (from the bake; `docs/phase-9/world-map.png`):

| From | To | Way |
|---|---|---|
| Frost (start) | Meadow | the snowline south of the monastery; the North Road to Hearn |
| Frost | Dunes | the cold erg, south-east off the plateau (z ≈ 1600–2000); ~1.5 km from the frost camp |
| Meadow | Dunes | the Dry Stair escarpment (x ≈ 1000–1400) |
| Meadow | Mirefen | west, down the rivers |
| Dunes / Meadow | Ember | south, where the seif dunes blacken into ash |
| Any | Coast | the south and west shores; the final Warden is at sea |

**Order rule (proposal, user to confirm):**
- Frost first.
- Then **meadow, dunes and mire in any order**.
- **Ember** is open, but it is the hardest region (heat, the volcano), so it is late by difficulty, not by a lock.
- **Coast:** the final Warden rises only when the other five are released (story: the last of the world's motion gathers in the sea).

**Why the meadow is the natural second region:**
- It is the closest.
- The story pulls the player there: Wenna runs north to find the Wraith.
- Its villagers are the warmest welcome.
- Its fight is the gentlest, because the Bellwether doesn't chase.

The dunes are the natural third:
- harsher light and storms;
- a mobile Warden;
- Shaped that hide under the sand.

**Difficulty:**
- **World tier** = the number of Wardens released (0–5). Shaped of every biome scale with it:
  - health, damage and aggression rise about 12 % per tier;
  - behaviours unlock: flanking from tier 1, elites appear from tier 2, mixed packs at borders from tier 2.
- Each biome also has a **base tier**: frost 0, meadow 0, mire 1, dunes 1, ember 2, coast 3.
- Effective difficulty is `max(base, world tier)`. A biome visited late isn't trivial, and one visited early isn't a wall.
- **Wardens don't scale:** their fights are designed and tuned once, and they are the difficulty spikes (§10).
  - The player brings more tools to a late Warden, which is the reward for exploring.

## 2. Elements as keys

Each biome hides **2–3 locks** for elements it doesn't teach.
- The lock is visible and readable on a first visit: a sand-sealed door, an ice wall, a mire channel.
- The journal records it under "Unfinished" with a plain line: *"A door sealed with sand. The earth would have to be moved."*
- A dim compass diamond for it appears once the needed element is known.

Locks are never on the critical path (principle 3).

| Biome ↓ / element → | Frost | Gale | Stone | Tide | Ember |
|---|---|---|---|---|---|
| **Frost** | *teaches* | Updraft to the **Bell Ledge** shrine above the monastery; glide the **Long Chute** off the ranges | Ridge through the **buried cloister vault** (snow and rubble) → a robe | Draw the **frozen spring** back to life → an Echo | Melt the **ice-sealed library** under the hall (lore, the last Shaper's journal) |
| **Meadow** | freeze the **mill race** to cross to the island shrine | *teaches* | Raise the **drowned stone circle** in the lake (a Ridge of lakebed) → an Echo | Water the **burnt orchard** so it regrows that day | Burn the **Old Hedge's** briars (the elite's lair) |
| **Dunes** | Frost-bind the **quicksand pans** (a shortcut across the playa) | Gust the **sand curtains** off the colonnade; Updraft onto the star dune's ruin | *teaches* | Fill the **dry aqueduct**, and the oasis garden blooms | Fuse **glass bridges** to the Sunken Temple's upper chamber |
| **Mire** | freeze **channels** into ice roads | blow the **standing fog** off a drowned shrine | Ridge **banks** to drain a hollow | *teaches* | bake **mud crust** into stepping stones |
| **Ember** | cool **crust to obsidian** platforms over lava | an ash plume exposes a **hidden crust path** | crack the crust for a **lava-tube** entrance (a cave) | steam out a **vent** that blocks a pass | *teaches* |

The cells are proposals. Each becomes a side quest or a secret in its biome's phase, and the frost and meadow ones are retrofitted as each element ships.

## 3. Traversal across surfaces

- **Hold RMB = the traversal of the surface underfoot** (§7). The material comes from the bake's `surface` map plus the terrain state:
  - snow → **snow-surf**;
  - sand → **sand-surf**;
  - water → **water-skim** (Tide);
  - ash → **ash-skate** (Ember);
  - frozen water and ice → snow-surf on ice (low friction);
  - frost-bound sand → sand-surf, firmer and faster;
  - glass → a slippery surf (any surf mode that is known);
  - grass, rock, mud and paving → none, so the Wraith runs.
- **In the air:** glide, once Gale is known (anywhere, any biome).
- **Crossing a border mid-run:**
  - If the next surface's mode is known, the tuning and the wake **morph over about 0.5 s** (the wake type crossfades, and so does the sound).
  - If it isn't, the surf brakes out to a run with the eased exit.
  - Example: snow-surf from the cold erg onto sand continues as sand-surf only after the dunes are released.
- **Chains** (the joy of the late game):
  - Updraft → glide → land on a slip face → sand-surf → jump a crest → glide;
  - Ridge as a ramp → glide;
  - Crystallize a river → snow-surf across it.
  - Landing hands speed to whatever mode the surface allows (glide already does this for snow).
- **Travel:**
  - Shrine travel works between any rested shrines, across biomes.
  - Roads link the settlements: the North Road and the Dry Stair caravan road.
  - Long distances are fun because of the chains. There are no mounts.

## 4. Reactions everywhere

**Rules:**
- When an **element ships**, its column of the §4.4 table ships for **every surface that exists**.
- When a **surface ships**, its row ships for **every element that exists**.
- A test enforces it: `reactions.test.js` fails if a built element has a `brush: null` cell on a built surface, unless the cell is explicitly "nothing".

| | Frost | Gale | Stone (Phase 9) | Tide (10) | Ember (11) |
|---|---|---|---|---|---|
| snow | built | built | Phase 9 | 10 | 11 |
| grass | built (rime) | built | Phase 9 | 10 | 11 |
| water | built (ice) | waves: open | Phase 9 (splash only) | 10 | 11 |
| sand | **Phase 9** | **Phase 9** | Phase 9 | 10 | 11 (glass) |
| mud | 10 | 10 | 10 | 10 | 10/11 |
| ash | 11 | 11 | 11 | 11 | 11 |

**Cross-element combinations.** Keep a few per pair; each must be visible and useful. Each is an entry in `CROSS`.

| Pair | Combination | Use |
|---|---|---|
| Frost + Gale | Gust over slush → rime (built); Vortex on snow → a drift wall (open); Updraft through a Ribbon → falling droplets (open) | cover; crowd |
| Frost + Stone | **Ridge of snow, then Crystallize → an ice rampart** that doesn't slump; **a frozen Shard → an ice spear** that pierces plates | shelter from storms and breath; anti-armour |
| Gale + Stone | **Vortex through a Bloom's falling curtain → a sand-blast** that chips and blinds; Gust through a sand plume → a blinding cloud | crowd control |
| Stone + Tide | Ridge dams water (the mire's banks); Tide on sand → wet packed sand that holds a Ridge without slumping | puzzles; building |
| Stone + Ember | Ridge of sand, then Fuse → **a glass wall** (permanent) | bridges, ramps, cover |
| Frost + Tide | Surge, then Crystallize → an ice ramp | traversal |
| Gale + Ember | Gust spreads fire downwind (grass); Vortex → a fire whirl | area damage |

**Echoes** may deepen a combination (§2.4: "cross-element reactions"), at most one per biome. Phase 9's is **"Glass-wind":** a sand-blast also frosts the sand it lands on, so Shaped that are hit stay slowed.

## 5. Combat across biomes

- **Read the material:** every Shaped is made of its biome's material, and the material decides the element to use (§10).
  - The compass and journal sketches teach it; there's no damage-number UI.
- **Shaped stay in their biome.** At borders, from tier 2, **mixed packs** appear:
  - frost hounds with Sedgerunners on the snowline;
  - Skitters with ash constructs on the seif dunes.
  - The player must switch elements mid-fight with keys 1–5, and the cuffs show the choice.
- **Restored biomes are calmer.** Restoration lowers spawn rates by half, and the Shaped there are rarer and drift.
  - A small set of **"unrest" encounters** stays for the late game (elite hunts as side quests), so the world isn't empty after the release.
- The **encounter director** generalises from frost anchors: each biome gets anchors, ambient patrols and storm-driven surges (blizzard, thunderstorm, sandstorm), with a cap of 8 active (§10).

## 6. Restoration across borders

- Restoration is per biome and blended by biome weight at borders (`worldState.restoration`). Weather, grade, vegetation, Shaped and dialogue read it.
- **Neighbour effects:** a release changes what's visible over the border.
  - Restored meadow: its rivers run, and the mire's inflows run while the mire stays stilled. The player sees moving water reach still water.
  - Restored dunes: dust haze drifts over the meadow margin and the ember edge, and the scrub greens a little.
  - Restored frost: meltwater streams in the cold erg's hollows.
- **Weather at borders** blends:
  - rain becomes sleet becomes snow at the snowline;
  - a sandstorm becomes dust haze over the meadow margin;
  - mire fog creeps up the meadow's western rivers.
- **Dialogue reads every biome:**
  - Hearn's villagers talk about the erg moving again after the dunes' release;
  - the frost pilgrims hear that the meadow wind is back.
  - Barks get conditions on other biomes' restoration.

## 7. The story across biomes

- **The thread:**
  - The last Shaper's journey, told in lore fragments spread across every biome (the frost library, the Sunken Temple, the mire's drowned shrine…). In order, they explain why the world stilled and what the Wraith is.
  - The finale at the coast closes it (§2.2: the Wraith settles into the tide).
- **The pilgrimage follows the Wraith:**
  - A frost pilgrim travels to Hearn after First Snow (already the plan).
  - A Hearn traveller goes to the dune camp after the fire night.
  - Each settlement keeps one person from the last, so the Veiled become a people across the map (BRIEF: 10–20 named NPCs in the whole game).
- **Chapters run in parallel.** Each biome is a chapter file (`data/quests/<biome>.json` and `-side.json`) merged into one quest graph.
  - Quests from several biomes can be active.
  - The journal groups them by region.
  - One quest is tracked (gold on the compass); the others are dim diamonds.
- **Rumours:** each chapter's start has a far trigger, so the player hears of every region early.
  - A line from an NPC, plus a journal entry under "Rumours" with a dim compass diamond.
  - Example: the frost camp's pilgrim tells of "the caravan stuck at the dry well, east, past the cold sands."

## 8. Progression economy

- **Echoes:** 3–5 per biome, about 20 in the whole game. Each has a visible effect (§2.4).
  - Some are found in other biomes' locks (the table in §2), so revisits pay.
- **Robes:** 2–3 per biome, each earned by play, with at most one modest property.
- **No levels, no health upgrades, no loot.** Growth is elements, Echoes, robes and player skill.
- **Focus** is unchanged. Each element's verbs have their own costs, and Echoes tune them.

## 9. Engine and systems work this needs

In Phase 9 unless marked:

1. **Save v3:** unlocked and active element, per-biome restoration, world tier, dune migration time, medal times and lock states, with a v2 → v3 migration. Today elements aren't saved; Gale is re-granted from a flag.
2. **Traversal dispatch by surface** (`character/playerSystem.js`): one surf controller with per-material tuning tables and wake types, mode morphing at borders, and landing hand-off by surface.
3. **Reactions coverage test** (§4) and the Stone column brushes for snow, grass and water.
4. **World tier:**
   - `game/worldState.js` gains `tier()`;
   - Shaped archetype tuning reads `max(base, tier)`;
   - a test proves monotone scaling.
5. **Encounter director per biome:** anchors in each chapter's data, not frost POIs.
6. **Critical-path validator:**
   - quest steps declare `needs: ['gale']` when a verb is required;
   - a data test checks every main-quest step needs only Frost plus the chapter's element;
   - side quests may need anything (they show as "Unfinished" until it is known).
7. **Locks:**
   - `data/quests/<biome>.json` gets a `locks` list (`{ id, at, needs, journal, reward }`);
   - a system shows a dim compass diamond once `needs` is known and marks the lock done when its reaction fires there.
8. **Journal regions, map regions, music per biome:** the audio director gets a cue table per biome (the user's music).
9. **Border blends** for weather and restoration (mostly exist; extend them to dunes).

## 10. How we prove it

- **Bot playthroughs in two orders:**
  - a "dunes second" save (frost released only) finishes the dunes' critical path;
  - a "meadow second" save then does the dunes with Gale in hand, using the faster routes.
- Order-independence is tested, not hoped for.
- **Reactions matrix screenshots:** one spot per built cell (`xr-<surface>-<element>`), with a contact sheet per phase.
- **Unit tests:** reactions coverage, the critical-path validator, world-tier scaling and save v3 round-trip.

## Decisions for the user

1. **Open order** after the frost (meadow, dunes, mire any order; ember late by difficulty; coast last), recommended; or a fixed chain.
2. **Elements lent at the waking** of each Warden (as the Bellwether does now), recommended.
3. **World tier scaling** of the Shaped (not the Wardens) by the number of releases, recommended.
4. **Revisit locks:** the table in §2, 2–3 per biome. Approve the idea, then the cells per phase.
