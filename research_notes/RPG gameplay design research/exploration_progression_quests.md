# Open-world exploration, progression and quest design philosophies (for "The Wraith of the Unstill")

Evidence-quality note: many primary talks (GDC Vault) are paywalled and could not be read; findings below come from fetched pages or search snippets. Items marked [opinion] are critic/blogger interpretation, not developer statements. "Application to Wraith" lines are inference, not sourced.

## 1. Breath of the Wild / Tears of the Kingdom: terrain, gravity, towers, multiplicative design

### Takeaway
BotW guides by shaping terrain and sightlines (triangular landforms that hide and then reveal content), not by markers. Its towers were a lesson in over-guiding. "Multiplication" (a few rule-based systems interacting) replaces per-puzzle bespoke content. The "gravity" term and exact Korok density figures could not be verified from primary sources.

### Cited Findings
- GDC 2017 session "Change and Constant: Breaking Conventions with Breath of the Wild" (Fujibayashi, Takizawa, Dohta) exists; the Vault recording was not accessible. — [GDC Vault](https://gdcvault.com/play/1024562/Change-and-Constant-Breaking-Conventions)
- A reporter's tweet-thread recap (secondhand) says the Triangle Rule gives a choice of going over or around, and blocks view so designers can surprise players; and that the initial plan of towers spread across the map with events between felt too guided/linear, solved with a concept called "gravity" (snippet did not explain it). — summarized via search of [GDC Vault listing](https://gdcvault.com/play/1024562/Change-and-Constant-Breaking-Conventions) and [Game Watch Impress](https://game.watch.impress.co.jp/docs/news/1047403.html) (the Impress article itself does NOT cover triangle/gravity)
- Multiplicative play: Fujibayashi contrasted "addition" (each puzzle bespoke, enormous resources) with "multiplication" (defined actions and objects interact predictably so players can solve problems many ways). — [Game Watch Impress (JP)](https://game.watch.impress.co.jp/docs/news/1047403.html)
- Chemistry engine (Dohta): "elements" (fire, water, ice, wind, electricity) change "materials" (wood, grass, rock) and other elements; materials don't affect each other. Physics uses "clever lies" (e.g. stasis). — [Game Watch Impress](https://game.watch.impress.co.jp/docs/news/1047403.html)
- Fujibayashi on climbing anywhere: since players can go anywhere, designers can ask "Where do you want to go?" — [Game Watch Impress](https://game.watch.impress.co.jp/docs/news/1047403.html)
- [opinion/analysis, Mark Brown GMTK] Terrain is mostly pyramids/cones; player chooses climb vs go around; eye drawn to peaks so POIs go there; triangles occlude what's behind, revealing gradually; only a few attractive places on screen at once with dozens of smaller landmarks nearby; "wherever you look, you should find something interesting to do." — [GMTK newsletter](https://gmtk.substack.com/p/how-nintendo-solved-zeldas-open-world)
- Towers: originally ~15 towers as waypoints along lines; playtesters felt on a "guide rope"; heat maps ~80% followed the route, 20% wandered. — [GMTK newsletter](https://gmtk.substack.com/p/how-nintendo-solved-zeldas-open-world) (relays the GDC talk; I could not confirm against the talk itself)
- [opinion, Nic Phan blog] "Gravity" read as terrain height: key locations sit in sunken areas, going down is easier than up, so players drift toward them; blogger admits an exception (Rito Village). This is an interpretation and may differ from Nintendo's meaning of "gravity". — [Game Developer](https://gamedeveloper.com/design/breath-of-the-wild-open-world-analysis-gravity-to-go-forward)
- Korok seeds: Fujibayashi's blog says rocks placed as an experiment weren't rewarding enough on their own, so small creatures were hidden there for the finding. 900 seeds exist (fan source: 441 needed for the max reward). — [DualShockers](https://www.dualshockers.com/breath-of-the-wild-korok-seeds/), [fan guide](https://gamertagmythras.com/blog/zelda-breath-of-the-wild/botw-korok-seeds-guide)
- Monolith Soft assisted with landscape/topography design. — via search summary of [Wikipedia: Fujibayashi](https://en.wikipedia.org/wiki/Hidemaro_Fujibayashi)

### Inferences
- Application to Wraith: shape heightfield silhouettes (cones, ridges, dune crests) so each biome hides its next POI behind a rise; put a distinct silhouette (ice spire, glass shard, ember vent) at the peak of a landform.
- Application to Wraith: do not use towers/line-of-quests as the primary guide; use compass diamonds only as an optional layer, with terrain "pull" (low basins hosting ruins/village) as the first.
- Application to Wraith: element interactions as "multiplication" (frost freezes mire water into a bridge, ember ignites dry steppe grass, wind clears glass dunes) so side quests can reuse a small rule set cheaply.
- Application to Wraith: tiny repeatable discoveries (a Korok-like "wisp/echo" with a small gag or melancholic beat) cheaply reward looking at odd spots; keep count modest and always under a visible oddity (ring of stones, lone tree).

### Gaps
- Primary GDC talk content (exact "gravity" definition, triangle rule slides, Korok density per area) not accessible; no verified "one POI per N seconds" figure found.
- TotK-specific design (depths, sky islands, Zonai) not researched.

## 2. Elden Ring / FromSoftware: landmarks, no markers, grace, cryptic NPCs, density

### Takeaway
Elden Ring leans on visible landmarks, fewer-but-richer POIs, and non-linear progression, with player-set pacing; sources confirm the high-level philosophy but I found no primary evidence on cryptic NPC questline trade-offs beyond general knowledge.

### Cited Findings
- Miyazaki: sense of accomplishment is a throughline since Dark Souls, plus a major focus on "a sense of adventure" letting players meet the world's unknowns at their own pace. — [Xbox Wire interview](https://news.xbox.com/en-us/2022/05/27/from-softwares-hidetaka-miyazaki-on-the-secrets-of-elden-rings-development/)
- Miyazaki: the challenge was keeping FromSoftware gameplay style while offering openness, balancing exploration with boss fights. — [PlayStation Blog](https://blog.playstation.com/2022/01/28/an-interview-with-fromsoftwares-hidetaka-miyazki/)
- Boss positions were set early; map designed around boss gameplay and boss behavior adjusted to terrain. Miyazaki cited Witcher 3, BotW, Elder Scrolls as open-world influences. — [TechRadar](https://www.techradar.com/news/elden-ring-director-reveals-his-favorite-boss-and-open-world-inspiration)
- [opinion, Bycer] Fewer diversions but "the quality of each point of interest is far higher"; content tiers: small single-reward ruins, bigger resource areas (mines, tombs), large level-like set pieces; distant unusual sights imply a unique situation; no tower-climb-to-unlock-map chore; grace introduced passively; skippable tutorial; non-linear progression reduces difficulty-as-barrier; players can rush or explore for hours. — [Game Developer](https://www.gamedeveloper.com/game-platforms/how-elden-ring-succeeds-by-ignoring-20-years-of-open-world-design)
- [summary of GMTK video] Map elements placed to lead the player while leaving room for secrets; critics flagged repetition and restrictive endgame. — [80.lv](https://80.lv/articles/a-look-at-the-world-design-of-elden-ring)
- [opinion, Level Design Lobby] Global landmarks (e.g. the Erdtree) orient across the world; local landmarks only visible nearby reward thorough exploration. — surfaced via [Level Design Lobby summary](https://videohighlight.com/v/LSN5LQrjKMw)

### Inferences
- Application to Wraith: one unmistakable global landmark per biome plus the continent's central "wrongness" visible from every biome; local landmarks only visible from within ~300 m.
- Application to Wraith: prefer ~3 tiers of POI (single-reward nook, resource/mini-site, Warden-scale set piece) over many identical checklist icons; make each nook hold something unique (a lore item, small boss, a shortcut).
- Application to Wraith: cryptic NPC quests suit the quiet tone, but pair with an in-game journal that records the last clue (pro: mystery; con: players miss quests or fail them irreversibly — avoid irreversible failure on a quiet game).
- Application to Wraith: Wardens as fixed pre-placed encounters with terrain built around them, per Miyazaki's boss-first map approach.

### Gaps
- No primary source found on sites-of-grace rationale, legacy-dungeon vs field ratio, POI counts/spacing, or NPC questline pros/cons; Miyazaki's difficulty quotes limited to the above.

## 3. Outer Wilds, Tunic, Return of the Obra Dinn: knowledge as progression

### Takeaway
Gate by what the player knows, not what they own; the log/book records and cross-references clues so curiosity is the key. Obra Dinn adds a verification gate (fates confirmed in threes) to prevent brute force.

### Cited Findings
- Outer Wilds progress is tied to knowledge from Nomai texts and key locations; ship log updates like a storyboard with vague hints and marks locations holding undiscovered information; planets can be visited in any order. — search summary of [Steam discussion](https://steamcommunity.com/app/753640/discussions/0/598515152383419065/?ctp=2), [The Boar review](https://theboar.org/2019/07/outer-wilds-review/) (user/critic sources)
- Obra Dinn: no hints or quest markers; solutions only confirmed in groups of three to stop brute-forcing. — [Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn), [bit-tech review](https://bit-tech.net/reviews/return-of-the-obra-dinn-review/1/)
- Tunic: Shouldice's Design Works book covers "why there are so many secrets"; manual/discovery details not confirmed. — [Finji Substack](https://finjico.substack.com/p/lead-developer-andrew-shouldice-on)

### Inferences
- Application to Wraith: a "Remembrance" journal that auto-logs observations (not tasks); some elemental techniques or Warden approaches unlocked by learning a rune/phrase from ruins rather than an item.
- Application to Wraith: verify deductions in clusters for any mystery side quest (e.g. identify who lived in the glass ruins) so guessing is not rewarded.

### Gaps
- No primary developer commentary on Outer Wilds ship log or Tunic manual found.

## 4. Metroidvania gating (Hollow Knight, Super Metroid)

### Takeaway
Key-lock gating works when locks are visible early and can sometimes be subverted; Team Cherry deliberately loosened hard gates. Super Metroid not sourced.

### Cited Findings
- Ari Gibson: Team Cherry chipped away at hard gating so many power-ups became optional (speedrunners get few), "exactly what we had hoped"; progression changed from linear to sectioned. — via search summary of [PC Gamer](https://www.pcgamer.com/how-to-design-a-great-metroidvania-map) (article text not fetched; verify before quoting)
- Hollow Knight starts with no map; cartographer Cornifer sells incomplete area maps, compass and pin tools. — via search summary of [Super Jump](https://www.superjumpmagazine.com/getting-lost-by-design-in-hollow-knight/)
- User reviews split on backtracking: scarce fast travel and no way to note places to return to. — [Steam discussion](https://steamcommunity.com/app/367520/discussions/0/1327844097124351718/?ctp=2) (user opinion)

### Inferences
- Application to Wraith: biome = element means each element-ability is the key; make locks visible (frozen door, lava seam, sealed glass vault) before the key arrives, and let in-biome shortcuts/loop-backs and a "pin" tool cover the return-later problem.
- Application to Wraith: soft-gate with difficulty and skill (as Hollow Knight) not hard walls in the open order.

### Gaps
- No sourced Super Metroid analysis; no formal "lock readability" study found.

## 5. Minimal HUD guidance: Ghost of Tsushima, Journey, Shadow of the Colossus

### Takeaway
Replace markers with diegetic pointers (wind) and subtract systems until what remains is mood and path. Ueda's own later view cautions that subtraction can go too far.

### Cited Findings
- Ghost of Tsushima: Guiding Wind replaces minimap/waypoint lines, orients to a tracked destination; origin was aesthetic/thematic ("everything moves", Kurosawa) per creative director Jason Connell. — [Android Central](https://www.androidcentral.com/ghost-tsushima-creative-director-interview) (snippet only), [Twinfinite review](https://twinfinite.net/2020/07/ghost-of-tsushima-review/)
- Accessibility caveat: wind streaks lose contrast in snow. — [Can I Play That?](https://caniplaythat.com/2020/07/29/ghost-of-tsushima-accessibility-review/) (directly relevant to a frost steppe)
- Journey: GDC 2013 "Designing Journey" (Jenova Chen) covers building an emotional arc; 3 years for a 2-hour game; many ideas failed; prototyping began around music. — [GDC Vault](https://gdcvault.com/play/1017700), [Game Developer](https://gamedeveloper.com/audio/video-designing-a-new-emotional-experience-in-i-journey-i-)
- Ueda "design by subtraction"; Ico cut combat/characters/areas to find core; at a 2004 GDC Q&A Ueda said they may have gone too far (fan-site report); Shadow of the Colossus had no towns, NPCs or side quests (commentary). — [amara transcript](https://amara.org/subtitles/RzpUvbByVapH/en/2/download/Ico%20and%20Design%20by%20Subtraction%20%20Game%20Designer%20Philosophy.en.vtt), [Glitterberri](https://glitterberri.com/ico/unused-dialogue-and-retranslation/), [Blake Crosley](https://blakecrosley.com/blog/design-philosophy-fumito-ueda)

### Inferences
- Application to Wraith: make the quest-diamond optional and diegetic first: wind-carried ember motes/frost-breath/sand streaks toward the active objective, with high-contrast variants per biome (dark motes on snow).
- Application to Wraith: emptiness must be intentional, paced with sound/music swells and a visible horizon target every few minutes of travel; do not subtract the incentive to explore (SotC had sixteen colossi, you have six biomes and need small rewards).
- Application to Wraith: emotional arc of a Warden release: approach (dread), ritual, release (quiet).

### Gaps
- Journey talk content (arc diagram, guidance specifics) not accessible; no direct Ueda quote on emptiness in SotC.

## 6. Side-quest design and environmental storytelling

### Takeaway
Witcher-style side quests succeed through story, choice with visible consequence and tying gameplay to narrative; environmental storytelling lets the world imply events. Yakuza, RDR2, and Tsushima Tales claims are mostly unsourced here.

### Cited Findings
- Sasko (GDC 2023): make players want the story (withhold info); emotional impact over spectacle; let the world carry exposition; real dilemmas; consequences visible and delayed (invisible consequences rarely worth the cost); avoid overdesign. — [Game Developer](https://www.gamedeveloper.com/marketing/10-key-takeaways-from-the-quest-design-of-cyberpunk-2077-and-the-witcher-3)
- Witcher 3 pipeline: writers outline, designers detail player actions; the team cuts gameplay with no narrative purpose; quest designers shape light/music/ambience; Bloody Baron parallels two fathers who lost daughters. — [Shacknews](https://www.shacknews.com/article/94509/witcher-3-quest-designers-talk-design-process-most-difficult-quest-to-create)
- German report: Witcher 3 has no classic fetch quests; every side quest tells a story, "play, show, then tell." — [mein-mmo](https://mein-mmo.de/witcher-3-geheimzutat-fuer-grossartige-quests/) (secondhand)
- RDR2 strangers appear as "?" blips, names revealed after interaction, multi-part chains, gated by main story progress. — [Push Square guide](https://www.pushsquare.com/guides/red-dead-redemption-2-how-to-complete-10-stranger-mission-strands), [Red Dead Wiki](https://reddead.fandom.com/wiki/Strangers)
- Environmental storytelling (Smith and Worch, GDC 2010): build spaces that feel historical so players infer events; player takes an active role in building "what happened here"; uses subtext and systemic reaction. — [GDC Vault](https://gdcvault.com/play/1012647/What-Happened-Here-Environmental), [Nieman Storyboard](https://niemanstoryboard.org/2011/01/14/harvey-smith-on-environmental-storytelling-and-embedding-narrative/)

### Inferences
- Application to Wraith: each side quest = a small data-driven story template: hook (anomaly or "?" diamond), investigation via environment (staged corpses, tools, scorched/frozen tableau), one choice, delayed visible consequence (a lit hearth in the village, a cairn that appears later).
- Application to Wraith: "no fetch" test: if the verb is only carry/collect, add a reveal or moral choice; reuse elemental ability as the verb (thaw, ignite, calm).
- Application to Wraith: few NPCs means each is a recurring character with an arc across biomes (a pilgrim you meet three times), rather than quest givers by number.
- Application to Wraith: show before tell: encounter the tableau first, then optional dialogue; ambient lines while walking, key info in focused moments.

### Gaps
- Yakuza substory tonal contrast, Ghost of Tsushima Tales design, and Elden Ring NPC questline analysis: no sources found (searches returned only guides). Treat as unsupported.

## 7. POI density and pacing; checklist criticism

### Takeaway
The best-supported evidence: fewer, higher-quality POIs (Elden Ring per Bycer), occlusion-based reveal (BotW per GMTK), and heat-map evidence that explicit routes cause players to follow rails. No direct Ubisoft checklist-critique source was found in my searches.

### Cited Findings
- See sections 1 and 2 for sourced density claims: [GMTK](https://gmtk.substack.com/p/how-nintendo-solved-zeldas-open-world), [Game Developer (Bycer)](https://www.gamedeveloper.com/game-platforms/how-elden-ring-succeeds-by-ignoring-20-years-of-open-world-design).
- Bycer contrasts Elden Ring with the tower-climbing map-unlock chore. — same Game Developer link.

### Inferences
- Application to Wraith: on 64 km2, target a reveal rhythm of "two or three new places during travel" (GMTK's phrase) rather than a fixed count; prototype a per-biome sparsity budget and check using the bot playtester that something notable is within sight along typical routes.
- Application to Wraith: vistas as rewards: a climbable lookout that shows next biome's landmark and a quiet music cue.
- Application to Wraith: breadcrumbs: NPC lines or items that name a landmark ("the glass tooth") rather than coordinates.

### Gaps
- No sourced criticism of Ubisoft-style checklists, "breadcrumbing" terminology, or vista theory; no quantitative POI spacing from developers.
