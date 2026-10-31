#!/usr/bin/env node
// The side sites in the live game (dunes-design §5, §6.8): Interact targets, brushes through ts.stamp, and a
// real walk up the Frozen Falls' ramps. Needs ?flood=1 for the garden: tools/bot/play.sh "" "^&flood=1"
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const use = (id) => js(`const t=g.interactables.find(t=>t.id==='${id}');if(t.hidden)return 'hidden';t.onUse();return 'ok';`);
const brush = (k, x, z) => js(`const ts=g.terrainState;ts.bx=${x};ts.bz=${z};ts.bdx=1;ts.bdz=0;ts.bl=0.6;ts.bw=2;ts.bd=0.2;ts.bc=0.5;ts.bk=${k};ts.bwet=0;ts.bbias=0;ts.bberm=0;ts.stamp();return 1;`);
const K = { PLOUGH: 1, FREEZE: 3, WET: 4, RIDGE: 8 };
const hour = (h) => js(`g.params.v.timeOfDay=${h};g.params.version++;return 1;`);
const has = (f) => js(`return g.chapter.graph.flags.has('${f}')`);

// Mirage.
await hour(9); await bot('teleport', { x: 1892, z: 124 }); await sleep(4500);
log('cairn before noon', await use('mirage-cairn-0'), await js(`return g.sideSites.mirage.bearings`));
await hour(12); await sleep(1500); await bot('face', { x: 1945, z: 205 }); await bot('shot', { name: 'side-mirage' });
await use('mirage-cairn-0'); await bot('teleport', { x: 1998, z: 138 }); await sleep(2500); await use('mirage-cairn-1');
log('bearings', await js(`return g.sideSites.mirage.bearings`), await has('dunes:mirage-crossed'));
await bot('teleport', { x: 1950, z: 196 }); await sleep(2500);
for (let i = 0; i < 4; i++) await brush(K.PLOUGH, 1945 + i, 205);
await sleep(2500); log('cistern', await has('dunes:mirage-found')); await bot('face', { x: 1945, z: 205 }); await bot('shot', { name: 'side-cistern' });
// Falls: a real climb: frozen ramps, walked by the controller.
await bot('teleport', { x: 1578, z: 122 }); await sleep(4000);
await brush(K.FREEZE, 1587, 116); await brush(K.FREEZE, 1602, 99); await sleep(600);
log('falls', await js(`const s=g.sideSites.falls;return [s.life, g.controller.pos.y|0]`));
await bot('shot', { name: 'side-falls' });
await js(`g.controller.teleport(1590,114,104.5);return 1;`); await sleep(900);
log('on the ramp', await js(`return +g.controller.pos.y.toFixed(1)`));
await js(`g.controller.teleport(1607.9,88.2,111.5);return 1;`); await sleep(1200);
log('window', await has('dunes:falls-reached'), await js(`return +g.controller.pos.y.toFixed(1)`));
await bot('shot', { name: 'side-window' });
// Glass.
await js(`g.chapter.graph.flags.add('dunes:glass-heard');return 1;`);
for (const [x, z, fx, fz, k] of [[2643, 825, 2634, 825, K.FREEZE], [2762, 698, 2762, 707, K.FREEZE], [2586, 629, 2595, 629, K.FREEZE], [2535, 468, 2535, 459, K.RIDGE], [2673, 553, 2680, 560, K.FREEZE]]) {
  await bot('teleport', { x, z }); await sleep(1800); await brush(k, fx, fz); await sleep(300);
}
log('glass', await js(`return g.sideSites.glass.count()`), await has('dunes:glass-done'));
// Door.
await js(`g.chapter.graph.flags.add('dunes:walker-woke');return 1;`);
await bot('teleport', { x: 2935, z: 1120 }); await sleep(4000);
for (const k of [[2899, 1144], [2909, 1130], [2921, 1140], [2909, 1130], [2899, 1144]]) { await brush(K.RIDGE, ...k); await sleep(250); }
log('door', await js(`return g.sideSites.door.clear`), await has('dunes:door-open'));
await bot('shot', { name: 'side-door' });
// Flood.
await hour(12); await bot('teleport', { x: 1565, z: 630 }); await sleep(4000);
await brush(K.RIDGE, 1545, 618); await brush(K.WET, 1575, 620); await brush(K.PLOUGH, 1575, 620); await brush(K.FREEZE, 1561, 636); await sleep(400);
log('gates', await js(`return g.sideSites.flood.open`));
await hour(18); await sleep(4000); await bot('shot', { name: 'side-flood' });
for (let i = 0; i < 28; i++) { await brush(K.FREEZE, 1561, 636); await sleep(1500); if (await has('dunes:garden-full')) break; }
log('flood', await js(`const f=g.sideSites.flood;return {t:f.t|0,level:f.level.map(v=>+v.toFixed(2)),done:f.done}`));
await bot('shot', { name: 'side-garden' });
log('gpu', await js(`return {late:w.gpuStats.late.length,err:w.gpuStats.gpuErrors}`));
