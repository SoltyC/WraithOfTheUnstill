# Manor and boss fight plan (research only)

Existing framework: `game/warden/{warden,fight,climb,spikes}.js` (Frost Warden: ShapedBody + chunk rig, 4 water joints, WARD/OPEN/FRENZY phases, barrage, climb modes LEG/BODY/PILLAR with focus drain and shaking), `systems/{wardenFight,climb,cinematic,audio}.js`, `camera/releaseCam.js`, `worldState.restoration`. PLAN M9 Bellwether is still a proposal (user open decision). The manor is built from `architecture.js` sites (blockers = oriented boxes/circles, platforms = standable tops, via `world/solids.js`); the hill must be a terrain-height feature.

## 1. Reconciling the Bellwether and the manor

**Option A (recommended): the Bellwether has grown into the manor.** Generations ago the pilgrims' founding family built a manor on a hill of standing stones. The Warden (a stilled grazer, 40 m, turf and stone) lay down on that hill to hold the meadow's wind and was never noticed to be alive. Turf and ivy overgrew it, and the manor was built against and over its back. Now the great hall is its ribcage (the bellows), the chimneys are its vents (sealed with turf and roots), and the towers are its spine ridges and horns. The "weird mythical creature" is the manor: when the Wraith arrives the roofs shift, a long neck and head lift out of the ruined west wing, and the whole building breathes in.
- Why nobody went up for decades: the stilled wind. Smoke stopped rising, bells would not ring, and anyone who climbed past the middle terrace felt breath pulled out of them (the stair runs against an inhaling draught). The family left or died, the stair went untended, and the village built its mill and market around the foot and told children not to climb. The hill's "stillness" is the Warden's hold, so the village's fire quest (everything burns, nothing carries the smoke) gets a tie-in: stilled air is why the fires cannot be fanned out or blown clear.
- Fits the fiction: it holds wind in by never exhaling; the Wraith strips the vents and opens valves; release is its first exhale, not a death.

**Option B: a separate creature.** A hollow "Hearth-Wyrm" or moth-bat colony lairs in the manor and is the boss, while the Bellwether stays out in the standing-stone ring elsewhere. Pros: simpler narrative. Cons: a second Warden-grade creature, which breaks "one Warden per biome" and doubles the cost. Not recommended.

## 2. Manor architecture

- Massing: a great hall (the ribcage, about 70 x 28 m, roof ridge about 30 m) along the main axis facing the stair. Two wings (east and west, each about 45 m), a gatehouse tower pair at the forecourt, 3 to 4 tall towers (40 to 55 m), and a chimney stack row of 6 vents on the hall roof. Overall footprint about 160 x 110 m, much larger than village houses (about 10 m). Silhouette: broken ridge line, one leaning tower, one tower collapsed to stumps.
- Run-down reads: roof sections fallen in (the hall roof is half open to the sky), missing tiles showing rafters, broken and empty windows, shutters hanging, ivy and turf on walls and roofs, scorched wing, rubble fans, tilted statues, dead lanterns, grass growing up the forecourt paving. Still readable and huge from the village, with one single faint lit window deep inside as the only warm light. Cheap to render: reuse the procedural builders with "damage" parameters (cut-away masks, rubble instances).
- Forecourt (about 90 x 60 m, paved and cracked, low walls) is the main arena; the Warden's head and neck rise from the west wing, and its body is the building mass.
- Walkable and climbable: forecourt and terrace edge (platforms), stair landings, hall interior floor (open to sky through the broken roof), wall-walks and tower tops via stairs inside, roofs (sloped platforms, limited). Climbable holds: root-bound ribs/rafters (PILLAR-style mode on tower faces, BODY mode on the neck and back). Gale Updraft takes the Wraith to rooftops.
- Collision: boxes for walls and platforms for floors and roofs; roofs sloped needs a ramp platform type or stepped boxes (small new work in solids.js).

## 3. The fight

- Approach: the long stair is the ominous climb. Wind audio and grass/banner motion fade out with height (wind-field gain tied to stair progress), draught pushes against the Wraith (small speed penalty), embers and ash hang still, music silent until the forecourt.
- Phases (reusing the M9 structure):
  1. Stilled air: it inhales; the 6 chimney vents on the hall roof are sealed with turf. Gust/Vortex strips the turf (like crystals, via STRIP/FLATTEN brush), reached by Updraft or climbing towers.
  2. Climb: the head and neck rear out of the west wing; the Wraith climbs the neck, back and rib-rafters to open 3 bellows valves, with shaking draining focus (existing).
  3. Its breath: every ~25 s it exhales a gale sweeping the forecourt; shelter behind the gatehouse, wall stubs and standing stones (barrage pattern with a wind wall that shoves and flattens grass).
  4. Frenzy at 30 percent: it calls the meadow Shaped (cap 8) out of the turf of the hillside.
- Glide: after valves open, the exhale can be ridden. Optional beat: glide off the summit between the tower pair to reach the east wing roof valves; the long fall to the village keeps the stakes visible. Death resets as in the frost fight.
- Arena: forecourt plus hall, about 100 m across. Camera: the spring arm will clip in the hall, so use the existing occlusion and pull in, plus a lock-on to the head. Needs a check.
- Release: valves open, it exhales for the first time. Cinematic: orbit with the head lowered, then a wind front rolls down the stair (cheap: a travelling wind-field burst band plus grass-state wave and dust), over the roofs of the village, and the mill sails start turning on the last frame. Village response: bells ring, shutters open, NPCs come to the foot of the stair, lanterns relight, smoke finally rises (fires quest stays gated until release or puts the fires out). `restoration.meadow = 'restored'`, grants Gale and glide.

## 4. Reuse, new work, effort, risks

Reuse: fight director pattern, climb (PILLAR/BODY), focus drain and shaking, spikes/barrage logic for the gale, releaseCam and cinematic, music cues (wake/release/death), restoration, Gale brush/wind bursts, glide.
New: Bellwether body (the existing 6-spine quadruped rig is wrong; needs a long-neck variant and building-integrated chunks), manor and hill builders, terrain heightfield for the hill, sloped-roof collision, vent/valve systems, gale wall, stair-progress wind fade, release front, village response.
Effort: hill and stair 1 to 1.5 sessions; manor shell with damage 2 sessions; Bellwether body and animation 2 sessions; fight phases 1.5; release and village response 1 to 1.5; tuning and Windows verification 1. Total about 9 to 10 sessions, on top of the village.

Risks: manor draw cost on a 14 to 16.5 ms GPU budget (needs instancing, LOD and a hard triangle budget); a building-sized creature reading as a creature (head and neck moving is essential); camera in the interior; terrain size of the hill versus streaming; collision for roofs; warm-up of new materials; the 16 light slots (one lit window only); fire quest tone versus the stilled air.

## Questions for the user
1. Option A (manor is the Bellwether) or B (separate creature)?
2. Is the Bellwether (long-necked grazer) still the chosen Warden, or a new creature design?
3. Is the manor's interior explorable, or only the hall and the forecourt?
4. Should the village know the manor is alive (legend) or be surprised?
5. Is the fire quest meant to be solved before or after the boss (stilled air tie-in)?
