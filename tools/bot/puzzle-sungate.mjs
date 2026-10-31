#!/usr/bin/env node
// The Sun Gate in the live game (dunes-design §4.2 A, §6.8), from the site's entry: the machine's own calls,
// fed as the world feeds them (the Interact target's onUse, FREEZE stamps through ts.stamp).
//   tools/bot/play.sh "" ""   then   node tools/bot/puzzle-sungate.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const O = [1484, 1056];
const state = () => js(`const s=g.sunGate;return {stage:s.stage,turns:s.turns.join(),pts:s.points>>1,lit:['m1','m2','g1','g2','eye','lens','fall'].filter(k=>s[k].lit).join(),frozen:+s.frozen.toFixed(1),clear:+s.clear.toFixed(1),lensLife:+s.lensLife.toFixed(1)}`);
const use = (id) => js(`const t=g.interactables.find(t=>t.id==='${id}');if(t.hidden)return 'hidden';t.onUse();return 'ok';`);
const freeze = (u, v) => js(`const ts=g.terrainState;ts.bx=${O[0] + u};ts.bz=${O[1] + v};ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=2;ts.bd=0;ts.bc=0.5;ts.bk=3;ts.bwet=0;ts.bbias=0;ts.bberm=0;ts.stamp();return 1;`);
const turnTo = async (k, test) => { for (let i = 0; i < 9; i++) { await sleep(350); if (await js(`const s=g.sunGate;return ${test}`)) return true; await use(k ? 'sg-mirror-2' : 'sg-mirror-1'); } return false; };

await js(`g.params.v.timeOfDay=10;g.params.version++;return 1;`);
await bot('teleport', { x: O[0] + 10, z: O[1] - 8 }); await sleep(4500);
log('arrive', await state());
await bot('face', { x: O[0], z: O[1] + 20 }); await bot('shot', { name: 'sungate-1' });
log('teach', await turnTo(0, 's.stage>=1'), await state());
await sleep(2500);
await bot('teleport', { x: O[0] + 12, z: O[1] + 10 }); await sleep(2000);
await bot('face', { x: O[0] - 8, z: O[1] + 20 }); await bot('shot', { name: 'sungate-2' });
await freeze(0, 20); log('lens', await turnTo(0, 's.lens.lit&&s.m2.lit'), await state());
await bot('shot', { name: 'sungate-lens' });
log('combine', await turnTo(1, 's.stage>=2'), await state());
await sleep(1500);
await bot('teleport', { x: O[0] + 8, z: O[1] + 30 }); await sleep(2000);
await bot('face', { x: O[0] - 16, z: O[1] + 42 }); await bot('shot', { name: 'sungate-fall' });
await freeze(0, 20); log('toward the eye', await turnTo(1, 's.m2.lit&&s.fall.lit'), await state());
await freeze(-16, 35); await sleep(300); await bot('shot', { name: 'sungate-column' });
log('strike', await use('sg-column'), await state());
await sleep(3500); log('done?', await state());
await bot('shot', { name: 'sungate-done' });
log('shaped near', await js(`return g.shaped?.slots?.filter?.(s=>s.active).map(s=>[s.body.x|0,s.body.z|0,s.kind]).slice(0,4)`), 'wraith', await js('return [g.controller.pos.x|0,+g.controller.pos.y.toFixed(1),g.controller.pos.z|0]'));
log('flag', await js(`return g.chapter.graph.flags.has('dunes:instrument-sun')`), 'gpu', await js(`return {late:w.gpuStats.late.length,err:w.gpuStats.gpuErrors}`));
