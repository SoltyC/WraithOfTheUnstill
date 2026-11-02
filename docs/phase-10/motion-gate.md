# The quality gate for generated movement

The user approved Kimodo on 2026-11-02 ("looks great"), on condition that it is quality gated. A generated clip reaches the game only through all three stages below. The model is never trusted: stage one reads the clip the game plays, after conversion and repair.

## The pipeline

1. **Generate** several seeds. Short prompts; 5 s takes about 100 s on the CPU (`C:\wraith-tools\kimodo-run.ps1`, `kimodo-seeds.ps1`).
2. **Convert:** `tools/motion/kimodo_clip.py`.
3. **Repair:** `tools/motion/clipRepair.mjs <in> <out> fit [feet] [loop=0.7]`. `fit` is required. Use `feet` only if the clip fails on foot creep, and `loop` only for a clip that loops. A repair is judged like everything else: it has been caught adding jitter and shortening arms.
4. **Stage one, the numbers:** `node tools/motion/clipGate.mjs <clip> [loop] [seated] [travels]`.
5. **Stage two, the robe:** `tools/bot/play.sh <open dry spot>`, then `node tools/bot/perform-gate.mjs <clip>`, on a fresh page for each clip.
6. **Stage three, the eye:** watch the film from stage two on the robe, from the angle the shot will use.
7. **List it** in `data/motion/manifest.json`: prompt, seed, model, repairs, gate flags, hash. `tests/motionGate.test.js` fails on a clip that isn't listed, has changed since it was judged, or doesn't pass stage one. A clip with `cues` (played by the game) also needs `eye`, the film that was watched. A clip changed by any repair needs watching again.

## Stage one: what is checked

Limits are in `LIMITS` in `clipGate.mjs`. `tests/motionGate.test.js` plants each fault in a good clip and requires the gate to name it.

| Group | Checks |
|---|---|
| File | format, finite numbers, length |
| Rig | frames square and right-handed, bones hold length, arm matches the rig, leg reach, soles on the ground, pelvis fits the rig |
| Motion | hand, foot and pelvis speed; torso and head turn; jitter on limbs and frames; pops |
| Anatomy | neck, elbow fold |
| Contact | through the ground, foot creep, foot slide, hovering |
| Self | hand or elbow in the torso, hand in the head, legs through each other |
| Weight | tipping, sitting on nothing (unless `seated`), stays put (unless `travels`) |
| Life | frozen stretches, alive |
| Loops | seam pose, seam speed (with `loop`) |

Two measures were replaced after they gave the wrong answer on real clips:
- **Jitter** measured the difference from a smoothed curve, and called a fast broom stroke noise. It now measures velocity above 7.5 Hz: real clips are 1–13 mm/s, a planted 6 mm shake fails at 30.
- **Foot skate**, the share of low frames moving fast, failed every shuffling walk even with the feet pinned, because it counted the foot lifting. It is now **foot creep** (a planted foot's movement) and **foot slide** (a low, fast foot for longer than a lift takes).

## Stage two: what is checked

Cloth numbers, overstretched links, the fastest cloth relative to the body, added frame time and late pipelines, through the whole clip including the ease in and out. The yardstick is the same robe walking and running on the same page. It refuses to run in water or off the ground.

## What the gate has found so far

Faults in the game:
- **Clips stood 10 cm too tall:** the pelvis at 0.98 m against the rig's 0.88 m, on ankles rather than soles. The hem rode up in every film before this one. Fixed by `fit`.
- **The feet twitched:** the gait kept stepping under a clip, flicking the foot meshes through false strides and firing footfalls. A clip now owns the feet.
- **A clip cut in** from the standing pose, moving the cloth 17 cm in a frame. A clip now eases in over 0.9 s, and out with `leave()`.
- **Loops snapped or kinked at the join:** the curve now runs round the period, and `loop` closes a clip so its last frame is its first. Clips no longer loop by default.
- **A mantle shelf:** arms push the mantle sideways only, so raised arms folded it out into a wedge. During a clip they push it in three dimensions.
- **A travelling clip returns to its start** if the controller isn't moved to it. The gate tool moves it; the director must do the same.

## The ten motions, plus three seeds

| Clip | Fit only | Fit + feet |
|---|---|---|
| `knead1`, `wheel`, `s-rock`, `s-rope` | pass | pass |
| `sweep` | foot creep | leg reach |
| `s-sweep` | foot creep, foot slide | jitter |
| `child` | foot creep, foot slide | pass |
| `s-scared` (the walk) | foot creep, foot slide | pass |
| `walk-4` | foot creep | jitter |
| `walk-5` | foot creep | leg reach, jitter |
| `walk-6` | jitter, foot creep | leg reach, foot speed, jitter |
| `hanne` | sitting on nothing | same |
| `cradle` | tipping, sitting on nothing, alive | same |

Six of the 13 pass as they are or after repair, and `hanne` is a sitter that needs `seated` and a seat. `cradle` is also too still.

In the game: `knead1`, `rock`, `wheel`, `walk`. All four pass stage two. `cradle` was removed.

## Stage three so far: Claude's look done, the user's still to come

Clips stay unaccepted in `manifest.json` until the user has watched them. Films are all in `screenshots/kimodo/`.

- **`knead1` (`gate-knead1.mp4`):** reads as standing and kneading, with good weight. Collar and sleeves are clean from four sides.
- **`rock` (`gate-rock.mp4`):** reads as cradling something.
- **`wheel` (`gate-wheel.mp4`):** clean, but the hands read less clearly.
- **`walk` (`gate-walk.mp4`):** reads as a slow, hunched walk. Grass and shade hide the feet, so it still needs a clear shot. Its fastest cloth rose to 23 cm a frame (walking yardstick 25 to 42), which is still in range.

Two robe faults were found on the first close look, and neither was in stage two's numbers:

- **A flange at the collar:** the clips look down up to 57°. The cowl's rows above the drape follow the head and its last row is fixed to the chest, so the rows collapse in and the last one stands out as a thin spike. `performance.js` now eases a nod from 20° to a limit of 34°, and the drape's front tucks in as the head goes down.
- **The sleeve through the mantle:** the arm's capsule (6 cm) is thinner than the sleeve (8 to 10 cm), so the mantle rode on the arm with the sleeve through it. During a clip four more capsules, sleeve-sized and eased in by the clip's weight, hold the mantle clear.

Normal play does not pay for or change with either: the cloth over 600 frames of play is byte-identical to the code before them, with 11 colliders.

Seen and left alone: the fur rim of the hood catches a low sun (the same in play, and the art is not to be restyled), the wide dark cuffs hide the hands in close work, and the Wraith's staff stays on its back through a clip.

## Known gaps

- Stage one has no measure for a good performance: mood, timing, whether it reads. Only the eye does.
- **Footfalls:** a clip fires none, so a walking clip leaves no prints or sound yet. The foot also stays flat through a swing, under the hem.
- A clip's ground is flat at its start height; slopes are not handled.
- Only the Wraith's body has been tested. The Veiled, who will carry most of these clips, have not.
- The hand IK for exact work (dough, wheel, broom) is still not built.
- Stage two has no measure for cloth passing through cloth: both faults above passed its numbers. Only the eye caught them.
- Run speed in the yardstick may not be a true sprint: walk and run often measure alike.
