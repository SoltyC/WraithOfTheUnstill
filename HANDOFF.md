# Handoff — 2026-10-27

This is the state of **The Wraith of the Unstill** (a Babylon.js WebGPU action RPG) at handoff, written for a new agent with no prior context. Read this file first, then:

- `BRIEF.md` (the spec);
- `DECISIONS.md` (architecture and the user's direction);
- `docs/gameplay-design.md` (the gameplay design, with "— Done" notes per system);
- `docs/phase-9/plan.md` and `docs/phase-9/dunes-design.md` (the current phase).

- **Repo:** `github.com/SoltyC/WraithOfTheUnstill`.
- **Local checkout:** `/home/sol/WraithOfTheUnstill`. This is WSL2 on the user's Windows PC (RTX 3060, target 1440p/60). WSL has about 4 GB of RAM.
- **Main working branch:** `claude/wraithoftheunstill-phase-7`. Everything merged lives here and is pushed.
  - Tests: **687/687** (`npx vitest run --maxWorkers=2`).
  - `flock /tmp/wraith-build.lock npx vite build` passes.
- **Three work-in-progress branches** are pushed and have local worktrees (§3). Nothing is running: all agents and preview servers were stopped at handoff.

---

## 1. How the user wants work done (standing preferences; follow them)

- **Don't change the graphical style.** Fixes and new surfaces must match the existing look.
- **Fixed difficulty.** No world-tier scaling and no difficulty selector. Open biome order after the frost.
- **Don't modify the trailer.**
- **Commit and push after each part.** Usage limits cut sessions off at any moment, so unpushed work is lost.
- **Play the game with the bot** to find problems, and look at the screenshots critically.
- **Save usage.**
  - Sonnet subagents build, each in its own git worktree and preview port. The lead (Opus) reviews their diffs and shots, merges, tests, builds and pushes.
  - **At most 2–3 agents at once.** Each is scoped to about an hour, with a tight brief listing exactly what to read.
  - Start a fresh agent from the pushed commit instead of resuming one with a long transcript.
  - Agents look at **1280 px downscaled shots** and commit only 1280 px shots. Full-size shots bloated history by 230 MB once; that branch was squash-merged.
- **If an agent can't solve something, the lead fixes it.** (The user said so; it was done for the Bell Ledge height and the glide-ring supports.) Don't just re-send the agent or leave it untested.
- **Never commit `node_modules`.**
  - `.gitignore` says `node_modules` (no slash), because worktrees symlink it.
  - Use explicit `git add <paths>`, never `-A`.
  - Check `git diff --stat` for `node_modules` before every merge. Merging a symlink once deleted the real `node_modules`.
- The user's email is for attribution only.
- **Commit trailer:**
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017jhdvvBvrzx8cfqxy6tEiT
  ```
  Agents use `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` with the same session line. A new session should use its own session URL.

## 2. Done and merged (newest first)

For each one, the design and its "— Done" note are in the docs named.

| Work | Docs / where |
|---|---|
| **Effects readability:** Bloom earth burst; deep snow pits (over 0.45 m) show earth; the toll's powder ring; the low dunk shot; Ridge trench seams | `screenshots/fx/` |
| **Phase 9 D4, Stone verbs:** Shard, Ridge, Bloom; the Stone reaction column; cross-element Ridge+Frost and Shard+Ribbon; Flow hooks. Unlocked by `?stone=1` or the F1 overlay until the dune Warden is released. | `plan.md` "D4 — Done"; `src/game/bending/stone.js`, `stoneMass.js`, `combat/stoneHits.js`; `screenshots/stone/` |
| **Phase 9 D0, the erg:** 8.1 km² of dune-dominant ground; dune-type map (barchans, transverse, stars, seifs); the ravines (Red Galleries canyon, slot trenches, wadis, the Stride rift); the Dry Stair; the cold erg; no grass on sand; seats for later sites. Squash-merged. | `plan.md` "D0 — Done"; `tools/bake-world/{dunemap,ravines,seats,pinned}.mjs`; `src/terrain/dunes.js`; `tests/d0Diff.test.js`; `screenshots/phase-09-d0/` |
| **Polish:** threshing floor, Ketil's lantern, tea at noon, glide-ring supports (pier up to 22 m, a plumb-stone above), drop glow, cobbles, rain through doorways, maul poise window (1.2 s) | `screenshots/polish2/` |
| **The Bell-mace** (sixth weapon): the plunge (damage 18+3.2h, cap 20 m), rebound, Updraft launch, the dunk (Shaped airborne state), the ice star, Downdraft, glide plunge, Flow effects, tiers, the Bell Ledge find above the monastery. The lead also changed two things for the whole game: **the Updraft's lift is full across a 1.4 m core, and air control is 0.7 while rising air lifts you** (both easier for everyone). | `docs/mace-design.md`; §11.2 "Bell-mace — Done"; `docs/weapons-playtest.md` |
| **Restored-world play:** wind streams, the Shelf glide course, the Wind Road, Hearn's post-release requests | `gameplay-design.md` §7 |
| Glaive and lantern flail; staff, sickles and maul; economy (marks, traders, forge, consumables, save v3); Remembrance and 39 nooks; Flow; side quests; rain and storm | §11, §6, §3; `docs/weapons-playtest.md` |
| Design docs | `docs/gameplay-design.md`, `docs/cross-biome.md` (fixed biome levels), `docs/phase-9/{plan,dunes-design}.md` with figures, `.claude/skills/wraith-design/` (run it before designing or reviewing gameplay) |

## 3. In progress: pushed WIP branches (each has a worktree; finish, review, merge)

All three were **stopped mid-task** at handoff. Each has a checkpoint commit `… WIP: checkpoint for handoff`.

### 3.1 `claude/encounters`, worktree `/home/sol/wraith-encounters` (port 4177), almost done

- **Plan:** `docs/encounter-audit-plan.md`.
- **Done:**
  - `docs/encounter-audit.md`: inventory, before and after numbers, verdicts, NOT ASSESSED;
  - role mixes in the one-role frost encounters, new meadow encounters, a storm surge, and the calm-after-peaks rule (`src/systems/calm.js`);
  - telemetry: `src/systems/encounterLog.js`, `tools/bot/encounters.mjs`;
  - tests in `tests/encounters.test.js`;
  - the §4.2 "Encounter audit — Done" note.
- **Left:**
  - The **isolation films** (`tools/bot/isolation-film.mjs`). The surf film is made (`screenshots/isolation/surf-720p.mp4`); the glide and frost-combat films are not. Make them as 720p two-pass mp4s under 15 MB; frames stay uncommitted.
  - Then merge main, run the tests and the build, and review.
  - **Send the three films to the user.** They are for the user to judge the feel.

### 3.2 `claude/sand`, worktree `/home/sol/wraith-sand` (port 4174), D1a built, needs review

- **Built** (commit `87668cb`):
  - `src/shaders/sand.wgsl.js`: scans, three-scale normals, self-shadowed wind ripples, glints, wet, compacted and frozen states;
  - **rain on sand (the user's request):** first individual drop dimples, then more, merging into uniformly dark wet sand, then uneven drying (crests first) with faint pits left.
- **Shots** in `screenshots/sand/`: `p9s1-close-*`, `-star-mid`, `-trail`, `-frozen`, and the rain sequence `p9s1-rain-1-dry` … `-6-drying`.
- **Left:**
  - **Review the shots critically.** The sand must read as fine sand, not clay or plastic. The first rain dots must read as individual drops, not noise or glitter; fix it yourself if not.
  - Measure frame cost at the star field (2700, 1300).
  - Write the "D1a — Done" note in `plan.md`.
  - Merge main, test, build.
  - Check for large files before merging. This checkpoint has 66 files; squash-merge if the history is heavy.
- **Not in D1a** (D1b, later): far-field dune shading at 2–4 km, the stilled and restored grade, sandstone strata on the canyon walls.

### 3.3 `claude/dune-shaped`, worktree `/home/sol/wraith-shaped` (port 4175), D9a just started

- **Spec:** `plan.md` D9.
- **This job:** Skitters (a swarmer that travels under the sand as a terrain-state bulge, with sand streaming before it lunges) and Plate-backs (a bruiser with a ruin-stone shell that glances frontal hits; frozen seams or Gust then Shard pop the plate; the flank lands; the Bell-mace plunge ignores plates). Every fight must be winnable with Frost only.
- **Done:** a rig and shader start only (`src/game/shaped/rigDune.js`, `shaped.wgsl.js`).
- **Probably simplest:** start a fresh agent with the D9a brief: build both, bestiary and Remembrance entries, tests, bot fights near (1900, 900), and `p9d9-*` shots. Put new behaviour in new files; `shaped.js` is about 750 of its 800 lines.

## 4. What to do next, in order

1. Finish and merge §3.1 (encounters plus films; send the films to the user), §3.2 (sand) and §3.3 (Skitters and Plate-backs).
2. **D2, crests and avalanching sand.** Start it only after the sand branch is merged, because both touch `terrainState.wgsl.js` and the surface shaders.
   - Knife-edge crests without stair-stepping. This also fixes the **sawtooth edges on sharp crests and canyon walls** seen in D0.
   - Collision parity.
   - The granular relaxation pass: talus at 34°, conservative, in a dirty rectangle, under 0.4 ms.
   - Sand healing.
   - This is the risky tech of the phase, and it underpins the dune puzzles' "sand flows" (G1).
3. **D9b:** Whirlers (the caster) and the Glass-sworn (the elite).
4. Then, per the plan's order and parallel tracks:
   - D3 sand-surf;
   - D5 and D6 light and weather;
   - D7 and D7b ruins, glass and the ravine wall kit;
   - D8 scrub and the oasis;
   - D10 the Long Walker (follow `gameplay-design.md` §5.1, not the old D10 text);
   - D11 camp and quests, the puzzle-based design in `dunes-design.md`, not a frost-style quest list;
   - D12 gate.
   - The glass blade weapon is part of Phase 9.

## 5. Known open issues

- **Needs the user's hands** (bot results are only indicative):
  - the Phase 7 gate play-through and sign-off in `PROGRESS.md`;
  - weapon and plunge feel;
  - whether the Bell-mace is too slow in frost fights (the bot plays it badly);
  - the Shelf's last two rings and the Wind Road finish (the bot never flew them reliably; medal times are from a simulation);
  - Flow tier 3 in natural play.
- **`npm run alloc`:**
  - `controller.update`, `springArm.update` and `weapons.update` fail. These predate this work.
  - `stone.update` has a small residue (12 scavenges per 2M calls).
  - The plunge has a small residue (about 1.1 MB per 3300 plunges).
- **Not wired:** the Bell-mace's Warden damage cap of 56 exists only in `plungeDamage()`, because weapons don't hit Wardens yet.
- **Visuals:**
  - the aloft Ketil lantern is only a faint glow;
  - the toll ring reads as haze, not a crisp line;
  - storm-cloud undersides are blotchy during a flash;
  - the robe isn't heavier when wet.
- **Pipelines:** one atmosphere god-ray compute pipeline appears late after a weather change, independent of recent work. It's worth chasing; the rule is the late-pipeline count reads 0.
- **D0:** only 5.2 of the erg's 8.1 km² lies west of x = 3300; the rest is under the east ring. Frozen sand staying firm waits for the sand state.

## 6. Tooling and conventions

- **Build:** `flock /tmp/wraith-build.lock npx vite build`. Serialise builds.
- **Tests:** `npx vitest run --maxWorkers=2`. One architecture checksum test can time out under load; rerun before you believe it.
- **Serve:**
  - `npx vite preview --port <P> --host 0.0.0.0`. Main uses 4173; each worktree gets its own port from 4174–4178.
  - Kill previews by PID.
  - **Never `pkill -f`** with a pattern that matches your own shell.
  - Rebuild after editing `data/photo-spots.json`.
- **Bot:**
  - Launch: `PORT=<P> tools/bot/play.sh [spot]` (`stop` closes it).
  - Commands: `WRAITH_URL=http://localhost:<P> node tools/bot/bot.mjs <cmd> '{json}'`. They include `state`, `eval {js}`, `hold`, `press`, `teleport {x,z}`, `spot`, `shot {name}`, `perf` and `film`.
  - In `eval`, `g` is the game context (`g.controller`, `g.arm`, `g.ground`, `g.wraithGround` (which includes built solids), `g.gale`, `g.shaped`, …).
  - Keep a single eval under 240 s, because undici times out at 5 minutes.
  - Never run two bot processes on one page.
  - Fight harness: `tools/bot/fight.mjs`. Mace: `tools/bot/mace.mjs`. Encounters: `tools/bot/encounters.mjs`.
- **Shots:**
  - `PORT=<P> tools/capture/win-shots.sh <spot-prefix> <dir>` runs headless Windows Chrome on the 3060. It skips existing files, and an empty prefix fails.
  - Downscale with `/mnt/c/ffmpeg/bin/ffmpeg.exe -i in.png -vf scale=1280:-1 out.jpg`. It is a Windows exe, so give output paths through `wslpath -w`.
  - There's no PIL in WSL.
- **Bake:** `npm run bake` and `npm run bake:verify`. Run them under the build lock.
- **Film:** the bot's `film` uses fixed 1/60 s steps (see `filmRun` in `src/core/bot.js`). Encode with the Windows ffmpeg. Send videos to the user as 720p two-pass copies; SendUserFile caps at 30 MB.
- **Worktrees:**
  - Create one with `git worktree add -q -b claude/<area> /home/sol/wraith-<area>`, then symlink `node_modules` from the main tree.
  - Merge pattern: `git merge --no-ff` (or `--squash` if history is heavy), test, build, push, then `git worktree remove --force` and `git branch -d`.
  - `screenshots/phase-01/bake-preview.png` is generated. A local copy of an old modification is backed up in the session scratchpad; it's safe to ignore.
- **Code rules** (BRIEF and DECISIONS):
  - zero per-frame allocations;
  - no doubles passed as call arguments in hot code;
  - one params write per system per frame;
  - warm every pipeline at load, so the late-pipeline count reads 0;
  - files of 200–400 lines, 800 at most;
  - WGSL uniform arrays written `array<vec4f,8>`.

## 7. Worktrees on this machine

| Worktree | Branch | Port | State |
|---|---|---|---|
| `/home/sol/wraith-encounters` | `claude/encounters` | 4177 | §3.1, almost done |
| `/home/sol/wraith-sand` | `claude/sand` | 4174 | §3.2, needs review |
| `/home/sol/wraith-shaped` | `claude/dune-shaped` | 4175 | §3.3, just started |
