#!/usr/bin/env node
// What Heavy (F) does to the camera: real presses of each element's F at several places, the camera logged each frame.
//   tools/bot/play.sh "" "^&gale=1^&stone=1"   then   node tools/bot/camera-heavy.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PLACES = [['frost', 100, 1740], ['meadow', 300, 1000], ['erg', 1900, 900], ['camp', 1806, 772], ['canyon', 1490, 1060], ['hourglass', 1676, 470]];
for (const [name, x, z] of PLACES) {
  await bot('teleport', { x, z });
  for (let i = 0; i < 30; i++) { await sleep(400); if (await js('return g.game.worldSettled()&&g.controller.grounded')) break; }
  for (const el of ['frost', 'gale', 'stone']) {
    await js(`g.elements.select(${JSON.stringify(el)});g.combat.focus=100;return 1`); await sleep(300);
    const r = await js(`const frame=()=>new Promise(r=>requestAnimationFrame(r));const a=g.arm,c=g.camera,L=[];
      const snap=()=>({yaw:c.rotation.y,pitch:c.rotation.x,roll:c.rotation.z,fov:c.fov,len:a.armLen,x:c.position.x,y:c.position.y,z:c.position.z,py:g.controller.pos.y,free:a.free,hold:!!a.hold,frz:g.clock.dt});
      for(let i=0;i<20;i++){await frame();L.push(snap());}
      w.inject('Heavy',true);await frame();await frame();w.inject('Heavy',false);
      for(let i=0;i<150;i++){await frame();L.push(snap());}
      const b=L[10];let big={dyaw:0,dpitch:0,droll:0,dfov:0,dlen:0,dpos:0,dpy:0,step:0,zero:0,free:false};let p=L[0];
      for(const s of L){big.dyaw=Math.max(big.dyaw,Math.abs(s.yaw-b.yaw));big.dpitch=Math.max(big.dpitch,Math.abs(s.pitch-b.pitch));big.droll=Math.max(big.droll,Math.abs(s.roll-b.roll));big.dfov=Math.max(big.dfov,Math.abs(s.fov-b.fov));big.dlen=Math.max(big.dlen,Math.abs(s.len-b.len));big.dpos=Math.max(big.dpos,Math.hypot(s.x-b.x,s.y-b.y,s.z-b.z));big.dpy=Math.max(big.dpy,Math.abs(s.py-b.py));big.step=Math.max(big.step,Math.hypot(s.x-p.x,s.y-p.y,s.z-p.z));if(s.frz===0)big.zero++;if(s.free)big.free=true;p=s;}
      for(const k in big)if(typeof big[k]==='number')big[k]=+big[k].toFixed(3);return big;`);
    console.log(name.padEnd(10), el.padEnd(6), JSON.stringify(r));
  }
}
