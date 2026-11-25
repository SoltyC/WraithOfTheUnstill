# The dunes' choice: *Where the Walker lies down* (design, 2026-11-25)

From `docs/storyline.md` (Dunes) and `docs/people-and-cutscenes.md` §3.3 ("Where it lies down … three"). Today only one of
the three is built: the Walker can lie down only at the Wellhouse, and no outcome is recorded, so nothing later can answer
it (the Ember warning's Iven and Nadra messengers wait on it: `docs/phase-11/ember-design.md` §2).

## The two communities

- **The Wellhouse** (built): Sarai, Hesper, Nadra and Pell, at the dry well in the caravanserai.
- **The Sun Gate's glass-readers** (to build): Iven moves out to them — he reads the old glass and lives where it is (Orsa the old reader, Kesh, Adda the mender). Three
  more people: an old reader, a young one and a mender. A camp of tents among the fallen stones on the canyon's east rim,
  under the Gate. They are there because the erg stopped: the Gate stands clear of the sand only while the Walker is still.
- **The hook:** Nadra's map "marks a cistern nobody has found" (data/quests/dunes.json). It is under the Sun Gate. The
  glass-readers know it is there and dry; the Sun Gate puzzle's beam, once solved, shows its mouth.

## The choice is steering (no menu)

The player steers the Walker with the glyph pillars as now. It lies down where it is brought and the eye is lit:
- **The Wellhouse** (as built): the well's glass eye lit with the mirror-stones in the evening sun.
- **The Sun Gate:** a second kneeling place on the open sand east of the rim below the Gate; its eye is the cistern's
  mouth, lit by the Sun Gate's own beam (the solved puzzle throws the morning sun into it).
- **Neither:** on its back, at the court's brake stone, the Wraith can **release the brake** (Interact, then again to be
  sure): it walks on, into the deep erg, its circuit for ever. Stone is learned and sand-surf granted as in the others.

Recorded as one of `dunes:home-well`, `dunes:home-gate`, `dunes:home-none` (plus the existing `dunes:walker-released`).

## What follows (the consequence scene and after)

| Outcome | The scene (in-engine, ~40 s, variants of one cut) | After |
|---|---|---|
| Wellhouse | It kneels at the well; water rises in the shaft; Sarai's camp at the rim; then, at dusk, the glass-readers packing their tents at the Gate and walking west along the Dry Stair, small against the dunes. | The well full, the camp settled; the Gate camp gone; within days the erg's front creeps toward the Gate (sand on its stones). Iven, if met, will not speak. `dunes:gate-left`. |
| Sun Gate | It kneels below the Gate; the cistern fills, the readers at its mouth; then the Wellhouse camp loading the sledges and leaving by the Dry Stair, Pell looking back. | The Wellhouse empty; Nadra and Pell met again later at Morrow's jetty (fen). `dunes:well-left`. |
| Neither | It walks away into a sandstorm; both camps watching from their rims; Sarai and Iven each say one line about the season left. | Both camps preparing to leave (a season's warning); the erg never restored, never calm. `dunes:both-warned`. |

## Build order

1. **The glass-readers' camp** at the Sun Gate: tents (the refugee kit), four people with homes there (Iven moved),
   their dialogue (who they are; the cistern; Iven's line about the Walker).
2. **The second home:** the kneeling place and eye at the Gate; the Walker's homing generalised to two homes; the eye lit
   by the Sun Gate's beam. The release there.
3. **Neither:** the brake stone on its back; it walks on.
4. **The outcome flags** and the after-states (camps leaving, people moved, dialogue).
5. **The consequence scene** (three variants), filmed.
6. **Ember's warning messengers:** Iven (Sun Gate chosen) and Nadra (Wellhouse left) per `ember-design.md` §2.
