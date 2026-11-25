# The Ember Warden's release: a plan for an epic one (2026-11-25)

The user, after the first cut: "The release needs to be more epic." Today it is three shots and 21 s: from its side it
opens its hands and sinks; the Wraith is put on the bench. Nothing in it answers what the fight was about.

## What it has to say

The Warden held the mountain's fire still. The eruption is that fire getting out. The Wraith binds it, climbs it, and
**gives the fire back**. So the release must show the opposite of the eruption: **the fire going home.** Everything the
player has seen pour out of the mountain for eight minutes pours back into it, through the Warden, and the land goes
quiet. Then the sky opens. Pity and awe, not victory.

Two rules from the Listener's release (`docs/phase-10/release-cinematic.md`) carry over:
- **The player's hand does it.** The give is held, not tapped, and the release runs on the hold. Letting go early does not
  stop it: the fire has started home.
- **The first viewing can't be skipped;** replays can (the Hold K skip).

## The sequence (about 90 s, in-engine, letterboxed)

| # | Time | Shot | What happens | Built from |
|---|---|---|---|---|
| 1 | 0:00 | Close, at the Wraith's height on the titan's chest | **The give, held.** The Wraith's palm on the split in the chest. Its hand-light (Ember's orange) runs down the arm into the crack; the crack widens and lights from inside. | the climb's end; `armDeck`; hand-light; the crack mask (heat) |
| 2 | 0:08 | Wide from the rim | **The shackles go.** Both obsidian fists crack and burst off the rock in slabs (the destruction system: fractured shells, real falls). The arms rise free. | `destruction.js` on two shackle sites; obsidian material |
| 3 | 0:16 | Low, from the lake's surface, looking up | **It stands.** It rises out of the lava to its waist and beyond, lava sheeting off it: for the first time the player sees how big it is. The Wraith small on its shoulder. | new pose (a hip and thighs sculpted: `ember_warden.py`); lava-sheet particles off it |
| 4 | 0:26 | Over its shoulder, toward the column | **It takes the fire back.** It lifts its hands to the sky. The eruption column **reverses**: the black cloud draws down into the crater, the bombs fall upward into it, the lightning stops. | `plume.wgsl.js` time running backward (a `reverse` uniform); bombs' gravity flipped; storm channel off |
| 5 | 0:38 | High, over the mountain's flank, the flows below | **The land goes quiet.** On every flow, a wave of black runs down from the crater: the lava crusts over front by front, the glow going out behind it. Burning houses gutter. | `lava.cooling` driven by a front sweeping down each flow (a new `coolFront` per flow) |
| 6 | 0:50 | From the camp on the headland (only if the camp has people) | **They see it.** The survivors at their fires turn to the mountain; the column falling into itself; someone stands up. No words. | the scene layer at CAMP; their brains (look at the crater) |
| 7 | 0:58 | Back in the crater, wide | **It lies down.** The lake drains down into it; it folds, knees and hands, into the crater floor, and becomes it — a basalt range ringed round the vent, the glow in its cracks cooling ring by ring. | new settled pose; lake level down to the floor; heat ramp |
| 8 | 1:12 | From the rim, the sky | **The sky opens.** The ash cloud parts over the crater; a shaft of sun comes down through it onto the Wraith on the bench. The hand-light: the Wraith's own colour again, and Ember in the cuffs. | `fog.ash` and the cloud deck pulled back from the crater outward; the fog pass's light shafts |
| 9 | 1:22 | The Waste, wide, end | **The Waste breathes** (BRIEF §6.5): the crust's cracks pulse slowly across the ash; the first ember storm lifts far off. Control returns on the bench. | the ember biome's restored state (`worldState.restoration.ember`), the crust pulse in the terrain shader |

**Sound and music:** the mountain's roar running backward (reversed boom), then silence on shot 5, the bells of the
chapel (if it stands) on shot 8; music only from shot 7 (the release cue, `music-cues.md` style).

**If the eruption already ended:** shots 4–6 change: no column to take back; instead the cooled black flows across the
land glow once, faintly, as it takes the last heat out of them (shot 5), and the camp sees the mountain's glow go out.

## What it changes in the world (after)

- The crater is the titan lying in it: walkable, a landmark (the Ember Warden becomes the mountain's floor).
- The eruption is over at once: flows crusted, the column gone, the ash cloud thinning over a day.
- The Waste restored: crust pulsing, ember storms, ash-skate possible (when built).
- The saved: anyone still at home when the column fell lives (the eruption's clock stops at the give).

## Build order and checks

1. **The held give** and the shackles bursting (shots 1–2). Film.
2. **It stands** (shot 3): sculpt a hip and thighs; a standing pose; lava sheeting. Film.
3. **The fire home** (shots 4–5): the column reversed, bombs upward, the cooling wave down the flows. Film from the rim
   and from the plain. This is the heart of it; it must read from far off.
4. **The camp sees it** (shot 6).
5. **It lies down; the sky opens; the Waste breathes** (shots 7–9).
6. The whole, filmed, reviewed densely; perf in the sequence (90 fps).

## Decisions for the user

- **Length:** about 90 s, as above, or a 45 s cut (shots 1, 3, 4, 5, 8)?
- **What it becomes:** the crater's floor (lying down, as planned), or does it walk away into the sea (it carried the fire;
  now it carries it out of the world)?
- **Non-skippable the first time,** like the Listener's?

## Built (2026-11-25): the user's cut

The user chose: **45 s; it falls apart and plugs the volcano, stopping the eruption; skippable** (from the first viewing).

- `systems/emberWarden.js` `REL`: the give (0–5 s: the heart floods, the cracks catch), the shackles burst (5.5), it rises
  with its arms to the sky (6–14), it comes apart into the vent (14–21: hands, forearms, arms, head, torso; real falling,
  tumbling pieces, `titan.loosen`), the eruption stops (22: `eruption.stop()`, the fronts held where they are), the column
  draws down and the lake crusts (`quell`, 22–33), the flows go black from the vent down (`cool`, 30–41: a wave in
  `shaders/lava.wgsl.js` by arrival time), the ash parts (`open`, 34–45), then `eruption.finish()`.
- The scene: `game/emberScenes.js wardenLetsGo` (six shots). Skipping it, or its end, runs `releaseEnd()`: everything done.
- Saved: `ember:stopped-t` and `ember:stopped-fronts`; on load the pieces lie in the vent (`titan.settleAll`), the flows
  where they stopped, cooled, the sky open, the plume a breath of steam (`volcano.js QUIET`).
- Anyone still at home when it stopped lives (the places' fates are only those already decided).
- Film: `SECS=52 node tools/bot/eruption-film.mjs warden-release`.
