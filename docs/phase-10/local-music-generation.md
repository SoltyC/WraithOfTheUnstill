# Generating the music locally on an RTX 3060 (12 GB)

Research 2026-11-02, then installed and tested the same day. Installed tool: **ACE-Step 1.5** at `C:\wraith-tools\ACE-Step-1.5` (commit `ca1e85f`, MIT). The first version of this page came from third-party guides. Everything below was checked against the project's own docs or run on this machine, and the corrections are listed at the end.

## Now on trial: Stable Audio 3.0 Medium

Installed 2026-11-02 at `C:\wraith-tools\stable-audio-3`, from Stability's own repository. The test clips are **not generated yet:** the weights are gated (401 without a login), so the user has to accept the terms. Nothing is built on it until the user has heard two samples.

- **Windows:** the repository supports NVIDIA only on Linux, so PyTorch 2.7.1 CUDA 12.6 was installed by hand. It sees the 3060. Flash Attention has no Windows build; the code falls back to its own SDPA path, which may be slower.
- **Sample:** after the login, `tools/audio/stable/sample.sh` writes 60 s of `fen-day` and `morrow-fire` to `C:\wraith-tools\sa3-out`.
- **Download:** 8.6 GB of model and 1.1 GB of text encoder.
- **Licence, if it's kept:** Stability AI Community License. Commercial use is free under US$1M annual revenue, across the user and affiliates, whatever the source of that revenue. It needs registration with Stability, a licence copy and notice file with the game, and "Powered by Stability AI" somewhere such as the credits. Outputs are the user's, and can't be used to train other generative models. The Gemma text encoder has its own terms.
- **Training data:** Stability says all of it is "fully licensed", without naming sources.

## Verdict: rejected by ear

**The user listened to the test clips on 2026-11-02 and said the audio is terrible. No cue in the game comes from ACE-Step.** The user had it deleted the same day, along with `tools/audio/ace`. The fast runs and licence below don't matter if the music isn't good enough, and the page's earlier recommendation of it for beds is withdrawn. The notes are kept as a record of what was tried.

## What was chosen, and why (superseded)

Of the models licensed for use in a game, it has the best mix for this score: instrumental mode, reference and cover modes, repaint, LoRA training, and fast local runs.

| Model | Licence | Fit for this game |
|---|---|---|
| **ACE-Step 1.5** | MIT | **Installed.** Runs on this card |
| YuE2 (Sept 2026) | Weights CC BY-NC | Ruled out: non-commercial |
| MusicGen | Weights CC BY-NC | Ruled out: non-commercial |
| HeartMuLa | Apache 2.0 | Usable, but built for lyrics and tags, with community reports of dependency conflicts and about 1× real time |
| Stable Audio 3.0 | Stability Community | The one to try next. Open weights up to Medium, company states it was trained on licensed data. Gated: the user has to accept terms on Hugging Face. Check the licence text before use; guides mention a US$1M revenue limit that Stability's post doesn't |
| Magenta RealTime 2 | Not checked | Built for live play, not composed cues |

## What was measured here

Minecraft was running throughout. Close it when generating: it costs memory, and the runs below were on the edge.

| Test | Result |
|---|---|
| 2B turbo, 8 steps, 40 s of music | 3–4 s, 6.4 GB peak |
| 2B turbo, three 36 s takes with lyrics | 9.5 s, 6.4 GB |
| 2B turbo, cover of a 36 s source | 4–7 s, 7.1 GB |
| 2B sft, 50 steps, 40 s of music | 12 s, 6.6 GB |
| 2B sft, cover of a 36 s source | 19 s, 6.9 GB |

**XL (4B) is not usable here.** Below 20 GB it needs CPU offload, and offload crashes this install (below). The partial download was deleted.

**Sparse music is possible.** The fen-day test moves from about −19 to −43 dB within the clip (LRA 16.8 LU, against 7.1 for the lyre), so it does leave gaps. True silence still has to be cut in an editor, and clips fade out early: the lyre test was silent for its last 6 s, so **every loop needs cutting and crossfading by hand**.

## The melody does not reliably survive

`music-cues.md` grows the whole chapter from the stair song, so this is the main limit. Cover mode was measured by chroma correlation with a plain plucked test tune, taking the best match over transpositions and small time shifts. 1.0 is identical.

| Output | Match |
|---|---|
| No source at all (control) | 0.28 |
| Lyre, cover 1.0 / 0.8 | 0.36 / 0.39 |
| Flute, cover 1.0 | 0.36 |
| Orchestra, cover 1.0 | 0.53 |
| sft model, lyre, cover 1.0 | 0.17 |

Different instruments lower this measure, so it can't prove a tune was lost, but only the orchestra clearly beats the control. This was the plan before the verdict:

1. **Write the stair song as notes** and approve it first. `sefa`, `sefa-lets-go`, `held-years`, `your-record`, `robes` and `morrow-fire` depend on those exact notes, so they are played from the notes on sampled or synthesised instruments, or by a person.
2. **Use ACE-Step for what has no fixed tune:** `fen-*`, `ebbhold-*`, `listener-hunt`, `no-way-up`, `night-camp`, and swells and textures under the rest.
3. **Try cover for the big cues** (`release-gold`, `release-climb`) and keep a take only if the tune is audibly there.

## Using it

- **Studio:** run `C:\wraith-tools\ace-ui.bat`, then open http://localhost:7860. It takes under a minute to start.
- **Batches:** `tools/audio/ace/run.sh <cues.json> [name]` writes 48 kHz WAVs to `C:\wraith-tools\ace-out\<name>`. The format is at the top of `tools/audio/ace/cue.py`. Use **one model per run**: switching models in one run crashed it.
- **Finish:** cut and loop in an editor, put the WAVs in `assets/audio/music/`, and run `tools/audio/encode-music.sh`.
- **Test takes:** `C:\wraith-tools\ace-out\listen`.
- **Disk:** about 24 GB on C:.

## Known problems on this machine

- **CPU offload crashes** (access violation moving the VAE to the CPU) when a source is encoded, so `cue.py` keeps everything on the GPU.
- **ACE-Step's 30 s encode chunk runs the card out of memory.** `cue.py` uses 12 s without changing the install.
- **The language model is off** in `ace-ui.bat`: it failed to load with the paging file too small, with Minecraft open. Without it, write captions by hand, using the prompt notes in `music-cues.md`.

## Before any of this ships

- **Training data:** the README doesn't say what the model was trained on. It warns of unintentional copyright similarity and asks users to check originality and disclose AI use. Stable Audio 3.0 is the alternative if that matters.
- Any cue used goes in `ASSETS.md` with its tool, settings and seed.

## Corrections to the first version

- **Instrumental mode exists:** `instrumental=True` or the `[Instrumental]` lyric.
- **Reference and cover modes exist,** but cover doesn't keep a tune reliably (above).
- **Newer than the first search:** YuE2 and Stable Audio 3.0, listed above.
- **Speed:** turbo is 10 times faster than real time here, much better than the guides suggested. Quality was judged afterwards: see the verdict at the top.

## Sources

- [ACE-Step 1.5 repository](https://github.com/ace-step/ACE-Step-1.5): README, `docs/en/GPU_COMPATIBILITY.md`, `INFERENCE.md`, `Tutorial.md`
- [HeartLib](https://github.com/HeartMuLa/HeartLib)
- [YuE2 on ComfyUI Wiki](https://comfyui-wiki.com/en/models/yue2)
- [Stable Audio 3, Stability AI](https://stability.ai/news-updates/meet-stable-audio-3-the-model-family-built-for-artistic-experimentation-with-open-weight-models)
- [Stable Audio 3.0, The Decoder](https://the-decoder.com/stability-ai-launches-stable-audio-3-0-with-up-to-six-minute-tracks-and-open-weights/)
- [Best Open-Source AI Music Models, Boppy AI](https://boppy.me/blog/best-open-source-ai-music-models)
