# Codex brief: skippable cutscenes, ruins that survive a reload, the camp's pens (2026-11-24)

You are working on **The Wraith of the Unstill**, a browser game (Babylon.js on WebGPU, WGSL shaders, Vite, Vitest).
Claude is working on other parts of the same chapter at the same time and will review and merge your branch.
Read this brief to the end before writing code.

## 0. Ground rules (read first)

- **Branch:** `codex/ember-polish`, already created for you from the checkpoint commit that contains this brief.
  Work and commit only there.
- **Commits:** small, verified checkpoints. Plain messages, **no co-author lines or trailers**.
- **Do not touch these files.** Claude is changing them now, and a merge conflict there costs more than your change is
  worth:
  - `src/systems/eruption.js`, `src/game/emberScenes.js`, `src/game/scenes.js`, `src/systems/scenes.js`
  - `src/shaders/lava.wgsl.js`, `src/shaders/plume.wgsl.js`, `src/shaders/clipmap.wgsl.js`
  - `src/world/sow.js`, `src/systems/npcs.js`, `src/systems/destruction.js`, `src/world/solids.js`
  - `data/motion/*`
  - `HANDOFF.md`, `PROGRESS.md`, `docs/phase-11/ember-design.md`

  If you need a change in one of them, write it in your report (§5) with the exact diff, rather than making it.
- **Boss fights are off limits.**
- **Code style:** match the files around you. Use readable, normal-width lines, and give every function a comment saying
  what it is in the world. Don't write dense minified one-liners.
- **Tests:** `npx vitest run` must pass in full (about 1270 tests) and `npm run build` must be clean before every commit.
- **Performance:** 90 fps at 1440p High on an RX 9070 (p95 ≤ 11.1 ms). None of this work should cost frame time; if
  something does, measure it (`node tools/bot/fps90-audit.mjs ...`) and say so.
- **Running the game:** the dev server is `npm run preview` on port 4173. `tools/bot/play.sh <spot> "^&gfx=high"` opens it
  in headless Windows Chrome on the GPU, and `tools/bot/client.mjs` drives it (`js(code)` evaluates in the page, where `g`
  is the game). **Always** run `tools/bot/play.sh stop` when you are done.

## 1. Task A: cutscenes can be skipped after the first viewing

From `docs/people-and-cutscenes.md` §3.1, the user's rule: **"Skippable after the first viewing, except the Listener's
release in Ebbhold, which always plays in full."** Nothing implements this yet.

What exists:
- `src/systems/director.js` plays shot lists, through `g.director.play(list, opt)`, `playCutscene(name)` and `stop()`, plus
  `active`, letterbox bars and subtitles.
- Directed scenes (`src/systems/scenes.js` `g.scenes.play(variant, opt)`) play through the director. A variant has an `id`.
- The quest graph's flags (`g.chapter.graph.flags`) save with the game.

Build:
1. **Seen records.** Give every cutscene a stable id: the name passed to `playCutscene`, a directed scene's `variant.id`,
   or an explicit `opt.id` passed to `play`. When one plays to the end or is skipped, add the flag `seen:<id>` so it saves.
2. **Skipping.** When a cutscene whose `seen:<id>` is already set is playing, show a small, quiet prompt in the corner
   ("Hold to skip", the game's minimal dark UI style; see existing HUD notices). Holding the key or button for about
   0.8 s, with a fill that shows the hold, skips it.
   - Skipping ends the cutscene the same way a natural end does: the same `onEnd` callbacks run, the camera blends back
     to the player, and the grade and letterbox are restored.
   - **Scene side effects must not be lost.** Some shots have `onCut` actions. A skip must still run every remaining
     shot's `onCut`, in order, before ending.
3. **The Listener's release** (`playCutscene('release')`) is never skippable, even when seen.
4. **Tests** (`tests/cutsceneSkip.test.js`, plain logic with no GPU):
   - the seen flag is set at the end;
   - skip is offered only when it has been seen;
   - 'release' is never offered;
   - a skip runs the remaining `onCut`s and `onEnd` exactly once.

   Factor the logic into a small pure module (for example `src/game/cutsceneSkip.js`) so it can be tested.
5. **Check it live** with the bot: play a cutscene twice, skip the second time, take a screenshot of the prompt, and
   confirm the game state is the same as after a full viewing.

## 2. Task B: ruins, black flows, ash and the camp survive a reload

After the eruption, the world remembers what happened:
- ruined buildings (vars `ruin:<site>` in `src/systems/destruction.js`);
- cooled flows and ash, from the flag `ember:erupted` in `src/systems/eruption.js` and `src/systems/volcano.js`;
- the camp's clearings (`ember:<id>-go` and the others, in `src/systems/sow.js`).

**Nobody has verified this across a real reload.** The bot's browser starts with a fresh, randomly named profile on every
launch (`tools/bot/play.sh`, the `prof=` line), so a save made in one launch is gone in the next.

Build:
1. **A persistent bot profile.** Add an option to `tools/bot/play.sh`, for example `PROFILE=keep`, that reuses a fixed
   profile directory instead of a fresh one, and doesn't delete it on `stop`. Keep the default exactly as it is.
2. **A reload test script**, `tools/bot/eruption-reload.mjs`:
   1. Launch with the kept profile.
   2. Run the eruption fast: teleport near the Sow, set `ember:warned`, then `g.chapter.graph.vars['ember:day'] = 4` and
      `g.eruption.rate = 25`, and wait for `g.eruption.done`.
   3. Wait for the collapses to settle. Record the `ruin:` vars, the camp sites that are shown, and the aftermath flags.
   4. Take screenshots at three places: the Sow (1000, −1640) looking at (860, −1950); Cinderhold (1880, −2040) looking
      at (1990, −2010); and the camp (690, −2650) looking at (760, −2632).
   5. Save to slot 1 (`window.game` or `g.game` `.saves.save('slot1')`), stop, relaunch with the same profile, load slot 1,
      and wait for the world to settle.
   6. Compare the same state and take the same three screenshots.
3. **Fix what doesn't survive**, outside the do-not-touch files if you can. If the fix belongs in one of them, describe
   it in the report with the exact change.
4. **Report:** a before/after screenshot pair for each place, and a table of the state that matched and the state that
   didn't.

## 3. Task C: the camp's animal pens

In the survivors' camp (`src/world/refugeeKit.js`, `pen()`, about line 390), the wattle pens render as odd orange
zigzags. Look at them in game:
1. Set the flags `ember:<id>-go` for `aled` and `ffion` (the farms with animals) and `ember:after`.
2. Teleport to (690, −2650), look at (760, −2632), and find a pen.

Make each one read as a woven hurdle fence:
- upright stakes;
- horizontal withies woven between them;
- the wood material (MAT.WOOD or MAT.PLANK), not whatever is giving the orange.

Keep within the kit's triangle budget test (`tests/refugeeKit.test.js`). Send before and after screenshots in the report.

## 4. What to read first

- `docs/people-and-cutscenes.md` §3, on cutscenes
- `src/systems/director.js`, `src/systems/scenes.js`
- `src/game/save/saveManager.js`, `src/game/save/saveStore.js`
- `src/systems/destruction.js` (only to read it: it's on the do-not-touch list)
- `src/world/refugeeKit.js`

## 5. Hand back

Write `docs/codex/ember-polish-report.md` covering:
- what you built, file by file;
- tests and build results;
- screenshots: the skip prompt, the reload before/after pairs, the pens before and after;
- every change you wanted in a do-not-touch file, with the exact diff;
- anything you are unsure of.

**Don't claim something looks right without having seen it.** If you couldn't run the game, say so.
