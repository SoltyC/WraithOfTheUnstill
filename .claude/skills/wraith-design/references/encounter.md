# Enemies and encounters

## Enemy check

- **One role:** swarmer, bruiser, caster or elite, and **one way it pushes the player** (Doom [P]).
- **Its material decides the right element** (`src/game/combat/reactions.js`). There must be at least two valid answers, so the open order holds.
- **Telegraphs through material,** and honest: sand streams, crust glows, frost creaks.
- **It rises from the ground and returns to it** (BRIEF §8.3). Its feet write the terrain state.
- **It threatens a mobile player:** it lunges across surf lines or has ranged lines.

## Encounter check

- 2–3 roles; at most 8 active.
- An arena feature the fight reshapes.
- Its kind differs from the last encounter on the route: ambush, guarded site, storm surge, hunt or frenzy.
- A visible reward or reason to fight. Otherwise the player should be able to surf past, and that's fine.
- Calm afterwards: no spawns for a while; the music settles.
- What to measure: deaths, time to clear, Flow tiers reached, and the share of time starved of focus (target under 15 %).
