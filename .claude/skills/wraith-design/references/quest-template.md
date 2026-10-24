# Quest template

Built from Witcher 3's lessons [P via summary] (withhold information, emotion over spectacle, the world carries the exposition, delayed and visible consequences) and Smith and Worch's environmental storytelling [S]. Dialogue voice follows `docs/village/dialogue-style.md`.

1. **Hook:** an anomaly in the world, or a person with a specific want, whose reason is withheld at first.
2. **Tableau:** a place that answers "what happened here?". Use the terrain state as evidence: tracks, craters, glass, frozen water.
3. **Play:** the core is verbs and reactions (thaw, bind, strip, raise, steer, glide, surf), not carrying.
4. **Choice:** at most one, one level deep, and only if it changes something.
5. **Consequence:** visible and delayed. A hearth lit days later, a new cairn, a person who moved, a building restored.
6. **Goals:** each step has a compass goal: an `npc` goal for people, a place for places, `dynamic` for moving things.

## Checks

- **No-fetch test:** if the only verbs are *go to* and *carry*, add a reaction, a reveal or a choice, or cut the quest.
- **Recurring people:** prefer someone the player has met, or will meet again in another biome.
- **No irreversible failure:** a missed moment changes the outcome instead.
- **Restored variant:** does the release change this quest or open a follow-up?
- **The bot can finish it:** write a `tools/bot/` script that plays it start to finish.
