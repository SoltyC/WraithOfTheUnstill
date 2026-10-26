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
