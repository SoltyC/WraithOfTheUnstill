// Bot: walk the stair from its foot to the manor (route `manor-stair`), timing it and noting stalls.
import { bot, js } from './client.mjs';
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const pts = await js(`const r=(g.routes||[]).find(r=>r.id==='manor-stair');return r?r.points.map(p=>[p[0],p[1]]):null`);
if (!pts) { console.log('no stair route'); process.exit(1); }
console.log('route points', pts.length);
let s = await bot('walkTo', { x: pts[0][0], z: pts[0][1], arrive: 2, timeout: 90, roads: true });
console.log(T(), 'at the foot:', JSON.stringify(s.walk), 'pos', s.pos);
const climbStart = Date.now();
let stuck = 0;
for (let i = 1; i < pts.length; i++) {
  const q = pts[i]; const pr = pts[i - 1];
  if (i < pts.length - 1 && Math.hypot(q[0] - pr[0], q[1] - pr[1]) < 3) continue;
  s = await bot('walkTo', { x: q[0], z: q[1], arrive: 1.8, timeout: 20 });
  if (!s.walk.arrived) { stuck++; console.log(T(), 'stalled at point', i, JSON.stringify(s.walk), 'y', s.pos[1]); }
  if (i % 25 === 0) console.log(T(), 'point', i, '/', pts.length, 'y', s.pos[1], 'fps', s.perf && s.perf.fps);
  for (const l of s.log || []) if (!/BARK/.test(l)) console.log('   |', l);
}
console.log(T(), 'top: climb took', ((Date.now() - climbStart) / 1000).toFixed(0), 's; stalls', stuck, 'pos', s.pos, 'quests', JSON.stringify(s.quests));
await bot('shot', { name: 'c01-top' });
