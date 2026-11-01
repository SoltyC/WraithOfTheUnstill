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

## Found in the user's playthrough (2026-11-01)

- The buried sled showed nothing: mast, lip stone and stakes added.
- **The game clock does not run in play** (`timeScale` defaults to 0): the hour changes only at shrines and a few set places. Any line implying time passes on its own is wrong. The cairns now wait for noon on Interact, and the Flood Garden for dusk. Whether the clock should run in play is the user's call.

## Finish pass (2026-11-01)

| Check | Target | Was | Now |
|---|---|---|---|
| 1% low, High | above 60 | 40–53 | 55–59 (not met; GPU-bound: Ridge spam 16.8 ms) |
| Worst frame, High | | 30–73 ms | 17–20 ms |
| Median fps, High | 60 | 60–65 | 59–65 (Ridge spam 59) |
| Low preset, 1440p | | 96–107 fps | 106–114 fps, 1% lows 94–103 |

- **The clock runs in play** (40-minute day); no measurable GPU or frame cost. Benches and bots hold a fixed hour. Not assessed: whether shadow edges visibly crawl as the sun moves.
- **The Long Walker:** a dune hide (broad strata under drifted sand), long tapered legs. Reads as one creature.
- **The camp:** felt tents replace the awnings.
- **The Hourglass:** thicker streams, chevrons in the pan, lights on the cradles.
- **G4 is live:** the Hourglass's chutes and the Frozen Falls read real sun and shade once a second.
- **Pressure:** a Skitter burrows in the pan at the twist (frozen sand stops it); a Whirler on the Singing Dunes sets off faces at random.
- **The ice halo stays in the frost.**
- **The surf wake** was a row of scallops: berms now form only along the groove.
- **CPU:** no re-record when a tree placement changes nothing; platforms by grid. The meadow is still about 23 ms (43 fps): cloth 4.4 ms and uniforms.
- **The yellow at the robe's hem is Flow,** by design.

## Still open

- **1% lows above 60 on High:** the GPU now limits it. Needs a GPU lever or a preset change.
- **The scarp at the frost/dune boundary** (about 2420, 1354): rows of sawtooth teeth on far hills. It is in the bake; a fix needs a re-bake and re-placement.
- **The signature frame:** no avalanching wake, no glass in shot. The wake is a clean trench with a hard outer edge.
- **Veil pair:** does not prove crest streams.
- **A Ridge on sand:** hard rectangular trenches.
- **Human play** of everything after the Hourglass; the laptop benchmark.
- Stand-ins from plan.md D11: Glass Battle visions, Pell's kite, the camp garden, Nadra's map layer, a dunes map page, what the two doors open.
- The frost Warden's climb may share the Bellwether's steering trap: not reproduced; boss fights are not to be changed without an explicit request.
