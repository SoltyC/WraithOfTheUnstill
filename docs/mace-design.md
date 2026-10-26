# The Bell-mace: a weapon of height

The Bell-mace is the sixth carried weapon (§11.2). Its hits get stronger the further you fall before them. It pairs with Gale: you Updraft up and plunge down. The idea of fall damage scaling with height comes from block-building games. Everything else here is Wraith's own: the bell, the rebound, the dunk, the ice star and the terrain it writes.

**One sentence:** a Shaper bell on a haft that stores the height you fall and pays it out as one tolling blow, so a fight becomes a rhythm of rise and drop.

- **Pillars:**
  - 1, *moving is the joy*: fights move into the air and chain with Updraft, glide and ridge lift.
  - 5, *learn by reading*: the bell's pitch and glow show the stored height, with no number.
- **Loop:** the 0–10 s combat beat (rise, then drop) and the 1-minute chain (Updraft catch → plunge → rebound → plunge).
- **Aesthetic:** Sensation, the vertical drop and the toll.

## 1. The core verb: the plunge

- **Input:** LMB in the air (light or heavy) with the Bell-mace drawn commits a **plunge**.
  - The Wraith pulls the bell overhead, then drops at 30 m/s straight down along its current horizontal drift, which is kept at 35 %. Aim assist bends the line by up to 2.5 m toward the nearest Shaped below.
  - Committing needs ≥ 2.5 m of clearance under the Wraith. Below that, LMB is an ordinary air swing.
- **Stored height `h`:** the drop from the highest point since the Wraith last stood on ground (or last plunge impact) to the impact point.
  - Updraft lift, a glide, ridge lift and jumps all count.
  - A glide's slow sink counts at half, so a long glide is not a free charge.
  - `h` is capped at **20 m** for damage.
- **Damage:** `18 + 3.2·h`. That is 18 from a hop, about 50 from one Updraft (10 m) and 82 at the cap. The maul's smash does 56.
  - The plunge is a heavy (`flow.hit(WEAPON_HEAVY)`, heavy hit-stop) and goes through the shared `strike` path: tea, tiers and affinity all apply.
- **The toll (area):** the impact rings a shockwave of radius `1.6 + 0.16·h` m (max 4.8 m).
  - The centre takes full damage; the edge takes 40 %. Knock-back scales with `h`.
  - Shaped poise counts double against a plunge from ≥ 8 m, so the brute and the hedgewarden stagger.
- **Strikes the crown:** front plates and shields don't apply to the plunge. A plate-back's glance (`affinity.js`) is skipped from above. This is what the Bell-mace is for and the maul is not.
- **Terrain writes:** the impact stamps a dent scaled by `h` through the existing ground-impact path. That means a small dent from a hop and the maul's crater only at the cap.
  - Snow throws a powder ring.
  - Turf lays flat in a ring.
  - The wind field gets a burst of strength `0.6 + h/20`, so the grass ripples outward.
- **The cost of a miss:** the plunge can't be cancelled after the first 0.12 s, apart from a dodge, which costs it.
  - A plunge that hits nothing leaves the Wraith on one knee for **0.55 s**.
  - On the ground the Bell-mace is weak: a 3-hit light combo of 9, 9, 14 with a 2.0 m reach and slow recovery. Its ground heavy is a short **hop-swing** (11 damage) that leaves the Wraith 2.5 m up, just enough for a small plunge.
  - **Honest weakness:** on flat ground with no Gale, the Bell-mace is the worst weapon.

## 2. Telegraph on the body: the bell reads the height

There is no HUD. While airborne with the Bell-mace drawn:

- **Glow:** the bell's mouth glows from dull bronze to white-gold as `h` grows, scaled 0 → 20 m. The glow is a weapon-shader uniform, like the death-drop glow.
- **Pitch:** a quiet hum rises over two octaves with `h`. At the cap it holds a steady overtone, so you can hear when more height adds nothing.
- **Impact sound:** a bell toll whose loudness and length scale with `h`.
- **Trail:** a fall trail from ≥ 6 m, using the swept trail, upright, in the element colour.

## 3. Combos unique to the Bell-mace

Each combo is one rule. Together they make a vertical rhythm no other weapon has.

### 3.1 Rebound (core, no forge needed)

- A plunge that **connects** throws the Wraith back up by `0.5·h` (max 8 m), plus a little drift toward the nearest other Shaped within 9 m.
  - The rebound's height becomes the new stored height, so you can plunge again from it.
- Each rebound in a chain gives 30 % less height (100 %, 70 %, 49 %…). Touching ground resets the chain.
- **Why it matters:** one Updraft can carry 2–3 plunges through a pack. The decay means you still need a new Updraft or a ridge.
- **Flow:** each rebound plunge is a chain (+0.45, using the existing chain streak), so a well-read pack builds Flow toward tier 3.

### 3.2 Updraft launch (Gale)

- The Updraft is the main way up: cast it under yourself, then plunge. Catching the Updraft already counts as a chain (+0.45).
- **New:** a plunge started **inside an active Updraft column** gains `+4 m` of stored height. The column pushes the bell down as it collapses, and the column ends at once with a ring burst.
  - This spends the Updraft early for more damage instead of more height: a decision.

### 3.3 The dunk (Gale)

- An Updraft already lifts and staggers the Shaped it catches. They now go **airborne**: they rise 3–5 m (by mass) and hang for 0.8 s.
- A plunge onto an **airborne** Shaped drives it into the ground as a projectile. Where it lands, a second impact strikes for 60 % of the plunge's damage in a 2.4 m disc.
  - It writes its own dent and knocks down whatever it lands among.
- **Why it matters:** you lift one foe out of a group, then hammer it down into the rest. It is the Bell-mace's crowd answer, and it only exists with Gale.
- **Scope note:** Shaped currently have only a visual `lift` pose. The dunk needs a small airborne state: a y offset with a ballistic arc, landing on the ground query, AI paused while airborne. The Updraft's `strike(..., lift)` already marks who is caught.

### 3.4 The ice star (Frost)

- A plunge from ≥ 6 m onto **frozen ground or ice** (a Sweep lane, a Crystallize sheet, a frozen tarn) cracks the ice in a six-armed star of length `h/2` m.
  - Every **frozen Shaped** inside the star or the toll shatters: `onShatter`, +0.6 Flow each.
  - The broken ice is written to the terrain state as slush where the arms run.
- The maul shatters one frozen foe. The Bell-mace from height shatters a frozen group, but only if you first froze them on ice and got up high. A Frost-plus-Gale setup.
- On plain snow it is only the powder ring. The ice star needs real ice (reaction table: the element made the ice; the mace only breaks it).

### 3.5 Downdraft (Gale, focus)

- A Gust (Q tap) cast **during a plunge** fires straight down under the Wraith instead of forward.
  - It adds `+5 m` of stored height (still capped at 20) and costs the Gust's 10 focus.
  - It also scours a ring at the impact point, so loose powder and sand blow out.
- This lets a low plunge (a hop, a small rebound) hit hard, at the price of focus. A choice between height and focus.

### 3.6 Ridge and glide (traversal)

- A plunge can start from a glide, from ridge lift on the meadow ridges or the restored summit course, or from any crest jump.
  - A glide's height counts at half (§1).
  - A plunge from a glide keeps 60 % of the glide's speed sideways instead of 35 %, so a diving attack still travels.
- A gliding plunge that connects and rebounds can go **straight back into the glide** (RMB held at the top of the rebound). That is a surf → glide → plunge → glide chain.

## 4. Flow at 2 and above

- **Flow 2+:** the rebound decay softens from 30 % to 20 %, and the ring the toll leaves becomes a visible rim of wind that ripples the grass for 1.5 s.
- **Flow 3:** a plunge from ≥ 12 m leaves a **small Updraft** (half strength, 1.2 s) at the impact point. Rising, falling and rising again can then sustain itself briefly with no focus.
  - At Flow 3 this is the flowing finisher §11.2 asked for ("a glide-dive slam").

## 5. Forge ladder (§11.4 pattern: I, III and V change play)

| Tier | Change |
|---|---|
| I | **The hop-swing rises 4 m** instead of 2.5 m, so a plunge works from flat ground with no Gale. |
| II | +12 % |
| III | Infusion slot. Frost: a plunge freezes the toll's ring for 1.4 s on the third plunge in a chain. Gale: the rebound gives +2 m. |
| IV | +12 %, a wider toll (+0.6 m) |
| V | **Thunderhead:** every plunge from ≥ 12 m leaves the small Updraft of §4, at any Flow. |

The cost is the same as the other weapons, from the same materials.

## 6. Where it comes from: the Bell Ledge

- The Bell Ledge is planned in `docs/cross-biome.md` §3 (frost: "Updraft to the Bell Ledge shrine above the monastery") but not yet built. Build it here as a small site.
- **Site:** a stone ledge about 9.5 m up (an Updraft with the glide peaks at 10–12 m, so it can be landed on) the cliff behind the monastery. A Shaper bell frame stands on it, with the mace hung as its clapper.
  - It can't be reached by climbing; only an Updraft cast against the front wall gets you up: you rise beside the wall and steer onto the top while the column still lifts (rising air gives the robe 0.7 air control).
  - It is visible from the monastery yard, so the lock is shown before the key.
- **Needs:** Gale known (the flag from the Bellwether). "Take" from the bell frame.
- **The first lesson is free:** two hounds idle in the hollow below the ledge. The way down is the first plunge (h ≈ 9.5 m, about 48 damage, a rebound to the second hound).
  - Remembrance entry `rem:bell-ledge` ("The bell that fell to ring").
  - The site counts as a nook for the payoff log.
- Fieldstone props come from `blobStone.js`, and the bell frame uses the existing Shaper stone language. Don't change the graphical style.

## 7. Wardens

- The plunge is a heavy like any other. Wardens keep their own win conditions (pillar 3), and plunge damage on a Warden is capped at the maul smash's 56, so height never short-cuts a release.
- A Warden phase can still ask for a strike from above (a crown, a crust). That is for later Warden design to use; nothing is built for it now.

## 8. Smell check

| Smell | Verdict |
|---|---|
| Bare core is not fun | NOT ASSESSED. Isolation test: an empty field, one Updraft and three training hounds; the bot films the rise, plunge, rebound and plunge. A human has to judge the feel. |
| Dominant strategy | Risk. Updraft → plunge could win every fight. Fixes: the 20 m cap; rebound decay; 24 focus per Updraft; the 0.55 s kneel on a miss; weak on the ground; Warden cap. Bot measure: clear times against the other five weapons. The Bell-mace must not win all four standard fights. |
| No opportunity cost | Clear: height costs focus (Updraft, Downdraft) or route (ridges); a miss costs a kneel. |
| Treadmill | Clear: tiers I, III and V change moves (hop-swing height, infusion, Thunderhead). |
| Lying or missing telegraph | Clear by design: glow, pitch and the steady cap overtone. Needs a human to confirm the pitch reads. |
| Complexity over depth | Watch it. Six rules, but each is one sentence and each makes one decision: spend the Updraft for damage, lift one foe to dunk it, freeze on ice first, spend focus on a Downdraft, glide back out. If the bot or the user finds one unused, cut it (Downdraft first). |
| Gate without warning | Clear: the ledge is visible from the yard before Gale. It is not on any critical path. |
| Scope mismatch | Moderate: the Shaped airborne state and the Bell Ledge site are the new work; the rest reuses the weapon machine, the ground impact, the Updraft and `onShatter`. |

## 9. Bot playtest (measure, don't guess)

- **Isolation:**
  - Updraft → plunge on one training hound;
  - log `h`, damage, toll radius and rebound height for 5, 10, 14 and 20 m (glide).
- **Standard four fights** (`tools/bot/fight.mjs`, mixed plus a plunge mode): 3 hounds, brute + 2 hounds, brute + 4 hounds, 3 sedgerunners, and 2 hedgewardens + 2 sedgerunners.
  - Report against the weapons-playtest tables.
- **Chains:** plunges per Updraft in a pack of 4, and the Flow reached.
- **Combos:**
  - the dunk (secondary impact hits a second foe);
  - the ice star (3 frozen hounds on a Sweep lane, all shatter from ≥ 6 m);
  - Downdraft (+5 m shows in the logged `h`).
- **Pipelines:** `gpuStats.late` stays empty through every combo.
- **Allocation:** zero per frame in the plunge and rebound path.
- **Shots:** `p9w-mace-*`:
  - the ledge from the yard;
  - the take;
  - the plunge at 3 heights (glow);
  - the toll ring;
  - the dunk;
  - the ice star.
