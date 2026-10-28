// Read existing GPU metadata; no diagnostic pipeline or extra late shader is introduced.
import fs from 'node:fs';
import { WorldData } from '../../src/world/worldData.js';
import { fbm,valueNoise } from '../../src/terrain/noise.js';
import { DUNE_SEED } from '../../src/terrain/dunes.js';
import { CLIPMAP_N,CLIPMAP_LEVELS } from '../../src/terrain/clipmapLayout.js';
const base='http://127.0.0.1:4176';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const gpu=await ev(`const frame=()=>new Promise(r=>requestAnimationFrame(r));g.game.teleport(3000,-700);g.arm.setFree(false);g.game.killShaped();for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<240;i++)await frame();const clip=g.content.clipmap,P=clip.levels.slice(),N=${CLIPMAP_N},L=${CLIPMAP_LEVELS},V=N+1;const raw=await clip.levelData.read();const d=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4),samples=[];if(d.length!==L*V*V*4)throw new Error('Wrong clipmap layout');for(let l=0;l<L;l++)for(let j=32;j<N;j+=64)for(let i=32;i<N;i+=64){const x=P[l*4]+(i-N/2)*P[l*4+2],z=P[l*4+1]+(j-N/2)*P[l*4+2];if(Math.abs(x)>4000||Math.abs(z)>4000)continue;samples.push({x,z,s:P[l*4+2],code:d[((l*V+j)*V+i)*4+3]});}return {samples,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`);
const dir='data/world/',m=JSON.parse(fs.readFileSync(dir+'manifest.json')),world=new WorldData(m);
const rd=f=>new Uint8Array(fs.readFileSync(dir+f));world.biomeA=rd(m.biome.files[0]);world.biomeB=rd(m.biome.files[1]);world.wind=rd(m.wind.file);world.dunes=rd(m.dunes.file);
let valid=0,maxPhaseError=0,maxAmpError=0,badFamily=0,nonFinite=0;const worst=[];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
for(const row of gpu.samples){
 if(!Number.isFinite(row.code)||row.code<0||row.code>16777216||Math.round(row.code)!==row.code){nonFinite++;continue;}if(!row.code)continue;valid++;
 const bits=row.code-1,family=(bits>>>23)&1,phase=(bits&131071)/512-128,amp=((bits>>>17)&63)*.5;
 world.qx=row.x;world.qz=row.z;world._climate();const u=row.x*world.windX+row.z*world.windZ,v=-row.x*world.windZ+row.z*world.windX,t3=world.duneT*3;
 let expectedPhase,expectedAmp,weight,lambda;
 if(family){expectedPhase=v/115+.55*fbm(u/700,v/300,3,DUNE_SEED+40);expectedAmp=13*(.65+.35*fbm(u/500,v/250,2,DUNE_SEED+41));weight=Math.max(0,t3-2);lambda=115;}
 else{expectedPhase=u/140+.9*fbm(u/900,v/600,3,0x6d65+1)+.25*valueNoise(v/170,u/400,0x6d65+2);expectedAmp=22*(.7+.3*fbm(v/260,u/700,3,0x6d65+3));weight=Math.max(0,1-Math.abs(t3-1));lambda=140;}
 expectedAmp*=weight*(1-smooth(lambda/8,lambda/3,row.s))*(1-world.duneFlat)*world.w3;
 const pe=Math.abs(phase-expectedPhase),ae=Math.abs(amp-expectedAmp);maxPhaseError=Math.max(maxPhaseError,pe);maxAmpError=Math.max(maxAmpError,ae);
 if(weight<.998||world.w3<.998)badFamily++;
 if(pe>.0025||ae>.26)worst.push({...row,family,phase,expectedPhase,amp,expectedAmp});
}
const report={date:new Date().toISOString(),samples:gpu.samples.length,valid,maxPhaseError,maxAmpError,badFamily,nonFinite,worst:worst.slice(0,10),gpuErrors:gpu.gpuErrors,late:gpu.late,note:'Existing clipmap storage readback checked against independent CPU WorldData climate plus original dune phase/amplitude functions. Phase is quantised to1/512cycle; amplitude to0.5m. This is metadata correctness, not collision-height parity or visual/motion acceptance.'};
fs.writeFileSync('docs/phase-9/relaxation/crest-metadata-oracle.json',JSON.stringify(report,null,2)+'\n');console.log(report);
if(valid<20||maxPhaseError>.0025||maxAmpError>.26||badFamily||nonFinite||gpu.gpuErrors||gpu.late.length)process.exitCode=1;
