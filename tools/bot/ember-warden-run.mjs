#!/usr/bin/env node
// The Ember Warden's fight, played by the bot (docs/phase-11/ember-warden.md): woken by the eruption with the Wraith on
// the bench; each blow dodged (a stride aside while the fist is up); each resting fist frozen twice in its dark beat
// (Frost's verdict through fight.freeze, as a Crystallize on it); then up a bound arm on foot, and the fire given back.
//   node tools/bot/ember-warden-run.mjs; tools/bot/play.sh stop
import { execSync } from 'node:child_process';
import { bot, js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
execSync(`tools/bot/play.sh e1-crater`, { stdio: 'inherit' }); await sleep(10000);
await js(`g.params.v.timeOfDay=15;g.params.version++;const F=g.chapter.graph.flags;F.add('ember:warned');F.add('ember:scene-played');g.chapter.graph.vars['ember:erupt-t']=60;g.chapter.graph.vars['ember:day']=4;
  w._ev=[];const EW=g.emberWarden;const c=EW.fight.clear.bind(EW.fight);EW.fight.clear=()=>{for(const e of EW.fight.events)w._ev.push(e.e+(e.hit!==undefined?(e.hit?'!':'·'):'')+(e.arm!==undefined?e.arm:''));c()};return 1`);
const t0 = Date.now(); let side = 1, phase = 0;
while (Date.now() - t0 < 240000) {
  const s = await js(`const F=g.emberWarden.fight;return {ph:F.phase,a:F.arms.map(a=>[a.state,+a.heat.toFixed(2)]),hp:Math.round(g.combat.health),dying:g.combat.dying>0}`);
  if (s.ph !== phase) { console.log('phase', s.ph, 't', Math.round((Date.now() - t0) / 1000)); phase = s.ph; }
  if (s.ph === 3 || s.ph === 4) break;
  // Dodge: a fist up (RAISE) — step 22 m along the bench's line, back and forth.
  // (Two places on the bench 15 m apart: the ledge and a stride round the pit from it.)
  if (s.a.some((a) => a[0] === 1)) { const an = -2.36 + (side > 0 ? 0.15 : 0); await js(`const p=g.controller.pos;p.x=2350+Math.cos(${an})*104;p.z=-2150+Math.sin(${an})*104;p.y=747;g.controller.vel.y=0;return 1`); side = -side; await sleep(2200); }
  // Freeze a resting fist in the dark beat.
  for (let i = 0; i < 2; i++) if (s.a[i][0] === 3 && s.a[i][1] < 0.34) console.log('  freeze', i, await js(`return g.emberWarden.fight.freeze(${i})`));
  await sleep(250);
}
console.log('events', (await js(`return w._ev.join(' ')`)));
console.log('after', JSON.stringify(await js(`const F=g.emberWarden.fight;return {ph:F.phase,flags:[...g.chapter.graph.flags].filter(f=>f.includes('warden')),lake:+g.volcano.level.toFixed(1),hp:Math.round(g.combat.health)}`)));
// Up the bound right arm on foot: from beside its fist toward its shoulder.
const B = await js(`const b=g.emberWarden.titan.bones,A=(v)=>Array.from(v);return {H:A(b.H[1]),W:A(b.W[1]),E:A(b.E[1]),S:A(b.S[1]),P3:A(b.P[3])}`);
console.log('arm', JSON.stringify(B, (k, v) => typeof v === 'number' ? Math.round(v) : v));
await js(`g.controller.pos.x=${B.W[0]};g.controller.pos.z=${B.W[2]};g.controller.pos.y=${B.W[1]}+8;g.controller.vel.y=0;return 1`); await sleep(1500);
console.log('on the wrist', JSON.stringify(await js(`const p=g.controller.pos;return [p.x,p.y,p.z].map(Math.round).concat([g.controller.deck?.riding])`)));
// (Along the bone's line, a few metres a step: the arm's top is some 8 m across.)
for (const [nm, A, P] of [['elbow', B.W, B.E], ['shoulder', B.E, B.S], ['neck', B.S, B.P3]]) {
  for (let u = 0.2; u <= 1.001; u += 0.2) await bot('walkTo', { x: A[0] + (P[0] - A[0]) * u, z: A[2] + (P[2] - A[2]) * u, arrive: 1.2, timeout: 12 }).catch(() => {});
  console.log(nm, JSON.stringify(await js(`const p=g.controller.pos;return [p.x,p.y,p.z].map(Math.round).concat([g.controller.deck?.riding])`)), 'target', P.map(Math.round));
}
console.log('heart', JSON.stringify(await js(`const h=g.interactables.find(t=>t.id==='ember-warden-heart'),p=g.controller.pos;return {hidden:h.hidden,d:Math.round(Math.hypot(h.x-p.x,h.y-p.y,h.z-p.z))}`)));
await bot('press', { key: 'Interact' }); await sleep(1500);
console.log('released', JSON.stringify(await js(`return {ph:g.emberWarden.fight.phase,flags:[...g.chapter.graph.flags].filter(f=>f.includes('warden')||f==='ember:learned'),rate:g.eruption.rate,err:w.gpuStats.gpuErrors}`)));
