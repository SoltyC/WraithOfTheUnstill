#!/usr/bin/env node
// The costume gate (docs/people-and-cutscenes.md §1.3): one costumed villager judged by the user in six shots — a turntable at
// 1 m, walking, working, in wind, at night by firelight, at 20 m. Needs the page opened with the figure:
//   tools/bot/play.sh p8-meadow-golden "^&costume=sow"   then   node tools/bot/costume-gate.mjs [shot,shot…] [tag]
//   (the night shot wants its own page: tools/bot/play.sh p8-fire-night "^&costume=sow", then the shot 'night')
// Frames go to screenshots/costume/frames/<tag>-<shot>/; encode with tools/bot/costume-encode.sh <tag>.
import { bot, js } from './client.mjs';

const shots = (process.argv[2] || 'still').split(',').flatMap((s) => (s === 'still' ? [0, 1, 2, 3, 4].map((k) => 'still' + k) : [s]));
const tag = process.argv[3] || 'sow';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { await sleep(500); if (await js('return !!g.costumeGate&&g.game.worldSettled&&g.game.worldSettled()')) break; }
await bot('release').catch(() => {});

// Stage: the figure on open ground a few metres ahead of the Wraith, facing back across it; the Wraith hidden while filming.
// Open ground: the point near the Wraith farthest from any building (its footprint), and the bearing along which there is most room.
await js(`const n=g.costumeGate,c=g.controller,p=c.pos,S=g.archSites.filter(s=>!s.prop);
  const clear=(x,z)=>{let m=1e9;for(const s of S){const d=Math.hypot(s.at[0]-x,s.at[1]-z)-(s.box?s.box*1.45:s.footprint||4);if(d<m)m=d}return m};
  let best=null;for(let r=0;r<=70;r+=5)for(let k=0;k<24;k++){const a=k/24*6.283,x=p.x+Math.sin(a)*r,z=p.z+Math.cos(a)*r;g.ground.qx=x;g.ground.qz=z;if(g.ground.covers&&!g.ground.covers())continue;g.ground.sample();if(Math.abs(g.ground.h-p.y)>3)continue;g.ground.qx=x+3;g.ground.qz=z;g.ground.sample();const h1=g.ground.h;g.ground.qx=x;g.ground.qz=z+3;g.ground.sample();if(Math.abs(h1-p.y)>3.5||Math.abs(g.ground.h-p.y)>3.5)continue;const m=clear(x,z);if(!best||m>best.m)best={x,z,m}}
  let ba=0,bm=-1;for(let k=0;k<16;k++){const a=k/16*6.283;let m=1e9;for(let d=0;d<=14;d+=2)m=Math.min(m,clear(best.x+Math.sin(a)*d,best.z+Math.cos(a)*d));if(m>bm){bm=m;ba=a}}
  w.__stage={x:best.x-Math.sin(ba)*4,z:best.z-Math.cos(ba)*4,a:ba,room:best.m};
  w.__restage=()=>{const S2=w.__stage;g.npcApi.put(n,S2.x,S2.z);n.yaw=S2.a;n.noLook=true;n.brain=(m)=>{m.vx=0;m.vz=0}};w.__restage();
  c.hold=true;return w.__stage`).then((r) => console.log('stage', JSON.stringify(r)));
// Night: stand her near a burning house instead (the fire-night page), between it and the Wraith, lit by it.
if (shots.includes('night')) console.log('fire stage', JSON.stringify(await js(`const vf=g.villageFire,c=g.controller,p=c.pos,P=new Map(g.village.plots.map(q=>[q.id,q]));
  let best=null;for(const id of g.meadowFire.fireIds){if(vf.isBurning&&!vf.isBurning(id))continue;const q=P.get(id).at,d=Math.hypot(q[0]-p.x,q[1]-p.z);if(!best||d<best.d)best={q,d}}
  const q=best.q,dx=p.x-q[0],dz=p.z-q[1],l=Math.hypot(dx,dz)||1,x=q[0]+dx/l*9,z=q[1]+dz/l*9;
  w.__stage={x,z,a:Math.atan2(-dx,-dz),fire:q};w.__restage();return w.__stage`)));
await sleep(2500);

const head = `const n=g.costumeGate,y=n.y;g.wraithView.setEnabled(false);if(i===-(w.__warm||40))w.__restage();`;
const SHOTS = {
  // A few still angles (front, three-quarter, side, back, above) at 1.2 m: the quick look.
  // Still angles (front, three-quarter, side, back, above), each its own short film so the exposure settles.
  ...Object.fromEntries([[0, 1.3, 1.45], [0.8, 1.3, 1.4], [1.57, 1.4, 1.3], [3.14, 1.4, 1.4], [0.4, 1.5, 2.2]].map(([da, r, h], k) => [`still${k}`,
    { seconds: 1 / 30, fps: 30, size: [1280, 1280], js: `${head}const a=n.yaw+${da};cam.at(n.x+Math.sin(a)*${r},y+${h},n.z+Math.cos(a)*${r},n.x,y+1.2,n.z,0.75);` }])),
  // Turntable: one slow turn round her at a metre and a bit, at head height, then lower.
  turntable: { seconds: 10, fps: 30, size: [1280, 1280], js: `${head}const a=n.yaw+t*0.6283,r=1.15,h=1.45-0.25*Math.sin(t*0.6283*0.5);cam.at(n.x+Math.sin(a)*r,y+h,n.z+Math.cos(a)*r,n.x,y+1.15,n.z,0.8);` },
  // Walking: she walks along a line, the camera alongside at three metres, then lets her pass.
  walking: { seconds: 8, fps: 30, size: [1600, 900], warm: 20, js: `${head}const S=w.__stage;if(i===-19){n.brain=(m,dt)=>{const sp=1.05;m.vx=Math.sin(S.a)*sp;m.vz=Math.cos(S.a)*sp;m.x+=m.vx*dt;m.z+=m.vz*dt;m.yaw=S.a}}
    const fx=Math.sin(S.a),fz=Math.cos(S.a),rx=fz,rz=-fx,lead=Math.max(0,t-5)*-0.9;cam.at(n.x+rx*3+fx*(1.2+lead),y+1.5,n.z+rz*3+fz*(1.2+lead),n.x+fx*0.3,y+1.05,n.z+fz*0.3,0.6);` },
  // In wind: a strong steady wind across her, a three-quarter view.
  wind: { seconds: 6, fps: 30, size: [1600, 900], js: `${head}if(i<0){n.brain=(m)=>{m.vx=0;m.vz=0}}g.params.v.windStrength=2.4;g.params.version++;const a=n.yaw+0.7;cam.at(n.x+Math.sin(a)*2.2,y+1.5,n.z+Math.cos(a)*2.2,n.x,y+1.05,n.z,0.6);` },
  // At 20 m: as she would be seen across a village street.
  far: { seconds: 4, fps: 30, size: [1600, 900], js: `${head}const a=n.yaw+0.5;cam.at(n.x+Math.sin(a)*20,y+1.7,n.z+Math.cos(a)*20,n.x,y+1.0,n.z,0.35);` },
  // Night by firelight (the fire-night page): she stands lit by the burning houses, the camera close at three-quarters.
  night: { seconds: 6, fps: 30, size: [1600, 900], js: `${head}const a=n.yaw+0.45+t*0.05;cam.at(n.x+Math.sin(a)*2.0,y+1.5,n.z+Math.cos(a)*2.0,n.x,y+1.1,n.z,0.6);` },
};
for (const s of shots) {
  const S = SHOTS[s]; if (!S) { console.log('unknown shot', s); continue; }
  await js(`w.__warm=${S.warm ?? 40};return 1`);
  const r = await bot('film', { name: `${tag}-${s}`, dir: 'costume', seconds: S.seconds, fps: S.fps, warm: S.warm ?? 40, size: S.size, quality: 0.93, js: S.js }, 600000);
  console.log(s, JSON.stringify(r));
}
console.log('gpuErrors', await js('return w.gpuStats.gpuErrors'));
