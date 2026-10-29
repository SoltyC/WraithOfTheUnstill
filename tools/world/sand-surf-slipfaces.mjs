import fs from 'node:fs';
import {WorldData} from '../../src/world/worldData.js';
const dir='data/world/',manifest=JSON.parse(fs.readFileSync(dir+'manifest.json'));
const rd=(f,T)=>{const b=fs.readFileSync(dir+f);return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
const world=new WorldData(manifest);
world.overview=rd(manifest.height.overview.file,Uint16Array);world.biomeA=rd(manifest.biome.files[0],Uint8Array);world.biomeB=rd(manifest.biome.files[1],Uint8Array);world.wind=rd(manifest.wind.file,Uint8Array);world.dunes=rd(manifest.dunes.file,Uint8Array);
for(let z=0;z<16;z++)for(let x=0;x<16;x++)world.setTile(x,z,rd(`height/${x}_${z}.u16`,Uint16Array));
const surface=rd('surface.rgba8',Uint8Array),h=(x,z)=>world.heightAt(x,z),mat=(x,z)=>surface[(Math.floor((4096-z)/4)*2048+Math.floor((x+4096)/4))*4];
const all=[];
for(let z=-1200;z<=1400;z+=12)for(let x=1650;x<=3150;x+=12){
 const y=h(x,z),type=world.duneT,dune=world.w3,flat=world.duneFlat;
 if(dune<.98||flat>.05||Math.min(Math.abs(type),Math.abs(type-1/3),Math.abs(type-2/3))>.015||![1,6].includes(mat(x,z)))continue;
 const gx=(h(x+1,z)-h(x-1,z))/2,gz=(h(x,z+1)-h(x,z-1))/2,slope=Math.hypot(gx,gz);
 if(slope<.35||slope>.75)continue;
 const dx=-gx/slope,dz=-gz/slope,drop25=y-h(x+dx*25,z+dz*25);
 if(drop25<8)continue;
 const profile=[];let valid=true;
 for(let d=0;d<=180;d+=6){const px=x+dx*d,pz=z+dz*d;if(![1,6].includes(mat(px,pz))){valid=false;break;}profile.push([d,h(px,pz)]);}
 if(valid)all.push({x,z,y,heading:Math.atan2(dx,dz),slope,drop25,type,profile,score:drop25+slope*4});
}
all.sort((a,b)=>b.score-a.score);const faces=[];
for(let i=0;i<3;i++){
 const name='face-'+(i+1);
 const candidate=all.find(c=>faces.every(p=>Math.hypot(p.x-c.x,p.z-c.z)>250));
 if(!candidate)throw new Error('No valid '+name+' face');faces.push({name,...candidate});
}
const report={date:new Date().toISOString(),faces,note:'Exact CPU field and baked sand material select three distinct fixed-heading downhill starts,19–37degree slope,>=8m drop in25m,180m straight sand corridor. These are authored diagnostic lines selected by code, not yet GPU-validated feel or camera compositions; actual curved run may leave the straight corridor.'};
fs.writeFileSync('docs/phase-9/sand-surf/slipfaces.json',JSON.stringify(report,null,2)+'\n');console.log(faces.map(({name,x,z,slope,drop25,heading})=>({name,x,z,slope,drop25,heading})));
