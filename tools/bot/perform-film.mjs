#!/usr/bin/env node
// A clip on the Wraith's robe, filmed in fixed steps (tools/motion, src/character/performance.js).
//   tools/bot/play.sh <spot>   then   node tools/bot/perform-film.mjs <clip> [seconds] [out name]
import { bot, js } from './client.mjs';

const [clip = 'knead1', seconds = 8, name = clip] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { await sleep(500); if (await js('return g.game.worldSettled&&g.game.worldSettled()&&g.controller.grounded')) break; }
await bot('release').catch(() => {});
console.log(JSON.stringify(await bot('perform', { name: clip, loop: false })));
const r = await js(`g.controller.yaw=${1.2};g.wraithView.wraith.performance.yaw=1.2;g.wraithView.wraith.performance.t=0;g.game.setPlayerVisible&&g.game.setPlayerVisible(true);return {x:g.controller.pos.x,y:g.controller.pos.y,z:g.controller.pos.z}`);
const a = 1.2 + 0.85;   // three-quarter view from the front
const f = await bot('film', { name, dir: 'kimodo', seconds: +seconds, fps: 60, warm: 40,
  js: `const p=g.controller.pos,a=${a};cam.at(p.x+Math.sin(a)*3.6,p.y+1.2,p.z+Math.cos(a)*3.6,p.x+Math.sin(1.2)*0.25,p.y+1.0,p.z+Math.cos(1.2)*0.25,0.6);if(i===-40&&g.wraithView.wraith.performance)g.wraithView.wraith.performance.t=0;` }, 400000);
console.log(JSON.stringify(f));
