# Player-motivation, core-loop and pacing frameworks for "The Wraith of the Unstill"

Research caveat: this session's fetch tool could not decode PDFs (MDA paper, Chen thesis) and was blocked (403/404) on Quantic Foundry, the PENS paper and GDC Vault. Items under "Cited Findings" were verified from pages actually retrieved (mostly secondary). Items I know from background knowledge but did NOT verify are listed under "Gaps" as "recalled, unverified" with the canonical source to check. Evidence vs opinion is tagged [E] evidence/study, [O] designer opinion, [S] secondary summary.

## 1. MDA framework (aesthetics taxonomy; designing from target aesthetics)

### Takeaway
Pick the felt experience first (aesthetics), then work backwards to dynamics and the few mechanics that can produce it. For Wraith the target set is Sensation + Discovery + Fantasy + Submission (+ Challenge in Warden fights), with Fellowship and heavy Narrative deliberately absent.

### Cited Findings
- [S] Eight aesthetics: Sensation (sense-pleasure), Fantasy (make-believe), Narrative (drama), Challenge (obstacle course; urge to master), Fellowship (social framework), Discovery (uncharted territory; urge to explore), Expression (self-discovery/creativity), Submission (pastime). The paper also mentions competition. — [Wikipedia: MDA framework](https://en.wikipedia.org/wiki/MDA_framework) (primary paper: https://users.cs.northwestern.edu/~hunicke/MDA.pdf, not decodable here)
- [S] Mechanics = rules/base actions/algorithms; Dynamics = run-time behaviour of mechanics responding to input and each other; Aesthetics = emotional responses evoked in the player. — same Wikipedia page
- [S] Designer view runs mechanics -> dynamics -> aesthetics; player view is reversed (aesthetics first). Designers can only directly touch mechanics. — same page

### Inferences
- Application to Wraith: write a one-line aesthetic target per biome/mode (e.g. Frost snow-surf = Sensation+Submission "flowing glide"; Warden = Challenge+Discovery "reading a puzzle-giant"; releasing it = Fantasy/Narrative catharsis). Reject features that serve no listed aesthetic (loot, levels, quest logs).
- Application: terrain memory (grooves, craters) is a dynamic that feeds Expression (player leaves a signature on the world) and Fantasy (world is alive) - a cheap mechanic generating two aesthetics; prioritise it.
- Application: because designers only control mechanics, playtest by asking "what did you feel?" (bot play + human sessions) and tune mechanics, not content volume.

### Gaps
- Recalled, unverified: the paper's advice that aesthetics are a vocabulary beyond "fun", and the tuning/iteration loop. Verify in the PDF.

## 2. Self-Determination Theory, PENS, Quantic Foundry, intrinsic vs extrinsic

### Takeaway
Games motivate mainly by satisfying competence, autonomy and relatedness (plus intuitive controls and presence), none of which require loot. Wraith should maximise competence (readable skill growth) and autonomy (free routes, free order) and treat relatedness as the Wardens/world, not NPC count.

### Cited Findings
- [E, correlational self-report] Ryan, Rigby & Przybylski 2006: in studies 1-3, felt in-game autonomy and competence predicted enjoyment, game preference and pre-to-post-play wellbeing; both also related to intuitive controls and presence/immersion. In study 4 (online multiplayer community) autonomy, competence and relatedness each independently predicted enjoyment and future play. — [ACU research bank abstract](https://acuresearchbank.acu.edu.au/item/8q128/the-motivational-pull-of-video-games-a-self-determination-theory-approach); [ScienceDaily](https://www.sciencedaily.com/releases/2006/12/061226134706.htm); paper at https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf (not read)
- [S] Quantic Foundry (Yee, Ducheneaut) model built from data on >1.25M gamers; 12 motivations in 6 clusters; Discovery = "explore, tinker, experiment"; Immersion linked to story/fantasy; Challenge = high difficulty/practice/mastery. — search summary of [GDC 2020 slides](https://quanticfoundry.com/wp-content/uploads/2020/08/GDC-2020-Slides-Player-Segments-Quantic-Foundry.pdf) and [MassivelyOP](https://massivelyop.com/2016/01/07/massively-overthinking-lets-play-with-the-gamer-motivation-model/) (critique: weak on multiplayer)
- [O] Miyazaki (Dark Souls): core concepts are sense of achievement and surprise of discovery; difficulty exists to produce accomplishment, not suffering. — [Game Informer 2011, via search](https://gameinformer.com/b/features/archive/2011/11/12/afterwords-dark-souls)

### Inferences
- Application: competence without levels = show it through the world (a line you could not previously surf is now clean) and optional diegetic feedback (robe wear, groove depth) rather than numbers.
- Application: autonomy = Warden order free, multiple valid climbs, no marker spam. Autonomy-thwarting patterns to avoid: forced tutorials, locked gates that say "come back later", timers.
- Application: Wraith's audience skews Quantic "Discovery + Immersion + Challenge (mastery)" clusters; market and onboard accordingly; Competition/Social low priority.
- Application: relatedness without NPCs: the Warden as a character you come to know (its pattern, its grief), and ambient creatures/companions.

### Gaps
- Could not retrieve the exact 12 motivation names (recalled, unverified: Action: Destruction, Excitement; Social: Competition, Community; Mastery: Challenge, Strategy; Achievement: Completion, Power; Immersion: Fantasy, Story; Creativity: Design, Discovery). Verify at quanticfoundry.com/gamer-motivation-model.
- "Glued to Games" book (Rigby & Ryan 2011) not accessed. Recalled, unverified: it discusses compulsion/extrinsic hooks vs intrinsic need satisfaction, and that need-frustrating designs produce "play that is not enjoyed". Verify.
- No evidence retrieved on "compulsion loops" (Zagal/ Kim "compulsion loop" pieces); verify before citing.

## 3. Core loops at multiple timescales / nested loops

### Takeaway
No retrievable primary source on nested-loop theory this session; design guidance below is mostly inference. Define a loop per timescale and ensure each has its own reward without relying on a higher one.

### Cited Findings
- [S] Shadow of the Colossus / Ueda "design by subtraction": cut NPCs, shops, side quests; world has only the 16 colossi as real challenges; long empty rides function as reflection/pacing rather than filler. — [Blake Crosley essay (opinion piece, single secondary source)](https://blakecrosley.com/de/blog/design-philosophy-fumito-ueda)
- [S] Breath of the Wild GDC 2017 ("Change and Constant"): team's goal was an "active" rather than "passive" game: less scripting, fixed solutions and gating, more objects reacting to the world. — [Zelda Universe report](https://zeldauniverse.net/2017/03/09/zelda-team-discusses-breath-of-the-wilds-development-and-2d-zelda-prototype-at-gdc/); [talk page](https://gdcvault.com/play/1024562/Change-and-Constant-Breaking-Conventions)

### Inferences (proposed Wraith loop stack, not sourced)
- Second-to-second (0-10 s): carve/surf/glide/bend - a verb should be pleasurable alone (Sensation). Test: standing in an empty field, is moving fun?
- Minute: read terrain -> choose line -> chain modes (snow-surf into glide into sand-surf) -> leave a mark. Reward = flow + visible groove.
- 5-15 min: spot landmark/Warden silhouette -> travel -> discover a micro-site (shrine, remnant, view) -> element lesson.
- Session (30-90 min): approach and release one Warden (climb puzzle + element-reading) -> world visibly changes (biome softens).
- Campaign: five elements + Echoes -> reach/combine them -> endgame release; world-state accumulates (restoration).
- Rule of thumb: each loop's reward must be felt at its own scale; session end should leave an obvious "stopping point" (post-release quiet).

### Gaps
- Recalled, unverified: nested-loop framing from Kim/Sotamaa/Salen & Zimmerman "game as loop" and Bethesda/Ubisoft "30 seconds of fun" (Halo's "30 seconds" from Jaime Griesemer GDC 2010 talk, "Design in Detail"). Verify before citing.

## 4. Flow, difficulty curves, dynamic vs fixed difficulty

### Takeaway
Two defensible philosophies: FromSoftware-style single fixed difficulty (shared experience, accomplishment) and Chen-style player-chosen difficulty embedded in play. Both reject hidden automatic scaling, consistent with the user's rejection of world-tier scaling.

### Cited Findings
- [O/E thesis, S] Chen (Flow in Games, USC thesis; flOw): passive Dynamic Difficulty Adjustment has unsolved problems - games cannot read flow directly, performance does not reliably reflect enjoyment, designers' fixed assumptions do not generalise; flow also depends on a sense of control. Proposal: let players pick activities/difficulty, bored players raise challenge, frustrated lower it; embed choices in core mechanics so menus do not break flow; "expand the flow zone" by offering a wide variety of experiences. — [Chen design page](https://www.jenovachen.com/flowingames/designfig.htm); thesis PDF https://www.jenovachen.com/flowingames/Flow_in_games_final.pdf (not decodable); overview [Wikipedia: Jenova Chen](https://en.wikipedia.org/wiki/Jenova_Chen)
- [O] Miyazaki on no difficulty selector (Sekiro, 2018): wants "everyone to the same level of discussion and the same level of enjoyment"; selector would fragment the community. On Elden Ring: lowering difficulty would remove the joy and "break the game". — [GameSpot](https://www.gamespot.com/articles/e3-2018-from-software-explains-why-dark-souls-bloo/1100-6459827/); [VideoGamer](https://videogamer.com/news/miyazaki-says-making-elden-ring-more-accessible-and-easier-would-break-the-game)
- Caveat: a 2012 "easy mode" Miyazaki quote was disputed as a mistranslation. — [Destructoid](https://destructoid.com/?p=135102)
- [S] Koster: boredom arises when patterns are mastered or too easy; frustration when too hard. — [Game Studies wiki summary](https://game-studies.fandom.com/wiki/A_Theory_of_Fun_for_Game_Design?oldid=4074)

### Inferences
- Application: fixed world difficulty, but player-driven challenge dials (Chen): choose which Warden first, how steep a slope, whether to take the risky ridge line for faster travel or an Echo. Difficulty = route choice, not a setting.
- Application: no scaling; use world geography as the soft gate (cold, wind, lethal terrain) and let diegetic hints say "not yet". Accessibility options (assist for timing/aim) separate from difficulty, optional, in menu.
- Application: guard rails to prevent frustration without scaling: generous checkpoint at Warden base, quick retry, never lose progress/world marks on failure.

### Gaps
- Csikszentmihalyi primary text not retrieved (recalled, unverified: flow conditions - clear goals, immediate feedback, challenge-skill balance, sense of control, loss of self-consciousness).
- No source retrieved on FromSoftware level design for teaching via encounter order; verify GMTK's Elden Ring/Dark Souls videos directly on YouTube.

## 5. Pacing and interest curves (Schell lenses, intensity rhythm, downtime)

### Takeaway
Alternate intensity with quiet deliberately; the quiet is the feature in this tone. Valve's director model formalises it; Ueda's empty rides exemplify it.

### Cited Findings
- [S] Schell's The Art of Game Design has 100 lenses; confirmed ones: #1 Essential Experience, #2 Surprise, #3 Fun, #4 Curiosity, #5 Endogenous Value, #6 Problem Solving, #7 Elemental Tetrad. — [CIRCA wiki (partial)](https://circa.cs.ualberta.ca/index.php/CIRCA:The_Art_of_Game_Design_-_Jesse_Schell) (page failed on re-fetch; from search summary)
- [O/S] Left 4 Dead director (Mike Booth): if action calms the Director plans new Infected attacks; if intense combat lasts too long it lets things settle. A blog describes a Relax - Build Up - Peak - Relax cycle and four stress metrics (unverified). — [Game*Spark interview 2007, via search](https://www.gamespark.jp/article/2007/04/10/11866.html); [GamesRadar making-of](https://gamesradar.com/making-left-4-dead)
- [S] Ueda: empty rides between colossi as reflection time (see section 3 source).

### Inferences
- Application: define an intensity budget: after any Warden release, force a quiet traversal stretch with no hostile spawns; world ambience (music swell on view reveals) does the pacing, not a director that spawns enemies.
- Application: use Schell lenses as a checklist per area: Curiosity (is there an unanswered question visible?), Surprise (one non-telegraphed wonder per 10 min), Interest Curve (hook -> rising -> climax -> release), Problem Solving, Endogenous Value (value comes from within the world: wind, snow, marks).

### Gaps
- Recalled, unverified lenses worth testing against the book: Interest Curve, Flow, Challenge, Skill, Freedom, Juiciness, Holographic Design, Resonance, Moments, Visible Progress, Reward, Anticipation (Schell's wording for hope/delay). Obtain the list from the book or deck.
- Booth's GDC 2009 slides unreachable (GDC Vault in maintenance redirect).
- Naughty Dog pacing: no source found.

## 6. Reward without loot; verbs design; Koster's theory of fun

### Takeaway
Discovery, knowledge, mastery, visible world change and expression are rewards that need no inventory. Keep the verb set small and let verbs interact; fun is learning patterns, so ensure new patterns keep arriving without bloat.

### Cited Findings
- [O] Miyazaki: surprise of discovery and sense of accomplishment are the core rewards (see section 2 source).
- [S] Koster (A Theory of Fun, 2005): fun is the brain mastering patterns; chunking groups information into units, deep repetition produces "grokking" similar to muscle memory; once patterns are mastered the challenge becomes trivial and games must present patterns in fresh ways or bore; no game lasts forever. — [Game Studies wiki summary](https://game-studies.fandom.com/wiki/A_Theory_of_Fun_for_Game_Design?oldid=4074); [Obsidian notes](https://publish.obsidian.md/aidanhelfant/Literature+Notes/Readwise/%F0%9F%93%9ABooks/Theory+of+Fun+for+Game+Design) (not fetched)
- [S] A Game Design Vocabulary (Anthropy & Clark, 2014): Anthropy part covers "Verbs and Objects", rules, creating choices; Clark covers "Resistance" including Push and Pull, Flow, Alternatives to Flow, The Pull of Rewards. — [InformIT](https://www.informit.com/store/game-design-vocabulary-exploring-the-foundational-principles-9780133155235); [O'Reilly](https://oreilly.com/library/view/a-game-design/9780133155181)
- [S] GMTK (Mark Brown) episode on versatile verbs: actions that gain multiple uses depending on how performed (e.g. Mario's jump). — [search result list, Wikipedia: GMTK](https://en.wikipedia.org/wiki/Game_Maker%27s_Toolkit)
- [S] Eurogamer analysis summarised: BotW expands the verb list and encourages experimentation. — [Matchsticks for my Eyes](https://www.matchstickeyes.com/2017/03/18/clippings-the-design-philosophy-of-breath-of-the-wild-building-a-career-out-of-mods-subscription-gaming-tooth-tail/)

### Inferences
- Application (verbs): core verbs = carve, glide, climb, grip, bend/release (element-specific modifier), leave mark. Each element should be a modifier on existing verbs (Frost: friction low; Gale: lift; Stone: grip/anchor; Tide: flow; Ember: burst) not new buttons, so combos multiply without bloat (versatile-verb principle).
- Application (chunking): teach each element in a safe space, then recombine under pressure in a Warden climb; later biomes quote earlier chunks in new context (Koster freshness).
- Application (reward without loot): (a) discovery: hidden lines worth finding because they are beautiful or faster; (b) knowledge: Warden patterns, wind rules, learned secrets gate nothing but open options; (c) mastery: "that run was clean" feedback via your own groove trail; (d) restoration: each release visibly changes biome (thaw, calm sea) - the strongest world-change reward; (e) cosmetics: robes earned by acts (e.g. wear patterns, dyes from biomes) as Expression; (f) anticipation: show a Warden silhouette on horizon long before you can climb it (delay + curiosity).
- Application (Echoes): few, each should unlock a new verb interaction, not a stat bump.

### Gaps
- No primary-source evidence located on anticipation/delay reward schedules (variable-ratio vs fixed) or on "knowledge as reward" outside Miyazaki; recalled unverified: Skinner/variable ratio critique in "compulsion loop" literature.
- Nintendo "toy first" / Miyamoto-Mario 64 camera-and-run philosophy not retrieved.
- Yee's earlier (2006) "Motivations of Play" paper not retrieved.
