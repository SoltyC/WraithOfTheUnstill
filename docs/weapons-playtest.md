# Weapons — bot playtest (2026-10-26)

Tool: `tools/bot/fight.mjs` (an in-page auto-fighter: turns to the nearest Shaped, closes to 0.72 of the weapon's reach, taps lights or mixes in a heavy every 3.5 s, bend-steps away from telegraphed lunges). Preview on port 4174, Windows Chrome on the RTX 3060, full health at the start of each fight, flow reset. Frost fights at (1060, 2690) by the monastery, meadow fights at (100, 800). "Taken" is health lost out of 100. One run each unless a count is given; the bot is an ideal-ish, tireless player, so read the numbers as relative.

## Frost

| Foes | Weapon / mode | Time to clear | Hits | Taken | Flow reached |
|---|---|---|---|---|---|
| 3 hounds | staff light | 7.4 s | 12 | 12 | 2 |
| 3 hounds | staff mixed | 6.2 s | 12 | 0 | 2 |
| 3 hounds | sickles light | 4.7 s | 14 | 0 | 1 |
| 3 hounds | sickles mixed | 3.3 s | 12 | 0 | 1 |
| 3 hounds | maul light | 3.9 s | 6 | 0 | 1 |
| 3 hounds | maul mixed | 2.3 s | 4 | 0 | 1 |
| brute + 2 hounds | staff mixed | 8.8 s | 16 | 42 | 2 |
| brute + 2 hounds | sickles mixed | 9.2 s | 21 | 60 | 1 |
| brute + 2 hounds | maul mixed | 7.8 s | 7 | 0 | 2 |
| brute alone (x2) | sickles mixed | 5.8 s | 13-14 | 30 | 1 |
| brute alone (x2) | maul mixed | 4.5 s | 4 | 0 | 1 |
| brute + 4 hounds | staff mixed | 11.3 s | 26 | 60 | 0 |
| brute + 4 hounds | sickles mixed | 13.8 s | 34 | 30 | 2 |
| brute + 4 hounds | maul mixed | 7.8 s | 11 | 30 | 2 |
| 3 frozen hounds | maul light | 2.1 s | 3 | 0 | 1 (3 shatters) |
| 3 frozen hounds | staff heavy | 4.6 s | 3 | 0 | 2 (3 shatters) |

## Meadow

| Foes | Weapon / mode | Time to clear | Hits | Taken | Flow reached |
|---|---|---|---|---|---|
| 3 sedgerunners | staff mixed (avg of 4) | 7.7 s | 9 | 57 | 0 |
| 3 sedgerunners | sickles mixed (avg of 4) | 12.8 s | 8.5 | 48 | 0 |
| 3 sedgerunners | maul mixed (avg of 4) | 14.5 s | 5.5 | 43 | 0 |
| 2 hedgewardens + 2 sedgerunners | staff mixed | 17.3 s | 33 | 96 | 2 |
| 2 hedgewardens + 2 sedgerunners | sickles mixed | 9.6 s | 33 | 58 | 0 |
| 2 hedgewardens + 2 sedgerunners | maul mixed | 11.4 s | 17 | 58 | 2 |

## Findings

1. **The weapons are different, not ranked.** The sickles clear hounds fastest in a crowd and are the worst against the brute (their light hits do not stagger it, so a lunge lands); the maul is the best against single armoured foes and shatters frozen ones in one hit; the staff is the steady middle and the best at keeping Flow up in a long fight. Against the meadow flankers (sedgerunner: 28 hp, speed 9) the maul swings at where a runner was: about 1 swing in 3 connects, and a 3-runner pack costs about as much health as with the other two (43 against 48 and 57). That is the intended price of the slow weapon; it did not need a fix.
2. **The maul stagger-locks a lone brute** (poise 30, a light hit does 30, so every hit staggers: 0 damage taken in four runs). That makes the brute a free kill with the maul. It is not a bug in the weapon (the maul is the armour-breaker, `docs/gameplay-design.md` §11.2), but a poise recovery window on the Shaped would remove it. Left as is; a human will miss more than the bot does. Judge by hand.
3. **Flow barely moves in meadow fights from zero.** Flow tier 0 in most sedgerunner fights (the packs die in under 15 s with no dodge-near-misses); a mixed rime fight reaches tier 2. This is the known "fights from zero barely raise Flow" issue, unchanged by the weapons.
4. **Occasional "2 of 3 dead, 0 damage taken" results** (one run each with the maul and the sickles, 30-60 s timeouts) came from the harness, not the weapons: the survivor had stopped engaging (no damage in the whole run) and did not come back in later runs. Not reproduced in about 20 further meadow fights.
5. **Pipelines:** after about 25 fights on a fresh page, `gpuStats.late` is 0. (An earlier page that had teleported across biomes showed one late compute pipeline in the post chain, from a render-chain pass, not from a weapon; it was not chased.)
6. The finds: the sickles ("Take" at the reaper's stand, (152, 948), 90 m east of Hearn's hub) and the maul ("Take" at the cold forge, (1090, 2722), 40 m from the monastery) were walked up to and taken with the bot (`press Interact`); both weapons are drawn at once, X swaps back.

## Filmed (screenshots/weapons/, raw frames not committed)

`sheet2-staff-combo-hit.jpg`, `sheet2-sickles-combo-hit.jpg`, `sheet2-maul-heavy-hit.jpg` (a live hound attacks and knocks the maul out of its windup, as designed), and `sheet2-{staff,sickles,maul}-heavy-frozen.jpg` (the heavies on a frozen hound: the hold, the strike, the shatter, the dent or crater). The earlier `sheet-*.jpg` are the first pass. Read for weight: anticipation and follow-through read in every move; the maul crater is large (about 5 m across, a deep pit) and the staff slam leaves the same crater when it follows a maul smash at the same spot, because the terrain state keeps it.

## Glaive and lantern flail (2026-10-26, branch `claude/weapons2`)

Same tool and set (`tools/bot/fight.mjs`, port 4177, Windows Chrome on the RTX 3060, full health, flow reset, mixed mode: lights with a heavy every 3.5 s). The bot is deterministic enough that four meadow runs were identical; read the numbers as relative.

| Foes | Weapon | Time to clear | Hits | Taken | Flow reached |
|---|---|---|---|---|---|
| 3 sedgerunners (x4) | glaive | 7.9 s | 8 | 40 | 0 |
| 3 sedgerunners (x4) | flail | 6.2 s | 3 | 30 | 0 |
| 2 hedgewardens + 2 sedgerunners | glaive | 9.7 s | 26 | 40 | 0 |
| 2 hedgewardens + 2 sedgerunners | flail | 10.1 s | 20 | 76 | 1 |
| 3 hounds (x2) | glaive | 4.1-5.0 s | 10 | 0-12 | 1-2 |
| 3 hounds (x2) | flail | 3.3-6.0 s | 6-8 | 0 | 1-2 |
| brute + 2 hounds (x2) | glaive | 9.3-10.8 s | 15-16 | 0 | 3 |
| brute + 2 hounds (x2) | flail | 7.1-7.4 s | 14 | 30 | 1-2 |
| brute + 4 hounds (x2) | glaive | 9.6-9.9 s | 24-25 | 0-30 | 1-2 |
| brute + 4 hounds (x2) | flail | 8.7-15.3 s | 16-19 | 0 | 3 |
| 3 frozen hounds (heavy) | glaive | 2.4 s | 3 | 0 | (all three die) |
| 3 frozen hounds (heavy) | flail | 12.3 s | 9 | 0 | (it thaws them) |

Against the first three weapons' meadow figures (taken: staff 57, sickles 48, maul 43 against 3 sedgerunners; 96, 58, 58 against hedgewardens + sedgerunners):

1. **The glaive is the answer to flankers.** The wide arcs reach both sides, so the sedgerunner pack costs 40 where the maul costs 43 and the staff 57, and the hedgewarden mix costs 40 (the best of the five). It also raised Flow most often (tier 3 against the brute): the long reach keeps the Wraith out of lunges, so the near-miss dodges that build Flow happen. It is not a damage weapon (9-15 a hit; 26 hits against the hedge mix) and the hedgewardens (poise 40) pin only on a nearly full draw.
2. **The flail is the fire weapon.** It kills sedgerunners with 3 hits in 6.2 s because the burn does the work (sedge burns 1.8 times as hot), and burning packs spread to each other. It is the worst weapon against hedgewardens (76 taken: the turf armour is slow to burn, the hits are slow, and the dead zone lets the wardens inside the swing) and against frozen Shaped (12.3 s: it melts them out of the ice instead of shattering them, which is the price of fire). The brute fights cost 30 sometimes: the 1.1 m dead zone lets a brute's slam land when it steps under the head. A player should keep the foe at arm's length, which is the intended skill.
3. **The weapons stay different.** Glaive: spacing, flanks, a pinning lane. Flail: fire and area, nothing too close, nothing frozen. Maul: armour and single bruisers. Sickles: crowds of small things at your feet. Staff: the steady middle. No weapon is best in all four fights.
4. `gpuStats.late` stayed `[]` through every fight above, two teleports across biomes, both finds taken, and the flail's whirl at night (the weapon shader is the same, the 14 slots are one uniform array, and the head's light is a world-grid light).
5. The finds were walked up to and taken with the bot (`press Interact`) once their flags were set: the glaive in the Ring of Nine after `meadow:side-stone-thanked`, the flail at Isolde's fire after `isolde-sang`.

### Filmed (screenshots/weapons2/, raw frames not committed)

`glaive-combo-side.jpg`, `glaive-heavy-side.jpg` (the thrust on a frozen hound: the draw, the lane, the shatter), `flail-combo-side.jpg`, and the photo spots `p9w-glaive-*`, `p9w-flail-*` (`p9w-flail-night.png`: the whirl at night, the lantern's flame and trail), `p9w-find-glaive.png`, `p9w-find-flail.png`. Read for weight: the glaive's draw (the shaft goes back, the blade tips up) and the thrust read at once; the flail's lantern lags the haft in the windup and whips out on the cut, the flame streaming back along its travel.

## Bell-mace (2026-10-26, branch `claude/mace`)

Tool: `tools/bot/mace.mjs` (port 4178, Windows Chrome on the RTX 3060, full health, flow reset; the bot casts an Updraft 3 m ahead, steps into it, steers over the heart of the pack and plunges, plunges again from each rebound, and on the ground hops or taps lights; `LOG=1` adds a 0.5 s state trace). Same foe sets and spots as the table above. Three runs each; "-" is a 60 s timeout with 2 of 3 dead.

### Iso plunges (an asleep brute, the Wraith set H m up)

| H | glow | h stored | damage | toll radius | rebound | rebound apex |
|---|---|---|---|---|---|---|
| 5 m | 0.21 | 4.94 | 33.8 | 2.39 m | 2.47 m | 4.6 m |
| 10 m | 0.43 | 9.99 | 50.0 | 3.20 m | 5.0 m | 7.2 m |
| 14 m | 0.60 | 14.0 | 62.8 | 3.84 m | 7.0 m | 9.5 m |
| 20 m | 0.80 | 20.07 | 82.0 | 4.80 m | 8.0 m | 10.4 m |

The damage matches `18 + 3.2 h` to 0.1 (capped at 20 m: 82); the toll and the rebound follow their formulas (the rebound caps at 8 m).

### Fights (mixed mode)

| Foes | Time to clear (3 runs) | Taken (3 runs) | Plunges per Updraft | Plunge misses |
|---|---|---|---|---|
| 3 hounds | 4.3, 10.8, 7.3 s | 0, 36, 24 | 1.0, 0.2, 1.0 | 0, 0, 1 |
| brute + 2 hounds | 13.3, 12.5, 15.3 s | 30, 42, 12 | 0.75, 1.25, 1.0 | 0, 1, 0 |
| brute + 4 hounds | 16.2, 16.1, 9.7 s | 0, 12, 24 | 0.67, 1.2, 1.0 | 0, 0, 0 |
| 3 sedgerunners | 13.4 s, -, - | 10, 40, 70 | 0.8, 0.29, 0.25 | 1, 1, 1 |
| 2 hedgewardens + 2 sedgerunners | 23.5, 12.9, 19.7 s | 28, 86, 80 | 1.25, 1.25, 1.75 | 0, 0, 0 |

Across the 15 runs the mean is about 0.9 plunges per Updraft; the highest stored height was 14.6 m (most plunges fell from 5-10 m). Against the other weapons' tables above the mace is last in the three hound and brute frost fights (the other weapons: 2.3-15.3 s) and in the hedgewarden mix, and worst in the sedgerunner fight (two of three runs timed out).

### Bot or weapon

Both, and mostly the weapon's cadence in tight fights. What the traces show (`LOG=1`, brute + 2 hounds, 12 s): a cycle is about 5.5 s, of which 1.5 s is the Updraft ride, 1-1.5 s a rebound plunge or two at 3-5 m, and the rest on the ground (hop-swing plunges from 2.5 m, light taps) because a foe inside 2.5 m of the Wraith stops the bot from casting (the Updraft aims 3 m or more out, and the bot will not cast at a foe it is standing next to). The bot's plunges fall from 3-5 m, so each is worth 28-34 damage; a human who drops from 10 m or more would deal about 50. The same fight varies by 2x run to run (3 hounds: 4.3 to 10.8 s), which is larger than any lever below. One lever was tried: the hop-swing lifting 3.5 m instead of 2.5 m (hound fights 6.9, 21.2, 12.5 s; brute + 2 hounds 13.1, 14.7 s; brute + 4 hounds 27.9, 15.4, 19.0 s): no faster, within the noise, and it was put back. The 20 m cap, the rebound drift and the toll falloff were not changed. Verdict: the mace is a slow, spacing weapon whose fights are dominated by the Updraft cadence; the bot is a poor mace player (it never chooses a height), so these times say "last with a middling bot", not "last". Judge by hand.

### Combos (live, real inputs: Heavy = Updraft / Crystallize, Bend = Gust / Sweep, Primary in the air = the plunge)

| Combo | Result |
|---|---|
| Dunk | An Updraft (cast 3 m ahead) catches a hound 2.2 m past the column's axis and throws it up (apex 4.3-4.5 m); the Wraith, set 9 m above it, plunges onto it in the air: `dunks 1`, `dunkLands 1`, `dunkHits 1` (h 6.1, 37.6 damage); the second hound, 2.2 m from the first, took 39.8 (the toll and the dunk together: it was inside the toll's radius, so the second impact alone is not separated; the unit test measures 60 % of the blow). The same setup with the hound missed by the column: no dunk (as designed). |
| Ice star | Three hounds on a real Sweep lane (all three on ice; the Sweep staggered but did not freeze them, so they were frozen by the harness), a plunge from 8 m (h 8.1): `star true`, `shatters 3`, 3 `onShatter` calls, all three dead. |
| Downdraft | A Gust (Bend) during the fall from 10 m: h 9.97 without it, 14.97 with it (+5.00), damage 49.9 to 65.9, `downdrafts 1`. |
| Glide plunge | Glide from 18 m at 11.7 m/s, plunge onto a row of sleepers: h 16.75, 4 hits, rebound 8 m, the glide blocked for the rebound, back in the glide 1.08 s after the landing. |
| Bell Ledge | Done (lead, 2026-10-27), on a fresh page (the mace not owned, the find not taken), `DIRECT=1 START=8 node tools/bot/mace.mjs ledge`: an Updraft cast against the bastion's front wall, the Wraith rising beside it to 16.2-16.4 m and steering onto the top while the column still lifts, landing on the 9.5 m ledge, Take, then a plunge onto the live hounds below: h 10.9 m, 53 damage, 1 hit (a hound killed). 2 of 3 runs landed (the miss fell short of the top). Three fixes made it reachable: the Updraft's lift is now full across a 1.4 m core (it fell below gravity under 1 m off the axis, so a body not dead on the axis barely rose: 5-6 m); air control is 0.7 while rising air lifts the body (0.25 otherwise); and the ledge courses are 1.6 m deeper. The earlier 'ledge too high' reading came from the bot casting from the hollow and gliding over the top. |

`gpuStats.late` was `[]` after all of the above (fights, combos, 8 shots, iso runs).

### Allocation (`npm run alloc`)

`controller.update` (walking and idle) and `springArm.update` fail as before. `weapons.update (swings, hits, heavies)` fails too, with 313-325 GC events: it fails identically (313 events) on the `claude/wraithoftheunstill-phase-7` checkout, so it is not from the mace. New cases in `tools/alloc/alloc-check.mjs`: with foes (plunge, toll, rebound, dunk, 7050 plunges) 241 GC events and 3.8 MB, no worse than the same loop without the plunge (340 events, 4.1 MB: the framework's); the plunge alone with no foes (commit, fall, land): 1 GC event, 5.5 MB over 400k calls against 4.4 MB with the plunge switched off, so about 1.1 MB over 3300 plunges. That residue was not traced; the pre-existing weapons-update allocation hides it.

### Shots (`screenshots/mace/`, 2560x1440)

`p9w-mace-ledge.png` (the great bell in its frame on the bluff, from the yard), `p9w-mace-take.png`, `p9w-mace-glow-4/10/18.png` (dull bronze, warm gold, deeper gold in the bell's mouth; no red rim, no white blow-out), `p9w-mace-toll.png` (a fresh crater and a plume at the impact, the Wraith landing; the ring itself is faint), `p9w-mace-dunk.png` (the Wraith landing on a hound: a crouch with the hound's legs under her; a high view, not a low side view), `p9w-mace-star.png` (the shatter on the cracked ice). The terrain keeps craters from earlier shots, so the toll and dunk frames show older craters too.
