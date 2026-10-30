#!/usr/bin/env node
// The Long Walker's homecoming in the live game (Phase 9 D10): from 150 m east of the camp it turns
// home and kneels by the caravanserai's gate; the Wraith on its back waits for dusk, turns the two
// mirror-stones until the low sun goes mirror → mirror → the well's glass eye, and it lies down.
//   tools/bot/play.sh "" "^&walker=home"   then   node tools/bot/walker-home.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const W = 'const w=g.walker;';
const onDeck = async (lx, lz) => {
  const [x, y, z] = await js(W + `const o=[0,0,0]; w.toWorld(${lx}, 0.05, ${lz}, o); return o;`);
  await js(`g.controller.teleport(${x}, ${z}, ${y}); g.walkerDeck.riding = true; return 1;`);
};

log('start', await js(W + 'return {st:w.state, mode:w.mode, x:w.x|0, z:w.z|0}'));
await onDeck(0, 6);
let st = 2;
for (let i = 0; i < 120 && st !== 7; i++) { await sleep(1000); st = await js(W + 'return w.state'); if (i % 10 === 0) log(i, await js(W + 'return {st:w.state, x:+w.x.toFixed(1), z:+w.z.toFixed(1), yaw:+w.yaw.toFixed(2), d:+w._homeD.toFixed(1), riding:g.walkerDeck.riding}')); }
log('home?', st === 7, await js(W + 'return {x:+w.x.toFixed(1), z:+w.z.toFixed(1), yaw:+w.yaw.toFixed(2), riding:g.walkerDeck.riding}'));
// Out to the side, a look at it kneeling by the gate.
const view = await js(W + 'return {x:w.x + Math.cos(w.yaw)*70 - Math.sin(w.yaw)*20, z:w.z - Math.sin(w.yaw)*70 - Math.cos(w.yaw)*20}');
await bot('teleport', view); await sleep(2000);
await bot('face', await js(W + 'return {x:(w.x+w.wellX)/2, z:(w.z+w.wellZ)/2}'));
await bot('shot', { name: 'walker-home' });
// Back on its back; dusk; the mirrors.
await onDeck(-2, -10);
await js('const t=g.interactables.find(t=>t.id==="walker-wait"); if (!t.hidden) t.onUse(); return g.params.v.timeOfDay;');
await sleep(2500);
log('sun y', await js('return +g.env.env.sunDir.y.toFixed(3)'), 'tod', await js('return g.params.v.timeOfDay'));
let lit = false;
for (let a = 0; a < 8 && !lit; a++) {
  const b0 = await js('return g.walker.beam0');
  if (!b0) { await js('g.interactables.find(t=>t.id==="walker-mirror-0").onUse(); return 1;'); await sleep(250); continue; }
  for (let b = 0; b < 8 && !lit; b++) {
    lit = !!(await js('return g.walker.beam1'));
    if (!lit) { await js('g.interactables.find(t=>t.id==="walker-mirror-1").onUse(); return 1;'); await sleep(250); }
  }
}
log('beam0', await js('return g.walker.beam0'), 'beam1', await js('return g.walker.beam1'), 'mirrors', await js('return Array.from(g.walker.mirrorYaw).map(v=>+v.toFixed(2))'));
await bot('teleport', view); await sleep(1200);
await bot('face', await js(W + 'return {x:(w.x+w.wellX)/2, z:(w.z+w.wellZ)/2}'));
await bot('shot', { name: 'walker-lit' });
for (let i = 0; i < 25; i++) { await sleep(1000); if ((await js(W + 'return w.state')) === 9) break; }
log('after', await js(W + 'return {st:w.state, rel:+w.rel.toFixed(2), y:+w.y.toFixed(1), flags:["dunes:walker-released"].map(f=>g.chapter.graph.flags.has(f)), restored:g.ws.restoration.dunes, stone:g.elements.unlocked.has("stone")}'));
await bot('face', await js(W + 'return {x:(w.x+w.wellX)/2, z:(w.z+w.wellZ)/2}'));
await bot('shot', { name: 'walker-rested' });
