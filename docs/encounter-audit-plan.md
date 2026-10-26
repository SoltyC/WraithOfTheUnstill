# Plan: encounter variety audit and isolation tests

These are HANDOFF §4 item 6 and `docs/gameplay-design.md` §10 items 5–6. The rules come from §4.2 (encounter rules), §9 (how we test fun), and the `wraith-design` skill references `encounter.md`, `playtest.md` and `smells.md`.

**Goal:**
- Every hostile encounter in frost and meadow meets §4.2, and is measured, not assumed.
- The bare verbs (surf, glide, frost combat) are filmed for the user to judge.
- Anything not measured is reported as **NOT ASSESSED**.

## What the lead already knows (check it, don't trust it)

- `src/systems/encounters.js` holds six armed encounters, **all frost**:
  - `cloister`
  - `camp-raid`
  - `varo-hounds`
  - `spring-hounds`
  - `escort-ambush`
  - `den`
- Three of them are **one role alone** (`cloister`, `spring-hounds` and `escort-ambush` are two hounds each). That breaks "2–3 roles, never one alone".
- Seers (the frost caster) appear in only one wave.
- **The meadow has no entries in `encounters.js`.** Its fights come from:
  - the Bellwether fight (`systems/bellwetherFight.js`);
  - the side quests (`systems/side/flock.js`: sedgerunners);
  - the village fire (`systems/flame.js`: prey spawns);
  - trials (`systems/trials.js`).
- Whether the meadow caster (Chanters, pollen) and the elite (the Old Hedge) exist in `src/game/shaped/` is unknown. Find out.
- Death re-forms the Wraith at safe places (`encounters.js` header). There may be no "calm after peaks" rule beyond the wave gap.

## Phase A: inventory (read only, about 30 min)

1. Find **every** source of hostile Shaped in both biomes: `grep shaped.spawn` and the archetype names across `src/`. Include the Warden fights, the side quests, trials, the flame, the flock and the photo-spot spawns (exclude these last from the audit, but list them).
2. Write the inventory table at the top of `docs/encounter-audit.md`. One row per encounter, with these columns:
   - id, biome, place (x, z), the quest or step that arms it;
   - waves and archetypes;
   - **roles** (swarmer, bruiser, caster, elite);
   - **arena feature** (slope, ice, grass, ruins, water or none);
   - **kind** (ambush, guarded site, storm surge, hunt, frenzy);
   - **visible reward or reason**;
   - **telegraphs** used;
   - **calm after** (seconds until the next possible spawn nearby);
   - active cap.
3. Lay the encounters on the **critical path order** for each biome, using the quest graph in `data/quests/`. Mark where two of the same kind come in a row.
4. List which archetypes exist in code per biome against §4.1's table, and say which are missing.

## Phase B: measurement harness (about 1 h)

1. **In-page telemetry** in a small new module, `src/systems/encounterLog.js`:
   - allocation-free, with fixed fields;
   - enabled only when `?bot=1`;
   - exposed on `g.encounterLog`.
   - Per encounter, from its first spawn to its clear, it records:
     - time to clear;
     - Wraith deaths;
     - health taken;
     - archetypes engaged (dealt or took damage);
     - time at each Flow tier;
     - **focus starvation**: the share of time with focus below the cheapest verb cost, which is the Gust or tap cost in `combat.js`;
     - max active Shaped.
   - Hook it where `encounters.js` spawns and clears waves. The other spawners need a one-line `encounterLog.begin(id)` / `end(id)`.
2. **Bot script** `tools/bot/encounters.mjs`:
   - For each encounter: teleport to its place with its quest step forced active, using `g.startEncounter(id)` or set flags. Reset health, focus and Flow.
   - Fight with the existing auto-fighter logic from `tools/bot/fight.mjs`, using the staff, the start weapon. Then run once with the player's best kit: Frost plus a Gale weapon of choice.
   - Print one JSON line per run.
   - 3 runs per encounter; record mean and range.
   - Run it at night too for the encounters a player can meet at night.
3. Calibrate against `docs/weapons-playtest.md`: 3 hounds with the staff should come out at about 6–7 s.

## Phase C: audit (write `docs/encounter-audit.md`)

For each encounter:

- Run the `encounter.md` checklist and walk the smells in `smells.md`: dominant strategy, bare core, lying telegraph and complexity.
- Write a **verdict**: keep, change or cut, and the smallest fix, with the principle it rests on.

Also judge the biome as a whole:

- **Role mix.** Is every role used? Is any encounter one role alone?
- **Kind rotation** along the critical path.
- **Arena features.** Does the fight reshape the ground?
- **Calm after peaks.**
- **Swarmers and casters cutting across surf lines.**
- **Honest telegraphs.** Look at the shots, not just the code.

Put the measured numbers beside the targets:

| Measure | Target |
|---|---|
| Focus starvation | under 15 % |
| Flow | tier 3 reachable but not constant |
| Deaths | recorded |

## Phase D: fixes (the smallest that meet §4.2)

Change at most what the audit says. In order:

1. **Mix roles** in the one-role encounters by adding a second role to an existing wave, for example a seer behind the hounds, or a brute in the escort ambush on the tarn. Keep each at ≤ 8 active and keep the quest beats.
2. **Arena features.** Where the place has none, shift the spawn ring by ≤ 30 m onto ground with one: a slope to surf, a tarn to freeze, grass to flatten, a ruin for cover. Don't move quest places or NPCs.
3. **Kind rotation.** Where two kinds of encounter come in a row, change one's kind with the least content. An ambush can become a guarded site by putting its visible reward in sight.
4. **Calm after peaks.** If missing, add one rule to `encounters.js` and the other spawners: no hostile spawns within 120 m for 60 s after a clear, a Warden release or a death re-form. Story-forced waves are exempt. Keep it data-driven.
5. **Meadow.** If the meadow has fewer than 3 armed encounters on its critical path, add **up to 3** to `encounters.js`. Use existing meadow archetypes and existing quest steps or sites; no new quests and no new archetypes. Each must meet §4.2. If chanters or the Old Hedge don't exist, write that down; don't build them.
6. Every change needs a test in `tests/encounters.test.js`:
   - every encounter has ≥ 2 roles across its waves, except Warden fights and named solo hunts (list those exceptions explicitly);
   - ≤ 8 active;
   - an `arena` tag;
   - a `kind`, with no two kinds in a row on each critical path;
   - the calm window holds.
   Add `arena` and `kind` fields to the `ENCOUNTERS` entries for this.
7. **Re-measure** every changed encounter with `tools/bot/encounters.mjs` and put before and after side by side.

## Phase E: isolation tests, filmed (§9)

These are three bare-verb films, made with the bot's film mode (`src/core/bot.js` filmRun, the pattern in `tools/bot/weapons-film.mjs`). Write a new `tools/bot/isolation-film.mjs`.

1. **Surf:**
   - 2 minutes on an empty frost slope with no content near it;
   - pick a long open slope from the baked heights (`tools/world/sample.mjs` can help);
   - a chase camera;
   - log Flow tier time and the speeds reached.
2. **Glide:**
   - off a high ridge, through a long glide, to the landing and back onto the surf;
   - include one restored-wind stream lift if the frost is restored (the Shelf stream, `data/restored.json`);
   - log airspeed and sink.
3. **Frost combat:**
   - 3 hounds on flat open ground, with the staff and Frost;
   - include a Sweep, a freeze and a shatter;
   - a side or wide camera.

For all three films:

- The film runs at a fixed 60 fps to `screenshots/isolation/frames/<name>/`. Don't commit the frames.
- Encode each with `/mnt/c/ffmpeg/bin/ffmpeg.exe` to a **720p two-pass H.264** mp4 under 25 MB, and a 1440p copy kept locally.
- Commit only the 720p mp4s, if each is under 15 MB. Otherwise leave them uncommitted and give their paths.
- **Watch the result** (sample frames), and reshoot anything that reads badly: camera clipping, the Wraith off frame, dead stretches.

## Rules

- Work in the worktree `/home/sol/wraith-encounters` on branch `claude/encounters`, port **4177**.
  - The Bell-mace agent works in `/home/sol/wraith-mace` on port 4178. Don't disturb it.
  - It touches `src/game/shaped/shaped.js` (an `idle` spawn option and an airborne state) and `data/photo-spots.json`. Avoid editing those files where you can. Where you must, expect a merge later.
- **Don't change the graphical style.** **Fixed difficulty:** no scaling and no difficulty selector.
- Zero per-frame allocations in hot code. Warm every pipeline at load; `gpuStats.late` stays empty.
  - Files are 200–400 lines, 800 at most.
- `npx vitest run` must pass; `flock /tmp/wraith-build.lock npx vite build` must pass.
- Never `pkill -f` a pattern that could match your own shell; kill by PID.
- **NEVER commit `node_modules`.** Use `git add <explicit paths>` only, and check `git diff --stat` before every commit.
- Commit and push at each phase (`git push -u origin claude/encounters`). Usage limits hit mid-task.
- Commit trailer:
  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017jhdvvBvrzx8cfqxy6tEiT
  ```

## Done when

1. `docs/encounter-audit.md` exists with:
   - the inventory;
   - the measured numbers before and after;
   - a verdict per encounter;
   - an explicit NOT ASSESSED list (at minimum: how fights feel to a human, and whether telegraphs read at speed).
2. The fixes are in with their tests.
3. The three isolation films are encoded and watched.
4. An "Encounter audit — Done" paragraph is in `docs/gameplay-design.md` §4.2.
5. The branch has the latest `claude/wraithoftheunstill-phase-7` merged in, with conflicts resolved by you, tests and build passing, and is pushed.
6. The report lists:
   - what changed;
   - the numbers;
   - the film paths;
   - what is NOT ASSESSED.
