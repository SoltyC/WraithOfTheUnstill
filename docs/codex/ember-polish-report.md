# Ember polish

## Cutscene replay

The director records a completed viewing in the chapter's saved flags. On a repeat viewing, **Hold K to skip** appears in the lower-right corner. The fill tracks a continuous 0.8-second hold. Skipping enters the remaining shots in order, applies their cut actions, and uses the usual end callback and camera cleanup. The named Listener's release always plays in full.

In Windows Chrome on the RX 9070, the Bakehouse first played for 17.0 seconds, set `seen:bakehouse`, and ran its end callback once. The prompt appeared on replay. An actual held K ended playback at 2.64 seconds. The end callback ran once for the replay, the city remained active, and the Wraith returned to the same position with controls available. The Listener's release hid the prompt even with its seen flag set. [Skip prompt during the hold](ember-polish-captures/skip-prompt.jpg)

The directed scenes need to pass their existing variant ID to the director at the point where a queued scene starts. Apply this one-line change when merging the concurrent edits in `src/systems/scenes.js`.

```diff
--- a/src/systems/scenes.js
+++ b/src/systems/scenes.js
@@ -69,7 +69,7 @@
       eval: (u, time, out) => evalBeat(b, u, time, resolve, groundAt, out, blocked),
       onCut: b.onCut,
     }));
-    g.director.play(shots, { blendIn: opt.blendIn ?? 0.8, blendOut: opt.blendOut ?? 1.2, onEnd: () => { playing = null; g.streamFocus = null; opt.onEnd?.(); } });
+    g.director.play(shots, { id: variant.id, blendIn: opt.blendIn ?? 0.8, blendOut: opt.blendOut ?? 1.2, onEnd: () => { playing = null; g.streamFocus = null; opt.onEnd?.(); } });
   }
   const S = g.scenes = {
     groundAt,
```

## Camp pens

Aled and Ffion's enclosures use upright stakes and six continuous plank-material withies per side. Adjacent rows alternate around the stakes. Each side follows the slope under it, exposing the rails on the uphill edge and retaining the entrance. I inspected Aled's pen from the same camera with both plots enabled. [Before](ember-polish-captures/pens-before.jpg) · [After](ember-polish-captures/pens-after.jpg)

## Save and reload

The bot ran the eruption at 25×, let the nearby ruins come to rest, and saved slot 1 at (1880, −2040) inside the ruined town’s footprint. It stopped Chrome with **PROFILE=keep**, started a new process on the same profile, and verified the saved slot’s timestamp before loading. The Wraith landed at Cinderhold. I inspected the paired frames from the same cameras. [Recorded state and comparison](ember-polish-captures/reload-state.json)

| View | Before | After |
| --- | --- | --- |
| The Sow | [Screenshot](ember-polish-captures/sow-before.jpg) | [Screenshot](ember-polish-captures/sow-after.jpg) |
| Cinderhold | [Screenshot](ember-polish-captures/cinderhold-before.jpg) | [Screenshot](ember-polish-captures/cinderhold-after.jpg) |
| Survivors’ camp | [Screenshot](ember-polish-captures/camp-before.jpg) | [Screenshot](ember-polish-captures/camp-after.jpg) |

| What was checked | Result |
| --- | --- |
| Saved ruins | All 13 records matched. Cinderhold’s town and cage debris meshes were enabled and at rest before and after. |
| Cooled flows and spent mountain | The three front positions matched, cooling was 1, and the mountain was at stage 5 in both sessions. |
| Ash | Falling intensity and the ground, grass and tree ash values matched at each camera. |
| Camp and aftermath | All 38 sampled Ember flags matched. The central camp, Aled’s plot, Ffion’s plot and the lookout were visible in both sessions. |
| Visual differences | The Sow was darker with storm light before the save and had lighter low fog on reload. The cooled flow and ruined town persisted at Cinderhold, but the rubble piles and exposed surfaces differed. The camp view was close across the pair. |

The Sow was photographed soon after the eruption ended. Residual storm cover eases during uninterrupted play, which may account for some of the lighting difference. The saved ruin record currently omits the collapse cause and the effective release times for each group of fragments. The following patch preserves both inputs in `src/systems/destruction.js`. It would improve reconstruction for new saves. Exact rubble placement also depends on the ground and the simulation’s stepping, and would need a check of the final fragment transforms after this change.

```diff
--- a/src/systems/destruction.js
+++ b/src/systems/destruction.js
@@ -13,6 +13,12 @@
 import { createDust, DUST_OF } from '../render/dust.js';

 const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
+
+/** The inputs needed to replay a saved collapse on the same ground. */
+function ruinRecord(opt, done = false) {
+  const { force, seed, strength, char = 0, cause, releaseOf } = opt;
+  return { force, seed, strength, char, cause, releaseOf, ...(done ? { done: 1 } : {}) };
+}

 /** @param {any} g  shared boot context */
 export function addDestructionSystem(g) {
@@ -35,7 +41,7 @@
     const m = e.data, r = ruins.get(m.id);
     if (!r) return;
     r.view.upload(m.xf);
-    if (m.done) { r.state = 'rest'; vars['ruin:' + m.id] = { force: r.opt.force, seed: r.opt.seed, strength: r.opt.strength, char: r.opt.char ?? 0, done: 1 }; }
+    if (m.done) { r.state = 'rest'; vars['ruin:' + m.id] = ruinRecord(r.opt, true); }
     for (const ev of m.events) {
       const sz = Math.min(6, ev.size);
       if (ev.kind === 'release') { if (sz > 0.7) dust.burst(ev.x, ev.y + 0.3, ev.z, 2 + Math.round(sz * 2), 1 + sz * 0.7, 1 + sz * 0.6, r.col, 16, 0.15); }
@@ -83,11 +89,13 @@
     if (!grid) return false;
     r.origin = [s.at[0], oy, s.at[1]];
     // When each group lets go: the cause's own timing (the lava's arrival), or a wave from the force's side.
-    const releaseOf = {};
-    if (r.opt.release) {
+    if (r.opt.release && !r.opt.releaseOf) {
+      const releaseOf = {};
       const acc = new Map();
       r.debris.frags.forEach((f) => { if (f.fixed) return; const a = acc.get(f.group) || [0, 0, 0, 0]; a[0] += f.pivot[0]; a[1] += f.pivot[1]; a[2] += f.pivot[2]; a[3]++; acc.set(f.group, a); });
       for (const [gid, a] of acc) releaseOf[gid] = Math.max(0, r.opt.release(s.at[0] + a[0] / a[3], s.at[1] + a[2] / a[3], oy + a[1] / a[3]) - r.elapsed);
+      r.opt.releaseOf = releaseOf;
+      if (!r.opt.done) vars['ruin:' + id] = ruinRecord(r.opt);
     }
     // The pieces at rest where they stood, until the worker moves them.
     const xf = r.view.xf;
@@ -99,7 +107,7 @@
     const far = Math.min(dAt(controller.pos.x, controller.pos.z), cam ? dAt(cam.x, cam.z) : Infinity, sf ? dAt(sf.x, sf.z) : Infinity) > 450;
     const finish = r.opt.done || far;
     const frags = r.debris.frags.map((f) => ({ pivot: f.pivot, half: f.half, vol: f.vol, group: f.group, top: f.top, fixed: f.fixed, mat: f.mat, rot: f.rot }));
-    worker.postMessage({ cmd: 'start', id, frags, grid, finish, opt: { origin: r.origin, force: r.opt.force, strength: r.opt.strength ?? 1, seed: r.opt.seed, cause: r.opt.cause, releaseOf: r.opt.release ? releaseOf : undefined } });
+    worker.postMessage({ cmd: 'start', id, frags, grid, finish, opt: { origin: r.origin, force: r.opt.force, strength: r.opt.strength ?? 1, seed: r.opt.seed, cause: r.opt.cause, releaseOf: r.opt.releaseOf } });
     r.state = finish ? 'finishing' : 'running';
     // The standing building goes; the pieces take its place.
     s.hidden = true; view.sites[r.i * 4 + 3] = 0;
@@ -165,7 +173,7 @@
     const r = { i, debris, view: dv, mainMat: main, state: 'pending', opt: { force: [1, 0], seed: 1 + i, ...opt }, col: DUST_OF[main] || DUST_OF[0], ext, elapsed: 0, origin: null };
     if (opt.char !== undefined) view.char[i] = Math.max(view.char[i], opt.char);
     ruins.set(id, r);
-    if (!opt.done) vars['ruin:' + id] = { force: r.opt.force, seed: r.opt.seed, strength: r.opt.strength, char: opt.char ?? 0 };
+    if (!opt.done) vars['ruin:' + id] = ruinRecord(r.opt);
     r.elapsed = clock.simTime - r.opt.t0;
     start(id, r);
     return r;
```

## Changed files

| File | Change |
| --- | --- |
| `src/input/actions.js` | Maps K to the cutscene skip action. |
| `src/game/cutsceneSkip.js` | Handles viewing history and ordered completion of remaining cuts. |
| `src/systems/director.js` | Displays and tracks the hold prompt and routes a skip through normal playback cleanup. |
| `src/systems/releaseLines.js` | Gives the restored-landscape scenes stable viewing IDs. |
| `src/game/quests/questGraph.js` | Refills the quest variables object held by world systems. |
| `src/boot/game.js` | Rebuilds recorded ruins when applying the selected save. |
| `src/systems/world.js` | Lets a teleport finish when a hidden building or hinged door has no standing floor. |
| `tools/bot/play.sh` | Adds `PROFILE=keep` for a persistent test profile per port. |
| `tools/bot/eruption-reload.mjs` | Runs the eruption, records the world, saves and relaunches Chrome, and compares the loaded world. |
| `src/world/refugeeKit.js` | Builds the woven, terrain-seated hurdles. |
| `tests/cutsceneSkip.test.js`, `tests/questGraph.test.js` | Check viewing eligibility, ordered cut callbacks and the retained variables object. |



## Verification

- `npx vitest run` passed all 1,272 tests across 149 files, including the headland triangle budget.
- `npm run build` succeeded. Vite printed its existing dynamic-import warnings.
- `bash -n tools/bot/play.sh` and `node --check tools/bot/eruption-reload.mjs` passed. The live reload comparison matched all sampled state fields at all three cameras.

The all-households camp audit used Windows Chrome on the RX 9070 with a 2560×1440 window, a 2538×1286 viewport, High at 0.8 render scale, and dynamic resolution off. I ran the control on the same build with the original pen geometry. The 11.1 ms presented-frame p95 target was missed in both runs. The 0.5 ms difference is from one run per geometry.

| Pen geometry | Presented p50 | Presented p95 | GPU p95 | GPU errors |
| --- | ---: | ---: | ---: | ---: |
| Original | 11.3 ms | 14.5 ms | 9.70 ms | 0 |
| Woven | 11.4 ms | 15.0 ms | 9.82 ms | 0 |
