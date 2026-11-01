# Phase 9 gate: the Glass Dunes (D12, 2026-11-01)

Machine T (RTX 3060), headless Windows Chrome, 2560×1440, GPU at 0–3% before each run. Verdict: **the systems pass; the frame-rate lows and the art bar do not.** Human feel is NOT ASSESSED: nobody has played D11.

## Results

| Check | Target | Result | |
|---|---|---|---|
| Playthrough to the release | every stage | camp, sled, three instruments, five side sites, Walker home and released | **pass** |
| Save, page reload, load | all where they were left | flags, site stages, restored erg, Walker's rest (1823, 743), groove and heap within 0.1–0.2 m | **pass** |
| Late pipelines, GPU errors | 0 | 0 in every run | **pass** |
| Median fps, High | 60 | surf 65, Ridge 60, fight 62, front 64 | **pass** (Ridge marginal) |
| 1% low, High | above 60 | surf 44, Ridge 40, fight 53, front 53 | **fail** |
| GPU frame, High | | 14.3 / 16.8 / 15.7 / 15.3 ms; GPU 1% low 57–61 fps | Ridge over budget |
| Low preset, same bench | | 96–107 fps, 1% lows 60–90 | good |
| Gate shots | 12 frames at the bar | 13 captured in `screenshots/phase-09-gate/` | **see below** |
| Films | signature, Walker waking | `screenshots/phase-09-gate/film/*.mp4` | **see below** |

The playthrough's Walker leg starts 150 m from the camp (`?walker=home`), and the solvers feed brushes and Interact rather than casting: the pursuit is covered by `tools/bot/walker-pursuit.mjs` alone. Run: `tools/bot/play.sh "" "^&walker=home^&flood=1^&stone=1"`, then `node tools/bot/dunes-playthrough.mjs`.

## The art bar, judged by eye

- **Hold up:** the erg vista (`p9g-star-noon`), the camp late in the day (`p9g-camp-dusk`, now 17.5 h), the night (`p9g-night`), the Sky Window's stairs.
- **Do not yet:**
  - **The Long Walker** at 95 m: beaded legs and wavy striped lumps. It is the biome's centrepiece and reads as unfinished.
  - **The signature frame:** the light and the surf work, but there is no avalanching wake and no glass behind; a yellow patch shows through the robe; a black tear appears in the sand at the wake.
  - **`p9g-veil-*`:** the pair does not show crest streams, so restoration is unproven in stills.
  - **A Ridge on sand:** hard rectangular dark trenches.
  - **Awnings** still read as boards up close. Earlier frames also show sawtooth edges and grey patches on far slopes, and small coloured pyramids at distance.

## Bugs the gate found (fixed)

- A load replaced the quest graph's flag set, so every system holding it, the D10 Walker included, read stale flags: sites unsolved, the Walker back at its start, until a restart.
- Puzzle machines read their state only at boot.
- 128 empty tree meshes bound into three shadow cascades in the erg: no GPU cost, about half the main thread's frame (35 → 17.5 ms).
- Every bench crashed at its results without `?sysprof=1`.
