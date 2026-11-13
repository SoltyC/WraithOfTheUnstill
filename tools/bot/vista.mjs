#!/usr/bin/env node
// Eye-level vistas for the meadow overhaul (docs/meadow-overhaul.md): the camera at (x, z), h m above
// the ground, looking along each yaw, at a fixed hour; one shot per yaw.
//   tools/bot/play.sh "" ""   then   node tools/bot/vista.mjs <tag> <x> <z> [h=3] [hour=12.5] [yaws=0,90,180,270] [pitch=0.04]
import { bot, js } from './client.mjs';
const [tag = 'v', x = '0', z = '0', h = '3', hour = '12.5', yaws = '0,90,180,270', pitch = '0.04'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await bot('teleport', { x: +x, z: +z }); await sleep(4000);
await js(`g.params.v.timeOfDay=${+hour};g.params.version++;g.game.setPlayerVisible(false);return 1`);
for (const yd of yaws.split(',').map(Number)) {
  const yaw = yd * Math.PI / 180;
  await js(`g.ground.qx=${+x};g.ground.qz=${+z};g.ground.sample();const y=g.ground.h+${+h};g.arm.setPose(${+x},y,${+z},${yaw},${-pitch},0.9);return 1`);
  await sleep(5000);
  await bot('shot', { name: `vista-${tag}-${yd}` });
}
console.log('done');
