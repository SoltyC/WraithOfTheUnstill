---
name: wraith-design
description: Gameplay design review for The Wraith of the Unstill. Use before designing or building any gameplay feature (a Warden, an enemy, a quest, a verb, a traversal mode, a site, a reward, a system), when planning a phase's gameplay, when reviewing a subagent's gameplay build, and after a playtest. Checks the feature against the game's pillars, loop stack, smell catalog and Warden variety axes, and says what was not assessed.
---

# Wraith design review

The design source of truth is `docs/gameplay-design.md` (pillars, loops, Flow, combat, Wardens, exploration, quests, testing). Read the section that matches the feature before using this checklist. Background research is in `reports/RPG gameplay design research.md`.

## Procedure

1. **State the feature in one sentence.** Then name the pillar it serves, the loop layer it feeds (0–10 s, 1 min, 5–15 min, session or campaign) and the aesthetic it targets. **If it serves no pillar, recommend cutting it.**
2. **Isolation test.** Is the core verb fun with no content around it? If it can't be tested yet, write NOT ASSESSED and say how the bot will test it.
3. **Walk the smell catalog** (`references/smells.md`). For each smell, write *clear*, *present* (with the fix) or *not assessed*.
4. **Run the matching brief:**
   - Warden: `references/warden-brief.md`, the five axes against every existing Warden.
   - Quest: `references/quest-template.md`, including the no-fetch test.
   - Enemy or encounter: `references/encounter.md`.
   - Verb, traversal or reaction: `references/systems.md`, the reaction-table invariants, Flow and feel.
5. **Write the verdict:**
   - keep, change or cut;
   - the smallest concrete fix, the principle it draws on and its cost;
   - what to measure in the bot playtest (`references/playtest.md`).

**Be opinionated and concrete. Never report "fine" for something not measured: write NOT ASSESSED.**

## Pillars (short form)

1. **Moving is the joy.** It rejects dead walking and traversal as a corridor.
2. **The world remembers and answers.** It rejects bespoke props, invisible state and resets.
3. **Release, not kill.** Every Warden is a different kind of problem. It rejects HP sponges and reskinned formulas.
4. **Quiet, but never empty.** It rejects checklists, icons, fetch quests, random loot spam and stat grinding.
5. **Learn by reading.** It rejects hidden scaling and lying telegraphs.
6. **Grow by what you carry.** Weapons are found, forged and upgraded; marks are traded; consumables heal and strengthen; elements are the secondary powers. It rejects random rolls, numbers-only upgrades, and shops that sell what the world should give. Economy checks: does every faucet have a sink, is there no reason to grind, and does each upgrade change how a weapon plays.

## Project constraints to respect

- **From the user:**
  - fixed difficulty, with no world tier;
  - open biome order after the frost;
  - don't change the graphical style;
  - a quiet compass HUD that shows direction to quest goals and NPCs.
- **From BRIEF:**
  - no HUD beyond that;
  - health and focus shown on the body;
  - at most 8 active Shaped;
  - dialogue at most one choice deep;
  - every verb writes the terrain state.
- **A biome's critical path needs only Frost plus that biome's element** (`docs/cross-biome.md`).

Smell catalog and critique procedure adapted from saschb2b/skills `game-design` (MIT). Playtest rule ("NOT ASSESSED") after Claude-Code-Game-Studios `/balance-check` (MIT).
