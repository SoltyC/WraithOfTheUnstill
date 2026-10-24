# Combat, boss, systemic-gameplay, game-feel and traversal design (for Wraith of the Unstill, esp. the Long Walker)

Evidence labels: [E] = designer statement or directly reported fact; [S] = secondhand/analyst/reviewer; "Application to Wraith" lines are my inferences, not sourced.

## 1. Boss design: how Shadow of the Colossus (and other large bosses) stay varied

### Takeaway
SotC's colossi differ because each started as a planning doc defining body shape, climbable fur, battle flow and arena together; the puzzle is finding how to reach the weak point, the execution is the climb. Variety came from changing the approach/discovery problem, not from adding new player tools. Ueda cut 48 concepts to 16 by merging elements of two colossi into one.

### Cited Findings
- Each colossus began as a planning document detailing its shape, where fur grows for climbing, how the battle flows and arena information; Ueda says colossus design is closely tied to how you defeat it, so designs could not be judged until modelled and tested, and failed designs often forced arena changes [E, Famitsu/guidebook interview, republished] — [Glitterberri: Making of the Colossi](https://glitterberri.com/extended-developer-interview/making-of-the-colossi/)
- Roster started at 48, cut to 24, then 16; Kaido: they would "condense the individual elements of two Colossi down into one"; optional colossi rejected as unsuited to the game; Ueda: "Like pruning tree branches, it's necessary to cut things out" [E] — same source. (The 20 intermediate figure appears only on a fan wiki: [Team Ico Wiki](https://teamico.fandom.com/wiki/Unused_Colossi), [S].)
- Ueda wanted early colossi beatable without using terrain; later fights require the environment and colossi "become trickier" [E] — Glitterberri above.
- Ueda rejected gating fights behind items from smaller enemies (would send players back into the field); core design: "Colossi you have to climb and defeat, and an enormous field" [E] — Glitterberri above.
- Spider's originally planned defeat method (slash it while riding Agro) was judged "not very elegant"; the idea was resurrected in Turtle [E] — Glitterberri above.
- Ueda: "The game needed to have the density of a painting in order to give the player a sense of vastness" [E] — Glitterberri above.
- Fight structure: research (search on horseback, no music) -> approach (quiet oppressive music, linear route, saving disabled) -> fight (percussive music). Only 2 of 16 do not require climbing to the weak point. Examples: #1 teaches sword/climbing; #2 has no visible route, bow hits soles to make it stumble; #3 must be made to hit the floor and its climbable-blocking arm trapped; later ones are flipped/trapped using environment, plus air, marine and underground giants [S, analyst article] — [Game Developer: Art of SotC 2/6](https://gamedeveloper.com/design/the-art-of-shadow-of-the-colossus-2-6-gameplay-and-story). (Its claim that no new power is ever introduced is disputed by the same article's later remark; treat cautiously.)
- Monster Hunter: behavior is planned first (player-monster spacing, logic of each action); clues via expressions/emotional states (alarmed, enraged, exhausted); distinct modes need separate design (e.g. Gore Magala Frenzied); subtle motion gives personality and signals intent; animations hand-made, based on real animals [E, Fujioka interview] — [Nintendo Life](https://nintendolife.com/news/2015/02/monster_hunter_4_ultimate_director_discusses_monster_design_and_animation)
- MH:World: monster designs grow out of habitat and relation to environment (Tobi-Kadachi uses trees; Paolumu from Coral Highlands air currents) [E/S via search summary] — [Game Informer bestiary](https://gameinformer.com/b/features/archive/2017/11/15/monster-hunter-world-bestiary-day-2-the-shocking-tobi-kadachi), [GameBanshee](https://www.gamebanshee.com/k4ak6)
- Zelda: Aonuma says the team picks the desired gameplay then asks how an item interacts with the dungeon; "dungeon -> item -> boss" is a series pattern ([S]); BotW dropped it because dungeon bosses had no dungeon-specific item [S, single reviewer] — [Zelda Dungeon](https://www.zeldadungeon.net/aonuma-discusses-zelda-dungeon-design/), [Game Informer](https://gameinformer.com/b/features/archive/2017/02/10/everything-we-know-about-the-legend-of-zelda-breath-of-the-wilds-dungeons)
- God of War 2018: an aggression-scoring system rates enemies by designer priority, player targeting and position relative to Kratos; Barlog says fights were tweaked late so none felt like a repeat [S, summaries] — [PlayStation Blog](https://blog.playstation.com/?p=370399), [GoW Wikipedia/summary](https://videohighlight.com/v/hE5tWF-Ou2k)

### Inferences
- Varied-boss recipe: vary (a) the discovery puzzle, (b) arena, (c) win condition, (d) tempo, (e) camera/ approach phase. Do not reuse "freeze joints" or "strip vents -> climb neck -> 3 valves" shape. Application to Wraith: Long Walker should have its own win-condition shape, e.g. a moving-target RACE/escort across the dune rather than a stationary joint puzzle: surf alongside its legs (sand-surf), use sand/Stone/Gale verbs to make a leg-sink (a leg's footfall in compacted vs loose sand), and only then climb. Mammoth = freeze/shatter (static), Bellwether = strip-then-climb (siege), so the Walker = chase/lure-through-terrain.
- Legs are six lure targets: Application to Wraith: the Walker's gait is the readable telegraph (Monster Hunter: movement signals intent); stumbling a leg (SotC #2 bow-to-soles analogue) via a Ridge/Bloom placed in its path is the "puzzle", climbing the leg is the "execution".
- SotC uses a quiet approach phase as tension; Application to Wraith: give the Walker a long sand-surf approach with a distant silhouette, no combat, saving off optional.
- Item-gated boss (Zelda) vs. verb-only (SotC): Application to Wraith: each Warden should force one element/verb combination the player has learned in the world (Walker: Gale Updraft + sand reaction), not a new tool.
- Merge rather than add: Application to Wraith: if Walker ideas are many, condense two into one (Kaido) rather than ship a long fight.

### Gaps
- No direct primary Ueda interview text on "different verb per colossus" (flying/swimming/lure) found; the verb-variety claim rests on analyst summary. Dragon's Dogma climbing and Elden Ring boss design not researched. GMTK SotC video not found. The 48/24/16 count is primary; 20 is fan-wiki.

## 2. Enemy and encounter design

### Takeaway
Doom 2016/Eternal uses enemies as "chess pieces" with distinct roles that push the player in different ways; Halo's "30 seconds" is a loop whose context constantly changes; Monster Hunter-style telegraphing keeps deaths fair.

### Cited Findings
- Doom Eternal: enemies are the resource source (chainsaw ammo, glory-kill health, flame-belch armor); Martin: "Each AI will push you in different ways"; weak spots on big demons give frequent feedback; enemy placement forces weapon switching ("the guns are the tool and the AI is the problem"); "the solution to every problem is to be aggressive"; Stratton: "Death is an ok thing, it's how you learn" [E] — [Game Developer: Aggressive resource management of Doom Eternal](https://gamedeveloper.com/design/the-aggressive-resource-management-of-i-doom-eternal-i-)
- Martin: "We use our chess pieces to move the player around and get them off those ledges and don't let them kite enemies"; levels avoid safe sniping spots; Mancubus redesigned to punish getting close [S, quote via secondary coverage; original Noclip video not verified] — [Fandom interview](https://www.fandom.com/articles/doom-eternal-marty-stratton-hugo-martin), [Bethesda: Designing Demons](https://slayersclub.bethesda.net/en-AU/news/designing-demons-noclip)
- Halo: Griesemer says the popular reading is backwards: "No 30 second stretch of Halo is ever repeated; the missions are constantly changing the context"; nested "3-second loop inside a 30-second loop inside a 3-minute loop that is always different"; AI "waits to see what you will do... then pushes back at just the right resistance"; varied weapons/vehicles/enemy combinations, including enemies fighting each other [E] — [Engadget interview](https://www.engadget.com/2011-07-14-half-minute-halo-an-interview-with-jaime-griesemer.html)
- Hades: level design informed enemy design (each Asphodel enemy got its own way to cross lava); variety came from combat/enemies rather than modular rooms [E, Gorinstein, via summary] — [DigiPen showcase](https://digipen.edu/showcase/news/eduardo-gorinstein-delivers-challenge-and-fun-hades), [Kotaku](https://kotaku.com/hades-level-design-is-less-random-than-it-seems-1845254545)
- Sunset Overdrive: enemies had to be redesigned for a highly mobile player; earlier paradigms were "woefully ineffective"; enemies track traversal objects player uses [S] — [GDC Vault: AI in the Awesomepocalypse](https://www.gdcvault.com/play/1021780/contactUs), [Game Informer](https://www.gameinformer.com/b/news/archive/2013/06/20/insomniac-breaks-down-the-sunset-overdrive-e3-trailer.aspx)

### Inferences
- With max 8 enemies, give each a role (fodder/heavy/ranged/support) and one forced behavior. Application to Wraith: Shaped enemies' material is the role-defining lever (a Stone Shaped needs Shatter/Gale-erosion, a Frost Shaped is slowed) — "bring the right element to the right enemy" is the Doom weapon-switch analogue, with focus resource as the Doom resource loop (kills/reactions refill focus).
- Mobile player needs mobile enemies. Application to Wraith: sand/snow-surf combat arenas must have ranged/lunging enemies that cut surf lines; avoid kiting by terrain-based threats.
- Context change over repetition. Application to Wraith: same 8-enemy pool in different surface states (frozen, sand, burning turf) feels new.

### Gaps
- No GDC transcript for Doom "combat chess" (original wording unverified), God of War enemy-role detail, or Hades telegraph talk found.

## 3. Systemic and emergent gameplay

### Takeaway
BotW's chemistry engine is a deliberately tiny rule set (elements change materials; elements change elements; materials never change materials) that yields large combinatorics; consistent, "clever" rules let players invent solutions. Noita and Larian surfaces show the same pattern.

### Cited Findings
- Dohta: chemistry engine is a "rule-based state calculator"; elements (fire, water, ice, electricity, wind) have no constant state; materials (trees, rocks, player) are solid; rules: elements change materials, elements change each other, materials cannot influence each other. Players accept rules if consistent and clever; real-world-referencing puzzles are solved instinctively; unified rules produce ideas developers didn't plan [E, GDC 2017 summary] — [Thumbsticks GDC'17 report](https://www.thumbsticks.com/gdc-17-breath-of-the-wild-science-lies). Panel details (Fujibayashi, Dohta, Takizawa) — [Perfectly Nintendo](https://www.perfectly-nintendo.com/?p=194934). "Multiplicative gameplay" coined by Fujibayashi; source gives no definition.
- Noita: nearly every pixel simulated by simple local rules (liquids fall then spread; fire tests neighbors; oil flammable, water not; sludge neutralized by water) producing surprising outcomes [S] — [80.lv](https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation/)
- Divinity: Original Sin 2: abilities create surfaces others combo with (rain -> puddle, lightning electrifies, fire makes steam blocking sight), bless/curse any surface; actions cost AP [S, previews] — [Co-Optimus](https://www.co-optimus.com/article/14154/pax-east-2016-divinity-original-sin-2-hands-on-impressions.html), [Giant Bomb](https://www.giantbomb.com/games/3030-50803/)
- Immersive sims: Smith says best ones give systems that interact in unplanned ways (Deus Ex magnetic mines as climbing tools) [S] — [Digital Citizen](https://www.digitalcitizen.life/dishonored-director-says-big-budget-immersive-sims-can-still-work/); Spector coined "immersive sim" [S] — [Giant Bomb](https://giantbomb.com/wiki/Concepts/Immersive_Sim)

### Inferences
- Application to Wraith: the surface x element table is the chemistry engine. Adopt BotW's three rules as invariants: elements write terrain/enemy-material state, elements combine, but terrain/material never self-propagate except through elements (keeps table auditable and bug-free).
- Application to Wraith: make the Long Walker obey the same table (sand surface x Tide = compacted/mud, x Ember = glass, x Gale = dust cloud) so boss solutions are discoverable, not scripted ("Colossi are climbable terrain that reacts").
- Teaching: BotW source gives no teaching method; inference: teach each reaction once in a safe sandbox then require it in an enemy encounter.

### Gaps
- No Spector/Smith "multiplicative vs additive" primary quote found; BotW "multiplicative gameplay" definition and teaching practices not found; Larian primary design source not found.

## 4. Game feel and juice

### Takeaway
Game feel = responsive real-time control plus polish; juice (shake, hit-stop, particles, audio) multiplies perceived impact at low cost. Input-timing forgiveness techniques are standard but I found no sourced treatment.

### Cited Findings
- Swink definition: "real-time control of virtual objects in a simulated space, with interactions emphasised by polish"; six areas: input, response, context, polish, metaphor, rules; responsiveness within a ~100 ms correction cycle [S] — [Wikipedia: Game feel](https://en.wikipedia.org/wiki/Game_feel), [Liz England review](https://lizengland.com/blog/review-game-feel-by-steve-swink/)
- Juice it or lose it (Jonasson & Purho): screenshake, squash/stretch, tweening, particles, flash, color, layered audio, more simultaneous action [S summary] — [RPG Playground](https://rpgplayground.com/research-making-a-juicy-game/)
- Art of Screenshake (Nijman/Vlambeer): camera lerp and kick scaled to event, hit-stop ("sleep"), enemy knockback, impact effects/permanence, weapon lag/recoil, bigger explosions, more bass [S, Reddit-derived summary] — same source
- Counterpoint: juice may cost immersion [S] — same source

### Inferences
- Application to Wraith: scale camera shake/hit-stop with Warden scale (a foot-fall = low-frequency shake + dust + distance-delayed sound); tie shake direction to cause.
- Application to Wraith: for lock-on/dodge, add input buffering and coyote time on surf-to-jump/glide transitions (technique standard; not sourced here).

### Gaps
- No primary source for hit-stop frame counts, coyote time or input buffering numbers; Swink's book not accessed directly.

## 5. Traversal as gameplay

### Takeaway
Spider-Man's swing was built around one pendulum that is the core activity, with district layout varying its texture and "one button drives the whole city" explicitly avoided; speed is conveyed through camera and cues. Sunset Overdrive/Titanfall tie flow to momentum chains.

### Cited Findings
- Smith (Insomniac): players "spend most of their time... swinging"; release timing is a mechanic; speed cues (motion blur, parallax); districts differ (high wide swings in Financial District vs lateral grid in Hell's Kitchen); warns against one-button traversal removing engagement; custom hero states rather than general physics [E] — [Game Developer: Spider-Man "Do what a spider can"](https://gamedeveloper.com/design/making-insomniac-s-i-spider-man-i-do-what-a-spider-can)
- Houdini used to place lampposts procedurally; junctions added so players must navigate obstacles [S] — search summary of [GDC 2019: Concrete Jungle Gym](https://gdcvault.com/play/1026084/Concrete-Jungle-Gym-Building-Traversal)
- Sunset Overdrive: city built so fastest route chains movement options; keeping traversal running earns combat bonuses [S] — [Game Informer](https://gameinformer.com/games/sunset_overdrive/b/xboxone/archive/2014/05/08/10-things-you-need-to-know-about-sunset-overdrive)
- Titanfall 2: Respawn tuned wall-run speed so speed accumulates when chaining wallruns; momentum lost was an unintended side effect [E] — [Trusted Reviews](https://www.trustedreviews.com/news/titanfall-2-to-receive-gameplay-changes-after-underwhelming-tech-test-2937406), [Game Informer](https://gameinformer.com/b/news/archive/2016/08/24/respawn-is-making-changes-to-titanfall-2-based-on-player-concerns)
- Journey: Chen described reframing earned power as "borrowed" power; sand rendered to behave physically [E/S] — [PlayStation Blog](https://blog.playstation.com/2011/01/11/jenova-chen-explains-journey-social-relevance-and-artistic-inspirations/), [GamesBeat](https://gamesbeat.com/an-interview-with-journey-co-creator-jenova-chen-video/)

### Inferences
- Application to Wraith: make the Long Walker's gait and the dunes it throws up the traversal terrain (surf its wake / dune slope); sand-surf speed should be gated by slope and element-written surface (Frost = fast slick, Tide = slow packed) so the terrain state is both combat and traversal input.
- Application to Wraith: reward chaining (surf -> glide -> updraft) with focus refill, linking traversal to combat as in Sunset Overdrive.
- Varied terrain "textures" per zone (Spider-Man districts) justify different surf rules per biome.

### Gaps
- No sourced material on Tony Hawk, SSX, Alto's Odyssey, Lonely Mountains Downhill (searches returned nothing relevant); no primary Titanfall 2 designer talk; scoring/challenge-from-traversal not covered.

## 6. Difficulty, fairness, checkpoints, death as learning

### Takeaway
FromSoft and id both frame death as meaningful learning; fairness depends on readable telegraphs and mistakes feeling like the player's own.

### Cited Findings
- Miyazaki: hardship gives experience meaning; difficulty is studio identity; asked how to give death meaning beyond failure; no easy mode; admitted Elden Ring "went a little too far" (poison swamps) and is adjusting [S, secondhand coverage of New Yorker/Guardian/CNET interviews] — [TheGamer](https://www.thegamer.com/elden-ring-creator-difficulty/), [80.lv](https://80.lv/articles/elden-rings-dlc-will-see-a-tailored-poison-swamp-many-ways-to-die/), [GGRecon](https://www.ggrecon.com/articles/hidetaka-miyazaki-clears-up-elden-ring-easy-mode-speculation/)
- Doom: players learn from deaths that feel like their own mistakes; "When you're bored, you're not thinking" — [Game Developer](https://gamedeveloper.com/design/the-aggressive-resource-management-of-i-doom-eternal-i-)
- Monster Hunter: telegraph via expression/state — Nintendo Life above.
- Halo: AI pushes back "at just the right resistance"; recover after damage — Engadget above.

### Inferences
- Application to Wraith: Warden fights should checkpoint at phase boundaries (after each freed joint/valve/leg); approach phase uncheckpointed length short; Walker telegraphs via gait and leg-lift before every footfall hazard.
- Application to Wraith: no source on checkpoint granularity; this is inference.

### Gaps
- No primary FromSoft telegraph/fairness source, no checkpoint-design source found; Miyazaki quotes are secondhand.
