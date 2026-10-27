# Encounter variety audit (frost and meadow)

Rules checked: `docs/gameplay-design.md` §4.2 and §9, `.claude/skills/wraith-design/references/encounter.md`, `smells.md`. Method: read of every spawner under `src/`, the quest graph in `data/quests/`, the baked world (`tools/world/arena.mjs`), and bot runs (`tools/bot/encounters.mjs`, telemetry `src/systems/encounterLog.js`). Anything not measured is marked **NOT ASSESSED**.

## 1. Inventory (Phase A, measured by reading the code, 2026-10-26, branch `claude/encounters` at `43f2e8a`)

### 1.1 Every source of hostile Shaped

| Source | File | Biome | In the audit? |
|---|---|---|---|
| Armed encounters (6) | `systems/encounters.js` | frost only | yes |
| The frost Warden's frenzy (summons at 30 health: 2 brutes + 2 hounds + a seer, a second seer 18 s after the first falls; fewer if the den is cleared) | `game/warden/fight.js` via `systems/wardenFight.js` | frost | Warden fight, listed only |
| The Bellwether's summons (`summonNames`: 2 sedgerunners, a hedgewarden, a chanter) | `systems/bellwetherFight.js` | meadow | Warden fight, listed only |
| Echo stone "guard" trial (a seer behind 2 hounds, rise round the stone when the Wraith starts the trial) | `systems/echoTrials.js` | frost | yes, as `echo-guard` (player-started, not armed by a quest step) |
| The carried flame draws 2 prey at night after a carry of `drawAfter` s (hounds in frost, sedgerunners in the meadow) | `systems/flame.js` | both | yes, as `flame-prey` (one role alone) |
| "The Flock in the Barley": 5 sedgerunners hidden in two flocks | `systems/side/flock.js` | meadow | yes, as `side-flock` (one role alone) |
| Photo-spot Shaped (`shaped: { spawn }` in `data/photo-spots.json`) | `systems/creatures.js` | both | excluded (captures only) |
| Dev spawns (`game.spawnShaped`, overlay) | `boot/game.js` | both | excluded |
| The village fire (`systems/villageFire.js`, `systems/villagers.js`) | meadow | none: fire and villagers, no Shaped | n/a |
| Trials (`systems/trials.js`: Shapers' Run, verb stones, the bell) | frost | none: no hostile Shaped | n/a |

`systems/encounters.js` holds **no meadow entries**. Besides the Bellwether (a Warden), the meadow's only hostile content is the Barley flock (one role) and the night flame prey (two sedgerunners, one role).

### 1.2 Archetypes in code against §4.1

| Role | Frost | Meadow | Dunes |
|---|---|---|---|
| Swarmer | hound (exists) | sedgerunner (exists, `flush`) | missing (not in this audit's scope) |
| Bruiser | brute (exists) | hedgewarden (exists, `territory`) | missing |
| Caster | seer (exists, ice shards) | chanter (exists, `support`: its song heals, pollen holds focus; **no shards**, so it is a support caster) | missing |
| Elite | den mother (exists, only in the `den` encounter) | **the Old Hedge does not exist** (`grep` for `oldhedge`, `Old Hedge` over `src/` and `data/`: no match) | missing |

The meadow caster exists but appears only in the Bellwether's summons. The meadow's elite does not exist: noted, not built (plan rule).

### 1.3 Armed encounters

Columns as in the plan. "Calm after" is the seconds until the next hostile spawn can happen nearby. At `43f2e8a` there is **no calm rule**: waves come 1.8 s after the last breaks (`e.gap > 1.8`), and the next encounter arms the instant its quest step opens and the Wraith is within `near`; after a death the Wraith re-forms at a shrine and the same encounter can rise again at once. So "calm after" is 0 s everywhere. Active cap is the largest wave (the global cap is 8 in `shaped.js` `MAX_SHAPED`).

Roles: swarmer = hound/sedgerunner, bruiser = brute/hedgewarden, caster = seer/chanter, elite = den mother. Arena feature: the share of the 35 m fight disc that is water/ice, surfable slope (0.12–0.6) or cliff, from the baked world (`node tools/world/arena.mjs`), plus the hand-read feature.

| id | biome | place (x, z) | armed by | waves (archetype × count) | roles | arena (measured) | kind | visible reason | telegraphs | calm after | active cap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `cloister` | frost | monastery (1125, 2750), `fromFacing` | `empty-robe` step `cloister` | W1: hound×2 | swarmer (1) | ruins + steps: water .08, slope .23, relief 5 m | ambush | "The stone woke something there" (journal only) | hound crouch and glowing back | 0 s | 2 |
| `camp-raid` | frost | camp-frost (880, 2450) | `pilgrims-fire` step `defend` | W1: hound×3; W2: brute, hound×2 | swarmer, bruiser (2) | slope .45, cliff .09, water .15, relief 12 m | guarded site (the tents) | the camp and its people | hound crouch; brute rears and cracks glow | 0 s | 3 |
| `varo-hounds` | frost | varo-rise (960, 2350) | `watching-stone` step `rescue` | W1: hound×3; W2: seer, hound | swarmer, caster (2) | slope .72, cliff .16, relief 24 m | guarded site (Varo pinned) | Varo standing in view | hound crouch; seer core glows before a shard | 0 s | 3 |
| `spring-hounds` | frost | spring-frost (600, 2470) | `trail-in-snow` step `guard` | W1: hound×2 | swarmer (1) | frozen lake .95 | guarded site (Tobin on the ice) | Tobin in view | hound crouch | 0 s | 2 |
| `escort-ambush` | frost | tarn-crossing (740, 2462) | `trail-in-snow` step `home` + flag `escorting` | W1: hound×2 | swarmer (1) | frozen tarn 1.0 | ambush | Tobin must be led home | hound crouch | 0 s | 2 |
| `den` | frost | den-frost (1620, 2560) | `den-mother` step `den` | W1: hound×3; W2: brute, hound×2; W3: den mother | swarmer, bruiser, elite (3) | enclosed bowl: cliff .66, relief 59 m | hunt (elite in its lair) | the sled's tracks lead here | hound crouch; brute and den mother rear with glow; her rime armour is visible | 0 s | 3 |
| `echo-guard` | frost | at an echo stone with the `guard` trial | the player starts the trial | seer + hound×2 at once | swarmer, caster (2) | the stone's ground | (player-started) | the stone | as above | 0 s | 3 |
| `side-flock` | meadow | side-barley (22, 1108) | `meadow-side-flock` after `ask` | 5 sedgerunners lying hidden (3 north, 2 south), all break when one is closed to 9 m | swarmer (1) | grass | hunt (flush the quarry) | the quest, Dunn's barley | they rise out of the grass; "something lies in it" notice | 0 s | 5 |
| `flame-prey` | both | wherever the flame is carried at night | `flame-carried` for `drawAfter` s, after dark | 2 hounds (frost) / 2 sedgerunners (meadow) | swarmer (1) | none | ambush | "drawn by the light" notice | hound crouch | 0 s | 2 |
| frost Warden | frost | warden-brazier (1047, 2313) | `held-snow` step `warden` | frenzy summons, see 1.1 | all | the arena | Warden frenzy | the Warden | spikes, wind | 0 s | 5 + Warden |
| Bellwether | meadow | the manor forecourt (300, 1000) | `meadow-the-burning-night` step `release` | summons, see 1.1 | swarmer, bruiser, caster | forecourt | Warden frenzy | the Bellwether | gale front | 0 s | 4 + Warden |

### 1.4 The critical paths in order

Frost main (`empty-robe` → `pilgrims-fire` → `watching-stone` → `held-snow`):

1. `cloister` (ambush)
2. `camp-raid` (guarded site)
3. `varo-hounds` (guarded site) — **same kind twice in a row (2 and 3)**
4. frost Warden (frenzy)

Frost sides (open once Maren is met): `trail-in-snow` → `spring-hounds` (guarded site) then `escort-ambush` (ambush); `den-mother` → `den` (hunt). Echo-stone `guard`, the night flame prey and the sides can come in any order.

Meadow main (`meadow-the-burning-night`: Wenna leads to Hearn → fires → Ebb → Hild → climb the stair → the manor → the Bellwether): **no armed encounter before the Warden**. The fire night is a rescue against fire (not hostile Shaped), and the climb from the stair foot to the manor (about 200 m of walking and 140 m of climb) is empty. Meadow sides: `meadow-side-flock` (hunt) is the only fight.

Roles across all armed frost encounters: swarmer in all six, bruiser in 2, caster in 1 (a single wave of one seer), elite in 1. Three of six are **one role alone** (`cloister`, `spring-hounds`, `escort-ambush`), against §4.2.

## 2. Measurement (Phase B)

Tools: telemetry `src/systems/encounterLog.js` (`g.encounterLog`, only with `?bot=1`, allocation-free); harness `tools/bot/encounters.mjs` (teleports to a start 36 m from the place, forces the encounter with `g.startEncounter`, in-page auto-fighter, one JSON line per run into `docs/encounter-runs/<label>.jsonl`); arena stats `tools/world/arena.mjs`. Windows Chrome on the RTX 3060, preview on port 4177, full health, Flow reset, 13:00 unless stated, a run that is not cleared in 100 s of game time counts as failed.

Two kits, both bot-played (an ideal tireless player: read as relative):

- **staff**: the start weapon only, lights with a heavy every 3.5 s and bend-steps away from lunges (the `fight.mjs` logic). It never uses Frost.
- **best**: the glaive plus Frost's Sweep (Q tap) at foes 4–13 m off, and Crystallize (F) on brutes and the den mother. (The plan's "Gale weapon" does not exist as a class: the glaive is the weapons playtest's best answer to packs.)

**Calibration** (`docs/weapons-playtest.md`: 3 hounds, staff, mixed = 6.2 s): `tools/bot/fight.mjs staff mixed hound:3` on this build gave 6.4 s and 5.8 s. The harness's own numbers include the walk to the foes and the waves' 1.8 s gaps, so they are longer than a bare kill time.

**Starvation** is the share of the run with focus below 10 (the Gust; below 8, the bend-step, is in the raw lines as `starve8`). It is **0 % almost everywhere** (the bot's casts are from full focus and rare), so the under-15 % target is met but **not a test of a human's focus use**: NOT ASSESSED for humans. Weapon blows cost no focus; only Sweep (14), Crystallize (30), Gust (10) and the bend-step (8) do.

## 3. The numbers, before and after (3 runs per cell, day; mean and range)

Before = the six frost encounters at `43f2e8a` (`docs/encounter-runs/baseline-day.jsonl`; the best kit's baseline is its second batch, with Crystallize). After = this branch (`after-day.jsonl`). `cl` = cleared. Time and health taken per run; "t2+3" = seconds at Flow tier 2 or 3.

| Encounter | Kit | Before | After |
|---|---|---|---|
| `cloister` (+ seer wave) | staff | 3/3 cl, 12 s, taken 0 | **0/3 cl (100 s), taken 0**: the staff bot cannot close on the seer |
| | best | 3/3 cl, 11 s, taken 0 | 3/3 cl, 33 s (33–34), taken 4 (0–12) |
| `camp-raid` (+ blizzard) | staff | 3/3, 22 s, taken 36 (12–54), t2+3 3.8 s | 3/3, 23 s, taken 24 (12–30), t2+3 8.8 s |
| | best | 3/3, 19 s (16–20), taken 18 (0–54) | 3/3, 19 s (18–19), taken 24 (0–42) |
| `varo-hounds` (unchanged) | staff | 3/3, 28 s (22–35), taken 24 | 3/3, 26 s (22–31), taken 28 |
| | best | 3/3, 16 s, taken 0 | 3/3, 18 s, taken 4 |
| `spring-hounds` (+ seer) | staff | 3/3, 11 s, taken 4 | 3/3, **41 s (33–53), taken 57 (40–92)** |
| | best | 3/3, 8 s, taken 4 | 3/3, 19 s (18–20), taken 10 |
| `escort-ambush` (+ brute) | staff | 3/3, 9 s, taken 4 | 3/3, 22 s (19–24), taken 40 (0–60), t2+3 4.7 s |
| | best | 3/3, 7 s, taken 0 | 3/3, 19 s (16–21), taken 30 (0–60), Flow 3 reached |
| `den` (unchanged) | staff | 0/3 cl, 3 deaths | 0/3 cl, 3 deaths (identical) |
| | best | 0/3 cl, 3 deaths | 1/3 cl (69–100 s), 2 deaths: run to run noise, the code is unchanged |
| `stair-wardens` (new) | staff | n/a | 0/3 cl (the chanter kites the staff bot), taken 60 (48–66) |
| | best | n/a | 3/3, 17 s (16–20), taken 19 (0–28) |
| `ring-ambush` (new) | staff | n/a | 0/3 cl (the chanter kites), taken 3 |
| | best | n/a | 3/3, 22 s (21–24), taken 41 (28–56) |

Night (13:00 → 22:00, best kit, 1 run each, `after-night.jsonl`): every encounter cleared; times within 1–2 s of the day's (den 63 s), health taken 0 in all but `spring-hounds` (10). A taken-0 night across the board is **unexplained** (the bot's dodge may read the dark telegraph as well as the day's; or the hounds' pack timing differs): NOT ASSESSED which.

Also measured: max active Shaped was 2–3 in every run (the cap of 8 is never approached); deaths 0 outside the den and one death in an early `stair-wardens` build (since lightened).

Targets:

| Measure | Target | Measured |
|---|---|---|
| Focus starvation | under 15 % | 0–2 % (the bot barely uses focus: not a human measure) |
| Flow | tier 3 reachable, not constant | tier 3 reached in `camp-raid`, `escort-ambush` and the `den`; tier 0 for most of every run; never constant. Cold-start fights rarely lift Flow (known, `gameplay-design.md` §3 "Open") |
| Deaths | recorded | 0 everywhere except the `den` (staff bot: 3 deaths in 3 runs, best kit 2 in 3) |

## 4. Verdict per encounter (principles: §4.2, `encounter.md`, `smells.md`)

| Encounter | Verdict | Why and the smallest fix |
|---|---|---|
| `cloister` | **changed** (+ a seer wave) | One role alone against §4.2 (3 of 6 frost fights were). Second wave: a seer 32 m out, behind the steps. It teaches "close the distance or break line of sight". Cost: the first fight of the game went from 11 s to 33 s (best kit) and the staff-only bot cannot close on a seer at all. **Risk: a first fight that long may be a bad tutorial. A human must judge it (NOT ASSESSED); if it reads badly, cut the wave, not the rule: move the seer into the `camp-raid` instead.** |
| `camp-raid` | **changed** (kind: storm surge) | Was a guarded site next to another (`varo-hounds`). It now turns the weather to a blizzard while it lasts (`worldState.weatherOverride`, released at the clear or a load; not if the overlay or a photo spot already holds one). Honest-telegraph risk (§4.2: a storm surge makes telegraphs harder to read): not looked at in motion; the one shot (`screenshots/encounters/camp-raid-blizzard.png`) is taken before the weather has built. Roles: swarmer + bruiser. Arena: slope .45, water .15. |
| `varo-hounds` | **keep** | Swarmer + caster, slope arena (.72 surfable, relief 24 m), the visible reason is Varo. The best-played one: the best kit takes 0–4 damage, the staff 24–28. |
| `spring-hounds` | **changed** (+ a seer wave) | A seer across the frozen lake (22 m) shoots at the Wraith and at Tobin's ice. The staff-only cost went from 4 to 57 health and 11 to 41 s; with Sweep 10 health. Keep, but this is the worst case for a staff-only player: if a human finds it a slog, drop the seer to 28 m or cut it. Arena: ice. |
| `escort-ambush` | **changed** (+ a brute) | A slow brute walking across the tarn is a lesson in the freeze (Crystallize, then a heavy shatters it). Cost 4 → 40 health with the staff; it raised Flow to 3 in some runs (near-miss dodges). Arena: ice. Kind: ambush (after the guarded `spring-hounds`). |
| `den` | **keep, but too hard for the bot; NOT ASSESSED for a human** | Three roles, an elite, a cliff bowl (cliff .66: cover and a place to be pinned). Neither bot kit clears it reliably (0/3 staff, 1/3 best): the den mother's armour (0.3 unless frozen) and the brute wave with two hounds. Real players have Flow, the consumables and the shrine; the bot has none. The fix to try if humans fail: nothing in this audit (the polish agent owns the poise and stagger path). |
| `stair-wardens` (new, meadow main path) | **new** | The meadow's critical path had no armed encounter before the Bellwether. The hedge guards the foot of the stair (kind: guarded site, the manor is in view above): a hedgewarden and a hidden sedgerunner, then a chanter and a sedgerunner. Armed by `meadow-the-burning-night` step `manor`. It rises on the 25 m shelf at the road's end (a first version at 20–24 m rose beyond the stair's retaining wall: unreachable). The hedgewarden's territory means the Wraith can walk past it (the plan's "surf past, and that's fine"). The first version also had two runners: 79 health lost with the staff, so one was cut (60 now; 19 with the best kit). |
| `ring-ambush` (new, meadow side) | **new** | The Ring of Nine: two runners and a chanter, then a hedgewarden. Armed by `meadow-side-stone` step `go`. Ruins (the standing stones) are the cover. The best kit takes 41 health (a runner pack in the open): the biggest hit in the set, as in the weapons playtest. |
| `side-flock` | **changed** (a chanter 30 m behind the south flock) | Five runners were one role alone; the chanter's song mends the runners, its pollen holds focus. Not measured on the page (the quest needs Dunn's talk): NOT ASSESSED. |
| `flame-prey` | **keep, exception** | Two hounds drawn to the carried flame at night: a lure, not an encounter; listed in `SOLO_OK` in the test. Now also held back by the calm window. |
| `echo-guard` | **keep** | Seer + two hounds already: 2 roles. Player-started, so not on a route. |
| Wardens | out of scope | Frenzy summons already mix roles. |

## 5. The biomes as a whole

**Role mix.** Frost: every encounter now has two or more roles across its waves (hound/seer, hound/brute, hound/seer, hound/seer, hound/brute, three roles in the den). The seer is in four fights (was one), the brute in three (was two), the elite in one. Meadow: sedgerunner, hedgewarden and chanter now all appear outside the Bellwether; the Old Hedge (the meadow elite) **does not exist** and was not built (plan rule).

**Kind rotation** (`ROUTES` in `src/systems/encounters.js`, tested): frost main ambush → storm surge → guarded site → Warden frenzy; frost trail guarded site → ambush → hunt; meadow main guarded site → Warden frenzy; meadow side hunt → ambush. No two in a row. Before: `camp-raid` and `varo-hounds` were both guarded sites.

**Arena features.** Every encounter had one already (measured, section 1.3): ruins, slope, ice, cliffs. None needed its ring moved; the only move was the stair's rings pulled in (to stand on the shelf). Whether the fight *reshapes* the ground (craters, freezes, grass flattened) is true of the verbs (the terrain state keeps every mark) but **not measured per encounter**: NOT ASSESSED.

**Calm after peaks.** There was none. Now `src/systems/calm.js`: after an encounter clears, a Warden is released (frost: `warden:released`; meadow: the Bellwether release), or the Wraith re-forms from a death, no new encounter rises within 120 m for 60 s, and neither does the Barley flock or the flame's night prey. A forced encounter (`g.startEncounter`: the bot, the dev) and the waves inside an encounter are exempt. Numbers in `calmTuning`. Music and ambience already settle after a sting; that part is NOT ASSESSED. The existing routes never needed it (consecutive places are over 120 m apart); it matters for deaths and the Warden's release.

**Swarmers and casters cutting across surf lines.** Hounds and runners lunge across a line (telegraphed by the crouch); seers and chanters keep 11–12 m and shoot or heal. Whether a *mobile* player is threatened *at surf speed* is NOT ASSESSED: the bot fought on foot.

**Honest telegraphs.** From the code: the hound crouch and back glow, the brute's rear and glow, the seer's gathering core, the den mother's visible rime. **Seen in a shot:** one close-up of a hound next to the Wraith in the blizzard. **At speed, at night, in the blizzard: NOT ASSESSED.**

## 6. Smell walk (`smells.md`)

- **Dominant strategy:** present in one place. A caster is answered only by Sweep or the Gust: the staff-only bot cannot clear the seer or chanter waves (cloister, stair, ring), while the best kit does so in 17–33 s. That is the design ("close the distance or break line of sight") but a **player who only swings is stuck**: the seer keeps 11 m and retreats. Watch in the user's play. Surfing past every fight is legal by the rules.
- **Bare core:** not assessed here (see the isolation films).
- **Lying telegraph:** none found in code; not assessed in motion.
- **Complexity:** the new rule count is small (a field each for `arena`, `kind`, `weather`, `heading`).
- **Treadmill:** none.

## 7. NOT ASSESSED

- How any fight **feels to a human**, including whether the longer cloister, the seered spring and the brute on the tarn are fun or a slog.
- Whether **telegraphs read at speed**, in the blizzard, or at night (one daytime close shot only).
- Focus starvation for a human (the bot's is 0–2 %).
- The Barley flock with its chanter on the page; the den for a human; the flame prey with the calm window.
- Whether the **calm rule** is felt (60 s, 120 m): only the data and unit tests; whether the music settles.
- Why night runs took no damage.
- The bot was a melee-only chaser for the "staff" kit: its 0/3 clears against casters are the bot's limit as much as the design's.
- Dunes, mire, ember, coast (no encounters in code).

## 8. Lead lifecycle review (Codex, 2026-10-27)

**Feature:** preserve complete encounter waves and quiet after a clear, and discard measurements for abandoned fights. This serves pillars 4 (quiet, but never empty) and 5 (learn by reading), in the minute and session loops, targeting readable challenge and relief.

**Verdict: keep the lifecycle fixes; hold integration for the outstanding GPU review.** A shared allocation-free capacity check counts only EMPTY slots, matching `shaped.spawn`; first and later waves wait instead of silently dropping enemies when the pool is full. The Barley flock reserves all six slots and starts the calm window on clear. Abandoning it, ending an encounter or loading discards active telemetry; finished runs are recorded before encounter reset. Starting the first active run rebases health so earlier damage cannot contaminate its result.

**Measured here:** main baseline 687/687 tests; merged encounter branch 749/749 tests, including 13 new lifecycle regressions and the existing 49 encounter rules tests. Locked production build passes. Later waves and forced starts bypass calm; automatic starts respect it. Full pools and FALLING bodies cannot skip waves or complete the Barley quest without spawning its enemies. Regression checks also cover weather ownership, death re-form, abandonment and load.

**Smell review:** no additional combat or reward rule; no new treadmill, gate or opportunity-cost change. Dominant strategy, bare-verb fun and honest telegraphs in motion remain NOT ASSESSED here. The earlier measurements and caster-bot limitations above are historical results, not fresh runs of this revision.

**Still required:** glide and frost-combat isolation films, visual review in motion, fresh bot runs including pool contention and the Barley clear, and GPU pipeline/performance checks. Windows `cmd.exe /c ver` failed with `UtilBindVsockAnyPort: socket failed 1`; GitHub fetch failed because `github.com` could not resolve. No new target-GPU or push claim is made. The branch is deliberately kept separate from main until the review is possible.

## 9. Target-GPU continuation (Codex, 2026-10-28)

The Windows Chrome/RTX 3060 path works again. The lifecycle fixes are kept. Three fresh staff + Frost daytime runs per encounter are recorded in `docs/encounter-runs/lead-frost-day.jsonl`: cloister 3/3 clears, mean 31.1 s and no damage; stair-wardens 3/3, 22.4 s and 28 damage; ring-ambush 3/3, 22.9 s and 56 damage. No deaths or focus starvation; maximum simultaneous enemies 2, 2 and 3. Every successful clear started 60 s of calm. This corrects the earlier melee-only bot limitation without removing the caster role.

The original Barley check cleared 1/3 runs: in two runs the bot stopped against field collision with two hidden runners remaining. Those failures remain in the raw data. The harness now detects a stalled chase and makes a short alternating detour with a jump. It preserves world collision, health, damage and quest rules. Repeat results in `lead-flock-navigation.jsonl`: **3/3 clears**, mean 25.7 s (23.6–27.2), mean damage 13.3 (10–20), no deaths or focus starvation, maximum six active. All three clears start 60 s calm. The detour fired 3, 0 and 1 times respectively.

### Isolation films and visual review

All three committed films are H.264, 1280×720, fixed 60 fps and below 15 MB. Probe results are in `docs/encounter-runs/isolation-media.json`. Local 1920×1080 copies and source frames are excluded from git; the requested local 1440p capture was not produced.

| Film | Duration | Size, bytes | Measured behavior |
|---|---:|---:|---|
| `screenshots/isolation/surf-720p.mp4` | 120 s | 13,188,643 | Speed maximum 22.5 m/s, mean 15.3; tier seconds 37.2 / 20.3 / 64.6 / 0 |
| `screenshots/isolation/glide-720p.mp4` | 60 s | 13,192,247 | Airspeed maximum 21 m/s, mean 13.8; mean vertical speed −1 m/s; lift 8.4; 33.9 s soaring, 14.2 s landed, 7.1 s surfing |
| `screenshots/isolation/combat-720p.mp4` | 12 s | 7,227,045 | Staff and Frost: 1 Sweep, 2 Crystallizes, 2 heavies, 1 shatter; all three hounds released, health 100 |

Telemetry includes setup/warm-up time (surf 122.2 s, glide 62.2 s, combat 12.7 s). It is not a frame-time benchmark. The glide driver deliberately leaves the lift after 45 s to land and return to surf. The combat driver casts Sweep before freezing so the film contains the three required verbs.

Sample frames reviewed at 1280 px: combat frames 80, 240 and 480; glide 300, 1800 and 3150, saved in `screenshots/isolation/review/`. The combat camera keeps the Wraith, frozen hound and terrain marks readable. The glide shows the stream approach, open flight, landing and slope; no camera clipping in those samples. Night/blizzard combat readability and human enjoyment remain **NOT ASSESSED**. The initial surf recording reported one late pipeline before the later haze warm-up fix; fresh glide/combat recordings reported zero. Cold forest entry still reports five late render pipelines on main, tracked separately from this encounter change. No claim of world-wide pipeline acceptance or sustained 60 fps is made.

**Smells:** no added combat complexity, rewards, scaling or grind. Caster pursuit works with the starting Frost kit in the fresh checks. A dominant strategy across all encounters, telegraph reading at surf speed, human focus budgets and whether the verbs feel fun still require the broader gameplay/human gates. Existing historical day/night measurements above are retained.
