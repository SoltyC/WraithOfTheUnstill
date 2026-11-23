#!/usr/bin/env node
// Ride The Melt (docs/direction.md M4): from its head at the frost Warden's tarn, surf held and forward held, steering only by
// facing the next point now and then (as a player would), until it reaches the foot of the manor hill. Logs progress along the
// line, distance off it, speed and whether the current has hold, every second.   tools/bot/play.sh p5-warden-afternoon "^&lines=1"
import { bot, js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ID = process.argv[2] || 'melt';
const L = await js(`return g.releaseLines.lines.find((l)=>l.id==='${ID}').pts`);
const near = (x, z) => { let b = 0, bd = 1e9; L.forEach((p, k) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; b = k; } }); return [b, bd]; };
await bot('teleport', { x: L[2][0], z: L[2][1] }); await sleep(5000);
await bot('face', { x: L[4][0], z: L[4][1] }); await sleep(1200); await bot('face', { x: L[5][0], z: L[5][1] }); await sleep(300);
// Pointed down the line (the bot's facing does not always take before the surf starts).
await js(`const L=g.releaseLines.lines.find((l)=>l.id==='${ID}').pts,a=Math.atan2(L[5][0]-L[2][0],L[5][1]-L[2][1]);g.controller.yaw=a;g.arm.yaw=a;g.controller.surf.heading=a;return 1`);
await js("window.__wraith.inject('MoveForward',true);window.__wraith.inject('Traverse',true);return 1");
const t0 = Date.now(); let last = null, done = false;
for (let s = 0; s < 400; s++) {
  await sleep(1000);
  const st = await js('const c=g.controller,s=c.surf;return {x:c.pos.x,z:c.pos.z,y:c.pos.y,sp:Math.hypot(c.vel.x,c.vel.z),surf:s.active,cur:s.curA,ok:c.grounded,swim:c.swimming,skim:c.skimming}');
  const [k, off] = near(st.x, st.z);
  // No steering: the channel carries the rider (only a nudge back if it has lost the stream entirely).
  if (off > 25) { const a = L[Math.min(L.length - 1, k + 3)]; await bot('face', { x: a[0], z: a[1] }); }
  if (s % 5 === 0 || k >= L.length - 2) console.log(`${s}s pt ${k}/${L.length - 1} off ${off.toFixed(1)} m speed ${st.sp.toFixed(1)} surf ${st.surf} current ${st.cur.toFixed(1)}${st.skim ? ' SKIM' : ''}${st.swim ? ' SWIM' : ''}`);
  if (process.env.SHOTS && s % 12 === 3) await bot('shot', { name: `melt-ride-${s}` });
  if (k >= L.length - 2) { done = true; break; }
  last = st;
}
await js("window.__wraith.inject('MoveForward',false);window.__wraith.inject('Traverse',false);return 1");
console.log(done ? `ARRIVED in ${Math.round((Date.now() - t0) / 1000)} s` : 'DID NOT ARRIVE');
