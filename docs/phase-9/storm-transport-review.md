# Storm transport history and sound checkpoint — 29 October

This is preparation for D6 spatial terrain erasure and real Ridge shelter. Neither terrain erasure nor Ridge shelter is implemented by this checkpoint. Normal storms remain disabled; main gameplay has not been changed.

## Persistence foundation

`StormExposure` records the actual shared world front in a fixed 65,536-key journal. Active samples commit at quarter-second cadence; inactive time is compact. Geometry/debug jumps retain a discontinuity instead of sweeping an imaginary front across the world. Queries integrate piecewise-linear sampled density in world space. The fixed-capacity limit fails explicitly rather than deleting history; long-session compaction is still required before shipping. This is not an allocation acceptance claim for the whole game.

An optional canonical 8m float32 node grid provides matching interval values for future CPU collision, GPU healing jobs and worker reloads. It uses existing raw Dunes biome bytes with independently clamped bilinear taps. It is tested but not instantiated or connected to terrain healing yet. No new terrain erosion is claimed.

Save schema v4 adds a nullable storm front/history payload, with a new v3 migration that invents no past storms. Actual front age, anchor, direction, fading strength and capture horizon restore in place. Terrain pages are collected first; world/play time and sealed history are captured afterwards so no late page timestamp exceeds the saved horizon. All journal endpoints, including the capture endpoint, stay committed on load. A regression catches the initial implementation's loss of that endpoint, which otherwise changed pre-save exposure during subsequent sub-cadence frames. Rebase and malformed/future-history checks are covered. This does not persist Stone's CPU shape pool or establish GPU/collision erosion parity.

`storm-front/save-smoke.json` exercises the actual running GPU terrain owner, async page readbacks, save-worker binary codec and in-memory application. Simulation advances while collecting two actual pages; both binary page hashes survive the codec exactly. Front block and exposure restore exactly, and a +1000-second clock rebase preserves the exposure integral. The terrain mark survives (fine/coarse values differ slightly across the existing downsample/restore path; this is not a bit-identical height assertion). No IndexedDB writes are made. Zero GPU errors/late pipelines; normal storm capability remains false.

## Sound

The existing SFX noise source now feeds six persistent storm nodes: low rumble, filtered grit and an upwind stereo pan. Actual shared local wind speed/direction and front density drive the layer. Wetness suppresses grit; a separate exposure input reduces nearby grit and leaves some distant rumble. That input is currently 1 because real Ridge shelter is still missing. The embodied storm sample is at the player, with camera orientation only for stereo. Ordinary wind retains its prior output when storm density is zero. Master mute and volume now control continuous SFX as well as triggered events.

`storm-front/audio-offline/report.json` plus seven 48kHz stereo float WAVs use the actual SFX factory through OfflineAudioContext, seeded noise and a 60Hz shared-wind timeline. Current storm-off PCM is bit-identical to the pre-change factory. Every render is finite and creates zero nodes during updates. Shelter-input RMS is lower than open air, enabled mute reaches an exact-zero tail, and zero volume stays silent. No speakers were used. The open storm mix has lower RMS than the ordinary reference because of the crossfade; these measurements do not establish perceptual balance. Human listening/mastering remains NOT ASSESSED. The shelter render is an audio-input check, not evidence of an actual Ridge.

## Gates and next integration

834 tests and locked production build pass. Review caught and fixed capture-boundary mutation and world-edge biome interpolation. GPU save smoke and offline audio are repeatable tools under `tools/bot/`.

Next: connect cumulative exposure to actual live/evicted terrain channels and collision, preserving fresh stamps and wet/frozen behavior; derive a bounded shared wind shelter field from actual GPU terrain state, retaining generation/staleness/coverage safeguards; then run real Ridge, audio, moving-body, graphics and combined performance checks. D2 cold maximum .492544ms still fails the unchanged .4ms gate. D2/D3/D9b remain unintegrated. No full handoff, human art/feel or full-world D12 acceptance.

Design verdict: shared physical cues support reading the wind and the body/terrain response in the 0–10s loop, with no new HUD or reward treadmill. Scope mismatch remains until actual erosion/shelter consumers exist. Bare-core fun, whole-world emptiness, dominance/opportunity cost, full-world chains, allocation and sustained performance remain NOT ASSESSED; no completion inferred from this foundation.
