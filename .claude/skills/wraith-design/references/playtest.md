# Playtest procedure

Use the bot and the user together. Anything not measured is reported as **NOT ASSESSED**.

**Setup:** `npx vite build` + `npx vite preview` (each worktree uses its own port), then `tools/bot/play.sh [spot]` and `node tools/bot/bot.mjs <cmd>`. See the memory note on bot playtesting.

| Test | How | Target |
|---|---|---|
| Isolation | An empty slope, ridge or flat; the bare verb for 2 minutes; filmed in film mode for the user | The user says it's fun |
| Payoff interval | The bot walks natural routes and logs seconds between nooks, sites, vistas and encounters | 60–90 s in dense areas; never more than 3 min |
| Flow | Time at each tier on a traversal route and in fights | Tier 3 is reachable but not constant |
| Focus starvation | Share of fight time with focus below the cheapest verb | Under 15 % |
| Encounter | Deaths, time to clear, roles engaged | Recorded per encounter |
| Warden | Time and deaths per phase; which solutions were used | At least two solutions seen across runs |
| Quest | A bot script finishes it; goals point right (compass screenshot) | All quests complete |
| Order | Scripted "dunes second" and "meadow second" saves | Both critical paths finish |

**Report:** numbers, screenshots and film paths, plus an explicit list of what is NOT ASSESSED and why.
