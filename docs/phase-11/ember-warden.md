# The Ember Warden: *The Hold* (design, 2026-11-25)

The user gave permission to build this fight on 2026-11-25. Sources: `ember-design.md` §1, §6, §7; `gameplay-design.md` §5; the `wraith-design` Warden brief.

## In one sentence

A titan of basalt and cooling crust, half sunk in the crater's lava lake with its arms locked across the vent, tears one arm free when the mountain goes. The Wraith must **bind its striking arms to the crater's rim**, freezing each fist to the rock in the moment it cools after a blow. Then it climbs the bound arm to the titan's chest and **gives the fire back** to its heart, and the Warden lets go and settles into the lake.

- **Pillar:** 3 (release, not kill), with 1 (the climb, the dodge) and 2 (the obsidian stays).
- **Loop layer:** session (the chapter's climax).
- **Aesthetic:** challenge, then pity.

## Why not "cool its crust and break it"

That is the Frost Warden's formula again: freeze the joints, shatter them. It fails the three-axes rule on the win condition and the discovery. So **nothing is broken**. The fight is a duel of timing, won by *holding*: the thing it did for the mountain, done to it.

## The five axes against the roster

| Axis | Ember Warden | Differs from |
|---|---|---|
| Target | **aggressive and rooted**: half sunk, it can't move, but its arms reach the whole caldera | Frost (static, passive); Bellwether (a building); Walker (moving, never attacks); Listener (hidden) |
| Win condition | **bind** both arms to the rim (Frost at the cooling beat), then **reach** the heart over the bound arm and give it the fire | Frost (break joints); Bellwether (strip, open valves); Walker (steer); Listener (strand) |
| Discovery | **its rhythm**: after a blow, the fist cools white, then orange, then dark red, then flares again. Frost only takes in the dark beat; in white heat it flashes to steam | Frost (which joints); Bellwether (order); Walker (gait); Listener (noise) |
| Arena | **the caldera shrinks**: the lake rises a terrace with each phase, ledges flood, and the obsidian the player makes becomes footing over the lava | Frost (snowfield); Bellwether (grounds); Walker (2 km journey); Listener (drowned city) |
| Tempo and mood | **frantic, then still**: fury, then pity as it hangs bound and panting | deliberate / staged / pursuit / stalking |

All five axes differ.

## The brief

1. **Fiction.** It held the mountain's fire still: its hands are the lid on the vent. It isn't evil. As motion comes back to the world, its grip is failing and it is in agony, and it strikes at anything that moves near its vent because moving things are what is breaking it.

2. **The approach.** The volcano is the global landmark. The climb to the rim is already built (the ash, the heat, the promontory facing the chapel).
   - **Before the eruption:** at the rim the Wraith sees it, half sunk, arms across the vent, straining. The crust creaks, and the lake rises past its chest by stage. This is **the crater scene** (`people-and-cutscenes.md` §3.3), a short scene the first time the Wraith reaches the rim.
   - **At the eruption:** its right arm tears free in the blast. From the plain, an arm against the column is the silhouette.

3. **The waking.** The eruption wakes it. The fight runs whenever the Wraith enters the caldera from stage 5 on, during the eruption or after it.
   - **Element lent:** Ember is lent when the Wraith first comes down into the caldera; its motion is caught as with the others. In the fight, Ember is **given back** at the end (the release beat).
   - **Ember's own verbs (Flare, Stream, Fuse) are not built yet** (Phase 11 list). So the fight's critical path is **Frost plus the release interact**, which keeps the open order (`cross-biome.md`). Gale and Stone are optional help: a Gust knocks a lava gobbet aside, a Ridge is cover from spatter.

4. **Phases.** Each phase boundary is a checkpoint.
   1. **One arm.** The left hand still holds the vent; the right arm hunts.
      - **Telegraph, through material:** the arm rises, the fist goes white-hot, and the ledge it will strike glows and its ash lifts.
      - **The blow:** a slam (one ledge) or a sweep (an arc across a terrace).
      - **After the blow:** the fist rests where it landed for about 4 s, cooling white → orange → dark red, steaming, then flares and lifts.
      - **Valid solutions:**
        - Crystallize the fist, or soak it with Ribbon, *in the dark beat*: two freezings bind it to the rock in an obsidian shackle;
        - frozen early, it flashes to steam and the beat is lost;
        - Sweep can add a freezing too.
      - **When it is bound:** it strains, the vent hand slips, the lake surges up a terrace (the caldera shrinks), and the left arm tears free.
   2. **Both arms.** The vent is open:
      - lava fountains rain gobbets (the eruption's bombs, closer);
      - both fists strike in turn;
      - the bound arm stays bound, but its strain throws spatter.
      Bind the left the same way. With both bound, **it hangs, held and panting: the calm moment.** The lake stills and the fountains sink.
   3. **The heart.** Climb the bound right arm: its obsidian crust is the climbing surface, rim → elbow → shoulder.
      - At the chest, the heart glows behind the crust.
      - **Give back the fire** (interact): the Wraith's hand-light goes from ember red to its own colour.
      - **The release:** it unclenches, the obsidian shackles crack, and it settles back into the lake, which crusts over its shoulders.

5. **The calm moment.** Both arms bound: still air, its breathing, ash falling, the climb.

6. **The climb.** On the bound forearm, a static surface (the arm is held), reusing the Frost Warden's climb (`game/warden/climb.js`) with a tube along the arm. **Quality gate:** if the tube climb fails the bar, the bound arm is a walkable ramp of obsidian instead (decision recorded).

7. **The release.**
   - **During the eruption:** releasing it tames the eruption. Every flow slows to a quarter, no new surge starts, and the column sinks. The holdouts still home have time.
   - **After:** the crater is spent. It settles either way.
   - **The biome:** the Waste is restored (crust breathing, ember storms: BRIEF §6.5, a later step).
   - **Ember:** learned. The obsidian shackles stay on the rim as permanent marks (pillar 2).
   - **If the eruption ends first:** it is released by the eruption itself. It slumps across the open vent, still, crust gone dark. The Wraith can climb it from the rim without a fight and give the fire back, so Ember is learned whichever way it went (`ember-design.md` §8).

8. **Rules.**
   - **Death:** the Wraith re-forms at the last shrine. The world keeps the eruption's time and the lake's height, but the arms come unbound (the fight restarts at the last checkpoint phase).
   - **Damage:**
     - a blow that lands on the Wraith: heavy;
     - standing in lava: steady, with a hard push out;
     - gobbets: as the eruption's bombs.

9. **What to measure** (a bot run plus my review):
   - time per phase and deaths per phase;
   - freezings attempted in the white beat versus the dark beat (is the rhythm readable?);
   - blows dodged versus taken.

   NOT ASSESSED until played.

## Build order

1. **The body:**
   - a chunk-rig titan (torso, head, two three-segment arms, hands) in crust and glowing seam chunks, posed and animated by joint angles;
   - in the lake, straining by stage;
   - the crater scene.
2. **The fight's logic** (pure, tested): phases; arm states (hold, raise, strike, rest and cooling, bound); heat; freezings; damage.
3. **In the world:**
   - Frost hits on the fists;
   - the strikes on the ledges;
   - lava damage;
   - the lake rising;
   - the gobbets;
   - checkpoints;
   - death and reset.
4. **The climb and the heart; the release scene:** the eruption tamed, Ember learned, flags and save.
5. **Films at each step;** a bot that plays it.
