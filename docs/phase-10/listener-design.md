# The Listener: design review (2026-11-03, per `.claude/skills/wraith-design`)

The Warden brief in `plan.md` ("Warden brief: the Listener") was written for the fen. The plan's later change moved the fight into
Ebbhold. This review holds the brief to the city, checks it against the roster and the smells, and splits the work by what exists.

## The feature, in one sentence

A colossal Veiled kneeling in the Tide Hall's great well, holding the drowned city in time by listening for every movement and
putting it out; the Wraith finds it, herds it, strands it and draws it dry, which is the release that kills everyone it held.

- **Pillar:** 3 (Release, not kill — told as a lie: the player believes this release is like every other), with 5 (Learn by
  reading: how it perceives is the whole discovery) and 2 (the world answers: it answers noise).
- **Loop layer:** 5–15 minutes (the fight); the chapter's climax (session).
- **Aesthetic:** dread, then pity; after the cutscene, grief turned on the player.

## What exists, and the split

| Needs | Exists? |
|---|---|
| Noise (`game/noise.js`, `g.noise`): each action's level, fading | **yes** (U5) |
| The great well (Tide Hall, water at −50, 30 m deep) | **yes** (U4) |
| The Drowned, who hear for it | **yes** (U5) |
| Skim (F3); Tide: Surge, Draw, Crystallize, Undertow (F4) | **no** |
| The climb (`game/warden/climb.js`) | yes (frost, bellwether, walker) |

**So:** build it in two parts.

1. **The Listener itself (now):** the figure, kneeling in the well, its hands cupped over the water; its head turning to every
   noise in the hall. It is what the cutscene needs (shots 7, 9, 13: it rises and opens its arms; it sits by the well, listening;
   it turns its head to the Wraith and lets go), and the first legible half of the hunt: *it hears you* is taught by watching it
   turn. **User checkpoint: the figure on film, alone.**
2. **The fight (after F3 and F4):** the phases below, which need Tide's verbs.

## The figure

- **A Veiled, vast.** Everyone in this chapter is cloth: the Wraith, the Drowned, Morrow. The Listener is one of them, made huge:
  the robe system at about fourteen times a person, so its veil and robe move as theirs do, heavy and slow. The city's statues
  are veiled figures with staves: it is what they were carved after.
- **Kneeling in the well,** water to its waist, the hall's causeway at its shoulder. Hands cupped over the water, as if holding
  something in it (it is: the strand). Head bowed to them.
- **Its ears:** two great bronze plates on the hood, the standing stones' bronze ears of the approach, so the shape says what it
  does before anything moves. Not a face: under the veil, dark, the cowl light of every Veiled, very faint.
- **It listens:** its head turns, slowly, to the loudest noise in the hall (g.noise), and back to its hands when the hall is
  quiet. The turn is the telegraph of the hunt, honest and through the body.
- **It never looks at the Drowned** (storylines.md "Keeping it fair": it turns away from them).

## Against the roster (five axes)

The roster's Mire column (gameplay-design.md §5) becomes the Listener's:

| Axis | Frost Warden | Bellwether | Long Walker | **The Listener** |
|---|---|---|---|---|
| Target | static, rooted | a building | always moving | **hidden: in the dark of the well; seen whole only when stranded** |
| Win condition | freeze, shatter | strip, climb, open | steer it home | **find it, herd it, strand it, draw it dry** |
| Discovery | which joints | which vents | read the gait | **how it perceives (noise)** |
| Arena | snowfield | manor | the whole erg | **the drowned city: flooded halls, the sea-doors, the well, whose water falls in the fight** |
| Tempo / mood | deliberate / grief | siege / relief | pursuit / companionship | **stalking, then sudden / dread, then pity** |

Differs from every Warden on all five. **Reskinned Warden: clear.**

## The brief, held to the city

1. **Fiction:** unchanged (it held the tide still by silencing it; told to keep the world quiet, and nobody came back).
2. **The approach:** the city grows quieter towards the hall; the Drowned turn their heads to the well when it listens.
   Silhouette: its bowed head and the bronze ears, seen from the causeway over the dark water. No marker.
3. **The waking:** at the well, Tide is lent (F4). The water draws back from the Wraith's feet.
4. **Phases** (after F4):
   - **Hear** (flooded halls): noise draws it through the water under the city; it strikes where the noise was, telegraphed by
     the water running out from under the spot (≥ 10 m readable on every preset). *Solutions:* Surge as a decoy; stand on
     Crystallized ice; the quiet walk.
   - **Herd** (the sea-doors): Crystallize the passages shut and lure it with Surge, or be the bait and skim it in. Checkpoint.
   - **Strand** (the well): Draw takes the well's water out; the level falls for real; it heaves on to its side, seen whole for
     the first time. Checkpoint.
   - **The climb and the last breath:** up its drying flank; one long Draw, then Undertow.
5. **Calm moment:** stranded, in the silence: its breathing is the only sound in the hall.
6. **The climb:** yes, last phase only; the drying cloth and the root-bound weed crumble under the hand (a clock in the material).
7. **The release:** the release cutscene. The tide returns.
8. **Measure:** time and deaths per phase, decoy against bait, how often the player walked by choice; one core, one breath.

## Smells

| Smell | Verdict |
|---|---|
| Bare core is not fun | **NOT ASSESSED.** The hunt's core is moving under threat of being heard. Bot: walk, run and splash in the hall; measure that its head turns to each within 0.5 s and settles back. The skim's own fun waits for F3. |
| Dominant strategy | **Present (risk):** the quiet walk everywhere is safe and slow. Fix: Herd needs noise (the bait); the hold weakens on a clock in the fight (the well's water drops between phases), so dawdling costs. |
| No opportunity cost | Clear: noise is the cost of speed. |
| Lying or missing telegraph | **Risk:** an unseen striker in dark water. Fix: the head turn (it heard you), then the water running out (it is coming), both ≥ 10 m. |
| Complexity over depth | Clear: one rule (noise), one core. |
| Forced resonance | Clear: it hunts noise because noise breaks the hold; the fiction and the rule are the same thing. |
| Graphics without play | Clear: its listening is the telegraph. |
| Gate without warning | Clear if the critical path stays Frost + Tide. |
| Scope mismatch | **Present:** the fight needs F3 + F4 (about 4 sessions) first. Fix: this split. |

## Verdict

**Keep.** Build the figure and its listening now (part 1); the fight after F3/F4. Smallest fix for the brief: rewrite its arena
for the city (above). The figure's checkpoint is the user's, on film, before it goes into any shot.

**Playtest (part 1):** its head turns to the loudest noise within 0.5 s, back to its hands within 3 s of quiet; it never turns to
a Drowned; the figure costs ≤ 1 ms a frame on the bench (one more cloth, at a person's resolution).
