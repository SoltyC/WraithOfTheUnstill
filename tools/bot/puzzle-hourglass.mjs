#!/usr/bin/env node
// The Hourglass in the live game (dunes-design §4.2 B, §6.8): the sluice's Interact, FREEZE and PLOUGH stamps
// through ts.stamp (the paths Crystallize and Sweep take).
//   tools/bot/play.sh "" ""   then   node tools/bot/puzzle-hourglass.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const O = [1660, 462];
const state = () => js(`const h=g.hourglass;return {stage:h.stage,levels:h.bowls.map(b=>+b.level.toFixed(2)).join(),breach:h.breach.frozen,left:h.left.frozen,cuts:h.cuts,sluice:h.sluice.open}`);
const use = (id) => js(`const t=g.interactables.find(t=>t.id==='${id}');if(t.hidden)return 'hidden';t.onUse();return 'ok';`);
const stamp = (k, u, v) => js(`const ts=g.terrainState;ts.bx=${O[0] + u};ts.bz=${O[1] + v};ts.bdx=1;ts.bdz=0;ts.bl=0.6;ts.bw=1.4;ts.bd=${k === 1 ? 0.4 : 0};ts.bc=0.5;ts.bk=${k};ts.bwet=0;ts.bbias=0;ts.bberm=0;ts.stamp();return 1;`);
const freeze = (u, v) => stamp(3, u, v), plough = (u, v) => stamp(1, u, v);

await js(`g.params.v.timeOfDay=11;g.params.version++;return 1;`);
await bot('teleport', { x: O[0] + 16, z: O[1] + 2 }); await sleep(4500);
await bot('face', { x: O[0], z: O[1] + 18 }); await bot('shot', { name: 'hourglass-1' });
log('arrive', await state());
log('sluice', await use('hg-sluice')); await sleep(2500); log('breach open', await state());
await bot('shot', { name: 'hourglass-leak' });
await freeze(0, 10); await sleep(3000); log('breach frozen', await state());
await bot('shot', { name: 'hourglass-run' });
for (let i = 0; i < 3; i++) { await plough(3 + i, 18); await sleep(300); }
await sleep(800); log('channel', await state());
await bot('teleport', { x: O[0] + 22, z: O[1] + 26 }); await sleep(2000); await bot('face', { x: O[0], z: O[1] + 34 });
await freeze(-5.5, 24); await sleep(500);
for (let i = 0; i < 16; i++) { await sleep(1500); await freeze(0, 10); if ((await state()).stage === 3) break; }
log('done?', await state());
await sleep(2500); await bot('shot', { name: 'hourglass-done' });
log('flag', await js(`return g.chapter.graph.flags.has('dunes:instrument-clock')`), 'gpu', await js(`return {late:w.gpuStats.late.length,err:w.gpuStats.gpuErrors}`));
