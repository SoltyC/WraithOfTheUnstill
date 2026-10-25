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
