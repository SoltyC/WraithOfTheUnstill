#!/usr/bin/env node
// The Singing Dunes in the live game (dunes-design §4.2 C, §6.8): standing on each lip, as the player does.
//   tools/bot/play.sh "" ""   then   node tools/bot/puzzle-singing.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const O = [2650, 680], L = [[-44, 4], [30, 35], [20, -50]];
const state = () => js(`const s=g.singing;return {stage:s.stage,at:s.song.at,frozen:+s.frozen.toFixed(0),last:s.lastNote,wait:[...s.wait].map(v=>+v.toFixed(1)).join()}`);
const use = (id) => js(`const t=g.interactables.find(t=>t.id==='${id}');if(t.hidden)return 'hidden';t.onUse();return 'ok';`);
const go = async (n) => { await bot('teleport', { x: O[0] + L[n][0], z: O[1] + L[n][1] }); await sleep(1200); };
const freezeMid = () => js(`const ts=g.terrainState;ts.bx=${O[0] + L[1][0]};ts.bz=${O[1] + L[1][1]};ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=2;ts.bd=0;ts.bc=0.5;ts.bk=3;ts.bwet=0;ts.bbias=0;ts.bberm=0;ts.stamp();return 1;`);

await js(`g.params.v.timeOfDay=15;g.params.version++;return 1;`);
await bot('teleport', { x: O[0] + 12, z: O[1] + 12 }); await sleep(4500);
await bot('face', { x: O[0], z: O[1] }); await bot('shot', { name: 'singing-ring' });
log('arrive', await state(), 'heights', await js('return g.controller.pos.y|0'));
log('hum', await use('sing-ring')); await sleep(1500); await bot('shot', { name: 'singing-hum' });
await go(2); log('teach (high)', await state());
await sleep(8500);
await go(0); await sleep(800); log('low, unfrozen: the middle goes too', await state());
await sleep(9000);
await go(1); await freezeMid(); await sleep(500);
log('frozen', await state(), await use('sing-ring').catch(() => 0));
await bot('shot', { name: 'singing-crust' });
await go(0); await sleep(300); log('low', await state());
await sleep(1500); log('no sympathy', await state());
await go(2); log('high', await state());
await go(1); log('strike', await use('sing-crust'), await state());
await sleep(1500); await bot('shot', { name: 'singing-done' });
log('flag', await js(`return g.chapter.graph.flags.has('dunes:instrument-song')`), 'gpu', await js(`return {late:w.gpuStats.late.length,err:w.gpuStats.gpuErrors}`));
