# U2 — the Lung and the descent: design review (2026-11-04, per `.claude/skills/wraith-design`)

**The feature in one sentence:** wearing Morrow's Lung, the Wraith dives the Sounding, tears the Lung on the kelp, fails to reach the surface, wakes among the kelp roots, and is taken by the city's breathing whirlpool into the undercroft.

- **Pillar:** 1 (moving is the joy: the dive itself is the reward) and 5 (learn by reading: air is on the body, never a bar). It sets up pillar 2's biggest answer, the release.
- **Loop layer:** a one-off 3–5 minute set piece in the campaign loop; the air rule (deep water puts out what moves) is a lasting rule of the world.
- **Aesthetic:** Sensation (the descent), then Challenge turned into dread (the tear), then relief (the column), then surrender (the pull).

## Isolation test

The bare dive passed the user on 2026-11-02 ("looks good, continue building"). What's new here is the air. Its test is NOT ASSESSED until a person plays it. The bot checks the mechanics: fit, descend, tear, try for the surface, wake on the ledge, reach the column, get pulled through.

## Rules

- **Air** (`game/lung.js`) drains only while submerged. With no Lung, the body holds about 14 s of moving air under the water: enough to look, not enough to reach the kelp. With the Lung, about 160 s: down 105 m and back at a dive's speed.
- **On the body:**
  - the cowl light follows the air;
  - the chest breathes out a bubble now and then, then thins to nothing;
  - below a third of the air the robe hangs still and the body sinks: the stroke up weakens and the rise becomes a fall.
- **The tear:** the first time the body passes through kelp with the Lung on, the Lung catches on a frond and tears. The kelp is a forest covering the whole pit floor, so wherever the player goes they pass through it. A body below the canopy's middle without having touched a frond tears anyway, because it did pass through. After the tear: a stream of silver bubbles from the chest, a hiss, and the air going in about 14 s.
- **No way up:** the surface is 70 m over the canopy, which is about 27 s at full stroke. The air runs out first, and the sag makes the last of the climb a fall.
- **Put out, never dead:**
  - The light goes, the screen goes dark, and the Wraith wakes on a ledge among the kelp roots, lower, with a thread of air (about 30 s at rest).
  - From the ledge the column's glow is in sight below, 30 m away.
  - If the thread runs out again, it wakes on the ledge again.
  - Without the Lung, running out wakes it floating at the surface over where it was.
- **The column** (the city's old intake):
  - Inside its 6 m radius the Lung refills in 2 s and the light comes back.
  - Then it turns: a swirl round the axis and a pull down that grows over about 12 s.
  - Stroking up holds the body for a while, but it wins.
  - At the vent, or once the pull has won, bubbles fill the screen and the Wraith wakes in the undercroft, in air. The Lung is finished.
- **Saved** as `ebb:lung` (fitted), `ebb:torn` and `ebb:through`. After `ebb:through` the Lung is gone, and the Sounding gives the plain 14 s again.

## Smells

| Smell | Verdict |
|---|---|
| Bare core not fun | Not assessed. The dive passed, but the air pressure on it is new and needs the user's play. |
| Dominant strategy | Clear. One route, by design. |
| No opportunity cost | Clear. Air is the budget, and looking around spends it. |
| Hollow loop | Clear. It feeds the city, the Drowned and the release, and the tear is paid off by the betrayal (`storylines.md`). |
| Treadmill | Clear. No numbers rise. |
| Lying or missing telegraph | **Present, fixed by design.** The tear must read as the kelp's doing, not a script: the frond snags (it bends towards the chest), a hiss, and the stream comes from the chest where it caught. The ascent fails by rules the player can read: light, bubbles, sag. |
| Complexity over depth | Clear. One gauge, shown three ways on the body. |
| Fetch in disguise | Clear. It's a descent, not a carry. |
| Empty stretch | Clear. The descent is the payoff: the light changes, the kelp, the column. |
| Graphics without play | Clear. The kelp tears the Lung and parts round the body; the column refills and pulls. |
| Gate without warning | Clear. The column's glow is seen from the ledge, and the surface is seen from everywhere. |
| Forced resonance | Clear. Air for a body with no lungs is answered in the fiction: the stillness puts out motion. |
| Scope mismatch | Present. The plan's shaft wall from the canyon kit and Ebbhold's towers seen far below are left for the art pass. This pass does the play. |

## Verdict

**Keep.**
- **Smallest risk:** the player feels cheated by the tear. That's half intended: the betrayal pays it off later. Make it read as an accident now: the snag, then the hiss.
- **The fitting is a stand-in:** until F10 builds Morrow as the fen's guide, the Lung is taken from her pile of brass at the jetty's end.
- **Measure** (bot and Chrome):
  - time from fit to tear;
  - the ascent's best height before the air runs out (must stay short of the surface);
  - that the wake ledge is inside the column's glow;
  - time in the column before the pull wins (8–14 s);
  - 0 GPU errors and 0 late pipelines;
  - the cost of the kelp at the canopy on High.
