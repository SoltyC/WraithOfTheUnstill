# Music: the next 30 Suno downloads (2026-11-26)

**The user:** 30 Suno downloads left. Look through the whole game (cutscenes, biomes and so on), decide where new songs go, and write a detailed Suno prompt for each.

## Where the game stands

**The score today is 15 tracks, all made on 8 October, before anything past the frost existed** (`assets/audio/music/`):
- **Beds:** title, waking, shrine, warden-fight, release, camp-lyre;
- **Travel:** plains-wanderer, plains-dusk, plains-herd, frost-highlands, frost-blizzard, frost-ice-caves;
- **Stings:** warden-wake, death, echo.

**How it plays** (`src/systems/audio.js`): the travel picker doesn't know which biome the player is in. It chooses by time of day and snow alone. So:
- the meadow, the dunes, the fen, Ebbhold, the Ember Waste and the coast all play the frost and plains music;
- the night track everywhere is `frost-ice-caves`;
- the Bellwether, the Walker, the Listener and the Ember Warden all share `warden-fight` and `release`;
- none of the cutscenes has a cue of its own.

**The fen chapter's 25 cues** (`docs/phase-10/music-cues.md`) were specified on 1 November and never made, even though the dive, Ebbhold, the Listener and its release are all built.

## How the 30 are spent

The rule: **each land gets its own sound.** This matches the user's "original things per land, not reuse". The game's quiet comes first. Wherever a cue can be cut from another track, or a silence is the cue, no download is spent on it.

| # | Land | Cues | Count |
|---|---|---|---|
| 1 | The theme | the stair song | 1 |
| 2–6 | Meadow | day, night, Hearn, the burning night, the stair to the manor | 5 |
| 7–10 | Dunes | day, night, the Walker's journey, the Walker lies down | 4 |
| 11–20 | Fen and Ebbhold | fen day, fen night, Morrow's fire, the descent, the halls, Sefa, the Listener ×2, the release, the register | 10 |
| 21–25 | Ember Waste | the Waste, the eruption, the Ember Warden, its release, the survivors' camp | 5 |
| 26–30 | Coast and the end | the still sea, *The Last Tide*, the walk into the sea, the epilogue, the credits song | 5 |

### What this deliberately doesn't spend a download on

- **The fen's short stings**, cut from the downloads instead:
  - `sefa-lets-go`: #16 stopped halfway through a phrase;
  - `tear`: the last seconds of #14, reversed or filtered;
  - `robes`: #1 cut before its last word;
  - `held-years`: #1 slowed to quarter speed (a `sox`/ffmpeg step in `tools/audio/encode-music.sh`);
  - `your-record`: one low note repeating and speeding up, which is easier to make in code than in Suno.
- **`release-climb`:** the existing `release.wav`. The cue sheet says it "must feel exactly like every other release", and the real one does that best.
- **The fen's other cues:** `fen-dusk`, `fen-tension`, `no-way-up`, `the-breath`, `ebbhold-held`, `tide-returns`, `night-camp` and `title-after`. These are the next batch if any of the 30 misses.
- **The Bellwether's own fight cue:** boss fights are off limits unless the user asks. It keeps `warden-fight`.
- **Frost:** it already has its own music.
- **The dunes' choice is paused.** #10 is the Walker lying down, whichever destination it ends up at, so no outcome is decided by the music.

### Wiring needed after the downloads (not done yet)

- A biome-aware travel picker in `systems/audio.js`.
- New beds in `audio/music.js` for each cue.
- Hooks so each Warden plays its own fight and release cue.
- Cues for the cutscenes (Ebbhold, Ember, and the coast once it's built).
- **Note:** the coast's ending (#27–#30) isn't built yet. Those four can be generated now or saved for when it is.

---

## How to use these prompts in Suno

- Use **Custom mode**. Paste the **Detailed prompt** into "Style of Music" (fall back to the shorter **Style** if a take drifts) and **Exclude** into "Exclude styles". Put the **Lyrics box** text into the lyrics field.
- **Turn Instrumental on** for every cue except #1 and #30.
  - With Instrumental on, Suno sometimes still adds "oohs". The `[Instrumental]` tags in the lyrics box help.
- **Make #1 first and keep it.** Everything marked *grows from the stair song* should be made with **Cover** from #1 (or with #1 uploaded as audio), so the tune carries over. That is the one idea in `music-cues.md`: all the fen's music turns out to be Old Ise's song.
  - Where Cover isn't available, the prompt describes the tune's shape in words instead.
- **Settings:** Weirdness low (20–35%) for anything gentle, higher (45–60%) for Ebbhold and the Listener. Style Influence high (70–85%), so it keeps to "sparse".
- **Only download the keeper.** Each generation gives two takes. Listen to both in full, regenerate freely, and download once per cue.
  - Then put it in `assets/audio/music/<file>.wav` (48 kHz WAV) and run `tools/audio/encode-music.sh`.
- **Shared house style:** quiet, slow, mythic, melancholic, a lot of air.
  - No drums unless the cue says so. No vocals unless the cue says so. No lo-fi or vinyl texture.
  - Silence and wind are the default (BRIEF §13).

**Not assessed:** I can't listen to audio, so I haven't heard the existing 15 tracks. Before you generate #2–#6, play `plains-wanderer` and `frost-highlands` and check that these palettes sit next to them. Adjust the instruments by ear if they don't.

---

## 1. The theme

### #1 `stair-song.wav` — Old Ise's stair song

- **Plays:**
  - The source of every fen cue.
  - Cut before its last word, it is `robes.wav` (the release's 2:55 shot).
  - Slowed to quarter speed, it is `held-years.wav`.
- **Length:** 1–2 min. Not looped.
- **Lyrics:** new, written for this, since `voice-script.md` never had them. Four plain lines a child could learn, sung on a stair in the dark.
  - The last line names **the door**: Ebbhold's sea-doors, and young Morrow's *"The door's not going anywhere."*
- **Style:**
  > a cappella folk lullaby, solo elderly female voice, thin, cracked, kind, unpolished, sung quietly to children in a stone stairwell, natural room reverb, simple four-line melody in a minor-modal key, stepwise, easy to remember, slow 66 bpm, rubato, intimate close microphone, breaths audible, old traditional work-song feeling, no instruments
- **Detailed prompt** (915 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Frail eighty-year-old woman singing alone, a cappella, in a cold stone stairwell at night, softly to frightened children so they keep walking down in the dark. Thin, cracked, kind, slightly breathy voice, unpolished, a real grandmother and not a trained singer, some notes wavering, pitch a little flat on long words. Very close microphone, every breath and lip sound audible, a short natural stone-room echo, no added reverb. One simple four-line folk melody in D minor modal (dorian), stepwise, mostly within five notes, rising on line three and falling home on the last word, a tune a child could learn after one hearing. Slow 66 bpm, free rubato, pauses between lines as if she is listening for footsteps. Begins with soft humming, sings the verse plainly, hums it once more more quietly, then trails off on the first line. Intimate, old, traditional, tender, a little sad. No instruments, no harmony, no choir.
- **Exclude:** `instruments, piano, guitar, strings, drums, choir, harmony, autotune, pop, vibrato-heavy opera, reverb wash, lo-fi`
- **Lyrics box:**
  ```
  [Intro]
  (hummed) mm-mm, mm-mm

  [Verse]
  Mind the stair, my little ones,
  one step down, and one step more.
  Follow my voice where the lamps don't go;
  I'll be waiting by the door.

  [Verse]
  (hummed, the same tune again, softer)

  [Outro]
  Mind the stair, my little ones...

  [End]
  ```
- **Listen for:**
  - A tune you could hum after one hearing.
  - A real old voice, not a stage "witch".
  - If Suno smooths the voice, add `frail, 80 year old woman` to the start of the style.

---

## 2. Meadow: the wind country

The meadow's own colour is **wind and bell**:
- breathy wooden flutes;
- the harp;
- bowed strings that swell and fall like gusts;
- now and then, far off, a bronze bell (the Bellwether).

### #2 `meadow-day.wav` — travel, by day

- **Plays:** anywhere in the meadow and forest, from 8:00 to 17:00. Loops.
- **Length:** 3–4 min.
- **Style:**
  > pastoral ambient folk, solo low whistle and wooden flute, celtic harp arpeggios, soft bowed psaltery, string pad swelling and falling like wind gusts, warm D mixolydian, 72 bpm, gentle, spacious, lots of silence between phrases, a lush green hillside under a big blue sky, a distant bronze bell once, quiet, slow, mythic, field recording of wind in grass underneath
- **Detailed prompt** (810 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Sparse pastoral ambient folk for exploring a lush green meadow under a huge blue sky. A solo low whistle and breathy wooden flute play a gentle, wandering D mixolydian melody in long phrases with real silence between them. Celtic harp answers with slow open arpeggios. A soft bowed-string pad swells and falls like gusts of wind moving across tall grass, then thins almost to nothing. A soft bowed psaltery shimmer now and then. Far away, once, a single bronze bell rings with a long decay. Underneath, a quiet field recording of wind in grass. 72 bpm, unhurried, no pulse you could tap. Warm, open, a little lonely, timeless and mythic. Structure: wind alone, whistle theme, harp alone, theme varied, back to wind so it loops cleanly. Natural acoustic recording, wide stereo, lots of air. No drums, no vocals.
- **Exclude:** `drums, percussion, vocals, choir, epic, trailer, pop, lo-fi, vinyl, synth bass, guitar strumming`
- **Lyrics box:** `[Instrumental] [Intro: wind] [Main theme: low whistle] [Break: harp alone] [Outro: wind]`
- **Listen for:** air between the phrases. If it's busy all the way through, it's wrong. Regenerate with `sparse` moved to the front.

### #3 `meadow-night.wav` — travel, dusk and night

- **Plays:** in the meadow from 17:00 to 8:00. This replaces `frost-ice-caves` there.
- **Length:** 3–4 min. Loops.
- **Style:**
  > nocturnal pastoral ambient, solo harp played slowly, alto flute, low cello drone, a far bronze bell tolling once with long decay, crickets and night wind texture, D dorian, 60 bpm, still and a little uneasy, the wind has died, lonely, sparse, lots of space, quiet, mythic, melancholic
- **Detailed prompt** (745 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Nocturnal pastoral ambient for a meadow at dusk and night after the wind has died. A solo harp plays slow, single notes and broken chords in D dorian with long gaps. An alto flute answers with low, breathy phrases. A very quiet low cello drone sits underneath. Crickets and the faint hush of night air in grass. Once in the piece, far away, a bronze bell tolls a single time and decays for many seconds. 60 bpm, free and still. Lonely, a little uneasy, beautiful, the land holding its breath under stars. Structure: night ambience, harp, flute, a long near-silence, harp again, end on the distant bell so it loops. Soft dynamics throughout, never louder than a whisper. Acoustic, natural, wide and dark. No drums, no vocals, no piano, no synths.
- **Exclude:** `drums, percussion, vocals, choir, piano, synth, lo-fi, vinyl, epic`
- **Lyrics box:** `[Instrumental] [Intro: night wind] [Harp] [Flute] [Long silence] [Outro: one bell]`
- **Listen for:** the bell is a landmark, so there should be one clear toll, not a carillon.

### #4 `hearn.wav` — the village of Hearn

- **Plays:** spatially, from the green at Hearn, the way the frost camp's lyre does from its fire. Someone in the village is playing.
- **Length:** 2–3 min. Loops.
- **Style:**
  > solo village fiddle tune with drone strings, played by one person on a porch, simple modal folk dance slowed to a walking pace, nyckelharpa-like resonance, light bodhran heartbeat very soft, warm, homely, a little tired, 84 bpm, dry close recording, natural, unpolished, a real musician not an orchestra
- **Detailed prompt** (817 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > One village fiddler playing alone on a porch at the edge of a green, for nobody in particular. Solo fiddle with ringing drone strings, a nyckelharpa-like sympathetic resonance, a simple modal folk dance tune slowed to a relaxed walking pace in D mixolydian. Opens with a few seconds of quiet tuning and open strings, then the tune, played plainly, then again with small ornaments, slides and double-stops, a little tired, a little tender. A very soft bodhran heartbeat comes in for the second pass only, barely audible. 84 bpm. Dry, close, unpolished recording: bow noise, finger squeaks, the odd scratchy note, wooden room. Homely, warm, real, the sound of a village that is still trying to live normally. Ends with the bow lifting off the string. One musician only. No orchestra, no vocals, no electric instruments.
- **Exclude:** `orchestra, choir, vocals, electric, synth, epic, pop, lo-fi, vinyl, fast reel, jig tempo`
- **Lyrics box:** `[Instrumental] [Intro: fiddle tuning a little] [Tune] [Tune again, varied] [Outro: the bow lifts]`
- **Listen for:** it must sound like one person playing. That's what makes it spatial and real.

### #5 `burning-night.wav` — the burning night

- **Plays:** while the fires burn in Hearn (*The Burning Night*). It replaces travel music there, until the last fire is out.
- **Length:** 2–3 min. Loops.
- **Style:**
  > tense folk-orchestral, urgent but not heroic, fast tremolo strings, low bowed drones, frame drum pulse like a running heartbeat, a bell ringing in alarm far away, crackle and roar of fire texture, D minor, 120 bpm, frightened village at night, chaos kept on a short leash, no melody you could sing, cinematic but small
- **Detailed prompt** (824 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Tense folk-orchestral underscore for a village on fire at night. Fast tremolo strings in D minor, low bowed double-bass drones, a frame drum pulsing like a frightened running heartbeat, and far away an alarm bell ringing in uneven, panicked strokes. Crackling and roaring fire texture woven in. 120 bpm. Urgent and desperate, the fear of someone trying to save other people, not a battle and not heroic. No singable melody; short rising string figures that keep breaking off, sharp dissonant swells, sudden drops to just the fire and the distant bell, then the pulse returns. Structure: alarm bell intro, build, tense loop, break of only fire and bell, tense loop again so it can repeat. Cinematic but small and close, a handful of players, not a trailer. No vocals, no choir, no brass fanfare, no rock, no electronic beats.
- **Exclude:** `vocals, choir, epic trailer hits, brass fanfare, rock, metal, electronic, dubstep, lo-fi, heroic`
- **Lyrics box:** `[Instrumental] [Intro: alarm bell] [Build] [Tension loop] [Break: just the fire] [Tension loop]`
- **Listen for:** panic for other people's sake, not a battle. If it sounds triumphant, regenerate with `desperate` instead of `urgent`.

### #6 `the-stair.wav` — the stair to the manor

- **Plays:**
  - On the 200 m climb from the stair-foot to the Bellwether's manor.
  - In the forecourt, where Bryn stands at the window with a lamp that hasn't flickered in forty years.
- **Length:** 2–3 min. Loops.
- **Style:**
  > slow ascending ambient, harp and celesta notes falling like held breath, a bowed glass tone that never changes, a bronze bell's overtones frozen and sustained, very sparse, a held moment, time has stopped, suspended, beautiful and wrong, B minor, 50 bpm, quiet, mythic, a lamp that never flickers
- **Detailed prompt** (771 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Suspended, glassy ambient for a long stone stair climbing to a manor where time has stopped. A single bowed-glass tone holds without changing for the whole piece. Over it, slow celesta and harp notes fall one at a time like held breath, in B minor, with long silences between them. The frozen overtones of a large bronze bell are sustained and shimmering, as if the bell's ring has been stopped mid-air and never faded. 50 bpm, no pulse. Very sparse, very quiet, beautiful and wrong, a lamp in a window that has not flickered in forty years, a sense that someone is still alive inside the stillness. Structure: held tone, celesta, silence, harp, held tone, so it loops seamlessly. Crystalline, clean, wide reverb tail. No drums, no vocals, no piano chords, no synth bass.
- **Exclude:** `drums, percussion, vocals, choir, epic, synth bass, lo-fi, vinyl, piano chords`
- **Lyrics box:** `[Instrumental] [Intro: held tone] [Celesta] [Silence] [Harp] [Outro: held tone]`
- **Listen for:** stillness. This is the first place the player might sense that the held are alive.

---

## 3. Dunes: the glass erg

The dunes' colour is **glass and sand that sings**:
- glass harmonica and bowed glass;
- ney (end-blown flute);
- a low plucked oud;
- the booming drone of a sand dune avalanching (G7: sand sings).

### #7 `dunes-day.wav` — travel, by day

- **Plays:** the erg, the wadis and the canyon, from 8:00 to 17:00. Loops.
- **Length:** 3–4 min.
- **Style:**
  > desert ambient, glass harmonica shimmer, solo ney flute, low oud plucked slowly, deep singing-sand drone like a booming dune, heat haze, bright and empty, vast, E phrygian, 66 bpm, very sparse, wind over sand, lonely and beautiful, quiet, mythic, lots of space, no rhythm section
- **Detailed prompt** (736 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Minimal desert ambient for crossing a vast glass-bright sand sea by day. A deep, booming singing-sand drone like a dune avalanching sits underneath. A glass harmonica shimmers in high, slow tones. A solo ney flute plays long breathy phrases in E phrygian, then silence. Occasionally a low oud is plucked slowly, single notes, never strummed. Heat-haze texture, wind hissing over sand. 66 bpm, no rhythm section, no groove. Bright, empty, vast, lonely and beautiful, ancient, not touristy and not exotic cliché. Structure: sand drone, ney, glass, a break of only wind, oud, back to drone so it loops. Extremely sparse, huge space, natural acoustic recording. No drums, no darbuka, no percussion, no vocals, no belly-dance or bazaar feel.
- **Exclude:** `drums, darbuka, percussion, vocals, choir, belly dance, EDM, pop, lo-fi, vinyl, epic trailer`
- **Lyrics box:** `[Instrumental] [Intro: sand drone] [Ney] [Glass] [Break: wind] [Oud] [Outro: drone]`
- **Listen for:** no tourist-bazaar clichés. If it comes out "Arabian Nights", regenerate with `minimal, ambient` first and drop the oud.

### #8 `dunes-night.wav` — travel, the cold erg at night

- **Plays:** in the dunes from 17:00 to 8:00.
- **Length:** 3–4 min. Loops.
- **Style:**
  > cold desert night ambient, bowed glass and crystal singing bowls, a single ney phrase far away, deep sub drone, star-filled silence, frost forming on sand, E minor, 50 bpm, extremely sparse, vast and cold, still, quiet, mythic, melancholic
- **Detailed prompt** (651 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Cold desert night ambient, a sand sea under thousands of stars with frost forming on the dunes. Bowed glass and crystal singing bowls ring in slow overlapping tones in E minor. A deep sub drone, felt more than heard. Once, very far away, a single solo ney phrase drifts in and fades. Faint night wind over sand. 50 bpm, no pulse, extremely sparse, long stretches of near silence. Vast, cold, still, lonely, quietly mythic and melancholic. Structure: silence and drone, glass tones, long silence, distant ney, drone, so it loops. Clean and crystalline, wide stereo, deep reverb. No drums, no percussion, no vocals, no oud strumming, no synth arpeggios.
- **Exclude:** `drums, percussion, vocals, choir, oud strumming, synth arpeggio, lo-fi, vinyl, epic`
- **Lyrics box:** `[Instrumental] [Intro: silence and drone] [Glass] [Long silence] [Ney] [Outro]`

### #9 `walker-song.wav` — the Long Walker's journey

- **Plays:** from the Walker's waking (`longWalker.js`), all through the 2 km steering home, in place of `warden-fight`.
  - The Walker never attacks. This is a procession, not a fight.
  - The song that steers it comes from the Singing Dunes.
- **Length:** 3–4 min. Loops.
- **Style:**
  > colossal slow procession, enormous low brass and bowed bass, deep frame drums like giant footsteps every two bars, singing-sand drone, glass harmonica melody of five notes repeated and answered, wordless low male choir humming, 56 bpm, ancient, awe, a mountain walking, majestic not aggressive, E phrygian, wide and slow, mythic
- **Detailed prompt** (786 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Colossal slow procession for a giant stone creature walking across the desert, ancient and peaceful, majestic, never aggressive. Deep frame drums and low bass drums strike like enormous footsteps once every two bars. Huge low brass and bowed double basses hold long chords in E phrygian. A deep booming singing-sand drone underneath. A glass harmonica plays a clear, memorable five-note melody, repeated and then answered by low horns. A wordless low male choir hums the five-note theme on the second pass. 56 bpm. Awe, grandeur, a mountain walking home. Structure: footsteps alone, five-note theme, build, theme with choir, break of footsteps only, theme again so it loops. Wide, cinematic, slow, huge space. No fast drums, no heroic fanfare, no trailer hits, no rock, no high soprano.
- **Exclude:** `fast drums, rock, metal, epic trailer hits, heroic fanfare, pop, EDM, lo-fi, vinyl, high soprano`
- **Lyrics box:** `[Instrumental] [Intro: footsteps] [Theme: five notes] [Build] [Theme with choir] [Break: footsteps only] [Theme]`
- **Listen for:** the five-note phrase. If one comes through clearly, the game can reuse it at the glyph pillars and the Singing Dunes.

### #10 `walker-lies-down.wav` — the dunes' release

- **Plays:** when the Walker kneels and lies down (`dunesScenes.walkerLiesDown`), in place of `release`. It fits any destination.
- **Length:** about 90 s. Plays once.
- **Style:**
  > slow cinematic release, the five-note glass melody now on warm strings, low brass settling, frame drums stopping one by one, singing-sand drone fading to silence, then water: harp and soft choir, relief and loss together, E major resolving, 52 bpm slowing, bittersweet, a giant lying down to rest, mythic, quiet ending
- **Detailed prompt** (698 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Slow cinematic release, about ninety seconds, as a colossal walking giant kneels and lies down to rest forever. Opens on the last two heavy footsteps of frame drums. The five-note glass melody returns, now on warm low strings, slow and tender. Low brass settles into long chords. The drums stop one by one. The singing-sand drone fades away to silence. Then, gently, water: a harp and a soft wordless choir enter, as if a spring has opened. Moves from E minor to a resolving E major. 52 bpm slowing to a stop. Relief and loss together, bittersweet, mythic, quiet and enormous. Ends softly on a held chord that fades out. No drums after the opening, no words, no trailer hits, no triumphant fanfare.
- **Exclude:** `vocals with words, fast drums, trailer hits, pop, EDM, lo-fi, vinyl, triumphant fanfare`
- **Lyrics box:** `[Instrumental] [Intro: last footsteps] [Theme on strings] [Drums stop] [Water: harp and choir] [End]`

---

## 4. Fen and Ebbhold: the Lung

These are specified in `docs/phase-10/music-cues.md`, including when each one plays. **Everything here grows from #1:** make them with Cover from #1 where you can. This is the game's quietest chapter.

### #11 `fen-day.wav` — the fen by day

- **Length:** 3–4 min. Loops.
- **Style:**
  > dark ambient, almost silent, a low drone, a few distant plucked lyre notes with very long gaps, marsh at dawn, held breath, mist, nothing with a pulse, D minor, free time, extremely sparse, lots of space, quiet, melancholic, fragments of an old lullaby never completed
- **Detailed prompt** (646 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Almost silent dark ambient for a misty marsh at dawn. A very low, soft drone in D minor, barely there. Every twenty or thirty seconds, two or three plucked lyre notes from far away, fragments of an old lullaby that never complete. Mist, still water, reeds, held breath. Free time, no pulse, nothing with a beat. Extremely sparse, long silences, mostly air. Quiet, melancholic, patient, uneasy calm. Structure: drone, silence, three notes, silence, drone, so it loops seamlessly. If anything becomes a melody you could hum, it is too much. Natural acoustic tone, distant, wide. No drums, no vocals, no piano, no synth arpeggios, nothing cinematic.
- **Exclude:** `drums, percussion, vocals, choir, melody, piano, synth arpeggio, lo-fi, vinyl, cinematic`
- **Lyrics box:** `[Instrumental] [Drone] [Silence] [Three notes] [Silence] [Drone]`
- **Listen for:** if you can hum it, it's too much.

### #12 `fen-night.wav` — the fen at night

- **Length:** 3–4 min. Loops.
- **Style:**
  > very low strings on the edge of hearing, sul tasto cello and bass, unsettled but not scary, dark water at night, a single low wooden flute phrase from far away (the lullaby's first four notes), D minor, free time, almost silent, sparse, quiet, melancholic
- **Detailed prompt** (583 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Very low strings on the edge of hearing for a marsh at night over black water. Sul tasto cello and double bass hold quiet, unstable chords in D minor that drift slowly, never resolving. Once, very far away, a low wooden flute plays the first four notes of an old lullaby and stops. Faint night ambience of water and reeds. Free time, almost silent, very sparse. Unsettled but not frightening, sad, lonely, dark. Structure: low strings, silence, distant flute, low strings, so it loops. Soft dynamics, wide and deep. No drums, no vocals, no horror stingers, no jump scares, no synths.
- **Exclude:** `drums, percussion, vocals, choir, horror stingers, jump scares, synth, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Low strings] [Silence] [Flute, far] [Low strings]`

### #13 `morrow-fire.wav` — Morrow's fire

- **Plays:** spatially, at Morrow's fire. It is the chapter's only warm music. **The player should love this.**
- **Length:** 2–3 min. Loops.
- **Style** (Cover of #1):
  > solo plucked lyre, simple and kind, the old lullaby melody stated plainly, then once more with a gentle harmony, warm firelight, intimate dry close recording, one musician, 66 bpm, D minor modal, folk, tender, unadorned, quiet
- **Detailed prompt** (622 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Solo plucked lyre by a campfire, the only warm music in a dark chapter. One musician playing an old lullaby melody in D minor modal plainly and kindly, then once more with a gentle lower harmony and a few small ornaments. 66 bpm, relaxed rubato. Warm, tender, unadorned, intimate, firelight on faces, a friend's song. Dry close recording, wooden body resonance, fingers on gut strings audible, soft fire crackle far behind. Structure: the tune, the tune again varied, the last note left ringing to silence, so it loops. Folk, quiet, simple, lovable. No vocals, no orchestra, no strings, no drums, no piano, no reverb wash.
- **Exclude:** `vocals, choir, orchestra, drums, strings, piano, reverb wash, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Tune] [Tune again, varied] [Outro: last note rings]`

### #14 `descent.wav` — the dive

- **Plays:** as the player sinks to the drowned city. **The most beautiful cue in the chapter.**
- **Length:** about 90 s. Plays once.
- **Also:** its last 5 s, reversed or low-passed, makes `tear.wav`.
- **Style** (Cover of #1):
  > underwater ambient, glassy shimmering pads, slow wordless choir, deep sub swell, rising wonder, slowly opening out as vast drowned towers appear in blue light, the lullaby melody slowed and enormous, D major lydian, 48 bpm, awe, beautiful, mythic, cinematic but gentle
- **Detailed prompt** (736 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Underwater ambient of wonder for sinking slowly through deep water to a drowned city. Deep sub swell and the muffled pressure of the deep at first. Glassy, shimmering pads slowly open out. A slow wordless choir enters, soft then rising. The old lullaby melody appears slowed and enormous, spread across the pads and choir, as huge drowned towers appear in blue light. D major lydian, 48 bpm, no percussion. Awe, beauty, mythic, gentle and vast, the most beautiful moment of the chapter. Structure over about ninety seconds: deep water, pads open, choir enters, full swell as the towers appear, hold, then end in a soft fading shimmer. Cinematic but gentle, wide stereo, long reverb. No drums, no lyrics, no solo singer, no trailer hits.
- **Exclude:** `drums, percussion, lyrics, solo vocal, trailer hits, synth arpeggio, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Intro: deep water] [Pads open] [Choir enters] [The towers: full swell] [Hold] [End]`

### #15 `ebbhold-halls.wav` — the drowned halls

- **Plays:** while exploring Ebbhold.
- **Length:** 4–5 min. Loops.
- **Style** (Cover of #1):
  > dread kept sad, reverberant low bowed metal and double bass, far-away slowed-down fragments of an old lullaby heard through water, muffled, vast stone halls underwater, D minor, free time, very sparse, unresolved, haunting not horror, quiet, mythic, melancholic
- **Detailed prompt** (627 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Haunting, sad underwater ambient for exploring vast drowned stone halls. Reverberant low bowed metal and double bass in D minor, long unresolved tones. From far away, slowed-down fragments of an old lullaby, heard muffled as if through water and walls, appear and dissolve. Free time, no pulse, very sparse, long silences. Dread kept sad rather than scary: grief and memory, not horror. Structure: low bowed tones, a muffled melody fragment, silence, low bowed tones, another fragment, so it loops. Huge cavernous reverb, dark, low-passed, deep. No drums, no vocals, no choir, no horror stingers or screams, no synth arpeggios.
- **Exclude:** `drums, percussion, vocals, choir, horror stingers, screams, synth, lo-fi, vinyl, epic`
- **Lyrics box:** `[Instrumental] [Low bowed] [Fragment, muffled] [Silence] [Low bowed] [Fragment]`
- **Settings:** Weirdness about 55%.

### #16 `sefa.wav` — Sefa holding the hem

- **Plays:** while Sefa holds the hem.
- **Length:** about 2 min. Loops.
- **Also:** stopped halfway through a phrase, it makes `sefa-lets-go.wav`.
- **Style** (Cover of #1):
  > tiny fragile music box playing the first four notes of an old lullaby over and over, slightly out of tune, slowing a little, a few soft felt piano notes underneath, close and small, childlike, heartbreaking, D minor, 60 bpm, extremely minimal, quiet
- **Detailed prompt** (583 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > A tiny fragile music box playing the first four notes of an old lullaby over and over, in D minor, slightly out of tune, its spring slowly winding down so it slows a little each time. Underneath, a few soft felt piano notes, very quiet, one at a time. 60 bpm. Close, small, childlike, heartbreaking, a child's hand holding on to someone's sleeve. Extremely minimal. Structure: music box alone, music box with soft piano, music box alone, so it loops. Dry and near, mechanical clicks of the box audible. No vocals, no strings, no drums, no orchestra, no reverb wash, no vinyl crackle.
- **Exclude:** `vocals, choir, strings, drums, orchestra, reverb wash, lo-fi, vinyl crackle`
- **Lyrics box:** `[Instrumental] [Music box] [Music box with piano] [Music box]`

### #17 `listener-hunt.wav` — the Listener: the hunt

- **Plays:** the fight's first phase. **No heroic percussion.** Slow and enormous: it sounds like something listening, then lunging.
- **Length:** 3–4 min. Loops.
- **Style:**
  > slow enormous dark ambient, sub-bass swells that rise and vanish, long silences, something huge listening in the dark, sudden low lunges of brass and bowed bass, then nothing, distant muffled lullaby fragment, D minor, free time, dread, underwater, vast, no rhythm
- **Detailed prompt** (648 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Slow, enormous dark ambient for a boss fight against a colossal blind creature in a flooded city that hunts by sound. Deep sub-bass swells rise slowly and vanish. Long silences in which something huge is listening in the dark. Then sudden low lunges: a short brutal blast of low brass and bowed bass, then nothing again. Far away, a muffled fragment of an old lullaby drifts through the water. D minor, free time, no rhythm, no heroic percussion. Dread, underwater pressure, vast scale. Structure: swell, silence, lunge, silence, swell, so it loops. Dark, cavernous, heavy low end. No drums, no vocals, no choir, no trailer hits, no horror screams.
- **Exclude:** `drums, heroic percussion, vocals, choir, trailer hits, horror screams, synth arpeggio, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Swell] [Silence] [Lunge] [Silence] [Swell]`
- **Settings:** Weirdness about 55%.

### #18 `listener-strand.wav` — the Listener: the turn

- **Plays:** the fight's turn. **The percussion finally arrives:** it's the player's triumph, earned and huge.
- **Length:** 2–3 min. Loops.
- **Style** (Cover of #1):
  > epic cinematic turn, the percussion finally arrives: deep taiko and timpani, low brass, full strings, wordless choir, the old lullaby melody now huge and defiant, D minor rising to F major, 92 bpm, earned triumph, underwater scale, mythic, powerful but not pop
- **Detailed prompt** (561 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Epic cinematic turning point in an underwater boss fight: the percussion finally arrives. A first deep taiko hit, then taiko and timpani drive forward with low brass, full strings and a wordless choir. The old lullaby melody, now huge and defiant, carried by horns and strings. Rises from D minor to F major. 92 bpm. Earned triumph, mythic, powerful, vast underwater scale. Structure: first drum, build, full theme, a break, full theme again, so it loops. Orchestral and choral, cinematic, never pop. No rock, no metal guitars, no EDM, no lyrics, no solo vocal.
- **Exclude:** `rock, metal, EDM, dubstep, pop, lyrics, solo vocal, lo-fi, vinyl, electric guitar`
- **Lyrics box:** `[Instrumental] [Intro: first drum] [Build] [Theme: full] [Break] [Theme]`

### #19 `release-gold.wav` — the release, 0:00 to 0:44

- **Plays:** in the release. The cutscene opens on the existing `release.wav` (as `release-climb`), then this.
  - The game stops it dead at the crack of the doors. **Keep it going well past 0:44.**
- **Length:** 60–90 s. Plays once.
- **Style** (Cover of #1):
  > golden sunlit full orchestra and choir, the old stair song at last in full, warm, happy, glowing, strings and horns and soft bells, D major, 70 bpm, everything finally home, joyous and full, mythic, the happiest music in the game, no ending, keeps building
- **Detailed prompt** (572 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Golden, sunlit full orchestra and choir: the happiest music in the game. An old lullaby, the stair song, heard at last in full and warm, carried by strings and horns with soft bells and a glowing wordless choir. D major, 70 bpm. Joyous, full, everything finally home, sunlight pouring through a drowned city. Starts already full and keeps building, bigger on the second statement of the theme, with no ending and no fade, as if it will go on forever. Warm, lush, mythic. About ninety seconds. No rock, no pop, no EDM, no lyrics, no solo vocal, no trailer hits, no sadness.
- **Exclude:** `rock, pop, EDM, lyrics, solo vocal, lo-fi, vinyl, trailer hits, sadness`
- **Lyrics box:** `[Instrumental] [Theme: full orchestra] [Choir] [Theme again, bigger]`

### #20 `the-register.wav` — the names read aloud

- **Plays:** under the register.
  - Very slow, and it only just holds together: nearly the song.
  - When Morrow reads the last name, it resolves, **once**, quietly.
- **Length:** 4–5 min. Plays once.
  - The ending needs to land when the last name is read. The game can start the cue so that it does.
- **Style** (Cover of #1):
  > very slow strings and solo cello, barely holding together, nearly the old lullaby, phrases that hang unfinished, long pauses, grief, D minor, 44 bpm, then at the very end one quiet final resolution to D major, sustained, then silence, sparse, quiet, melancholic
- **Detailed prompt** (620 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Very slow strings and solo cello under names being read aloud, one by one. The old lullaby, nearly there but never quite, phrases that hang unfinished and stop. Long pauses. D minor, 44 bpm. Grief, patience, remembrance, barely holding together. The cello leads, the string section answers softly, then silence. At the very end, once and quietly, everything resolves to D major, a sustained final chord, then silence. Structure: cello, unfinished strings, silence, strings, final resolving chord, end. Four to five minutes. Sparse, quiet, intimate. No drums, no vocals, no choir, no piano, no synths, nothing triumphant.
- **Exclude:** `drums, percussion, vocals, choir, piano, synth, lo-fi, vinyl, epic, triumphant`
- **Lyrics box:** `[Instrumental] [Cello] [Strings, unfinished] [Silence] [Strings] [Final chord: resolve] [End]`

---

## 5. The Ember Waste: the mountain is waking

The Waste's colour is **stone, bells and breath**:
- duduk and low cello;
- hand-struck stone and bronze bells (the Ash Chapel's hours, Cinderhold's lift bells);
- a low male chant for the pilgrims;
- a drone that breathes like the crust.

### #21 `ember-waste.wav` — travel

- **Plays:** in the Waste before the eruption (stages 1–4). A darker variation of it would suit stage 4, which could be a later download.
- **Length:** 3–4 min. Loops.
- **Style:**
  > volcanic ambient, solo duduk, low cello drone, hand-struck basalt stone and small bronze bells with long decay, a slow breathing pulse like cooling lava crust, steam hiss texture, A phrygian, 58 bpm, uneasy warmth, black ground and ash, sparse, quiet, mythic, melancholic
- **Detailed prompt** (631 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Volcanic ambient for crossing a black ash waste below a waking mountain. A solo duduk plays slow, sorrowful phrases in A phrygian. A low cello drone underneath. Hand-struck basalt stones and small bronze bells ring with long decays, like a chapel's hours and distant lift bells. A slow breathing pulse rises and falls like cooling lava crust. Steam hiss and faint ground rumble texture. 58 bpm. Uneasy warmth, black ground, ash in the air, sparse and mythic. Structure: the ground breathing, duduk, bells, silence, duduk, so it loops. Natural acoustic tone, wide, dark. No drum kit, no rock, no vocals, no choir, no synths, no EDM.
- **Exclude:** `drums kit, rock, metal, vocals, choir, synth, EDM, lo-fi, vinyl, epic trailer`
- **Lyrics box:** `[Instrumental] [Intro: breath of the ground] [Duduk] [Bells] [Silence] [Duduk]`

### #22 `eruption.wav` — the eruption

- **Plays:** the playable climax on the flanks (the last rescues, surges, ash at noon). The game swaps to #23 at the crater.
- **Length:** 3–4 min. Loops.
- **Style:**
  > catastrophic cinematic orchestral, relentless taiko and low drums, roaring low brass, tremolo strings, a bronze chapel bell ringing on its own out of time, low male choir chanting, rumbling sub bass, A phrygian, 104 bpm, urgency, a race against fire, desperate rescue, no triumph, dark, huge
- **Detailed prompt** (586 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Catastrophic cinematic orchestral for a volcano erupting while people are rescued from its flanks. Opens on a bronze chapel bell ringing on its own, out of time. Then relentless taiko and low drums, roaring low brass, tremolo strings, a low male choir chanting without words, rumbling sub bass. A phrygian, 104 bpm. Urgency, a race against fire and ash, desperate rescue, no triumph. Structure: bell intro, drums, build, full, a break of only rumble and bell, full again, so it loops. Dark, huge, cinematic, heavy. No rock or metal guitars, no EDM, no pop, no lyrics, no heroic fanfare.
- **Exclude:** `rock, metal guitars, EDM, dubstep, pop, lyrics, solo vocal, lo-fi, vinyl, heroic fanfare`
- **Lyrics box:** `[Instrumental] [Intro: the bell] [Drums] [Build] [Full] [Break: rumble and bell] [Full]`

### #23 `ember-warden.wav` — the Ember Warden fight

- **Plays:** in the crater, in place of `warden-fight`.
- **The fight's rhythm is the music's rhythm:** after a blow, the fist cools white, orange, dark red, then flares again. Frost only works in the dark beat.
- **Length:** 3–4 min. Loops.
- **Style:**
  > aggressive rooted duel, heavy taiko and anvil hits, low brass stabs, a cycle that builds hot then drops to near silence then flares again, breathing heat, roaring lava texture, deep male choir, A phrygian, 96 bpm, relentless, colossal, a titan chained in fire, cinematic orchestral, dark and powerful
- **Detailed prompt** (594 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Aggressive rooted orchestral duel against a titan of fire chained in a crater. Heavy taiko and anvil hits, low brass stabs, a deep male choir chanting. The music moves in cycles like a glowing fist cooling: it builds hot and loud, then drops to near silence with only roaring lava and a breathing drone, then flares again with a huge hit. A phrygian, 96 bpm. Relentless, colossal, dark and powerful. Structure: flare, hot, cooling to near silence, flare, hot, cooling, flare, so it loops. Cinematic, heavy low end. No rock or metal guitars, no EDM, no dubstep, no pop, no lyrics, no solo vocal.
- **Exclude:** `rock, metal guitars, EDM, dubstep, pop, lyrics, solo vocal, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Intro: flare] [Hot] [Cooling: near silence] [Flare] [Hot] [Cooling] [Flare]`
- **Listen for:** the dark beats. If it never drops, it's just a battle track.

### #24 `ember-release.wav` — the fire going home

- **Plays:** in the release (`docs/phase-11/ember-release.md`). Music starts only at shot 7: the Warden lies down, the sky opens, the Waste breathes. Before that it's the reversed roar and then silence.
- **Mood:** pity and awe, not victory.
- **Length:** about 90 s. Plays once.
- **Style:**
  > pity and awe, slow strings and low choir, a solo duduk carrying the melody, bronze bells ringing slowly as sunlight breaks through ash, warm A major rising out of A minor, 54 bpm, a giant lying down into the earth, the land going quiet, grief and peace together, mythic, cinematic but gentle, no victory
- **Detailed prompt** (539 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Slow strings and low choir as a defeated fire titan lies down into the earth and the sky opens. A solo duduk carries a sorrowful melody. Bronze bells ring slowly as sunlight breaks through clouds of ash. Warm A major rising out of A minor, 54 bpm. Pity and awe, grief and peace together, the land going quiet, absolutely no victory. Structure over about ninety seconds: low choir, duduk, bells as the sky opens, strings rise, quiet end. Cinematic but gentle, mythic, wide. No drums, no taiko, no trailer hits, no heroic fanfare, no lyrics.
- **Exclude:** `drums, taiko, trailer hits, heroic fanfare, lyrics, pop, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Intro: low choir] [Duduk] [Bells: the sky opens] [Strings rise] [End: quiet]`

### #25 `ash-camp.wav` — the survivors' camp on the headland

- **Plays:** spatially, at the survivors' fires, after the eruption. Its tone covers both outcomes:
  - the people who lived;
  - the shapes in the ash.
- **Length:** 2–3 min. Loops.
- **Style:**
  > solo low male voice humming a fishers' tune, no words, by a fire on a headland over the sea, one small hand drum very soft, a duduk answers once, tired, grieving, still together, A minor, 64 bpm, intimate dry recording, folk, quiet, melancholic
- **Detailed prompt** (559 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > One tired man humming an old fishers' tune by a fire on a headland over the sea, after a disaster. Solo low male voice, humming only, no words, close and dry, unpolished. One small hand drum played very softly, like a heartbeat. A duduk answers his tune once, from a little way off. A minor, 64 bpm. Grieving, tired, but still together, a community that survived. Structure: hummed tune, duduk answers, hummed tune, the fire crackling at the end, so it loops. Intimate folk, quiet, melancholic, real. No lyrics, no choir, no orchestra, no drum kit, no synths.
- **Exclude:** `lyrics, choir, orchestra, drums kit, synth, pop, lo-fi, vinyl, epic`
- **Lyrics box:** `[Instrumental] [Hummed tune] [Duduk answers] [Hummed tune] [Outro: the fire]`
- **Note:** this has a voice. If Instrumental mode drops it, use Instrumental off and put `[Humming] mm-mm` lines in the lyrics box.

---

## 6. The coast and the end

The coast's colour is **the end of motion**:
- solo piano and strings;
- a wordless female voice;
- glass-still water.

In the ending, the stair song returns. **The tune that never finished in Ebbhold finishes in the credits.**

### #26 `coast-still.wav` — travel by the still sea

- **Plays:** the coast, the cliffs and the beaches (day and night) until the end.
- **Length:** 3–4 min. Loops.
- **Style:**
  > still ocean ambient, solo felt piano, long sustained strings like a glass sea, slow swell that never breaks, soft wordless female voice far away once, wide horizon, F lydian, 52 bpm, calm and eerie, the end of the world's motion, extremely sparse, lots of space, quiet, mythic, melancholic
- **Detailed prompt** (578 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Still ocean ambient for a coast where the sea has stopped moving. Solo felt piano, slow, sparse single notes and soft open chords in F lydian. Long sustained strings like a glass-flat sea. A slow swell that rises and never breaks. Once, very far away, a soft wordless female voice. 52 bpm, no pulse. Calm and eerie, a wide horizon, the end of the world's motion, extremely sparse, lots of silence. Structure: still water, piano, strings, silence, distant voice, piano, so it loops. Quiet, mythic, melancholic, wide. No drums, no lyrics, no choir, no synth arpeggios, no new age.
- **Exclude:** `drums, percussion, lyrics, choir, synth arpeggio, new age, lo-fi, vinyl, epic`
- **Lyrics box:** `[Instrumental] [Intro: still water] [Piano] [Strings] [Silence] [Voice, far] [Piano]`

### #27 `last-tide.wav` — *The Last Tide* (cutscene)

- **Plays:** the sea Warden rising; the truth told plainly. **The ending isn't built yet** (`sea-plan.md` S5).
- **Length:** 2–3 min. Plays once.
- **Style** (Cover of #1):
  > vast cinematic revelation, deep strings and low brass rising from silence, full choir, a colossal shape rising from a still ocean, the old lullaby melody revealed in the low brass, D minor, 60 bpm, awe and dread and sorrow, the truth at last, mythic, huge but slow
- **Detailed prompt** (522 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Vast cinematic revelation as a colossal shape rises from a perfectly still ocean. Begins in silence and still water. Deep strings and low brass rise slowly from nothing. A full choir enters. The old lullaby melody is revealed in the low brass, slow and enormous. D minor, 60 bpm. Awe, dread and sorrow, the truth told at last. Structure: still sea, rising, choir, the theme in brass, hold, end. Two to three minutes, huge but slow, mythic, cinematic. No rock, no EDM, no pop, no lyrics, no trailer hits, no heroic fanfare.
- **Exclude:** `rock, EDM, pop, lyrics, trailer hits, heroic fanfare, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Intro: still sea] [Rising] [Choir] [The truth: theme in brass] [Hold] [End]`

### #28 `the-walk.wav` — walking into the sea

- **Plays:** while the player holds forward and the water rises.
  - At least 20 s, and it can be turned back from at any time, so it must loop and swell with the depth.
  - It continues into the sacrifice: the robe empties, the tide turns, and motion runs back up every river.
- **Length:** 2–3 min. Plays once, with a loopable first half.
- **Style** (Cover of #1):
  > a single held string note that slowly thickens into a vast swell, solo cello carrying the old lullaby very slowly, the water rising, then a sudden release: full orchestra and choir as the tide turns and the whole world moves again, D minor to D major, 50 bpm, sacrifice, grief and wonder, mythic, overwhelming, cinematic
- **Detailed prompt** (624 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > A single held string note that slowly thickens into a vast swell as someone walks into the sea and the water rises. A solo cello carries an old lullaby very slowly over it. Grows steadily with the depth. Then one sudden moment of release: full orchestra and choir burst in as the tide turns and the whole world moves again. D minor turning to D major, 50 bpm. Sacrifice, grief and wonder, overwhelming and mythic. Structure: held note, cello lullaby, swell, the release, full orchestra, long fade. The first half calm and even enough to loop. Cinematic. No drums, no trailer hits, no rock, no pop, no lyrics, no solo singer.
- **Exclude:** `drums, trailer hits, rock, pop, lyrics, solo vocal, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Held note] [Cello: the lullaby] [Swell] [Release: the tide turns] [Full] [Long fade]`
- **Listen for:** the turn must be a single moment that the game can cut to.

### #29 `epilogue.wav` — the world the player made

- **Plays:** under the long pass along the coast and inland, composed from the story state, so its length varies.
- **Length:** 4–5 min. Loops.
- **Style** (Cover of #1):
  > gentle reflective orchestral, felt piano carrying the old lullaby in fragments, warm strings, harp, soft horn, the sea moving again, wind returning, bittersweet, peaceful, D major, 60 bpm, a world in motion after a long stillness, sparse but warm, quiet, mythic
- **Detailed prompt** (496 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Gentle reflective orchestral epilogue over a long view of a coast and countryside coming back to life. Felt piano carries fragments of an old lullaby. Warm strings, harp and a soft horn answer. The sea moving again, wind returning. D major, 60 bpm. Bittersweet, peaceful, a world in motion after a long stillness. Sparse but warm. Structure: piano, strings, harp, piano and strings together, fade, so it can loop. Quiet, mythic, tender. No drums, no percussion, no lyrics, no choir, nothing epic.
- **Exclude:** `drums, percussion, lyrics, choir, epic, trailer, pop, lo-fi, vinyl`
- **Lyrics box:** `[Instrumental] [Piano] [Strings] [Harp] [Piano and strings] [Fade]`

### #30 `credits.wav` — the credits song: *Mind the Tide*

- **Plays:** over the credits and the moving sea. It's the only song in the game with words, apart from #1.
- **Its job:** this is where the stair song's last line is **finally finished**.
- **Length:** 3–4 min. Plays once.
- **Style** (Cover of #1):
  > folk ballad, solo young female voice, clear, plain, unaffected, close microphone, begins unaccompanied then a fingerpicked nylon guitar and harp join, strings arrive in the last verse, D major and D minor modal, 68 bpm, tender, sorrowful and hopeful, an old lullaby turned into a farewell, cinematic folk, quiet, building gently, final line resolves
- **Detailed prompt** (588 characters; paste into Style of Music in place of the short Style above, or into the Song Description box in Simple mode):
  > Folk ballad for end credits: an old lullaby turned into a farewell. Solo young female voice, clear, plain, unaffected, close microphone, no vibrato, no belting. The first verse is sung unaccompanied. A fingerpicked nylon-string guitar and a harp join on the second verse. Soft strings arrive in the last verse and swell gently. D major and D minor modal, 68 bpm. Tender, sorrowful and hopeful. The final line resolves fully on the home note and the instruments let it ring to silence. Cinematic folk, quiet, building gently. No pop production, no autotune, no drum kit, no choir, no rock.
- **Exclude:** `pop production, autotune, drums kit, EDM, rock, belting, vibrato-heavy, lo-fi, vinyl, choir`
- **Lyrics box:**
  ```
  [Intro]
  (hummed) mm-mm, mm-mm

  [Verse 1]
  Mind the stair, my little ones,
  one step down, and one step more.
  Follow my voice where the lamps don't go;
  I'll be waiting by the door.

  [Verse 2]
  Snow came down on the waiting stone,
  wind came home to the empty hill,
  sand lay down where the well was dry,
  and the fire slept, and the sea was still.

  [Verse 3]
  Mind the tide, my little ones,
  one wave in, and one wave more.
  Follow the water where I can't go;
  I'll be waiting by the shore.

  [Outro]
  Mind the stair, my little ones...
  I'll be waiting by the door.

  [End]
  ```
- **Listen for:** a plain voice, no pop sheen. Verse 2 retells the whole journey (frost, meadow, dunes, Ember, sea). The outro must land and resolve. It's the only resolved statement of the tune in the game.
- **Optional:** to keep `credits.wav` instrumental, Wenna's last shot could take this song instead, or the two could be split. Decide after hearing it.
