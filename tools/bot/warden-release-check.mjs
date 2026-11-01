#!/usr/bin/env node
// Standing under the Warden as it is released: the Wraith is set clear, the drifts build over seconds, and it survives.
//   tools/bot/play.sh "p5-warden-golden" ""   then   node tools/bot/warden-release-check.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(4000);
const st = () => js(`const w=g.warden,b=w.body,p=g.controller.pos;let m=1e9;for(let i=0;i<b.sx.length;i++)m=Math.min(m,Math.hypot(p.x-b.sx[i],p.z-b.sz[i]));return {state:w.state,t:+w.t.toFixed(1),dist:+m.toFixed(1),bankN:w.bankN,drifts:w.drifts,knock:g.knock.active,y:+p.y.toFixed(1)}`);
console.log(await js(`const w=g.warden;return {active:w.active,state:w.state,x:w.body.x|0,z:w.body.z|0}`));
await js(`const w=g.warden,b=w.body;g.controller.teleport(b.sx[2]+1,b.sz[2]+1);return 1`); await sleep(1500);
console.log('under it', await st());
await js(`g.warden.damage?.(1e9);g.warden.hp=0;g.warden.state=4;g.warden.t=0;return 1`);
for (let i = 0; i < 12; i++) { await sleep(1000); console.log(JSON.stringify(await st())); if (i === 3) await bot('shot', { name: 'release-a' }); if (i === 8) await bot('shot', { name: 'release-b' }); }
