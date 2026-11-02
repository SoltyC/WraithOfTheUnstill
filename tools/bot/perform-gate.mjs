#!/usr/bin/env node
// The gate's second stage (docs/phase-10/motion-gate.md): a clip that passed tools/motion/clipGate.mjs, on the real robe in the
// real game. Plays it in fixed steps and reads the cloth every frame, against the same robe standing idle, then again in real
// time for its cost. Writes a contact sheet for the third stage, the eye.
//   tools/bot/play.sh <spot>   then   node tools/bot/perform-gate.mjs <clip> [out name]
import { execFileSync } from 'node:child_process';
import { bot, js } from './client.mjs';

const [clip = 'knead1', name = `gate-${clip}`] = process.argv.slice(2);
const LIMITS = { nonFinite: 0, stretch: 0.005, addedMs: 1.0, late: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { await sleep(500); if (await js('return g.game.worldSettled&&g.game.worldSettled()&&g.controller.grounded')) break; }
await bot('release').catch(() => {});
// The yardstick below walks the Wraith away, so each clip needs a fresh page; a clip played in the water proves nothing.
if (await js('return !!g.controller.swimming||!g.controller.grounded')) { console.log('FAIL not standing on dry ground: restart with tools/bot/play.sh'); process.exit(1); }

// Per frame: bad numbers, the share of links stretched past 1.5× (normal play peaks at 1.35×; a stray link or two means nothing),
// the longest step of free cloth relative to the body.
const probe = `{const wr=g.wraithView.wraith,c=wr.cloth,s=w.__clip;const n=c.n,p=c.p;
if(!s.prev)s.prev=new Float64Array(p.length);
let bad=0,st=0,sp=0,all=0;for(let k=0;k<n*3;k++)if(!Number.isFinite(p[k]))bad++;
for(let k=0;k<c.c;k++){const a=c.ci[k*2]*3,b=c.ci[k*2+1]*3,d=Math.hypot(p[a]-p[b],p[a+1]-p[b+1],p[a+2]-p[b+2]),r=c.cr[k];if(r>0.01){all++;if(d/r>1.5)st++}}st/=all||1;
const B=wr.body,mx=B.px-(s.bx??B.px),my=B.py-(s.by??B.py),mz=B.pz-(s.bz??B.pz);s.bx=B.px;s.by=B.py;s.bz=B.pz;if(i>0)for(let k=0;k<n;k++){if(c.w[k]===0)continue;const q=k*3,d=Math.hypot(p[q]-s.prev[q]-mx,p[q+1]-s.prev[q+1]-my,p[q+2]-s.prev[q+2]-mz);if(d>sp)sp=d}
s.prev.set(p);const f=s.frames;if(i>=0){f.push([bad,st,sp*100])}}`;
const measure = async (label, seconds, film, extra = '') => {
  await js('window.__wraith.__clip={frames:[]};window.__wraith.__left=0;return 1');
  const a = 1.2 + 0.85;
  const r = await bot('film', { name: `${name}-${label}`, dir: 'kimodo', seconds, fps: 30, warm: 45, size: film ? [960, 960] : [320, 320], quality: film ? 0.92 : 0.5,
    js: `if(w.__pending&&i===-1){g.wraithView.wraith.performance=w.__pending;w.__pending=null}${extra}const b=g.wraithView.wraith.body,p={x:b.px,y:g.controller.pos.y,z:b.pz},a=${a};cam.at(p.x+Math.sin(a)*2.4,p.y+1.25,p.z+Math.cos(a)*2.4,p.x+Math.sin(1.2)*0.25,p.y+1.0,p.z+Math.cos(1.2)*0.25,0.6);${probe}` }, 400000);
  const f = await js('return window.__wraith.__clip.frames');
  const worst = (k) => Math.max(...f.map((x) => x[k]));
  const peak = f.reduce((b, x, i) => (x[2] > f[b][2] ? i : b), 0);
  return { dir: r.dir, frames: f.length, peakAt: +(peak / 30).toFixed(2), nonFinite: worst(0), stretch: +worst(1).toFixed(4), stepCm: +worst(2).toFixed(1) };
};
const hold = (on) => js(`const wr=g.wraithView.wraith,c=g.controller;c.hold=${on};c.yaw=1.2;if(wr.performance)wr.performance.yaw=1.2;return 1`);

await hold(true);
const idle = await measure('idle', 4, false);
// The whole of it: in from the pose it stood in, the clip, and out to the gait.
const started = await bot('perform', { name: clip, loop: false, wait: true });
await hold(true);
const seconds = (started.frames - 1) / 30;
const live = await measure('play', seconds + 1.5, true, `const P=g.wraithView.wraith.performance;if(t>${seconds - 0.9}&&P&&!w.__left){w.__left=1;P.leave();const b=g.wraithView.wraith.body;g.controller.pos.x=b.px;g.controller.pos.z=b.pz}`);

// The yardstick: the same robe in an ordinary walk and run.
await hold(false);
await js("g.controller.hold=false;window.__wraith.inject('MoveForward',true);return 1");
const walked = await measure('walked', 3, false);
await js("window.__wraith.inject('Sprint',true);return 1").catch(() => {});
const ran = await measure('ran', 3, false);
await js("window.__wraith.inject('Sprint',false);window.__wraith.inject('MoveForward',false);return 1").catch(() => {});
await sleep(1500);
console.log(`yardstick: walk ${walked.stepCm} cm (${walked.stretch}), run ${ran.stepCm} cm (${ran.stretch})`);
// The real-time cost: the same clip looped, frame times against idle.
const realtime = async (on) => {
  if (on) await bot('perform', { name: clip, loop: true });
  await sleep(2000);
  const a = await js('return new Promise(r=>{const o=[];let l=performance.now(),n=0;const f=()=>{const t=performance.now();o.push(t-l);l=t;if(++n<180)requestAnimationFrame(f);else{o.sort((x,y)=>x-y);r({ms:o[90],late:window.__wraith.gpuStats.late.length})}};requestAnimationFrame(f)})');
  if (on) await bot('perform', {});
  return a;
};
const still = await realtime(false), playing = await realtime(true);
const addedMs = +(playing.ms - still.ms).toFixed(2);

const checks = [
  ['cloth numbers', live.nonFinite, LIMITS.nonFinite, live.nonFinite <= LIMITS.nonFinite],
  ['cloth links overstretched', live.stretch, `${LIMITS.stretch} (idle ${idle.stretch})`, live.stretch <= LIMITS.stretch],
  ['cloth step, cm per frame', live.stepCm, `${ran.stepCm}, a run (walk ${walked.stepCm}, idle ${idle.stepCm})`, live.stepCm <= ran.stepCm],
  ['added frame ms', addedMs, LIMITS.addedMs, addedMs <= LIMITS.addedMs],
  ['late pipelines', playing.late - still.late, LIMITS.late, playing.late - still.late <= LIMITS.late],
];
console.log(`clip's fastest cloth at ${live.peakAt} s of ${(seconds + 1.5).toFixed(1)}`);
for (const [id, v, l, ok] of checks) console.log(`${ok ? ' ok ' : 'FAIL'} ${id.padEnd(26)} ${String(v).padStart(8)}  (limit ${l})`);

// The sheet for the eye: twelve frames across the clip.
const win = (p) => execFileSync('wslpath', ['-w', p]).toString().trim();
try {
  const cols = 4, rows = 3, step = Math.max(1, Math.floor(live.frames / (cols * rows)));
  execFileSync('/mnt/c/ffmpeg/bin/ffmpeg.exe', ['-v', 'error', '-y', '-framerate', '30', '-i', win(`${live.dir}/f%06d.jpg`), '-vf', `select='not(mod(n\\,${step}))',scale=400:-1,tile=${cols}x${rows}`, '-frames:v', '1', '-vsync', '0', win(`screenshots/kimodo/${name}-sheet.png`)]);
  console.log('sheet', `screenshots/kimodo/${name}-sheet.png`);
} catch (e) { console.log('no sheet:', String(e.message).split('\n')[0]); }
const ok = checks.every((c) => c[3]);
console.log(ok ? `PASS ${clip}` : `FAIL ${clip}`);
process.exit(ok ? 0 : 1);
