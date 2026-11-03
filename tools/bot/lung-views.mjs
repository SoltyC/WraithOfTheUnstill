// Bot: review stills of the Sounding's descent (Phase 10 U2): the kelp from above, inside the canopy, the ledge and the column.
//   tools/bot/play.sh u2-ledge "^&lung=ledge" ; node tools/bot/lung-views.mjs [dir]
import { bot, js } from './client.mjs';
const dir = process.argv[2] || 'phase-10-u2-views';
const st = () => js(`const p=g.controller.pos;return {st:g.lung.stage,p:[p.x,p.y,p.z].map(v=>+v.toFixed(1)),kelp:g.kelp.shown,err:w.gpuStats.gpuErrors,late:w.gpuStats.late.length}`);
for (let k = 0; k < 40; k++) { const a = await st(); if (a.p[1] < -90) break; await bot('wait', { ms: 500 }); }
await bot('wait', { ms: 3000 });
console.log('at ledge', JSON.stringify(await st()));
await js('g.arm.pitch=0.05;return 1'); await bot('wait', { ms: 800 });
await bot('shot', { name: 'v1-ledge-column', dir, hud: false });
await js('g.arm.pitch=0.55;return 1'); await bot('wait', { ms: 800 });
await bot('shot', { name: 'v1b-ledge-vent', dir, hud: false });
await js('g.arm.yaw+=Math.PI*0.6;g.arm.pitch=-0.35;return 1'); await bot('wait', { ms: 800 });
await bot('shot', { name: 'v2-ledge-up', dir, hud: false });
// Hold the Wraith in place (god) at depths and look about.
for (const [y, n, pitch] of [[-70, 'v3-canopy', 0.1], [-62, 'v4-canopy-top', 0.6], [-35, 'v5-above-kelp', 0.9], [-92, 'v6-among-stipes', -0.2]]) {
  await js(`const c=g.controller;c.pos.x=-2700;c.pos.z=-1460;c.pos.y=${y};c.vel.x=c.vel.y=c.vel.z=0;g.arm.pitch=${pitch};g.arm.snap(c.pos);return 1`);
  for (let i = 0; i < 6; i++) { await js(`const c=g.controller;c.pos.y=${y};c.vel.y=0;g.lung.air=1;return 1`); await bot('wait', { ms: 250 }); }
  await bot('shot', { name: n, dir, hud: false });
  if (n === 'v3-canopy') console.log('perf in the canopy', JSON.stringify(await bot('perf', { frames: 240 })));
}
console.log('done', JSON.stringify(await st()));
