#!/usr/bin/env node
// The Sow slice, played (docs/phase-11/ember-design.md §9 "Measure"): Cole's warning, the new steam read with Crystallize, then
// the farms — Bethan shown her cistern and helped to load; Huw shown his floor once she is on the road, the harvest left
// (Elin stays); a lie at Ffion's. Prints the state after each, and films the Bethan family leaving.
//   tools/bot/play.sh && node tools/bot/sow-run.mjs
import { bot, js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flags = async () => js(`return [...g.chapter.graph.flags].filter(f=>f.startsWith('ember:'))`);
const skip = async () => { for (let i = 0; i < 40; i++) { const c = await js(`return g.chapter.current`); if (!c) return null; if (c.options) return c.options; await js(`g.chapter.updateDialogue(30,true,-1);return 1`); await sleep(60); } return null; };
const choose = async (k) => { const c = await js(`return g.chapter.current`); if (!c?.options) { console.log('  (no choice open)'); return null; } console.log('  →', c.options[k]); await js(`g.chapter.updateDialogue(0,false,${k});return 1`); await sleep(200); return skip(); };
const talk = async (id) => { await bot('talkTo', { id, ms: 600 }); return skip(); };
const fams = await js(`return Object.fromEntries(g.sow.fams.map(f=>[f.id,{sign:f.sign,door:f.door,at:f.farm.at,facing:f.farm.facing}]))`);
const tp = async (x, z) => { await js(`g.requestTeleport(${x},${z});return 1`); for (let i = 0; i < 40; i++) { await sleep(500); if (await js(`return !g.pendingTp?.active && !g.controller.hold`)) break; } await sleep(1500); };
const log = async (what) => console.log(what.padEnd(28), JSON.stringify(await flags()));

await js(`g.params.v.timeOfDay=10;g.params.version++;return 1`);
// Cole.
await tp(985, -1316);
console.log('cole says', await talk('ember-cole')); await log('warned');
// The new steam: stand by a fissure and Crystallize on it.
const fz = [2045, -1704];
// (Crystallize lands where the Wraith aims, ~15 m ahead: stand back from it, face it, cast.)
await tp(fz[0] - 13, fz[1] - 1);
await bot('face', { x: fz[0], z: fz[1], pitch: -0.3 });
await js(`g.frost.castCrystal=true;return 1`); await sleep(1500);
await log('steam read');
// Bethan: the cistern, shown; loaded.
const B = fams.bethan;
await tp(B.door[0] + 4, B.door[1] + 4);
{ const o = await talk('ember-bethan'); console.log('bethan (no sign)', o); if (o) await choose(o.length - 1); }
await bot('walkTo', { x: B.sign[0] + 1.5, z: B.sign[1] + 1.5, arrive: 1.2 }); await bot('face', { x: B.sign[0], z: B.sign[1] });
await bot('press', { key: 'Interact' }); await sleep(800); await log('cistern looked at');
console.log('bethan (sign)', await talk('ember-bethan')); await choose(0);
console.log(JSON.stringify(await bot('follow', { id: 'ember-bethan', flag: 'ember:bethan-believes', dist: 3, timeout: 60 })).slice(0, 80));
await skip(); await sleep(1500); await log('bethan shown');
console.log('bethan (ready)', await talk('ember-bethan')); await choose(0); await sleep(2500); await log('bethan loads');
// Film the family going out of the gate.
const fx = Math.sin(B.facing), fzz = Math.cos(B.facing);
await bot('film', { name: 'sow-run-leave', dir: 'bot', seconds: 10, fps: 15, warm: 20, size: [1280, 720], js: `const e=g.npcs.find(n=>n.id==='ember-bethan');const p=g.controller.pos;cam.at(${B.at[0] + fx * 24 + fzz * 10},p.y+4,${B.at[1] + fzz * 24 - fx * 10},e.x,p.y+0.5,e.z,0.85);` });
await log('bethan on the road');
// Huw: now one family is on the road.
const H = fams.huw;
await tp(H.door[0] + 4, H.door[1] + 4);
await tp(H.sign[0] + 3, H.sign[1] + 3); await bot('face', { x: H.sign[0], z: H.sign[1] });
await bot('press', { key: 'Interact' }); await sleep(800);
console.log('huw (sign)', await talk('ember-huw')); await choose(0);
await bot('follow', { id: 'ember-huw', flag: 'ember:huw-believes', dist: 3, timeout: 60 }); await skip(); await sleep(1500);
console.log('huw (ready)', await talk('ember-huw')); await choose(1); await sleep(1500); await log('huw goes light');
// Ffion: the lie.
const F = fams.ffion;
await tp(F.door[0] + 4, F.door[1] + 4);
console.log('ffion', await talk('ember-ffion')); await choose(0); await sleep(1500); await log('lied to ffion');
// The next dawn.
await js(`g.params.v.timeOfDay=5.8;g.params.version++;return 1`); await sleep(1500);
await js(`g.params.v.timeOfDay=6.3;g.params.version++;return 1`); await sleep(1500); await log('dawn');
console.log('state', JSON.stringify(await js(`return {road:g.sow.onRoad(), hours:g.chapter.graph.vars['ember:hours'], decided:g.chapter.graph.vars['ember:sow-decided'], err:w.gpuStats.gpuErrors, quest:g.chapter.graph.quests['ember-waking']}`)));

// The other three: Gwil (Draw the bucket), Mari (Crystallize on the bottom terrace), Aled (the trough; the promise).
// (With the lie found, each wants two more neighbours: three are on the road.)
const showAndReady = async (id, read, pick) => {
  const P = fams[id];
  await read(P);
  console.log(id + ' (sign)', JSON.stringify(await talk('ember-' + id))); await choose(0);
  await bot('follow', { id: 'ember-' + id, flag: `ember:${id}-believes`, dist: 3, timeout: 60 }); await skip(); await sleep(1500);
  for (let i = 0; i < 20 && !(await js(`return g.chapter.graph.flags.has('ember:${id}-ready')`)); i++) await sleep(250);
  console.log(id + ' (ready)', JSON.stringify(await talk('ember-' + id))); await choose(pick); await sleep(1500);
  await log(id);
};
const castAt = async (P) => {
  const dx = P.sign[0] - P.at[0], dz = P.sign[1] - P.at[1], l = Math.hypot(dx, dz) || 1;
  await tp(P.sign[0] - dx / l * 13, P.sign[1] - dz / l * 13); await bot('face', { x: P.sign[0], z: P.sign[1], pitch: -0.3 });
  await js(`g.frost.castCrystal=true;return 1`); await sleep(1500);
  console.log('  cast at', JSON.stringify(await js(`return [g.frost.crystalX,g.frost.crystalZ]`)), 'sign', P.sign);
};
await showAndReady('gwil', async (P) => { await tp(P.sign[0] + 1.8, P.sign[1] + 1.8); await bot('face', { x: P.sign[0], z: P.sign[1] }); await bot('press', { key: 'Interact' }); await sleep(800); }, 1);
await showAndReady('mari', castAt, 0);
await showAndReady('aled', castAt, 0);
console.log('final', JSON.stringify(await js(`return {road:g.sow.onRoad(), hours:g.chapter.graph.vars['ember:hours'], decided:g.chapter.graph.vars['ember:sow-decided'], all:g.chapter.graph.flags.has('ember:sow-all'), quest:g.chapter.graph.quests['ember-waking'], err:w.gpuStats.gpuErrors}`)));
