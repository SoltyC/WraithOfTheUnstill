// Read-only camera candidates from the exact CPU field; GPU composition/parity is still required.
import fs from 'node:fs';
import { WorldData } from '../../src/world/worldData.js';
import { fbm,valueNoise } from '../../src/terrain/noise.js';
import { DUNE_SEED } from '../../src/terrain/dunes.js';
const transverse=process.argv.includes('--transverse'),peakPhase=transverse?.72:.5;
const dir='data/world/',manifest=JSON.parse(fs.readFileSync(dir+'manifest.json'));
const rd=(file,T)=>{const b=fs.readFileSync(dir+file);return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
const world=new WorldData(manifest);
world.overview=rd(manifest.height.overview.file,Uint16Array);world.biomeA=rd(manifest.biome.files[0],Uint8Array);world.biomeB=rd(manifest.biome.files[1],Uint8Array);world.wind=rd(manifest.wind.file,Uint8Array);world.dunes=rd(manifest.dunes.file,Uint8Array);
for(let z=0;z<16;z++)for(let x=0;x<16;x++)world.setTile(x,z,rd(`height/${x}_${z}.u16`,Uint16Array));
function height(x,z){world.qx=x;world.qz=z;world.sample();return world.h;}
function phase(x,z){height(x,z);const u=x*world.windX+z*world.windZ,v=-x*world.windZ+z*world.windX;return transverse?u/140+.9*fbm(u/900,v/600,3,0x6d65+1)+.25*valueNoise(v/170,u/400,0x6d65+2):v/115+.55*fbm(u/700,v/300,3,DUNE_SEED+40);}
const results=[];
for(let z=transverse?200:-2200;z<=(transverse?1600:300);z+=50)for(let x=1600;x<=(transverse?3300:3550);x+=50){
 let tx=x,tz=z;
 for(let i=0;i<5;i++){
  const p=phase(tx,tz),nx=transverse?world.windX:-world.windZ,nz=transverse?world.windZ:world.windX;
  const a=phase(tx+nx,tz+nz),b=phase(tx-nx,tz-nz),gradient=(a-b)/2;
  if(Math.abs(gradient)<.001)break;
  const delta=Math.max(-55,Math.min(55,(p-Math.floor(p)-peakPhase)/gradient));tx-=nx*delta;tz-=nz*delta;
 }
 const solved=phase(tx,tz);if(Math.abs(solved-Math.floor(solved)-peakPhase)>0.0001)continue;
 const ty=height(tx,tz),dune=world.w3,type=world.duneT,flat=world.duneFlat,headingBase=Math.atan2(world.windX,world.windZ),nx=-world.windZ,nz=world.windX;
 if(transverse&&(tx<1600||tx>3300))continue;
 if(dune<.95||(transverse?Math.abs(type-1/3)>.002:type<.98)||flat>.05)continue;
 for(let angle=0;angle<(transverse?4:16);angle++)for(const D of [500,2000]){
  const heading=transverse?headingBase+[0,Math.PI,Math.PI/8,-Math.PI/8][angle]:angle*Math.PI/8,dx=Math.sin(heading),dz=Math.cos(heading),cx=tx-dx*D,cz=tz-dz*D;
  if(ty<=height(tx+dx*2,tz+dz*2)||ty<=height(tx-dx*2,tz-dz*2))continue;
  if(Math.max(Math.abs(cx),Math.abs(cz))>3950)continue;
  let lower=height(cx,cz)+2,upper=ty-1,background=0;
  for(let t=16;t<D-8;t+=16){const h=height(cx+dx*t,cz+dz*t);lower=Math.max(lower,(h+1-ty*t/D)/(1-t/D));}
  if(transverse){
    const cy=Math.max(lower+3,ty+20);if(cy-ty>D*.25)continue;
    const gap=ty+(ty-cy)*16/D-height(tx+dx*16,tz+dz*16);if(gap<1)continue;
    results.push({distance:D,target:[tx,ty,tz],camera:{mode:'free',pos:[cx,cy,cz],yaw:Math.atan2(dx,dz),pitch:Math.atan2(cy-ty,D),fov:D===500?.5:.25},player:[cx,cz],clearanceMargin:gap*10+Math.max(0,50-(cy-ty)),backgroundGapAt16m:gap,dune,type,flat});continue;
  }
  for(let t=D+16;t<=D+3000;t+=32){const px=cx+dx*t,pz=cz+dz*t;if(Math.max(Math.abs(px),Math.abs(pz))>4000)break;const h=height(px,pz);upper=Math.min(upper,(ty*t-(h+1)*D)/(t-D));background++;}
  if(upper<=lower+2||background<20)continue;
  const cy=Math.min(ty-2,upper-5);if(cy<lower+2)continue;
  results.push({distance:D,target:[tx,ty,tz],camera:{mode:'free',pos:[cx,cy,cz],yaw:Math.atan2(dx,dz),pitch:Math.atan2(cy-ty,D),fov:D===500?.5:.25},player:[cx,cz],clearanceMargin:upper-lower,dune,type,flat});
 }
}
results.sort((a,b)=>b.clearanceMargin-a.clearanceMargin);
const selected=[500,2000].flatMap(d=>results.filter(r=>r.distance===d).slice(0,4));
const report={transverse,date:new Date().toISOString(),note:transverse?'CPU transverse-phase candidates in the erg west of x3300. Foreground clear and at least1m gap behind the crest; distant terrain may form the backdrop, so these are not sky-only silhouettes. GPU depth/composition review remains required.':'CPU seif-phase crest candidates. Camera lower bound clears foreground; upper bound keeps sampled background below the target skyline. 16/32m ray samples can miss small occluders; no props, GPU LOD or visual acceptance inferred.',candidates:selected};
fs.writeFileSync('docs/phase-9/relaxation/crest-cpu-candidates'+(transverse?'-transverse':'')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
