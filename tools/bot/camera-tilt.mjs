#!/usr/bin/env node
// The horizon after F: a real Heavy, the shake left to end, the camera turned 90° (where a stale up vector leans the
// view by the pitch), a second Heavy. Every reading should be 0°.
//   tools/bot/play.sh "" "^&gale=1^&stone=1"   then   node tools/bot/camera-tilt.mjs
import { bot, js } from './client.mjs';

await bot('teleport', { x: 1900, z: 900 });
for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 300)); if (await js('return g.game.worldSettled()&&g.controller.grounded')) break; }
for (const pitch of [0.3, 0.6, 1.0]) console.log('pitch', pitch, JSON.stringify(await js(`const frame=()=>new Promise(r=>requestAnimationFrame(r));
  const a=g.arm,c=g.camera;const wait=async n=>{for(let i=0;i<n;i++)await frame()};const tilt=()=>{const m=c.computeWorldMatrix&&c.getViewMatrix(true).m;return +(Math.atan2(m[4],m[5])*57.3).toFixed(1)};
  const settle=async()=>{await wait(10);for(let i=0;i<300&&a.shake>=1e-5;i++)await frame();await wait(5)};const F=async()=>{g.combat.focus=100;w.inject('Heavy',true);await frame();await frame();w.inject('Heavy',false);};
  await settle();a.yaw=0;a.pitch=${pitch};await wait(5);const out={start:tilt()};
  await F();await settle();out.afterF=tilt();
  for(let i=0;i<40;i++){a.yaw+=Math.PI/80;await frame();}await wait(3);out.turned90=tilt();
  await F();await settle();out.secondF=tilt();a.yaw=0;a.pitch=0.28;return out;`)));
