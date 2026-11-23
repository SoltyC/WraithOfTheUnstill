# Codex brief: the Ember aftermath — the survivors' camp, and the words after (2026-11-23)

You are working on **The Wraith of the Unstill**, a browser game (Babylon.js on WebGPU, WGSL shaders, Vite, Vitest).
Claude is building other parts of the same chapter at the same time and will review and merge your branch.
Read this brief to the end before writing code.

## 0. Ground rules (read first)

- **Branch:** work on `codex/ember-aftermath`, created from the checkpoint commit you were given (the one with the Ember
  chapter in it: `src/systems/eruption.js`, `src/world/crater.js` and `src/world/sow.js` must exist). If they don't, stop and say so.
- **Commits:** small, verified checkpoints. Plain messages, **no co-author lines or trailers**.
- **Do not touch these files** (Claude is changing them now; a conflict there costs more than your change is worth):
  `src/systems/eruption.js`, `src/systems/volcano.js`, `src/systems/scenes.js`, `src/game/scenes.js`, `src/game/director.js`,
  `src/systems/director.js`, `src/systems/world.js`, `src/shaders/plume.wgsl.js`, `src/shaders/lava.wgsl.js`,
  `src/render/lava.js`, `src/render/bombs.js`, `src/world/fracture.js`, `src/game/collapse.js`, `src/systems/destruction.js`,
  `HANDOFF.md`, `PROGRESS.md`, `docs/phase-11/ember-design.md`. If you think one of them needs a change, write it down
  in your report (§6) instead.
- **Boss fights are off limits.** Do not build or change any Warden fight.
- **Code style:** match the files around you. Readable, normal-width lines, a comment on every function saying *what it is
  in the world* (see `src/world/camp.js` and `src/world/sow.js` for the voice). **No dense minified one-liners** — an earlier
  Codex branch was hard to review because of that. Pure world builders must stay deterministic (seeded, no `Math.random`).
- **Tests:** `npx vitest run` must pass in full (about 1240 tests now) and `npm run build` must be clean before every commit.
- **Performance budget:** the game must hold 90 fps at 1440p High on an RX 9070 (p95 frame ≤ 11.1 ms). The camp is static
  geometry built once on the architecture Builder, so it is cheap if you keep the triangle count sane: **≤ 40k triangles for the
  whole camp at its largest**.

## 1. What this is in the game (why it matters)

The Ember chapter ends with the volcano erupting. Over the days before, the player warned four communities: the six farming
families of **the Sow** (Aled, Bethan, Huw, Ffion, Gwil, Mari — `SOW_FARMS` in `src/world/sow.js`), the mining town of
**Cinderhold**, and the **Ash Chapel**. Those the player convinced walk to **the headland camp** (`CAMP.at = [720, -2640]` in
`src/world/sow.js`), on cliffs over the sea, 250 m up, with the mountain in view. Those who stayed die in the eruption.

Today the camp is three lean-tos and a fire ring (`campBuild` in `src/world/sow.js`). The user's requirement, in their
words: **"if you're doing survivor camps, it needs to be visually understandable that they are."** A player arriving must
read *refugee camp* at a glance, from 100 m away, with no text. The camp's size must also show *how many the player saved*:
each group that got out adds its own shelter, its own cart and its own belongings.

## 2. Build A — the refugee kit (`src/world/refugeeKit.js`, new)

Procedural builders on the architecture `Builder` (`src/world/architecture.js`; see `box`, `drum`, `cone`, `quad`, `grid`,
`piece`, `struct`, `light`; `stick` and `feltTent` in `src/world/camp.js`; `cloth` in `src/world/sow.js`). Every builder takes
`(B, x, z, yaw, seed, opt)` in site-local metres, wraps each separable object in `B.piece(() => …)` (so the destruction
system can break it later), and varies with its seed so **no two are the same** (the user's art bar: procedural, never
visibly repeated). Materials from `MAT`: CANVAS (cloth, tarps), WOOD, PLANK, EARTH, STONE, IRON, THATCH.

The things that make a camp read as people who fled with what they could carry:

1. **`tarpShelter`** — a tarp or cart cover slung over a ridge pole or rope between two poles (or a pole and a cart),
   pegged out, sagging, a corner flapping loose, the edges uneven. Two or three shapes: A-frame, single slope, draped over a
   cart.
2. **`leanTo`** — branches leaned on a cross-pole with a cloth thrown over, bedding under it.
3. **`loadedCart`** — a two-wheeled farm cart (spoked wheels, shafts down on the ground or propped on a stone) **piled
   high**: sacks, a chest, a chair upside down on top, a rolled mattress, pots hung off the side, a rope across the load.
   Also a smaller **`handcart`** and a **`barrow`**. The load is what reads "fled", so make it generous and untidy.
4. **`bundles`** — cloth bundles tied at the top, sacks slumped against each other, a basket, a clay jar, a small chest,
   a cradle. Scattered in groups of 3–8 by shelters.
5. **`cookfire`** — a stone ring, burnt logs, a **tripod with a hanging pot**, a log or two to sit on round it. Calls
   `B.light(…, 'fire')` (warm, flickering; see `campBuild`). Every group has one.
6. **`bedrolls`** — rolled or laid out blankets near the fire, some with a lump under them.
7. **`washLine`** — a rope between two poles with cloths hanging (`cloth` or thin quads).
8. **`pen`** — a rough hurdle pen of wattle panels for the Sow families' animals (sheep, goats) — the fence only; the
   animals are a separate system.
9. **`lookout`** — at the cliff edge, a spot where people stand to watch the mountain: a few stones to sit on, a staff
   stuck in the ground. Mark it with **people slots** (below).

**People slots:** the kit does not draw people (the game has its own NPC and crowd systems). Each builder that implies people
returns or pushes **slots**: `{ x, z, yaw, pose }` in site-local metres, with `pose` one of `'sit'`, `'stand'`, `'crouch'`,
`'lie'`, `'watch'` (standing at the edge, facing the mountain). Collect them on the builder as `B.slots` (create the array if
it is missing). Claude will fill them with figures.

## 3. Build B — the camp layout (`campLayout`, pure) and the sites

In `src/world/refugeeKit.js`:

```js
/**
 * The camp for whoever got out. groups: [{ id, size, kind }] — id is the household or place ('aled', …, 'cinderhold',
 * 'chapel'), size is how many people (1–30), kind is 'farm' | 'town' | 'chapel'. Returns
 * { plots: [{ id, x, z, yaw, r, items: [{ what, x, z, yaw, seed }] }], lookout: { x, z, yaw }, slots: [...] }.
 */
export function campLayout(groups, { seed, mountain, sea, radius })
```

- Every group gets **its own plot**: one cookfire, one or more shelters (one per ~4 people), its cart (farms: `loadedCart`;
  town: handcarts and barrows; chapel: a single handcart and bedrolls), bundles, bedrolls; farms with animals get a `pen`.
- Plots ring a **shared middle** (a bigger fire, the place people gather), with paths between plots left clear (≥ 2.5 m).
- Shelters face away from the sea wind (`sea`: the direction the sea lies in) and toward the middle.
- The **lookout** sits on the camp's edge nearest the mountain (`mountain`: the direction of the crater, from the camp
  toward `[2350, -2150]`).
- No plot may overlap another; everything fits within `radius` (start with 45 m). Deterministic for the same input.
- Zero groups → just the shared fire, cold, and one abandoned bundle (the camp is empty: the player saved no one).

Sites: add `campSites(groups)` that returns one architecture site per plot (`id: 'emb-camp-' + group.id`, `hidden: true`,
`seatAt: 'center'`, `glow: 1`) plus `'emb-camp-middle'` and `'emb-camp-lookout'`. **Keep the existing `emb-camp` site id
working** (`src/systems/sow.js` reveals it by id): either make `emb-camp` the middle, or leave a thin alias. The wiring in
`src/world/sow.js` `sowSites` is yours to change — it is the only edit you need outside the new file. Revealing a plot when
its group arrives is a one-line change in `src/systems/sow.js` (`s[idx].hidden = false`, as the door does); do it the same
way, by the `ember:<id>-go` flags for the farms; for Cinderhold and the chapel, reveal them when the flag
`ember:fled-cinderhold` or `ember:fled-chapel` is set (Claude will set those from the eruption; just read them).

## 4. Build C — the words after (data only)

The game's dialogue lives in `data/quests/ember.json`: `talk[npcId]` is a list of `{ when: { flag }, say: key }`, first
match wins; `dialogue[key] = { speaker, lines: [...] }`. Remembrance (the journal) is `data/remembrance.json`: entries
`{ id, group, title, text, has }` (`has` is a flag; text 40–330 characters; `tests/remembrance.test.js` checks them).

1. **At the camp, after the eruption** (flag `ember:after`): for each Sow elder and their kin who got out
   (`ember-aled`, `ember-bethan`, `ember-huw`, `ember-ffion`, `ember-gwil`, `ember-mari` and their family NPCs listed in
   `npcs`), add a talk entry **at the front of their list** (`when: { flag: ['ember:after', 'ember:<id>-go'] }`), and a
   different one if they came because the player **lied** to them (`ember:<id>-lied`: they know now; they are alive and
   angry, or alive and grateful anyway — pick per character from their `about`).
2. **Lines that depend on what the player did:** use the flags that already exist (search `data/quests/ember.json` and
   `src/systems/sow.js` for `ember:` flags). At least: who they lost (`ember:<id>-stays` for a neighbour), whether the
   player showed them the sign themselves (`ember:sign-<id>`), whether the player found the guild's lie (`ember:lie-found`).
3. **Remembrance, one entry per community** (group `people`), each with two or three variants by fate: for the Sow farms
   one per family (`has: 'ember:<id>-go'` → "got out"; `has: 'ember:<id>-stays'` → "stayed"), and Cinderhold and the chapel
   (`ember:fled-cinderhold` / `ember:lost-cinderhold`, `ember:fled-chapel` / `ember:lost-chapel`). Every entry needs a unique
   id and exactly one trigger.
4. **Voice:** plain, concrete, sparing. People talk about things (the goats, the well, the bucket coming up hot), not
   feelings in the abstract. No exclamation marks, no speeches. Grief is quiet and practical. Look at the existing
   `ember.*` lines and the frost and meadow chapters' lines and match them. The tone reference is `docs/storyline.md`.
   Nobody thanks the player in so many words; they say what they saved.

## 5. Tests (`tests/refugeeKit.test.js`, new)

- every builder is deterministic (same seed → identical positions) and different seeds give different shapes;
- `campLayout`: no plot overlaps; every plot is inside `radius`; paths ≥ 2.5 m; the lookout faces the mountain (within
  30°); 0, 1, 4 and 8 groups all work; more people → more shelters;
- the whole camp at 8 groups × 12 people is under 40k triangles (count `B.idx.length / 3`);
- every people slot stands on the plot (inside its circle) and has a valid pose;
- the dialogue keys referenced by every new `talk` entry exist in `dialogue`; every new Remembrance entry passes
  `checkEntries` (`src/game/remembrance.js`).

## 6. Hand back

When done, write `docs/codex/ember-aftermath-report.md`:

- what you built, file by file;
- the test count and build result;
- the triangle count of the camp at 0, 1, 4 and 8 groups;
- **anything you wanted to change in a file on the do-not-touch list**, with the exact change;
- what you are unsure of.

If you can run the game, `tools/bot/play.sh <name> "^&gfx=high"` starts it in a headless Chrome and
`tools/bot/client.mjs` drives it (`g.requestTeleport(720, -2640)` takes you to the camp). Screenshots of the camp at 4 and 8
groups would help; stop the browser afterwards (`tools/bot/play.sh stop`). If you can't run it, say so — don't claim it looks
right without having seen it.
