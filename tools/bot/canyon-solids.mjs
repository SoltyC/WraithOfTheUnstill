#!/usr/bin/env node
// The canyon's solids in the running game: the arm with and without F, lock-on with F, walking off a rim,
// the Needle end to end with the camera turning, and running at a hoodoo.
//   tools/bot/play.sh "" "^&gale=1^&stone=1"   then   node tools/bot/canyon-solids.mjs
import fs from 'node:fs';
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arrive = async (x, z) => { await bot('teleport', { x, z }); for (let i = 0; i < 40; i++) { await sleep(300); if (await js('return g.game.worldSettled()&&g.controller.grounded&&!!g.canyon.ready&&g.solids.walls.n>=0')) break; } await sleep(1200); };
const data = JSON.parse(fs.readFileSync('data/world/ravines.json', 'utf8'));
const FRAME = 'const frame=()=>new Promise(r=>requestAnimationFrame(r));const wait=async n=>{for(let i=0;i<n;i++)await frame()};';

// 1. The arm: running and jumping for the same time at the same place, with and without F.
for (const f of [false, true]) {
  await arrive(1900, 900);
  console.log('arm', f ? 'with F' : 'no F  ', JSON.stringify(await js(`${FRAME}const a=g.arm;a.yaw=0;a.pitch=0.28;g.elements.select('frost');g.combat.focus=100;
    w.inject('MoveForward',true);w.inject('Jump',true);let lo=99,at=0;for(let i=0;i<150;i++){await frame();if(${f}&&(i===40||i===90)){w.inject('Heavy',true);await frame();await frame();w.inject('Heavy',false);}if(a.armLen<lo){lo=a.armLen;at=i;}}
    w.inject('MoveForward',false);w.inject('Jump',false);return {lowest:+lo.toFixed(2),frame:at};`)));
}
// 2. Lock-on, real key, enemies waiting.
await arrive(1900, 900);
console.log('lock', JSON.stringify(await js(`${FRAME}const a=g.arm,p=g.controller.pos,inp=g.input;g.elements.select('frost');g.combat.focus=100;
  const ids=[0,1,2].map(k=>g.shaped.spawn('hound',p.x+Math.sin(a.yaw+3.14+k*0.4)*9,p.z+Math.cos(a.yaw+3.14+k*0.4)*9));await wait(170);
  const live=ids.filter(i=>i>=0&&g.shaped.isLive(i)).length;const y0=a.yaw;
  w.inject('LockOn',true);await frame();await frame();w.inject('LockOn',false);await wait(60);
  const lock=g.combat.lock,turned=+(a.yaw-y0).toFixed(2);const y1=a.yaw;for(let i=0;i<30;i++){inp.mouseDX+=10;await frame();}
  const held=+((a.yaw-y1)/(30*10*0.0022)).toFixed(2);w.inject('Heavy',true);await frame();await frame();w.inject('Heavy',false);await wait(20);
  const afterF=g.combat.lock;for(let i=0;i<8;i++)if(g.shaped.isLive(i))g.shaped.damage(i,1e6,true,0,0);g.combat.lock=-1;return {ids,live,lock,turned,mouseShare:held,afterF};`)));
// 3. Off a rim: the tallest long Galleries wall, from behind its cap out over the lip.
const wall = data.walls.filter((w) => w.pts.length > 60 && w.pts[30][4] - w.iso > 8).sort((a, b) => (b.pts[30][4] - b.iso) - (a.pts[30][4] - a.iso))[0];
for (const k of [20, 30, 40]) {
  const q = wall.pts[Math.min(k, wall.pts.length - 1)], [x, z, nx, nz, top, depth] = q;
  const sx = x - nx * (depth + 9), sz = z - nz * (depth + 9);
  await arrive(sx, sz);
  const r = await js(`${FRAME}const c=g.controller,a=g.arm;a.yaw=Math.atan2(${nx},${nz});a.pitch=0.5;w.inject('MoveForward',true);const L=[];let last=null,jump=0;
    for(let i=0;i<240;i++){await frame();const p=c.pos,d=(p.x-${x})*${nx}+(p.z-${z})*${nz};g.ground.qx=p.x;g.ground.qz=p.z;g.ground.sample();
      if(last){const j=Math.hypot(p.x-last[0],p.z-last[1]);if(j>jump)jump=j;}last=[p.x,p.z];if(i%24===0)L.push([+d.toFixed(1),+p.y.toFixed(1),+g.ground.h.toFixed(1),c.grounded?1:0]);}
    w.inject('MoveForward',false);return {L,biggestStep:+jump.toFixed(2),cam:g.solids.walls.n};`);
  console.log('rim', k, 'top', top.toFixed(1), 'iso', wall.iso, JSON.stringify(r));
}
await bot('shot', { name: 'rim', dir: 'canyon-fix' });
// 4. The Needle: walked along the spine with the camera swung, the camera's own position tested against the rock.
const needle = data.spines.find((s) => s.kind === 'slot' && (s.name || s.id) === 'needle') || data.spines.find((s) => s.kind === 'slot');
let inside = 0, frames = 0, shortest = 99;
for (let k = 1; k + 1 < needle.pts.length; k++) {
  const p = needle.pts[k]; await arrive(p[0], p[1]);
  for (const zoom of [5.2, 12]) {
    const r = await js(`${FRAME}const a=g.arm,s=g.solids;a.zoomTarget=${zoom};let n=0,c=0,lo=99;for(let i=0;i<120;i++){a.yaw+=0.052;a.pitch=0.1+0.25*Math.sin(i*0.09);await frame();c++;const q=g.camera.position;s.px=q.x;s.py=q.y;s.pz=q.z;if(s.insideQ())n++;lo=Math.min(lo,a.armLen);}return {n,c,lo};`);
    inside += r.n; frames += r.c; shortest = Math.min(shortest, r.lo);
  }
  if (k === 3) await bot('shot', { name: 'needle', dir: 'canyon-fix' });
}
await js('g.arm.zoomTarget=5.2;return 1');
console.log('needle: camera in rock on', inside, 'of', frames, 'frames; shortest arm', shortest.toFixed(2));
// 5. Run at a hoodoo from each side: where the body stops, against the drawn width.
for (const h of data.hoodoos.slice(1, 3)) {
  const stops = [];
  for (const a of [0, 2.1, 4.2]) {
    await arrive(h[0] + Math.sin(a) * 10, h[1] + Math.cos(a) * 10);
    stops.push(await js(`${FRAME}const c=g.controller;g.arm.yaw=${a}+3.1416;w.inject('MoveForward',true);await wait(120);w.inject('MoveForward',false);return +Math.hypot(c.pos.x-${h[0]},c.pos.z-${h[1]}).toFixed(2);`));
  }
  console.log('hoodoo r', h[4], 'stopped at', stops.join(' '));
}
const h = data.hoodoos[1];
await js(`g.arm.setPose(${h[0] + 7},${h[2] + 4},${h[1]},-1.5708,0.1,1);return 1`); await sleep(1500);
await bot('shot', { name: 'hoodoo-seam', dir: 'canyon-fix' });
await js('g.arm.setFree(false);return 1');
