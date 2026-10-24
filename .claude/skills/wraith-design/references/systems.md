# Verbs, traversal, reactions and feel

## Reaction-table invariants

These are BotW's chemistry rules [P], adapted:

1. Elements change materials.
2. Elements change each other (the `CROSS` combinations).
3. Materials never change materials by themselves (only healing and weather, at their per-material rates).

Additional rules:

- A shipped element ships its column for every built surface. A shipped surface ships its row for every built element (`docs/cross-biome.md` §4).
- `reactions.test.js` must stay green.
- Teach each reaction once, in a safe place, before an encounter or a Warden requires it.

## Flow

See `docs/gameplay-design.md` §3.

- A new verb or traversal mode must say what builds Flow, what breaks it, and what it does at Flow 2 and above.
- Flow is shown on the body and in the world only: hem, hand-light, wake, music. Never on a HUD.

## Traversal

- **Each surface has its own feel** (Spider-Man [P]: each district gives the swing its own texture). Tuning tables are per material.
- **Chains hand speed across modes.** Every entry and exit eases; nothing snaps.
- **A run must stay visible from across the field** (coarse pages).

## Feel checklist

1440p/60 on the RTX 3060.

- Input to visible response within about 100 ms (Swink [S]).
- Hit-stop of 30–60 ms on heavy impacts (BRIEF §10).
- Screen shake only on heavy spells, hard carves and Warden impacts. It scales with mass and distance.
- Jump leniency: coyote time and input buffering. Values are unsourced, so tune them by hand and record them.
- Sound for every verb and every landing, and a lift in the music at high Flow.
- No first-cast hitch: every pipeline is warmed during loading, and the late-pipeline detector reads 0.
