#!/usr/bin/env node
import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4176';
const js=`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 g.game.killShaped();g.combat.dying=0;g.combat.health=100;g.game.teleport(1900,900);
 for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<90;i++)await frame();
 g.game.killShaped();w.params.v.refillRate=0;w.params.version++;
 const ts=g.terrainState,r=ts.relaxation,c=ts.coarseRelaxation;r.enabled=false;
 ts.bx=1904;ts.bz=900;ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=0.6;ts.bd=2;ts.bc=0.2;ts.bk=5;ts.stamp();
 for(let i=0;i<30;i++)await frame();await ts.snapshot();
 const slot=(await ts.debugProbe(1904,900)).slot;
 const half=(h)=>{const e=(h>>>10)&31,m=h&1023;return (h&32768?-1:1)*(e?(1+m/1024)*2**(e-15):m*2**-24);};
 const read=async()=>{
   const size=512*512*4;
   const raw=await ts.atlas[0].read(slot*size,size),extra=await ts.atlas[2].read(slot*size,size);
   const a=new Uint32Array(raw.buffer,raw.byteOffset,size/4),b=new Uint32Array(extra.buffer,extra.byteOffset,size/4);
   let mass=0,peak=0;for(let i=0;i<a.length;i++){const v=half(a[i]>>>16)-half(a[i]&65535)+half(b[i]>>>16);mass+=v;peak=Math.max(peak,v);}
   return {mass,peak};
 };
 const before=await read(),jobs=c.jobs;r.iterations=0;r.enabled=true;
 for(let i=0;i<180;i++)await frame();r.enabled=false;for(let i=0;i<3;i++)await frame();
 const after=await read();r.iterations=4;
 return {before,after,delta:after.mass-before.mass,jobs:c.jobs-jobs,ready:c.ready,late:w.gpuStats.late,errors:w.gpuStats.gpuErrors};
`;
const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();
const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);
fs.mkdirSync('docs/phase-9/relaxation',{recursive:true});fs.writeFileSync('docs/phase-9/relaxation/coarse-world.json',JSON.stringify({date:new Date().toISOString(),...r.result},null,2)+'\n');console.log(JSON.stringify(r.result));
const x=r.result;if(x.errors||x.late.length||x.jobs<100||x.after.peak>=x.before.peak||Math.abs(x.delta)>0.01)process.exitCode=1;
