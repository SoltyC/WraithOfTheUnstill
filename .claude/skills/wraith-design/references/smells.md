# Smell catalog (Wraith)

Each smell has a detection signal and a fix. Adapted from saschb2b/skills `game-design` (MIT), with Wraith-specific smells added.

| Smell | Detection signal | Fix |
|---|---|---|
| **Bare core is not fun** | The verb only entertains once story or rewards are layered on; in an empty field it's dull. | Fix the verb first (feel, speed, feedback). No content saves a boring core. |
| **Dominant strategy** | One move wins everywhere (e.g. freeze then shatter on every Shaped; surfing past every fight). | Make it situational: give materials and roles that resist it. Close the gap in the rules; don't ask players to behave. |
| **No opportunity cost** | The player can do everything at no cost: stand still and cast forever. | Add a budget: focus, Flow decay when stopped, time windows in Warden phases. |
| **Hollow loop** | A reward doesn't feed a bigger loop; the player can't say what they're working toward. | Connect it: the nook leads to the site, the site to an Echo or lock, the lock to the next biome. Make feedback visible in the world. |
| **Treadmill** | Numbers rise but play doesn't change. | Echoes change *how* a verb behaves (range, shape, a new reaction), not only how much. |
| **Lying or missing telegraph** | Deaths feel random; "there was no way to know". | Telegraph the *what* through material (sand streams, crust glows, frost creaks). Vary timing only with assists available. |
| **Complexity over depth** | Many rules, few real decisions. | Cut or merge (Kaido: two colossi into one). Every reaction cell must create a decision somewhere. |
| **Reskinned Warden** | A new Warden matches an old one on 3 or more of the five axes (warden-brief.md). | Change the win condition or the tempo first, then the arena. |
| **Fetch in disguise** | A quest's only verbs are *go to* and *carry*. | Add a reaction, a reveal or a choice, or cut the quest. |
| **Empty stretch** | More than 3 minutes of natural route with no nook, vista or encounter (bot payoff log). | Add a nook or reshape the terrain to reveal a landmark. Beauty or melancholy counts as a payoff; nothing does not. |
| **Graphics without play** | A feature is mainly visual and changes no decision or verb. | Give it a use (restored dunes: crest streams you can ride) or accept it as pure Sensation and keep it cheap. |
| **Gate without warning** | A lock appears with no hint of its key, or a critical path needs another biome's element. | Show the lock before the key; keep the critical path to Frost plus the biome's element. |
| **Forced resonance** | A mechanic is bent to fit the fiction and serves neither. | Let it be honestly orthogonal. |
| **Scope mismatch** | More tuning than we can do and verify with the bot and the user. | Scale down; cut what doesn't earn its place. |

## Rework procedure

Use this when a mechanic falls flat.

1. Name the tension it should serve. If it serves none, it's decoration.
2. Find the decision and check it's interesting.
3. Trace the loop: does the reward feed a larger loop? Is the feedback legible?
4. Find the failing dynamic, then change the **smallest** mechanic that produces it (MDA: designers only touch mechanics).
5. Restore opportunity cost if it leaked.
6. Re-run the isolation test.
