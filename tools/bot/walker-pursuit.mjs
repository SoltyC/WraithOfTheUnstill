#!/usr/bin/env node
// The Long Walker in the live game (Phase 9 D10): bind the sand under a lifted foot, watch it kneel,
// walk up its kneeling leg and flank stair onto its back, ride it, and strike a glyph pillar.
//   tools/bot/play.sh "" "^&walker=walk"   then   node tools/bot/walker-pursuit.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const W = 'const w=g.walker;';

// Beside it, 40 m off its right flank.
async function beside(d = 40) {
  const [x, z] = await js(W + 'const c=Math.cos(w.yaw),s=Math.sin(w.yaw); return [w.x + c*' + d + ', w.z - s*' + d + '];');
  await bot('teleport', { x, z }); await sleep(1500);
}

await beside();
log('walker', await js(W + 'return {st:w.state, x:w.x|0, z:w.z|0, y:+w.y.toFixed(1), v:+w.speed.toFixed(2)}'));
// Bind the sand under a right foot as it lifts (the telegraph's ring is where it will land).
let leg = -1;
for (let i = 0; i < 80 && leg < 0; i++) {
  leg = await js(W + 'for (const k of [3,4,5]) if (w.swing[k] > 0.05 && w.swing[k] < 0.4) { const ts=g.terrainState; ts.bx=w.tx[k]; ts.bz=w.tz[k]; ts.bdx=1; ts.bdz=0; ts.bl=0; ts.bw=2.5; ts.bd=0; ts.bc=0.4; ts.bk=3; ts.bwet=0; ts.bbias=0; ts.bberm=0; ts.stamp(); return k; } return -1;');
  if (leg < 0) await sleep(150);
}
log('froze under leg', leg);
let st = 0;
for (let i = 0; i < 60 && st !== 4; i++) { st = await js(W + 'return w.state'); await sleep(200); }
log('state after the foot landed', st, '(4 = kneel)');
await beside(70);
await bot('face', await js(W + 'return {x:w.x, z:w.z}'));
await bot('shot', { name: 'walker-kneel' });
// The climb: beyond the knee → the knee → the flank stair's foot → its top → in at the gap → the court.
const k = await js(W + 'return w.kneelLeg');
const wps = await js(W + `const k=${k}, s=k<3?-1:1, out=[0,0,0], L=[0,0,0]; w.toLocal(w.kx[k],w.ky[k],w.kz[k],L);
  const hz=[12,0,-12][k%3], dir=k%3===2?1:-1, top=hz+dir*(0.5+0.85*6);
  const pts=[[L[0]+s*5,L[2]],[L[0],L[2]],[s*12.9,hz],[s*12.9,top],[s*9,top],[0,0]];
  return pts.map(([x,z])=>{ w.toWorld(x,0,z,out); return [out[0],out[2]]; });`);
await bot('teleport', { x: wps[0][0], z: wps[0][1] }); await sleep(800);
const t0 = Date.now();
for (let i = 1; i < wps.length; i++) {
  const r = await bot('walkTo', { x: wps[i][0], z: wps[i][1], arrive: 0.7, timeout: 12 });
  log('waypoint', i, r.walk, 'y', r.pos[1]);
}
log('climb took', ((Date.now() - t0) / 1000).toFixed(1), 's; riding', await js('return g.walkerDeck.riding'), 'state', await js(W + 'return w.state'));
await sleep(5000);
log('after rising', await js(W + 'const L=[0,0,0]; const p=g.controller.pos; w.toLocal(p.x,p.y,p.z,L); return {st:w.state, riding:g.walkerDeck.riding, local:L.map(v=>+v.toFixed(2)), y:+w.y.toFixed(1)}'));
await bot('look', { pitch: 0.1 });
await bot('shot', { name: 'walker-deck' });
// Steer: a real Shard thrown at the right glyph pillar from the court's middle.
const y0 = await js(W + 'return w.yaw');
await js('g.elements.select("stone"); g.combat.focus = 100; return 1;');
await js(W + 'const o=[0,0,0]; w.toWorld(0,0.05,-1,o); g.controller.teleport(o[0], o[2], o[1]); g.walkerDeck.riding = true; return 1;');
await sleep(400);
await js(W + 'const o=[0,0,0]; w.toWorld(7.5,0,-1,o); const p=g.controller.pos; g.arm.yaw=Math.atan2(o[0]-p.x, o[2]-p.z); return 1;');
await bot('press', { key: 'Bend' });
await sleep(1500);
log('steered: mode', await js(W + 'return w.mode'), 'target-yaw change', +(await js(W + 'return w.targetYaw')) - y0);
await sleep(8000);
log('turned by', +(await js(W + 'return w.yaw')) - y0, 'riding', await js('return g.walkerDeck.riding'));
log('perf', JSON.stringify((await bot('perf', { frames: 120 })).perf || (await bot('state')).perf));
