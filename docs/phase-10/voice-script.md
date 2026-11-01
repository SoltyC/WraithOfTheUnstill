# Voice script: The Lung (2026-11-01)

Everything to generate for Phase 10. The user sources the voices; this file says who, how and what. **The Wraith has no voice.**

## How to deliver

- **Format:** 48 kHz mono WAV in `assets/audio/voice/`, one line per file, named by the line's ID (`mor-001.wav`). The encoder makes the game's copies.
- **Dry and clean:** no reverb, music or filter. The game adds the underwater and room sound. **The same take is used muffled in play and clean in the cutscene,** so don't generate separate versions.
- **Trim to about 0.1 s of silence** at each end.
- **Lines marked ★ matter most:** generate three takes and let me hear them.
- `(soft)`-style notes are direction only. **Don't let the tool read them aloud.**
- Please note the tool's name and licence, as `ASSETS.md` asks for the music.

---

## Cast

| Who | Age | Voice type | Sounds like | Avoid |
|---|---|---|---|---|
| **Morrow** | about 70 | Woman. Low, weathered, warm, a light rasp. Slow, dry humour, rarely raises her voice. Plain rural accent. | Someone's favourite aunt, who's tired | Whispery, wise-old-mentor, theatrical |
| **Young Morrow** | 28 | The same woman, 40 years younger. Same rhythm, more laugh in it. | Teasing her sister | A different person. It must be recognisably her |
| **Liese** | 33 | Woman. Bright, quick, a bit bossy, an easy laugh. Same accent as Morrow. | An older sister running a work crew | Sweet or fragile |
| **Hanne** | 55 | Woman. Warm, broad, unhurried, a bit gruff. | A baker up since 4 am | Comic |
| **Teodor** | 36 | Man. Soft tenor, gentle, tired, careful. | A new father trying not to wake the baby | Deep hero voice |
| **Old Ise** | 80+ | Woman. Thin, cracked, kind. She sings too. | A very old woman on a stair | Witch-like |
| **Sefa** | 7 | Girl. Small, clear, serious. | A quiet child, not a cute one | Cute or stage-child. See note |
| **Oda** | 50 | Woman. Flat, level, practical. Holding herself together. | The person who has to do the counting | Sobbing |
| **Tam** | 40 | Man. Rough, plain, angry when he can't help it. | A camp hand | Villainous |
| **The Listener** | | Very deep and very quiet, as if from under the floor. Slow, no breath. **Any neutral deep voice:** I'll layer it with the crowd's voices. | A huge thing trying not to wake anyone | Demonic or growling |
| **The Held, crowd** | mixed | 6 women, 6 men, of different ages. Plain, frightened, quiet. | Ordinary people | Ghostly, moaning |

**Sefa's voice:** some tools restrict child voices. If yours does, use a soft young adult woman, and I'll pitch and process it. She only has a few lines.

**Who's voiced:** this chapter only, for now. Other chapters stay text, and a voiced fen next to silent camps will be noticeable. Voicing Sarai, Wenna and the others can come later if you like the result.

---

## 1. The fen: meeting Morrow

Where: the fen's edge, the first time the Wraith skids or runs on to open water.

| ID | Line | Direction |
|---|---|---|
| mor-001 | Stop. Stop there. Don't run on that. | urgent, kept low, from behind the player |
| mor-002 | I'm Morrow. I keep the jetty at the Sounding. You'd be the robe everyone's on their knees about. | getting her breath, amused |
| mor-003 | No feet. They said no feet. I thought they were being polite. | dry |
| mor-004 | Listen. You hear that? No, you don't. Nothing does. That's the fen. | quiet |
| mor-005 | Everything out here listens, and the water tells on you. | |
| mor-006 | So walk. Mud's loud. Reeds are loud. Running water's the loudest thing there is. | teaching, patient |
| mor-007 | Stay behind me. Put your feet where I put mine. Well. Whatever you've got. | smile in it |

## 2. Learning to be quiet

Short barks while walking behind her.

| ID | Line | Direction |
|---|---|---|
| mor-010 | Slower. | |
| mor-011 | There. Now you're getting it. | pleased |
| mor-012 | That was loud. | |
| mor-013 | Stand still. Don't do anything. | sudden, low |
| mor-014 | ...All right. It's gone. Come on. | breath out |
| mor-015 | See the ripples? That wasn't you. | |
| mor-016 | Ice doesn't talk. Walk on ice if you can make it. | |
| mor-017 | You're not bad at this, for a coat. | dry |

## 3. She saves the Wraith

Mudlings rise and catch it. She comes in with a lantern and a pole.

| ID | Line | Direction |
|---|---|---|
| mor-020 | Oh, you great wet idiot. Hold still! | shouting, for the only time |
| mor-021 | Get off it! Get off! | effort |
| mor-022 | Up. Get up. That's it. | breathing hard |
| mor-023 | I'm too old to do that twice. Don't tell anyone I ran. | laughing, shaky |

## 4. The fire ★

Three nights at her fire. These are why the betrayal hurts. Each night is one sitting, played by Interact. She's easy company, and **she never says the people are dead.**

| ID | Line | Direction |
|---|---|---|
| mor-030 | Sit. I know you don't need to. Sit anyway. I've had no one to talk at in years. | |
| mor-031 | My sister says I talk too much. Said. Says. | small catch, moves on |
| mor-032 | Liese. Three years older and she'll tell you it's ten. | fond |
| mor-033 | She could get a door crew moving with one look. I've seen grown men run. | laugh |
| mor-034 | She went down to work the doors at Ebbhold. A city, under the Sounding. You'd not believe it. | |
| mor-035 | She stayed down. They all stayed down. | flat, then looks at the fire |
| mor-040 | I used to dive. Best on the fen. | night two |
| mor-041 | Forty years I've looked at that water. It doesn't change. That's the trouble with it. | |
| mor-042 | You know what the worst of it is? Being the one who's still up here getting older. | light, it isn't |
| mor-043 | I hum, sorry. It's an old stair song. Old Ise sang it, so the little ones could find her. | ★ she has been humming the lullaby |
| mor-050 | They say you put things right. The wind. The sand. | night three |
| mor-051 | Is that true? When you've finished with one, does it stop? | very quiet, careful |
| mor-052 | ...Good. That's good. | ★ she has decided. Warm, and it should be a bit too steady |
| mor-053 | Get some rest. Or whatever it is you do. | |

## 5. The jetty ★

| ID | Line | Direction |
|---|---|---|
| mor-060 | This is the Sounding. Five hundred metres across and nobody's found the bottom but me. | |
| mor-061 | My sister's down there. She's waiting. I can't go down again. You can. | ★ plainest thing she's said |
| mor-062 | This is a Lung. Shaper work. You don't breathe, I know. The water doesn't care. It puts out anything that moves. | fitting it, hands shaking |
| mor-063 | There. That's the best I can do. | ★ she has just finished. Don't sell it |
| mor-064 | You've air to get down and come back. No more. Don't stop to look. | |
| mor-065 | When you find them, say their names. There's a book. They've waited a long time to hear them. | ★ she means something else. Play it as kindness |
| mor-066 | Go on. Before I change my mind. | a joke, and not one |

## 6. Ebbhold: the Held

In play these are heard **muffled under water and through walls,** with the words just out of reach. In shots 11–12 of the cutscene the **same takes play clean.** Plain and quiet: people who've been frightened for a very long time, and don't know how long.

| ID | Who | Line | Direction |
|---|---|---|---|
| hel-001 | Hanne | Is someone there? | hopeful |
| hel-002 | Hanne | Is it over? | |
| hel-003 | Hanne | Who's that? Can you hear me? | ★ |
| hel-004 | Teodor | Please. She's only just gone to sleep. | whisper |
| hel-005 | Teodor | Don't let her wake. Please. | |
| hel-006 | Old Ise | Mind the stair. | gentle, habit |
| hel-007 | Old Ise | Come on, little ones. This way. | |
| hel-008 | Liese | Morrow? Is that you? | ★ she thinks it's her sister |
| hel-009 | Liese | Hold the wheel. Keep holding. Someone's coming. | command, tired |
| hel-010 | Liese | I told you she'd come. | ★ to the crew. Glad |
| hel-011…016 | Crowd × 6 | Someone's here. | each voice |
| hel-017…022 | Crowd × 6 | Are you the one? | |
| hel-023…028 | Crowd × 6 | Don't go in there. Stop. | |
| hel-029…034 | Crowd × 6 | Help us. | not moaned; said |
| hel-035…040 | Crowd × 6 | Wait. Wait! | |

**When a name is said.** This is the worst sound in the game. Each is one quiet word, in the middle of a breath. Heard muffled in play. Clean in shot 12.

| ID | Who | Line | Direction |
|---|---|---|---|
| don-001 | Hanne | Don't. | ★ |
| don-002 | Teodor | Don't. | ★ |
| don-003 | Old Ise | Don't. | ★ a little surprised |
| don-004 | Liese | Morrow, don't. | ★ |
| don-005…016 | Crowd × 12 | Don't. | each voice |

**Sefa** says nothing in the city. Her silence is the point.

## 7. The Listener: the hunt

Heard low and rarely, from everywhere. It isn't taunting. It's asking for quiet.

| ID | Line | Direction |
|---|---|---|
| lis-001 | Hush. | |
| lis-002 | Hush now. | |
| lis-003 | Quiet. | |
| lis-004 | Don't wake them. | ★ it's the truth, and the player will take it as a threat |
| lis-005 | Please. | ★ at the stranding, the last thing before the climb |

## 8. The release: the cutscene

Timings are from `release-cinematic.md`. The first half is alive and loud, so the silence hits.

**Shots 2–3, the city alive**

| ID | Who | Line | Direction |
|---|---|---|---|
| cut-001 | Hanne | Who's had the crust off this? I can see you! | laughing |
| cut-002 | Teodor | There. There she is. Hello. Hello, you. | to the baby |
| cut-003 | Old Ise | Come on, little ones. Mind the stair. | same words as hel-007, and warm |
| cut-004 | Liese | You're late. | grinning |
| cut-005 | Young Morrow | The door's not going anywhere. | |
| cut-006 | Liese | Bring me a fish when you come back down. A real one. | |
| cut-007 | Young Morrow | Bring yourself up for once. | laughing, walking away. ★ the last thing she said |

**Shots 4–6, the flood**

| ID | Who | Line | Direction |
|---|---|---|---|
| cut-010 | Sefa | Papa! Papa, look! | running, happy |
| cut-011 | Teodor | Sefa, come here. Come here now. | ★ fear arriving |
| cut-012 | Liese | The doors! Hold the wheel! Hold it! | full shout |
| cut-013 | Crowd × 6 | Run! Get up the stair! | shouting |

**Shot 7, the Listener stops it**

| ID | Who | Line | Direction |
|---|---|---|---|
| lis-010 | Listener | Hush. | ★ The moment everything stops. The gentlest line in the game |

**Shots 9–12**

| ID | Who | Line | Direction |
|---|---|---|---|
| lis-011 | Listener | Stay. I have you. | ★ time-lapse, slow |
| lis-012 | Listener | Someone will come. | |

Shots 11–12 then use hel-001…040 and don-001…016, clean.

**Shot 13: it lets go**

| ID | Who | Line | Direction |
|---|---|---|---|
| lis-013 | Listener | I kept them. | ★ |
| lis-014 | Listener | I kept them as long as I could. | ★ to the Wraith, and without blame |

**Shot 14**

| ID | Who | Line | Direction |
|---|---|---|---|
| cut-020 | Crowd, all 12 | (one sharp breath in, no voice) | each separately; I'll layer them |
| cut-021 | Sefa | (one breath in) | |

**Nothing is said from then until the jetty.**

## 9. The jetty, after ★

She's on the jetty's end, facing the water. She's been waiting for this for forty years and it hasn't helped. **She doesn't apologise until the very end, and doesn't cry.**

| ID | Line | Direction |
|---|---|---|
| mor-100 | You took your time. | ★ her first line to it. Barely there, not a joke |
| mor-101 | They were alive. All of them. Liese too. You knew that by the end, didn't you. | ★ flat |
| mor-102 | I went down after it stopped. I found her at her wheel with her mouth open, in the middle of a word. I couldn't wake her. I tried for a week. | ★ |
| mor-103 | Forty years. She's been one breath from drowning for forty years. It was never going to finish. Nothing was ever going to come. | |
| mor-104 | I couldn't do it. I went down three times, and I stood at that well, and I couldn't do it. | |
| mor-105 | Then the whole fen started saying you put things right. | a dry, awful almost-laugh |
| mor-106 | I cut the Lung. I told you to say the names. You'd never have gone all the way if you'd known. | ★ the betrayal. No excuses in the voice |
| mor-107 | That's why it had to be you. You didn't know what you were doing. | ★ |
| mor-108 | I liked you. That's the part I can't... | ★ she stops herself, unfinished |
| mor-109 | I wanted her to be allowed to finish. That's all. It's done now. | |

**The choice:** the Wraith still wears the Lung.

| ID | When | Line | Direction |
|---|---|---|---|
| mor-110 | The Wraith hands it back | Thank you. No. Don't thank me for that. Just... go on. | she takes it, and can't look |
| mor-111 | The Wraith drops it in the water | ...Yes. All right. That's fair. | a long pause first |
| mor-112 | Either, last | The tide's coming back. Hear it? I'd forgotten the sound. | ★ final line of the scene. The first time she's ever sounded old |

## 10. That night

The shore camp. Oda has the register and is counting who came ashore. The count falls in a band, and she **never says a number:** the journal does. Only the matching lines play.

| ID | When | Who | Line | Direction |
|---|---|---|---|---|
| oda-001 | Always | Oda | Twelve hundred and six names in this book. I've read every one tonight. | exhausted |
| oda-002 | Few lived | Oda | That's all of them. That's all that's coming. | ★ |
| oda-003 | Some lived | Oda | Some of the rooms held. Nobody can tell me why those ones. | |
| oda-004 | Many lived | Oda | More than I'd dared. The shut rooms held. Somebody left them shut. | ★ doesn't look at the Wraith |
| tam-001 | Always | Tam | Don't bring that thing near the fire. | |
| tam-002 | Always | Tam | They knelt to you. You know that? My own mother knelt to you. | ★ |
| tam-003 | Player named many | Tam | They say you read them out. One at a time. | ★ |
| tam-004 | Player named none | Tam | You never said a word to them, did you. You just walked through. | |

**If Sefa lived.** She's by the fire with Oda. When the Wraith comes near she moves behind Oda, and says this to her, not to it.

| ID | Who | Line | Direction |
|---|---|---|---|
| sef-001 | Sefa | Is my papa coming up? | ★ small. Not crying |
| oda-010 | Oda | Not yet, love. Come here. | ★ she's lying, and is very steady |
| sef-002 | Sefa | It held my hand. | ★ to no one. Only if Teodor was named or the door crew's wheel was stopped |

**If Sefa didn't live.**

| ID | Who | Line | Direction |
|---|---|---|---|
| oda-011 | Oda | She isn't in the book. She wasn't old enough. I don't know what to call her. | ★ standing by a very small robe |
| tam-005 | Tam | Get away from her. Get away! | ★ the only shout of the night |

**If the Wraith finds Morrow later** (the jetty, any time after):

| ID | Line | Direction |
|---|---|---|
| mor-120 | Lantern's still lit. I don't know what for. | |
| mor-121 | I read the names. Every night. It doesn't get shorter. | |

## 11. The survivors' quest: The Register

At the jetty, the survivors read the book aloud. The Wraith stands and hears it. It fixes nothing.

| ID | Who | Line | Direction |
|---|---|---|---|
| reg-001 | Oda | We read them all. You'll stand there and hear them. That's what's left. | |
| reg-002 | Crowd × 12 | (each reads 5 names: list below) | steady |
| reg-003 | Morrow | Liese Morrow. My sister. | ★ last name read |
| reg-004 | Oda | That's all of them. Go on, then. | |

Names for reg-002: Hanne Dray, Teodor Vale, Ise Corran, Bren Asher, Maud Tolley, Jonas Reed, Petra Holm, Anselm Hart, Wil Sayer, Kit Marrow, Greta Lund, Odo Finch, Ansa Wray, Luc Harrow, Mira Stone, Ivo Crane, Nell Ashby, Rafe Tull, Sanna Pike, Edmund Rye, Tilda Marsh, Hugh Lyle, Orla Beck, Davy Thorne, Runa Hale, Piers Cobb, Elin Moss, Gil Warrick, Hester Pryce, Aldous Fenn, Berit Coll, Noah Tarn, Ada Lowe, Colm Birch, Inga Rook, Jory Wells, Lena Vance, Micah Dunn, Thea Grey, Silas Roe, Una Keld, Walt Ames, Yara Shaw, Ned Farrow, Alys Quill, Bastian Horne, Cora Teal, Dov Lark, Esme Rudd, Finn Oakes, Gwen Sedge, Harald Voss, Isla Penn, Jude Marsh, Kaia Dorn, Leif Strand, Moira Glen, Nils Hay, Opal Reeve, Perrin Sole.

## 12. After: the Veiled turn away

Barks anywhere in the world, once. They replace kneeling. The same 2 crowd voices can read these.

| ID | Line | Direction |
|---|---|---|
| bar-001 | That's it. That's the one from the fen. | low, to someone else |
| bar-002 | Don't look at it. | |
| bar-003 | Twelve hundred people. | |
| bar-004 | We used to leave out water for you. | ★ to its face |
| bar-005 | Go on. Nobody here's going to stop you. | |
| bar-006 | Keep walking. | |

---

## Song

**Old Ise's stair song.** Sung by Old Ise, unaccompanied, thin and in tune. The whole score grows from this tune (`music-cues.md`). Morrow's hummed version can be the same tune hummed by Morrow's voice.

| ID | Who | |
|---|---|---|
| sng-001 | Old Ise | The whole verse, alive, in shot 2 |
| sng-002 | Morrow | Hummed, no words, about 20 s, for the fire |

> Mind the stair, mind the stair,
> hold the wall and I'll be there.
> Count them up and count them down,
> nobody's lost and nobody's drowned.
