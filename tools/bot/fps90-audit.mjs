#!/usr/bin/env node
// The 90 fps audit (docs/direction.md M0, user 2026-11-22: a steady 90 fps on the RX 9070 at 1440p High):
// one page load on High, dynamic resolution off, then for each spot the presented frame time (what the
// player feels: p50/p95/max over 400 frames) and the median GPU frame (240 frames, w.gpuTimer).
// Writes docs/perf/fps90-audit.json.   node tools/bot/fps90-audit.mjs [spot,spot,...]
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { bot, js } from './client.mjs';

const SPOTS = (process.argv[2] || [
  'p2-frost-noon', 'p1-monastery-golden', 'p5-warden-afternoon',
  'p8-meadow-golden', 'p8-forest-shafts', 'p8-lake-golden', 'p8-hub-golden', 'p8-fire-night', 'p8-summit',
  'p9r-galleries-dawn', 'p9s1-star-mid', 'p9-storm-inside', 'p9-walker-walk',
  'u2-jetty', 'u2-ledge', 'ebbhold:hall', 'p1-volcano-dusk', 'p1-coast-noon',
].join(',')).split(',');
/** tp: spots — [x, z, look x, look z, pitch]. */
const TP = { 'chapel': [2160, -2335, 2215, -2320, 0.05], 'cinderhold': [1880, -2040, 1990, -2010, 0.05], 'sow-bethan': [958, -1700, 860, -1950, 0.05], 'volcano-rim': [2200, -2120, 2350, -2150, 0.2], 'sow-valley': [1000, -1640, 860, -1950, 0.15] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gpu = `const frame=()=>new Promise(r=>requestAnimationFrame(r));const t=w.gpuTimer;if(!t.supported)return null;for(let i=0;i<30;i++)await frame();
  const old=t.sampleEvery;t.sampleEvery=1;const s=t.count;t.setActive(true);for(let i=0;i<240;i++)await frame();t.setActive(false);
  await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<4;i++)await frame();t.sampleEvery=old;
  const a=[];for(let i=s;i<t.count;i++)a.push(t.ms[i%t.ms.length]);a.sort((p,q)=>p-q);if(!a.length)return null;
  return {gpu:+a[a.length>>1].toFixed(2), gpu95:+a[Math.floor(a.length*0.95)].toFixed(2)};`;

execSync(`tools/bot/play.sh "${SPOTS[0].includes(':') ? 'p8-meadow-golden' : SPOTS[0]}" "^&gfx=high${process.env.EXTRA || ""}"`, { stdio: 'inherit' });
await sleep(8000);
const out = { date: new Date().toISOString(), note: 'RX 9070, headless Windows Chrome (window 2560x1440), High preset, dynamic resolution off; presented = rAF intervals', target: '11.1 ms (90 fps)', spots: {} };
const info = await js(`return { w: innerWidth, h: innerHeight, scale: g.post.post.renderScale }`);
out.viewport = info;
for (const id of SPOTS) {
  if (id.startsWith('ebbhold:')) { await js(`g.ebbhold.enter('${id.split(':')[1]}'); return 1`); }
  // tp:<name>: a place with no capture spot — the Wraith teleported there, facing a point (TP below).
  // fire:<spot>: a spot with the mountain at its last stage (systems/emberClock.js), the plume at its biggest.
  else if (id.startsWith('fire:')) { await js(`g.chapter.graph.flags.add('ember:warned'); g.chapter.graph.vars['ember:day']=3; return 1`); await bot('spot', { id: id.slice(5) }); }
  // erupt:<tp>@<s>: the eruption (systems/eruption.js) at a place, s seconds in (its heaviest: the collapses, the dust).
  else if (id.startsWith('erupt:')) { const [place, at] = id.slice(6).split('@'), t = TP[place]; await js(`g.requestTeleport(${t[0]},${t[1]}); return 1`); await sleep(9000); await bot('face', { x: t[2], z: t[3], pitch: t[4] ?? 0 }); await js(`g.chapter.graph.flags.add('ember:warned'); g.chapter.graph.vars['ember:erupt-t']=${+at || 30}; g.chapter.graph.vars['ember:day']=4; return 1`); }
  else if (id.startsWith('tp:')) { const t = TP[id.slice(3)]; await js(`g.requestTeleport(${t[0]},${t[1]}); return 1`); await sleep(9000); await bot('face', { x: t[2], z: t[3], pitch: t[4] ?? 0 }); }
  else await bot('spot', { id });
  await sleep(id.startsWith('erupt:') ? 9000 : 7000);
  await js(`g.params.v.dynamicRes=0; g.params.version++; return 1`);
  await sleep(1500);
  const p = await bot('perf', { frames: 400 });
  const m = await js(gpu);
  const err = await js(`return w.gpuStats.gpuErrors`);
  const r = { p50: p.p50, p95: p.p95, max: p.max, fps: p.fps, ...(m || {}), scale: p.renderScale, err, ok: p.p95 <= 11.1 };
  out.spots[id] = r;
  console.log(id.padEnd(22), JSON.stringify(r));
}
fs.mkdirSync('docs/perf', { recursive: true });
fs.writeFileSync('docs/perf/fps90-audit.json', JSON.stringify(out, null, 1));
execSync('tools/bot/play.sh stop');
