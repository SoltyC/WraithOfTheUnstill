# Handoff — 2026-10-25

This is the state of work on **The Wraith of the Unstill** at handoff, and everything a new agent needs to finish the open tasks. Read this first, then `BRIEF.md` (the spec), `PROGRESS.md`, `DECISIONS.md` (ends with the user's 2026-10-24 gameplay direction), `PLAN.md`, and the design docs below.

- **Repo:** `github.com/SoltyC/WraithOfTheUnstill`.
- **Main working branch:** `claude/wraithoftheunstill-phase-7`, at commit `21b7f99` before this file. All merged work lives here.
- **Local checkout:** `/home/sol/WraithOfTheUnstill` (WSL2 on the user's Windows PC, an RTX 3060).

---

## 1. What the user asked for (open requests, in their words)

1. *"Do the rain and thunderstorm"* — **done, merged.**
2. *"More side quests would be fun. Also wire up the hud … showing where to go, eg go visit the elder in the hall it shows the direction on the hud of the npc"* — **done, merged.**
3. *"Plan phase 9"* — **done:** `docs/phase-9/plan.md`.
4. *"Plan how the gameplay works cross biome"* — **done:** `docs/cross-biome.md`.
5. *"Research actual RPG design philosophies and claude skills … design gameplay"*. **Done:**
   - the report: `reports/RPG gameplay design research.md`;
   - the design: `docs/gameplay-design.md`;
   - the project skill: `.claude/skills/wraith-design/`.
6. User decisions, 2026-10-24:
   - build **Flow** (done, merged);
   - the Long Walker as **"bring it home"**;
   - the **Remembrance** page;
   - the **nook pass**;
   - a bigger dune region **with ravines**;
   - the Long Walker must feel **unlike the other Wardens**;
   - open biome order;
   - **no world-tier scaling.**
7. *"Make this game feel fun playing … new mechanics eg combat or flow … worth it. … there needs to be progression … actual weapons which can be obtained, upgraded from quests, etc trade currency, trade with npc to buy items, to heal provide buffs like strength"*. **In progress:**
   - spec: `docs/gameplay-design.md` §11;
   - build order: §13.
8. Standing preferences, kept across sessions:
   - Don't change the graphical style.
   - Commit and push after each part.
   - Supervise long jobs; never stall silently.
   - Play the game with the bot to find gameplay problems.
   - **Save usage:** Sonnet subagents build in worktrees, and the lead reviews.
   - Fixed difficulty.

## 2. Merged on the main branch (done)

| Work | Where | Notes |
|---|---|---|
| Rain and thunderstorm (M11) | `src/world/weather*.js`, `lightning.js`, `src/render/rain.js`, `lightningBolt.js`, `src/systems/storm.js`, `src/shaders/rain.wgsl.js` | Photo spots `p8-rain-*`, `p8-storm-*`; shots in `screenshots/rain-final/`. |
| Side quests (5), meadow shrines (6), quest direction on the HUD | `data/quests/meadow-side.json`, `src/systems/side/*`, `src/game/nav.js` (`goal: {npc}`), `src/ui/hud/compass.js` | Shots in `screenshots/p8-side/`. A side quest never takes the compass from a tracked main quest. |
| Flow | `src/game/flow.js`, `src/systems/flow.js`, `src/ui/overlay/flowTools.js` | Spec and tuning in `docs/gameplay-design.md` §3. The hem glow is warm gold (so it never reads as low-health frost). |
| Design docs, research, skill | `docs/gameplay-design.md`, `docs/cross-biome.md`, `docs/phase-9/plan.md`, `reports/`, `research_notes/`, `.claude/skills/wraith-design/` | |

Tests: **443/443** pass on the main branch (`npx vitest run`). `npx vite build` passes.

## 3. In progress — pushed WIP branches (both interrupted by a usage limit)

### 3.1 `claude/weapons` (`8ce0ebe`) — weapons and the new controls

- **Built so far:**
  - a weapon framework (`src/game/weapons/`), with a state machine and tests;
  - the staff, sickles and maul;
  - weapon geometry, view and shader (`src/render/weaponGeo.js`, `weaponView.js`, `src/shaders/weapon.wgsl.js`, `src/systems/weaponView.js`, `src/systems/weapons.js`);
  - an inventory stub (`src/game/inventory.js`);
  - the controls remap in `src/input/actions.js`;
  - overlay tools;
  - bot tools: `tools/bot/fight.mjs`, `weapons-film.mjs`, `sheet.mjs`, `restart.sh`;
  - contact sheets of attacks in `screenshots/weapons/*.jpg`. Raw film frames were not committed.
- **State:** tests 444/444, build ok. **Not play-reviewed, and the "Done" notes are not written.**
- **The branch is based on `ba6c4fc`**, from before the side-quest merge. Merge it into the main branch. Expect conflicts in `src/core/bot.js`, `src/main.js` and `data/photo-spots.json` (keep both sides; check that the photo-spot ids are unique).
- **To finish:**
  - Review against `docs/gameplay-design.md` §11.1–11.2. The brief also asked for: input buffering of about 150 ms, cancelling into a dodge, hit-stop of 30–60 ms on heavies, material spray, `flow.hit(WEAPON_*)` on every connected hit, Shaper-style procedural meshes, and procedural attack poses with anticipation, follow-through and a trail.
  - Check the world finds: the sickles at a meadow site near Hearn and the maul in the frost, each taken with "Take".
  - Film and review the combos for weight. Read the contact sheets.
  - Run bot fights against frost hounds and meadow Shaped, and log the results.
  - Write the "Weapons — Done" note in §11.2 and a DECISIONS.md line on the controls.

### 3.2 `claude/remembrance` (`93608d7`) — the Remembrance page and the nook pass

- **Built so far:**
  - `data/nooks.json`: **36 nooks**, placed but not built in the world;
  - `tools/world/route.mjs`, `payoff.mjs` (payoff-interval measurement), `nookfind.mjs`, `placeNooks.mjs`.
- **Not built:**
  - the Remembrance journal tab and `data/remembrance.json`;
  - the living reaction table;
  - the discovery hooks;
  - the nook builders and their interactions;
  - the before and after payoff numbers;
  - tests;
  - shots.
- **Spec:** `docs/gameplay-design.md` §6. Also from the brief: 30–50 Remembrance entries (land, Shaped, Wardens, people) kept in quest-graph flags `rem:<id>`; one discovery call where reactions fire; nooks hidden from the compass until found, shown on the map after; payoff interval of 60–90 s on natural routes and never over 3 min; photo spots `p8n-*`.

## 4. Remaining work, in order (`docs/gameplay-design.md` §13)

1. ~~**Finish and merge weapons** (§3.1).~~ **Done, merged 2026-10-26** (`docs/weapons-playtest.md`).
2. ~~**Finish and merge Remembrance and nooks** (§3.2).~~ **Done, merged 2026-10-26** (39 nooks, 46 entries). Nook `reward: {marks}` hooks wait for item 3.
3. ~~**Economy** (§11.3–11.8):~~ **Done, merged 2026-10-26** ("Economy — Done" in `docs/gameplay-design.md` §11; traders Corin and Osk, smith Garrow). Original scope:
   - extend `src/game/inventory.js` with **marks** (currency), materials and consumables;
   - **consumables:** salve, the shrine-water flask (refills at rested shrines), Ember tea, Rime tonic, Wind-bread and the Stillwater draught, used with **R** and cycled with **C**;
   - **trade screen** in the parchment codex style, opened from talk;
   - **traders:** Corin in Hearn, the frost camp's sled-trader, and later the dune caravan master;
   - **the forge:** a Hearn smith, 5 tiers, where tiers 1, 3 and 5 change moves, plus infusion from tier 3;
   - **health threads**;
   - **robes as armour**;
   - marks dropped at death and recovered at that spot;
   - **save v3** with a v2→v3 migration (inventory, equipped items, the flask, threads, trader stocks, dropped marks);
   - wire the nooks' marks.
   - Run the wraith-design economy checks: every faucet has a sink, there's no reason to grind, and each upgrade changes play.
4. **The remaining weapon families:** ~~glaive, lantern flail~~ (**done on `claude/weapons2`**, "Glaive and lantern flail — Done" in §11.2), and the glass blade (dunes, Phase 9).
5. **Restored-world play** (§7): the summit glide course, ridge-lift routes, and Hearn's requests after the release.
6. **Encounter variety audit** (§4.2) and **isolation tests** (§9), filmed for the user.
7. **Phase 9** per `docs/phase-9/plan.md`, with the dune quests and ravines from `docs/phase-9/dunes-design.md` (user, 2026-10-26: puzzle-based, unlike the frost), starting with D0:
   - the bigger erg with ravines (wadis, canyons, slot canyons, a rift);
   - no grass on sand.

   The Long Walker follows `docs/gameplay-design.md` §5.1, not the superseded D10 text.

## 5. Known open issues (not blocking)

- **Rain:**
  - the underside of storm clouds is blotchy during a flash;
  - wet streets at dusk are very dark, with little lamp reflection;
  - the robe isn't heavier when wet;
  - rain seen through a doorway from inside is hidden (the fade is global);
  - perf is about +1.3 ms per frame, measured on a shared GPU.
- **Flow:**
  - tier 3 (from chains plus reactions) isn't proven in natural play;
  - fights started from zero barely raise Flow;
  - the gold glow is faint at the default camera distance at noon;
  - the flowing Gust push wasn't re-measured after it was reduced.
  - The user must judge the feel. Tuning is live in the F1 overlay.
- **Side quests:**
  - the glide medal times come from the ideal line;
  - the barley fight is unproven for a human;
  - the lamp posts look like fence posts;
  - the glide rings float with no supports;
  - the lamp's wind threshold is untuned.
- **`npm run alloc`:** `controller.update` and `springArm.update` fail. This predates this work and is noted in DECISIONS.md.
- **Phase 7 gate:** it still needs the user's own play-through and their sign-off in PROGRESS.md.

## 6. How to work here (tooling and conventions)

- **Build:** `flock /tmp/wraith-build.lock npx vite build`. WSL has about 3 GB of RAM, so serialise builds.
- **Serve:**
  - `npx vite preview --port <P> --host 0.0.0.0`; the main tree uses 4173, and each worktree gets its own port.
  - Restart the preview after changing `vite.config.js`.
  - **Rebuild after editing `data/photo-spots.json`.**
- **Bot (play the game):**
  - Launch with `PORT=<P> tools/bot/play.sh [spot]`, then `WRAITH_URL=http://localhost:<P> node tools/bot/bot.mjs <cmd> '{json}'`.
  - Commands include `state`, `eval`, `hold`, `press`, `look`, `face`, `aim`, `walkTo{roads}`, `talkTo`, `follow`, `teleport`, `spot`, `shot` (it paints the HUD), `perf` and `film`.
  - Grip inputs must stay held through an in-page `eval` loop, because `hold` releases its keys.
  - For close stills, set `g.arm.zoomTarget` and `g.arm.pitch`.
  - `play.sh stop` kills only that port's Chrome.
- **Shots:** `PORT=<P> tools/capture/win-shots.sh <prefix> <dir>`. It runs headless Windows Chrome on the 3060 and skips shots that already exist. An empty prefix fails, so run it per prefix group.
- **Film:**
  - The bot's `film` command uses fixed 1/60 s steps and saves JPEG frames; see `filmRun` in `src/core/bot.js`.
  - `tools/bot/trailer.mjs` and `trailer-cut.py` make trailers with the Windows ffmpeg at `/mnt/c/ffmpeg/bin/ffmpeg.exe`.
  - The user doesn't want the trailer changed.
- **Never `pkill -f`** with a pattern that matches your own command line: it kills your shell.
- **Subagent workflow** (the user's request):
  - one Sonnet agent per area, each in a worktree (`git worktree add -b claude/<area> ../wraith-<area>`, with `node_modules` symlinked from the main tree) and its own port;
  - the agent commits but doesn't push;
  - the lead reviews the diff and shots with the `wraith-design` skill, merges, tests, builds and pushes.
- **Commit trailer:**
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017m4fC7b6q36UDdYEisk35E
  ```
  Agents use `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Sending files to the user:** SendUserFile caps at 30 MB. Send a 720p two-pass copy of videos.
- **Code rules** (BRIEF and DECISIONS):
  - zero per-frame allocations;
  - no doubles passed as call arguments in hot code;
  - one params write per system per frame;
  - warm every pipeline during loading;
  - the late-pipeline detector reads 0;
  - files of 200–400 lines, 800 at most;
  - WGSL uniform arrays written `array<vec4f,8>`, with no space.

## 7. Worktrees on this machine (local; safe to remove after merging)

`/home/sol/wraith-weapons` (`claude/weapons`) and `/home/sol/wraith-remember` (`claude/remembrance`). Both are pushed. Remove them with `git worktree remove --force <dir>` once their branches are merged.
