import fs from 'node:fs';
import {Wraith} from '../../src/character/wraith/wraith.js';
import {createWind} from '../../src/world/wind.js';
import {createSandstormFront} from '../../src/world/sandstormFront.js';
const reports=[];
for(const storm of [false,true]){
 const f=createSandstormFront();f.enabled=storm;f.target=1;f.snap=true;f.anchorX=2400;f.anchorZ=900;f.update();f.age=95;f.update();
 const wind=createWind(f);wind.stormWeight=1;wind.strength=1;wind.dirX=1;wind.dirZ=0;wind.gustiness=.545;
 const ground={qx:0,qz:0,h:0,sample(){this.h=0;}},w=new Wraith(ground);w.bx=0;w.by=0;w.bz=0;w.yaw=0;w.dt=1/60;
 const cloth=w.cloth,series=[];let nonFinite=0,maxStretch=0;
 for(let i=0;i<720;i++){
  wind.time=i/60;wind.update();wind.sx=2400;wind.sz=900;wind.sample();w.windX=wind.outX;w.windZ=wind.outZ;w.windStrength=wind.speed*.9;w.time=wind.time;w.update();
  if(i<180)continue;
  const hems=[];for(const id of [0,1]){const g=w.garments.find(g=>g.id===id);let x=0,z=0,v2=0;for(let j=0;j<g.cols;j++){const k=(g.start+(g.rows-1)*g.cols+j)*3;x+=cloth.p[k];z+=cloth.p[k+2];for(let a=0;a<3;a++){const v=(cloth.p[k+a]-cloth.q[k+a])*120;v2+=v*v;}}hems.push({x:x/g.cols,z:z/g.cols,speed:Math.sqrt(v2/g.cols)});}
  series.push({time:wind.time,wind:wind.speed,force:Math.hypot(cloth.windX,cloth.windZ),hems});
  for(let j=0;j<cloth.n*3;j++)if(!Number.isFinite(cloth.p[j]))nonFinite++;
  for(let j=0;j<cloth.c;j++){const a=cloth.ci[j*2]*3,b=cloth.ci[j*2+1]*3;maxStretch=Math.max(maxStretch,Math.hypot(cloth.p[a]-cloth.p[b],cloth.p[a+1]-cloth.p[b+1],cloth.p[a+2]-cloth.p[b+2])/Math.max(cloth.cr[j],1e-9));}
 }
 const stats=a=>({min:Math.min(...a),max:Math.max(...a),mean:a.reduce((a,b)=>a+b,0)/a.length});
 reports.push({storm,nonFinite,maxStretch,wind:stats(series.map(s=>s.wind)),force:stats(series.map(s=>s.force)),robeX:stats(series.map(s=>s.hems[0].x)),mantleX:stats(series.map(s=>s.hems[1].x)),robeSpeed:stats(series.map(s=>s.hems[0].speed)),mantleSpeed:stats(series.map(s=>s.hems[1].speed)),series});
}
const name=process.argv[2]||'cloak-offline';fs.writeFileSync('docs/phase-9/storm-front/'+name+'.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Actual shared CPU wind feeding the actual Wraith/Verlet garments, fixed standing pose and matched12s timeline. First3s settle excluded. Measures garment response and stability, not human art, rendered collisions or full-world allocation/performance.'},null,2)+'\n');console.log(reports.map(({series,...r})=>r));if(reports.some(r=>r.nonFinite))process.exitCode=1;
