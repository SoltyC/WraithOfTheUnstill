#!/usr/bin/env node
// The realism plan's fixed look-dev set (docs/realism-plan.md): the same cameras and hours before and
// after each phase. One shot each, named look-<tag>-<name>.
//   tools/bot/play.sh "" ""   then   node tools/bot/look-set.mjs <tag> [only=name,name] [restored]
// (restored: the meadow in its restored state, full colour; the default is the game's start, stilled)
import { bot, js } from './client.mjs';
const [tag = 'x', only = '', state = ''] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// name, x, z, height above ground, hour, yaw (deg), pitch (+ looks up)
const SET = [
  ['meadow', -250, -450, 2, 12.5, 215, 0.03],
  ['meadow-e', -250, -450, 2, 12.5, 90, 0.03],
  ['rocks', -250, -450, 2, 12.5, 235, 0.0],
  ['near', -380, -470, 1.7, 12.5, 200, -0.25],
  ['golden', -250, -450, 2, 17.6, 235, 0.04],
  ['golden-back', -250, -450, 2, 17.6, 80, 0.04],
  ['scree', -390, -481, 2, 12.5, 229, -0.25],
  ['scarp', -400, -540, 6, 12.5, 323, -0.25],
  // The lake (realism plan W): its shore, grazing across it, down into the shallows, into the sun.
  ['lake-shore', -243, -443, 1.6, 13, 45, -0.25],
  ['lake-graze', -243, -443, 0.7, 13, 60, 0.0],
  ['lake-down', -236, -436, 4, 13, 45, -0.9],
  ['lake-sun', -243, -443, 1.6, 8.2, 80, -0.02],
  ['lake-golden', -243, -443, 1.6, 17.6, 60, 0.0],
];
await bot('teleport', { x: -250, z: -450 }); await sleep(5000);
await js(`g.game.setPlayerVisible(false);g.ws.weatherOverride='clear';g.ws.restoration.meadow='${state === 'restored' ? 'restored' : 'stilled'}';if(g.restoration)g.restoration.snap=true;return 1`);
for (const [name, x, z, h, hour, yd, pitch] of SET) {
  if (only && !only.split(',').includes(name)) continue;
  const hourChanged = await js(`const c=g.params.v.timeOfDay!==${hour};g.params.v.timeOfDay=${hour};g.params.version++;return c`);
  const yaw = yd * Math.PI / 180;
  // The ground query answers a frame late and the exposure adapts: pose, settle, pose again.
  for (let k = 0; k < 2; k++) {
    await js(`g.ground.qx=${x};g.ground.qz=${z};g.ground.sample();const lv=g.water.levelAt(${x},${z});const y=Math.max(g.ground.h,lv>-1e3?lv:-1e9)+${h};g.arm.setPose(${x},y,${z},${yaw},${-pitch},0.9);return 1`);
    await sleep(k ? 6000 : (hourChanged ? 10000 : 3000));
  }
  await bot('shot', { name: `look-${tag}-${name}` });
}
console.log('done');
