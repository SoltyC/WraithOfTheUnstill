# Music cues: The Lung (2026-11-01)

The user sources the music, **with Suno** (decided 2026-11-02, after ACE-Step and Stable Audio 3.0 were both rejected by ear). Delivered like the rest of the score: **48 kHz WAV masters in `assets/audio/music/`** under the file names below; `tools/audio/encode-music.sh` makes the game's copies.

## The one idea

**Everything grows from Old Ise's stair song** (lyrics in `voice-script.md`). A short, plain, four-line tune a child could learn: first heard hummed at Morrow's fire, then under the city, then sung in the flashback.

Only then does the player understand that all the chapter's music was that song. **Please write or generate the tune first,** then build the cues from it.

**The fen's rule:** this is the game's quietest chapter, and the silence is doing work. Sparse, a lot of air. **Silence is a cue:** the places marked *none* are deliberate.

## Fen

| File | Length | Loops | Mood and instruments |
|---|---|---|---|
| `fen-day.wav` | 3–4 min | yes | Almost nothing. A low drone, a few distant plucked notes, long gaps. Held breath. Nothing with a pulse |
| `fen-dusk.wav` | 3–4 min | yes | The same, a little warmer, a single low flute. Fragments of the song, never the whole tune |
| `fen-night.wav` | 3–4 min | yes | Very low strings on the edge of hearing, unsettled but not scary |
| `morrow-fire.wav` | 2–3 min | yes | The chapter's only warm music. Solo plucked instrument (lyre, as at the frost camp), simple and kind. The tune stated plainly. **The player should love this** |
| `fen-tension.wav` | 1–2 min | yes | Plays when something nearby is listening. One low pulse, very slow, like a heartbeat under the floor |

## The dive

| File | Length | Loops | Mood and instruments |
|---|---|---|---|
| `descent.wav` | about 90 s | no | **The most beautiful cue in the chapter.** Rising wonder as the player sinks: glassy pads, slow choir without words, opening out as the towers appear |
| `tear.wav` | 3–5 s | sting | Not a crash. The music itself draining away, a falling, thinning gliss, as if the air's going out of it |
| `no-way-up.wav` | about 60 s | yes | Thin, fast high strings, shallow-breath rhythm. Panic with no drums |
| `the-breath.wav` | about 40 s | no | Huge relief, a swell of warmth when the bubbles refill the Lung, which curdles into something turning and circular |

## Ebbhold

| File | Length | Loops | Mood and instruments |
|---|---|---|---|
| `ebbhold-halls.wav` | 4–5 min | yes | Dread, kept sad. Reverberant low bowed sounds and far-away, slowed-down fragments of the song, as if heard through water |
| `ebbhold-held.wav` | 2–3 min | yes | For rooms full of the Drowned. Almost silent. A very slow, soft chord that never resolves |
| `sefa.wav` | 2 min | yes | Under the time she's holding the hem. Tiny and fragile: a music box, or a few piano notes. The first four notes of the song, over and over |
| `sefa-lets-go.wav` | 20 s | no | The tune stops halfway through its line |
| `listener-hunt.wav` | 3–4 min | yes | The fight: slow and enormous. Sub-bass swells and silence. It should sound like something listening, then lunging. **No heroic percussion** |
| `listener-strand.wav` | 2–3 min | yes | The fight's turn. The percussion finally arrives: this is the player's triumph, and it should feel earned and huge |

## The release (one cutscene; timing matters)

The times are from `release-cinematic.md`. The game makes the hard cuts itself, so **cues can run longer than they're needed.**

| File | Plays | Length | Mood and instruments |
|---|---|---|---|
| `release-climb.wav` | The Last Draw, held key, to 0:00 | 60–90 s, loops | The biggest build in the game so far. Heroic, swelling, with the choir. **It must feel exactly like every other release:** the player has to feel they've won |
| `release-gold.wav` | 0:00 → 0:44 | 60 s | The same theme turns golden, sunlit, full and happy: the stair song at last, in full orchestra. **Keep going past 0:44.** The game stops it dead at the crack of the doors |
| *none* | 0:44 → 0:54 | | No music at all: only the flood |
| *none* | 0:54 → 1:15 | | **Total silence** after the Listener stops everything |
| `held-years.wav` | 1:15 → 1:42 | 30 s | Green and slow. The song at quarter speed, very low, on one instrument |
| `your-record.wav` | 1:50 → 2:15 | 25 s | The stair song's rhythm, with the tune gone: one low note repeated, slowly getting faster and tighter with the names. No melody. Cold |
| *none* | 2:15 → 2:40 | | Nothing. The Listener's voice, the breath, the water, black |
| `robes.wav` | 2:55 → the end of the shot | 40 s | **Old Ise's song, one small, thin voice or a single instrument,** unaccompanied, and it doesn't finish its last line. Then silence |

## After

| File | Plays | Length | Mood and instruments |
|---|---|---|---|
| *none* | The walk through the robes | | Only water |
| *none* | The jetty | | Only water, until the tide |
| `tide-returns.wav` | From Morrow's last line | 30 s | The first time the fen has made a sound of its own: the tide in low strings. Not comforting |
| `night-camp.wav` | The night | 2 min, loops | One low voice, far away, no words. A grief with nothing to resolve it |
| *none* | The fen, from then on | | **No music until the survivors' quest is done** |
| `the-register.wav` | The names read aloud | 4–5 min | Very slow, and it only just holds together. Nearly the song. When Morrow reads the last name, it finally resolves, once, quietly |
| `title-after.wav` | The title screen, on any save past this | 2–3 min, loops | The usual title theme with the warmth taken out, and the stair song's four notes inside it. The player will hear this every time they start the game |

## Prompt notes for an AI music tool

- **Always:** no vocals unless the cue says so, no drums unless the cue says so, no vinyl or lo-fi texture, "sparse", "lots of space".
- Style words the game already uses: quiet, slow, mythic, melancholic.
- For `fen-*`: "dark ambient, almost silent, long gaps between notes, drone, marsh at dawn".
- For `descent`: "underwater, glassy pads, wordless choir, slowly opening, wonder".
- For `release-climb`: "cinematic orchestral triumph, heroic, huge choir, rising".
- For `your-record`: "single repeated low note, slowly accelerating, cold, minimal, no melody".
