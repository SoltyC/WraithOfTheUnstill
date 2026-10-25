// Bot: play the burning night from the arrival in Hearn (tools/bot/to-village.sh first): rescue Ebb,
// then put every fire out with the Ribbon, house by house, as a player would. Prints a running log
// of what happened and what got in the way.
import { bot, js } from './client.mjs';
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const say = (...a) => console.log(T(), ...a);
const logState = (s) => { for (const l of s.log || []) if (!/BARK/.test(l)) say('  |', l); };
const burning = () => js(`const v=g.villageFire,p=g.controller.pos,o=[];for(let i=0;i<v.N;i++){const s=v.state[i];if(s!==1&&s!==2&&s!==3)continue;o.push({id:v.ids[i],st:s,heat:+v.heat[i].toFixed(2),d:+Math.hypot(v.x(i)-p.x,v.z(i)-p.z).toFixed(1),x:v.x(i),z:v.z(i),r:v.radius(i)})}return o.sort((a,b)=>a.d-b.d)`);

// 1. Ebb.
let s = await bot('state', { full: true }); logState(s);
const ebb = await js(`const n=g.npcs.find(q=>q.id==='meadow-ebb');return {x:n.x,z:n.z}`);
say('Ebb at', ebb.x.toFixed(1), ebb.z.toFixed(1));
s = await bot('walkTo', { x: ebb.x, z: ebb.z, arrive: 1.2, timeout: 40 }); say('walk to Ebb:', JSON.stringify(s.walk), 'health', s.health); logState(s);
s = await bot('wait', { ms: 2500 }); logState(s);
s = await bot('press', { key: 'Interact' }); s = await bot('wait', { ms: 4000 }); logState(s);
const marit = await js(`const n=g.npcs.find(q=>q.id==='meadow-marit');return {x:n.x,z:n.z}`);
// Lead him: walk to his mother in steps, looking back for him.
for (let k = 0; k < 12; k++) {
  const fl = await js(`return [...g.chapter.graph.flags].filter(f=>/ebb/.test(f))`);
  if (fl.includes('meadow:ebb-saved')) { say('Ebb saved'); break; }
  s = await bot('walkTo', { x: marit.x, z: marit.z, arrive: 2.5, timeout: 8 }); logState(s);
  const e = await js(`const n=g.npcs.find(q=>q.id==='meadow-ebb');const p=g.controller.pos;return {d:+Math.hypot(n.x-p.x,n.z-p.z).toFixed(1),flags:[...g.chapter.graph.flags].filter(f=>/ebb/.test(f))}`);
  say('  leading Ebb: he is', e.d, 'm behind; flags', e.flags.join(','));
  if (!e.flags.includes('meadow:ebb-follow')) { s = await bot('talkTo', { id: 'meadow-ebb' }); logState(s); }
  await bot('wait', { ms: 1500 });
}

// 2. The fires.
let rounds = 0, lastId = '', same = 0;
while (rounds++ < 80) {
  const list = await burning();
  if (!list.length) { say('no fires left'); break; }
  const f = list[0];
  if (f.id === lastId) same++; else { same = 0; lastId = f.id; }
  if (same > 6) { say('GIVING UP on', f.id, '(no progress)'); list.shift(); if (!list.length) break; }
  s = await bot('state');
  if (s.focus < 30) { say('  focus low (' + s.focus.toFixed(0) + '): waiting'); await bot('wait', { ms: 5000 }); }
  // Stand off the house on the side facing us, out of the heat.
  const p = s.pos, dx = p[0] - f.x, dz = p[2] - f.z, dl = Math.hypot(dx, dz) || 1, R = f.r + 5;
  const w = await bot('walkTo', { x: f.x + dx / dl * R, z: f.z + dz / dl * R, arrive: 1.5, timeout: 25, roads: true });
  if (!w.walk.arrived) say('  could not reach', f.id, JSON.stringify(w.walk));
  await bot('face', { x: f.x, z: f.z, pitch: 0.05 });
  const h = await bot('hold', { keys: ['Bend'], ms: 3000 });
  const after = (await burning()).find((q) => q.id === f.id);
  say(f.id.padEnd(5), 'heat', f.heat, '->', after ? after.heat : 'out', '| health', h.health.toFixed(0), 'focus', h.focus.toFixed(0), '| fps', h.perf && h.perf.fps, '| left', list.length - (after ? 0 : 1));
  logState(h);
}
s = await bot('state', { full: true });
say('END quests', JSON.stringify(s.quests), 'fire', JSON.stringify(s.fire), 'task', s.task);
logState(s);
