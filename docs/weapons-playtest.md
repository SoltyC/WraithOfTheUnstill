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
2. **The maul stagger-locks a lone brute** (poise 30, a light hit does 30, so every hit staggers: 0 damage taken in four runs). That makes the brute a free kill with the maul. It is not a bug in the weapon (the maul is the armour-breaker, `docs/gameplay-design.md` §11.2), but a poise recovery window on the Shaped would remove it. **Fixed (polish2):** a Shaped staggered by a weapon cannot be re-staggered by the same weapon while it reels or for 1.2 s after (`weapons.js` `poiseT`; the blows still land). `fight.mjs maul` vs one brute, same bot: before light 5.1 s / 0 damage taken, mixed 5.9 s / 30; after light 6.7, 5.4 s / 30, 30; mixed 8.2, 4.8 s / 30, 0 (small samples). A human will miss more than the bot does. Judge by hand.
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
