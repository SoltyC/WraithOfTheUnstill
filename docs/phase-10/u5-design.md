# U5: the Drowned and the register (design review, 2026-11-03)

**Feature.** Ebbhold's twenty people, still doing what they were doing, hear the Wraith's noise, come to it and hold the robe until it is still. A name read in the register and said to the right person stops them for good.

- **Pillars:** 2 (the world remembers: every name said is saved, and U7 counts them), 5 (learn by reading: the register's lines are the only way to tell who is who), 4 (quiet).
- **Loop layer:** the 1-minute layer (crossing a room unheard), feeding the session layer (the register).
- **Aesthetic:** melancholy, sensation. Not horror: they are sad first.

## How it plays

- **Noise** (`game/noise.js`): the quiet walk (hold Shift, 42 % speed) is heard at about 3 m. A walk is heard at about 13 m, a jump or landing further, and a dodge or swing at 25–30 m. Sound carries about 9 m up or down between gallery tiers.
- **The Drowned** (`game/drowned.js`): a noise in reach turns the head (0.9 s, the telegraph). They then walk to where the sound was. If it is gone, they stand listening for 4 s and go back to their loop. If the robe is within reach, they hold it: each pair of hands slows the Wraith, and four pin it. They let go once the Wraith has been still for 2.5 s. A dodge shakes them off, but it is loud, so they come again.
- **The register:** the stone book on the platform opens its journal page. One name can be *carried* at a time. Speaking to a Drowned says it: the right person goes still for good (`ebb:named:<id>`), and a wrong name makes them cry out, which draws the room.

## Checklist

- **Isolation test:** NOT ASSESSED. The bot checked the rules: a quiet approach is heard only within about 1.5 m; a normal walk is heard at 7 m; two people hold the robe (speed ×0.36) and let go after stillness; a wrong name cries and the right one stills. Whether creeping through a room *feels* good needs the user.
- **Smells:**
  - *Dominant strategy:* the quiet walk everywhere. Its price is time (42 % speed). **Present, mildly.** The fix comes with the Listener (F9), which hunts by the same noise, and with the air, if the city's flooded halls get a breath clock.
  - *No opportunity cost:* being held costs only seconds. **Present.** It's acceptable for U5, since sad-not-scary is the tone. F9 makes a held struggle audible to the Listener.
  - *Lying telegraph:* clear. Heads turn before they come, and nothing happens off-screen.
  - *Fetch in disguise:* clear. Naming is a reading puzzle: match the register's line to what you see someone doing, or to their dye and build.
  - *Graphics without play:* the loops are both the clue and the obstacle. Clear.
  - *Scope:* twenty people, one rule set. Clear.
- **Encounter brief:**
  - **Role:** a grappler swarm; it pushes the player to move quietly and to stop.
  - **Valid answers:** the quiet walk, stillness, a dodge (with a price), naming.
  - **Elements:** none interact yet. NOT ASSESSED until Tide (F4) and Frost in the city are decided.
  - **The "rises from the ground" rule doesn't apply:** they are people, not Shaped.

## Verdict

Keep.

**Still to do:**
- The loops read only as body motion (bowing, swaying, walking a line, the capstan round). The plan's bar, "from 5 m a viewer can say what each one does", needs hand animation and props: that is U6's checkpoint.
- The floating veils.
- The *held* look (wet ink, mouths moving when named).
- The kneader, cradle and shelves are still grey boxes.

**What to measure in the playtest:**
- the share of rooms crossed unheard;
- the time held per room;
- right versus wrong names;
- whether players read the register before naming anyone.
