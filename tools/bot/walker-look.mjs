#!/usr/bin/env node
// The Long Walker's look: walking and kneeling, near and far, from free cameras.
//   tools/bot/play.sh "p9-walker-walk" "^&walker=walk"   then   node tools/bot/walker-look.mjs [tag]
import { bot, js } from './client.mjs';

const tag = process.argv[2] || 'a';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await js(`g.params.v.timeOfDay=16.5;g.params.version++;g.game.setPlayerVisible(false);return 1`);
await sleep(6000);
const shot = async (name, off, up, look) => {
  await js(`const w=g.walker,c=Math.cos(w.yaw),s=Math.sin(w.yaw),H=(x,z)=>{g.ground.qx=x;g.ground.qz=z;g.ground.sample();return g.ground.h;};
    const x=w.x+s*(${off[1]})+c*(${off[0]}),z=w.z+c*(${off[1]})-s*(${off[0]}),y=H(x,z)+${up},tx=w.x,ty=w.y+(${look}),tz=w.z,dx=tx-x,dy=ty-y,dz=tz-z;
    g.arm.setPose(x,y,z,Math.atan2(dx,dz),Math.atan2(-dy,Math.hypot(dx,dz)),0.9);return 1`);
  await sleep(1500); await bot('shot', { name: `walker-${tag}-${name}` });
};
await shot('side', [70, 12], 8, -6); await shot('front', [14, 62], 5, -4); await shot('low', [34, -14], 1.7, -12);
await shot('far', [190, 60], 16, -8);
