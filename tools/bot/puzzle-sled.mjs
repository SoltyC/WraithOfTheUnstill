#!/usr/bin/env node
// The Wellhouse's buried sled in the live game (dunes-design §4.1, §6.8): the heap forms when the Wraith
// comes near; the lip with no channel pours over the sled; a channel, then the lip, frees it. The channel
// here is the same PLOUGH stamps Sweep makes (their path through ts.stamp is what the puzzle reads).
//   tools/bot/play.sh "" ""   then   node tools/bot/puzzle-sled.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const F = Math.atan2(36, -39), C = Math.cos(F), S = Math.sin(F);
const wx = (x, z) => 1810 + x * C + z * S, wz = (x, z) => 775 - x * S + z * C;
const at = (x, z) => ({ x: +wx(x, z).toFixed(1), z: +wz(x, z).toFixed(1) });
/** The height the Wraith stands at on the sled (the collision reads the terrain state). */
const height = async () => { await bot('teleport', at(0, -27)); await sleep(1500); return js('return +g.controller.pos.y.toFixed(2)'); };
const state = () => js(`return {st:g.sled.state,cut:g.sled.channel(),tries:g.sled.tries,cool:+g.sled.cooldown.toFixed(1),freed:g.chapter.graph.flags.has('dunes:sled-freed')}`);

await bot('teleport', at(14, -27)); await sleep(4000);
log('goals', await js(`return g.chapter.graph.goals().map(q=>q.quest+':'+q.step)`));
log('flat ground by the sled', await js('return +g.controller.pos.y.toFixed(2)'));
log('on the heap', await height(), await state());
await bot('teleport', at(14, -27)); await sleep(1500);
await bot('face', at(0, -27)); await bot('shot', { name: 'sled-heaped' });
await bot('teleport', at(0, -33)); await sleep(2500);
log('lip, no channel', await state());
await bot('teleport', at(14, -27)); await sleep(9000);
log('after the slide', await state());
await js(`const ts=g.terrainState,{BRUSH}={BRUSH:{PLOUGH:1}};const C=${C},S=${S};for(let u=1;u<13;u+=1){ts.bx=${wx(4, -29)}+C*u;ts.bz=${wz(4, -29)}-S*u;ts.bdx=C;ts.bdz=-S;ts.bl=0.7;ts.bw=1.4;ts.bd=0.5;ts.bc=0.6;ts.bk=1;ts.bwet=0;ts.bbias=0;ts.bberm=0.4;ts.stamp();}return 1;`);
await sleep(800); log('channel cut', await state());
await bot('face', at(8, -29)); await bot('shot', { name: 'sled-channel' });
await bot('teleport', at(0, -33)); await sleep(1000);
await bot('teleport', at(14, -27)); await sleep(6000);
log('lip, channel', await state(), 'on the sled', await height());
await bot('teleport', at(14, -27)); await sleep(2500);
await bot('face', at(0, -27)); await bot('shot', { name: 'sled-freed' });
await bot('teleport', at(-3, 12)); await sleep(3000);
await js('g.game.setPlayerVisible?.(true);return 1'); await bot('face', at(-8, 4)); await bot('shot', { name: 'wellhouse-court' });
log('npcs', await js(`return g.npcs.filter(n=>['sarai','hesper','iven','nadra','pell'].includes(n.id)).map(n=>[n.id,n.shown,+n.x.toFixed(0),+n.z.toFixed(0)])`));
log('gpu', await js(`return {late:w.gpuStats.late.length,err:w.gpuStats.gpuErrors}`));
