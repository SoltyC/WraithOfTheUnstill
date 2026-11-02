# Generating the music locally on an RTX 3060 (12 GB) (research, 2026-11-02)

The user sources the music (`music-cues.md`). This is what could be run on their own machine instead of a web service. It comes from three web searches of third-party guides and mirror sites, which **disagree on VRAM**. Check the official README before downloading anything.

## Recommendation: ACE-Step 1.5

The best fit for a 12 GB card. It's the newest, it's MIT-licensed (safe for a game), and it's the lightest on VRAM.

- **VRAM:** the 2B model is reported at about 4.7 GB for the weights and should run comfortably on 12 GB. The 4B "XL" model needs at least 12 GB with offload and quantization, or at least 20 GB without. It would fit, but only just.
- **Speed:** one source claims a full song in about 20 s on a modern GPU. Unverified, and a 3060 isn't a top card, so expect slower.
- **Instrumental:** no source describes an instrumental-only mode. Try empty lyrics or `[Instrumental]`, and put "no vocals" in the style tags.
- **Control:** a style prompt plus lyrics. It probably has no true "exclude" field, so fold the avoid-styles into the style prompt as "no drums, no vocals".
- **Setup:** a ComfyUI workflow template exists, or run the project's own app.

## Alternatives

| Model | VRAM | Fit |
|---|---|---|
| **YuE** | The project says 8 GB with quantized builds; other guides say 16–24 GB | Full songs with lyrics. Likely slow and awkward on a 3060 |
| **MusicGen** (Meta) | About 16 GB for the large model; the small model is lighter | Weights are CC-BY-NC (non-commercial), so a poor choice for a game |
| **Stable Audio Open 1.5** | One guide lists 12 GB | Short clips of about 47 s at 44.1 kHz. Good for stings like `tear.wav`, not the full cutscene. Community license, so check the terms |
| **Magenta RealTime 2** | Not found | Built for live, real-time music, not composed pieces |

## Plan

1. Install ACE-Step 1.5 and start with the 2B model.
2. Generate each cue separately (the five cutscene cues in `release-cinematic.md` timing). Local models are no better than web services at keeping to timestamps or producing true silence.
3. Generate `release-gold` first (the stair song in full). Use it as the reference for the other cues if the tool supports audio reference or cover mode.
4. Cut and pad to length in an editor. Put the 48 kHz WAVs in `assets/audio/music/` and run `tools/audio/encode-music.sh`.

## Caveats

- Figures come from third-party guides and may be out of date. The official GitHub README is the source for VRAM and install steps.
- No independent quality comparisons were found. Claims that ACE-Step beats Suno came from promotional posts.
- Not checked: whether `tools/` already has a local-generation setup to build on.

## Sources

- [Deploy Open-Source AI Music Generation on GPU Cloud (2026), Spheron](https://www.spheron.network/blog/deploy-open-source-ai-music-generation-gpu-cloud-2026/)
- [ACE-Step 1.5 README mirror](https://gh.r-mj.com/ace-step/ACE-Step-1.5)
- [ACE-Step 1.5 project page](https://ace-step.github.io/ace-step-v1.5.github.io)
- [ACE-Step Music Generation, Clore.ai](https://docs.clore.ai/guides/music-generation/ace-step)
- [ACE-Step 1.5: The Complete 2026 Guide, DEV Community](https://dev.to/czmilo/ace-step-15-the-complete-2026-guide-to-open-source-ai-music-generation-522e)
- [Best Open-Source AI Music Models (2026), Boppy AI](https://boppy.me/blog/best-open-source-ai-music-models)
- [The Best Open Source AI Music Models in 2026, SongCreator](https://songcreator.pro/blog/best-open-source-ai-music-models)
- [Stable Audio Studio brings local AI sound generation, Startup Fortune](https://startupfortune.com/stable-audio-studio-brings-local-ai-sound-generation-into-focus/)
- [Magenta RealTime 2 discussion](https://hackernews-dynamic.seasondane.workers.dev/news/48402613)
