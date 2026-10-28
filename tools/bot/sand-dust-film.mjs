import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4173';
async function cmd(body){const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
console.log(await cmd({do:'eval',js:`
g.clock.frozen=false;g.ws.wetForce=0;g.ws.puddleForce=0;g.ws.restoration.dunes='restored';
g.terrainState.restore([]);g.sandDust.strength=1;
g.loop.systems=g.loop.systems.filter(s=>s.name!=='dustCompareFixedNoise');
g.post.post.grain=0.035;g.post.post.jitter=true;g.post.taa.on=true;
for(let i=0;i<90;i++)await new Promise(r=>requestAnimationFrame(r));
g.ground.qx=1900;g.ground.qz=900;g.ground.sample();w.dustFilmBase=g.ground.h;
return {height:w.dustFilmBase,errors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`}));
console.log('film started');
const result=await cmd({do:'film',dir:'sand-dust-review',name:'dust',seconds:6,fps:60,size:[1280,720],warm:45,quality:0.9,js:`
cam.at(1900,w.dustFilmBase+2.4,895,1900,w.dustFilmBase+0.5,907,0.9);
if(i===75||i===210){const ts=g.terrainState;ts.bx=i===75?1898.5:1901.5;ts.bz=902;ts.bdx=1;ts.bdz=0;ts.bl=0.65;ts.bw=0.65;ts.bd=0.35;ts.bc=0.2;ts.bk=5;ts.stamp();}`});
console.log(result);
const end=await cmd({do:'eval',js:`return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,events:g.sandDust.bursts.emitted};`});
fs.writeFileSync('docs/phase-9/dust/film.json',JSON.stringify({date:new Date().toISOString(),result,end,note:'Six-second diagnostic material film: restored ground blow and two actual mound writes. Not a D2 slumping or human-feel acceptance film.'},null,2)+'\n');console.log(end);
